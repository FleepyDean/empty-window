import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { extractCbtlOtp, extractRawToHeader } from "@/lib/email-otp";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const IMAP_HOST = process.env.GMAIL_IMAP_HOST ?? "imap.gmail.com";
const IMAP_PORT = Number(process.env.GMAIL_IMAP_PORT ?? 993);
const IMAP_USER = process.env.GMAIL_BASE_EMAIL ?? "";
const IMAP_PASS = process.env.GMAIL_APP_PASSWORD ?? "";
const CBTL_FROM_EXACT = "no-reply@my.thecoffeebeanandtealeaf.com";
const POLL_INTERVAL_MS = 1500;
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── Singleton IMAP client ─────────────────────────────────────────────────────
// One shared connection for all SSE requests — eliminates the 28s per-request
// TCP+TLS+auth handshake that was killing latency on Railway.
let _client: ImapFlow | null = null;
let _connecting: Promise<ImapFlow> | null = null;

function resetClient() { _client = null; _connecting = null; }

async function getImapClient(): Promise<ImapFlow> {
  if (_client?.usable) return _client;
  if (_connecting) return _connecting;
  _connecting = (async () => {
    const c = new ImapFlow({
      host: IMAP_HOST, port: IMAP_PORT, secure: true,
      auth: { user: IMAP_USER, pass: IMAP_PASS },
      logger: false,
    });
    c.on("error", resetClient);
    c.on("close", resetClient);
    await c.connect();
    _client = c;
    console.log("[OTP] Singleton IMAP client connected");
    return c;
  })().finally(() => { _connecting = null; });
  return _connecting;
}

function extractRawFromHeader(buf: Buffer): string {
  const str = buf.toString("utf8");
  const headerEnd = str.indexOf("\r\n\r\n");
  const headers = headerEnd > 0 ? str.substring(0, headerEnd) : str.substring(0, 2000);
  const unfolded = headers.replace(/\r\n[ \t]+/g, " ");
  const match = unfolded.match(/^From:\s*(.+)$/im);
  if (!match) return "";
  const em = match[1].match(/[\w.+\-]+@[\w.\-]+/);
  return em ? em[0].toLowerCase() : "";
}

/**
 * GET /api/admin/cbtl-register/email-otp/stream
 *
 * SSE stream using IMAP IDLE. Gmail pushes an EXISTS event the instant
 * new mail arrives — no polling, no delay.
 *
 * Two-phase fetch strategy:
 *   Phase 1: fetch headers only (~100ms) to check From/To/Date
 *   Phase 2: fetch full source (~1s) only if headers match
 * This avoids downloading 50-200KB HTML emails for every CBTL email
 * in the inbox (the previous approach was O(n × fullEmail) = ~20s).
 */
export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const sinceParam = searchParams.get("since");
  if (!email) return new Response("email required", { status: 400 });

  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 30 * 60 * 1000);
  const targetTo = email.toLowerCase().trim();

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const t0 = Date.now();
  let done = false;

  const send = (data: unknown) => {
    try { writer.write(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { }
  };

  // Heartbeat starts IMMEDIATELY — keeps the stream open while IMAP connects
  const hb = setInterval(() => { if (done) { clearInterval(hb); return; } send({ heartbeat: true }); }, 5000);
  request.signal.addEventListener("abort", () => {
    done = true; clearInterval(hb); try { writer.close(); } catch { }
  });

  (async () => {
    try {
      const client = await getImapClient();
      console.log(`[OTP] Client ready in ${Date.now() - t0}ms`);

      const searchSince = new Date(since);
      searchSince.setDate(searchSince.getDate() - 1);
      const seenUids = new Set<number>();

      async function pollOnce(): Promise<string | null> {
        let lock: Awaited<ReturnType<ImapFlow["getMailboxLock"]>> | undefined;
        const tStart = Date.now();
        try {
          lock = await client.getMailboxLock("INBOX");
          const tLock = Date.now();

          let uids: number[] = [];
          try {
            uids = await client.search(
              { raw: `to:(${targetTo}) from:(${CBTL_FROM_EXACT})`, since: searchSince } as never,
              { uid: true }
            ) as unknown as number[];
          } catch {
            uids = await client.search(
              { from: CBTL_FROM_EXACT, since: searchSince } as never,
              { uid: true }
            ) as unknown as number[];
          }
          const tSearch = Date.now();

          const arr = Array.isArray(uids) ? uids : [];
          const newUids = arr.filter(uid => !seenUids.has(uid));
          for (const uid of arr) seenUids.add(uid);

          if (newUids.length === 0) {
            console.log(`[OTP] poll: lock=${tLock - tStart}ms search=${tSearch - tLock}ms 0 new`);
            lock.release();
            return null;
          }

          // Batch headers fetch — ONE IMAP command for all candidates instead of N round-trips
          const candidates = newUids.sort((a, b) => b - a).slice(0, 10);
          const matches: number[] = [];
          const tHdrStart = Date.now();
          for await (const msg of client.fetch(
            candidates.join(","),
            { headers: ["from", "to", "date"], internalDate: true },
            { uid: true }
          )) {
            if (!msg) continue;
            const emailDate = msg.internalDate ?? null;
            if (!emailDate || emailDate < since) continue;
            const hdrs = msg.headers as Buffer | undefined;
            if (!hdrs) continue;
            if (extractRawFromHeader(hdrs) !== CBTL_FROM_EXACT) continue;
            const toAddrs = extractRawToHeader(hdrs);
            if (!toAddrs.includes(targetTo)) continue;
            matches.push(msg.uid);
          }
          const tHdrEnd = Date.now();
          console.log(`[OTP] poll: lock=${tLock - tStart}ms search=${tSearch - tLock}ms headers=${tHdrEnd - tHdrStart}ms (${candidates.length} cand, ${matches.length} match)`);

          for (const uid of matches.sort((a, b) => b - a)) {
            const tBody = Date.now();
            const srcMsg = await client.fetchOne(String(uid), { source: true }, { uid: true });
            if (!srcMsg || !(srcMsg as { source?: Buffer }).source) continue;
            const parsed = await simpleParser((srcMsg as { source: Buffer }).source);
            const text = (parsed.text ?? "").trim();
            const html = typeof parsed.html === "string" ? parsed.html : "";
            const body = text || html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
            const otp = extractCbtlOtp(body);
            console.log(`[OTP] body uid=${uid}: ${Date.now() - tBody}ms otp=${otp ?? "none"}`);
            if (otp) { lock.release(); return otp; }
          }
          lock.release();
          return null;
        } catch (err) {
          try { lock?.release(); } catch { }
          if (!client.usable) resetClient();
          throw err;
        }
      }

      const initial = await pollOnce();
      if (initial && !done) { done = true; send({ otp: initial }); }

      while (!done) {
        await sleep(POLL_INTERVAL_MS);
        if (done) break;
        const otp = await pollOnce().catch(err => {
          console.error(`[OTP] Poll error:`, err instanceof Error ? err.message : err);
          return null;
        });
        if (otp && !done) { done = true; console.log(`[OTP] Found at +${Date.now() - t0}ms`); send({ otp }); }
      }
    } catch (err) {
      console.error(`[OTP] Fatal:`, err instanceof Error ? err.message : err);
      if (!done) send({ error: "IMAP error" });
    } finally {
      clearInterval(hb); done = true; try { writer.close(); } catch { }
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function fetchAndCheck(
  client: ImapFlow, uid: string, targetTo: string, since: Date, t0: number
): Promise<string | null> {
  try {
    const hdrMsg = await client.fetchOne(uid, { headers: ["from", "to", "date"], internalDate: true }, { uid: true });
    if (!hdrMsg) return null;
    const emailDate = hdrMsg.internalDate ?? null;
    if (!emailDate || emailDate < since) return null;
    const hdrs = hdrMsg.headers as Buffer | undefined;
    if (!hdrs) return null;
    if (extractRawFromHeader(hdrs) !== CBTL_FROM_EXACT) return null;
    const toAddrs = extractRawToHeader(hdrs);
    if (!toAddrs.includes(targetTo)) return null;
    console.log(`[OTP] Headers matched uid=${uid} at +${Date.now() - t0}ms — fetching body`);
    const srcMsg = await client.fetchOne(uid, { source: true }, { uid: true });
    if (!srcMsg || !srcMsg.source) return null;
    const parsed = await simpleParser(srcMsg.source as Buffer);
    const text = (parsed.text ?? "").trim();
    const html = typeof parsed.html === "string" ? parsed.html : "";
    const body = text || html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
    return extractCbtlOtp(body);
  } catch { return null; }
}
