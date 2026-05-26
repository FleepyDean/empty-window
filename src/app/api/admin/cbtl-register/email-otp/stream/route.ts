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
      console.log(`[IDLE] Connected in ${Date.now() - t0}ms`);

      lock = await client.getMailboxLock("INBOX");
      console.log(`[IDLE] Mailbox locked in ${Date.now() - t0}ms`);

      // Check if OTP already arrived before we connected
      const existing = await initialScan(client, targetTo, since, t0);
      if (existing) {
        done = true;
        send({ otp: existing });
        await finish(client, lock);
        return;
      }

      console.log(`[IDLE] Entering IDLE at ${Date.now() - t0}ms — waiting for EXISTS push`);

      // IMAP IDLE: Gmail pushes EXISTS the instant a new email lands.
      // 'count' is the new mailbox total — the newest email is at seqno 'count'.
      // Fetch it directly by seqno: no search round-trip needed.
      client.on("exists", async ({ count }: { count: number }) => {
        if (done) return;
        console.log(`[IDLE] EXISTS fired (count=${count}) at +${Date.now() - t0}ms`);
        const otp = await fetchAndCheck(client!, String(count), targetTo, since, false, t0);
        if (otp && !done) {
          done = true;
          console.log(`[IDLE] OTP found at +${Date.now() - t0}ms`);
          send({ otp });
          try { (client as ImapFlow & { idleNotify(): void }).idleNotify(); } catch { }
        }
      });

      const hb = setInterval(() => {
        if (done) { clearInterval(hb); return; }
        send({ heartbeat: true });
      }, 25000);

      request.signal.addEventListener("abort", () => {
        done = true;
        clearInterval(hb);
        finish(client, lock);
      });

      await client.idle();
      clearInterval(hb);
      if (!done) await finish(client, lock);

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

/**
 * Search for a pre-existing OTP using X-GM-RAW (Gmail-specific narrow search).
 * Falls back to from-only search if X-GM-RAW fails.
 */
async function initialScan(
  client: ImapFlow, targetTo: string, since: Date, t0: number
): Promise<string | null> {
  const searchSince = new Date(since);
  searchSince.setDate(searchSince.getDate() - 1);

  let uids: number[] = [];
  try {
    // X-GM-RAW narrows results to this exact recipient — usually 0 or 1 result
    uids = await client.search(
      { raw: `to:(${targetTo}) from:(${CBTL_FROM_EXACT})`, since: searchSince } as never,
      { uid: true }
    ) as unknown as number[];
  } catch {
    // Fallback: search by sender only, filter To: in memory
    uids = await client.search(
      { from: CBTL_FROM_EXACT, since: searchSince } as never,
      { uid: true }
    ) as unknown as number[];
  }

  const uidArray = Array.isArray(uids) ? uids : [];
  console.log(`[IDLE] Initial scan: ${uidArray.length} candidate(s) at +${Date.now() - t0}ms`);
  if (!uidArray.length) return null;

  const sorted = [...uidArray].sort((a, b) => b - a).slice(0, 5);
  for (const uid of sorted) {
    const otp = await fetchAndCheck(client, String(uid), targetTo, since, true, t0);
    if (otp) return otp;
  }
  return null;
}

/**
 * Two-phase fetch:
 *   Phase 1 — headers only (~100ms): verify From/To/Date without downloading the email body.
 *   Phase 2 — source only if Phase 1 passes (~1s): parse body and extract OTP.
 *
 * @param id      Sequence number (byUid=false) or UID string (byUid=true)
 * @param byUid   Whether `id` is a UID (true) or seqno (false)
 */
async function fetchAndCheck(
  client: ImapFlow, id: string, targetTo: string,
  since: Date, byUid: boolean, t0: number
): Promise<string | null> {
  try {
    // Phase 1: cheap header fetch
    const hdrMsg = await client.fetchOne(
      id,
      { headers: ["from", "to", "date"], internalDate: true },
      { uid: byUid }
    );
    if (!hdrMsg) return null;

    const emailDate = hdrMsg.internalDate ?? null;
    if (!emailDate || emailDate < since) return null;

    const hdrs = hdrMsg.headers as Buffer | undefined;
    if (!hdrs) return null;

    if (extractRawFromHeader(hdrs) !== CBTL_FROM_EXACT) return null;
    const toAddrs = extractRawToHeader(hdrs);
    if (!toAddrs.includes(targetTo)) {
      console.log(`[IDLE] Header check failed: to=[${toAddrs.join(",")}] target=${targetTo}`);
      return null;
    }

    console.log(`[IDLE] Header matched ${id} at +${Date.now() - t0}ms — fetching source`);

    // Phase 2: full source only for the matching message
    const srcMsg = await client.fetchOne(id, { source: true }, { uid: byUid });
    if (!srcMsg || !srcMsg.source) return null;

    const parsed = await simpleParser(srcMsg.source as Buffer);
    const text = (parsed.text ?? "").trim();
    const html = typeof parsed.html === "string" ? parsed.html : "";
    const body = text || html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
    return extractCbtlOtp(body);
  } catch {
    return null;
  }
}
