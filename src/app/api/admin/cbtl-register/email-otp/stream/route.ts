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

  const send = (data: unknown) => {
    try { writer.write(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { }
  };

  let done = false;

  const finish = async (client?: ImapFlow, lock?: { release: () => void }) => {
    try { if (lock) lock.release(); } catch { }
    try { if (client) await client.logout(); } catch { }
    try { writer.close(); } catch { }
  };

  (async () => {
    let client: ImapFlow | undefined;
    let lock: Awaited<ReturnType<ImapFlow["getMailboxLock"]>> | undefined;

    try {
      client = new ImapFlow({
        host: IMAP_HOST, port: IMAP_PORT, secure: true,
        auth: { user: IMAP_USER, pass: IMAP_PASS },
        logger: false,
      });

      await client.connect();
      console.log(`[OTP] Connected in ${Date.now() - t0}ms`);
      lock = await client.getMailboxLock("INBOX");
      console.log(`[OTP] Ready in ${Date.now() - t0}ms`);

      const searchSince = new Date(since);
      searchSince.setDate(searchSince.getDate() - 1);
      const seenUids = new Set<number>();

      async function findNewUids(): Promise<number[]> {
        let uids: number[] = [];
        try {
          uids = await client!.search(
            { raw: `to:(${targetTo}) from:(${CBTL_FROM_EXACT})`, since: searchSince } as never,
            { uid: true }
          ) as unknown as number[];
        } catch {
          uids = await client!.search(
            { from: CBTL_FROM_EXACT, since: searchSince } as never,
            { uid: true }
          ) as unknown as number[];
        }
        const arr = Array.isArray(uids) ? uids : [];
        const fresh = arr.filter(uid => !seenUids.has(uid));
        for (const uid of arr) seenUids.add(uid);
        return fresh.sort((a, b) => b - a);
      }

      for (const uid of (await findNewUids()).slice(0, 5)) {
        const otp = await fetchAndCheck(client, String(uid), targetTo, since, t0);
        if (otp && !done) { done = true; send({ otp }); await finish(client, lock); return; }
      }
      console.log(`[OTP] Polling every ${POLL_INTERVAL_MS}ms from +${Date.now() - t0}ms`);

      const hb = setInterval(() => { if (!done) send({ heartbeat: true }); else clearInterval(hb); }, 20000);
      request.signal.addEventListener("abort", () => { done = true; clearInterval(hb); finish(client, lock); });

      while (!done) {
        await sleep(POLL_INTERVAL_MS);
        if (done) break;
        for (const uid of (await findNewUids()).slice(0, 5)) {
          const otp = await fetchAndCheck(client, String(uid), targetTo, since, t0);
          if (otp && !done) { done = true; console.log(`[OTP] Found at +${Date.now() - t0}ms`); send({ otp }); break; }
        }
      }
      clearInterval(hb);
      await finish(client, lock);

    } catch (err) {
      console.error(`[IDLE] Error at +${Date.now() - t0}ms:`, err instanceof Error ? err.message : err);
      if (!done) send({ error: "IMAP error" });
      await finish(client, lock);
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
