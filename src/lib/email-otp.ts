import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const IMAP_HOST = process.env.GMAIL_IMAP_HOST ?? "imap.gmail.com";
const IMAP_PORT = Number(process.env.GMAIL_IMAP_PORT ?? 993);
const IMAP_USER = process.env.GMAIL_BASE_EMAIL ?? "";
const IMAP_PASS = process.env.GMAIL_APP_PASSWORD ?? "";

// CBTL OTP email signature
// We ONLY accept OTP emails from no-reply@... (skip marketing@...)
const CBTL_FROM_EXACT = "no-reply@my.thecoffeebeanandtealeaf.com";
// Marker text that appears in CBTL OTP emails, right before the 6-digit code
const OTP_MARKER = "thanks for joining MyCBTL";

export type EmailOtpResult = {
  otp: string;
  receivedAt: Date;
  messageId: string;
};

function assertConfig() {
  if (!IMAP_USER || !IMAP_PASS) {
    throw new Error("GMAIL_BASE_EMAIL or GMAIL_APP_PASSWORD env var is missing");
  }
}

/**
 * Extract the raw "To:" header value from email source.
 * This bypasses any normalization by IMAP envelope or mailparser.
 */
export function extractRawToHeader(source: Buffer | string): string[] {
  const str = typeof source === "string" ? source : source.toString("utf8");
  // Only look at headers (before first blank line)
  const headerEnd = str.indexOf("\r\n\r\n");
  const headers = headerEnd > 0 ? str.substring(0, headerEnd) : str.substring(0, 4000);
  // Unfold continuation lines
  const unfolded = headers.replace(/\r\n[ \t]+/g, " ");
  const match = unfolded.match(/^To:\s*(.+)$/im);
  if (!match) return [];
  // Parse addresses from the To header value
  const raw = match[1];
  const addresses: string[] = [];
  const emailRegex = /[\w.+-]+@[\w.-]+/g;
  let m;
  while ((m = emailRegex.exec(raw)) !== null) {
    addresses.push(m[0].toLowerCase());
  }
  return addresses;
}

export async function fetchCbtlOtpForEmail(
  toEmail: string,
  since: Date,
  excludeOtps: string[] = [],
  excludeMessageIds: string[] = []
): Promise<EmailOtpResult | null> {
  assertConfig();

  const targetTo = toEmail.toLowerCase().trim();
  console.log(`[IMAP] Searching for OTP email to: ${targetTo}, since: ${since.toISOString()}`);

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASS },
    logger: false
  });

  try {
    await client.connect();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[IMAP] CONNECT FAILED: ${msg}`);
    throw err;
  }

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Use Gmail's X-GM-RAW extension to search by exact To address + from + newer_than
      // This drastically reduces the result set compared to searching all CBTL emails
      const searchSince = new Date(since);
      searchSince.setDate(searchSince.getDate() - 1);

      let uids: number[];
      try {
        // Gmail-specific: search by to + from with X-GM-RAW
        const rawQuery = `to:(${targetTo}) from:(${CBTL_FROM_EXACT}) subject:(OTP)`;
        uids = await client.search(
          { raw: rawQuery, since: searchSince } as never,
          { uid: true }
        ) as unknown as number[];
      } catch {
        // Fallback for non-Gmail IMAP: standard search
        uids = await client.search(
          { from: CBTL_FROM_EXACT, since: searchSince, to: targetTo } as never,
          { uid: true }
        ) as unknown as number[];
      }

      const uidArray = Array.isArray(uids) ? uids : [];
      console.log(`[IMAP] Found ${uidArray.length} candidate emails for ${targetTo}`);

      if (uidArray.length === 0) return null;

      // Walk newest → oldest, limit to 10 most recent for speed
      const sorted = [...uidArray].sort((a, b) => b - a).slice(0, 10);

      for (const uid of sorted) {
        // Phase 1: cheap headers-only fetch to verify From/To/Date
        const hdrMsg = await client.fetchOne(
          String(uid),
          { headers: ["from", "to", "message-id"], internalDate: true },
          { uid: true }
        );
        if (!hdrMsg) continue;

        const emailDate = hdrMsg.internalDate ?? null;
        if (!emailDate || emailDate < since) continue;

        const hdrs = hdrMsg.headers as Buffer | undefined;
        if (!hdrs) continue;

        const rawToAddrs = extractRawToHeader(hdrs);
        console.log(`[IMAP] uid=${uid} rawTo=[${rawToAddrs.join(", ")}] target=${targetTo}`);

        if (!rawToAddrs.includes(targetTo)) {
          console.log(`[IMAP] Skipping uid=${uid}: To doesn't match`);
          continue;
        }

        // Extract messageId from headers for dedup check
        const hdrStr = hdrs.toString("utf8");
        const midMatch = hdrStr.match(/^Message-ID:\s*(.+)$/im);
        const messageId = midMatch ? midMatch[1].trim() : String(uid);

        if (excludeMessageIds.includes(messageId)) {
          console.log(`[IMAP] Skipping: messageId already used`);
          continue;
        }

        // Phase 2: full source only for the matching message
        const srcMsg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!srcMsg || !srcMsg.source) continue;

        const parsed = await simpleParser(srcMsg.source as Buffer);
        const textBody = (parsed.text ?? "").trim();
        const htmlBody = typeof parsed.html === "string" ? parsed.html : "";
        const bodyForOtp = textBody.length > 0 ? textBody : htmlBody.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
        const otp = extractCbtlOtp(bodyForOtp);

        if (otp) {
          if (excludeOtps.includes(otp)) {
            console.log(`[IMAP] Skipping: OTP ${otp} already used`);
            continue;
          }
          console.log(`[IMAP] SUCCESS! OTP=${otp} for ${targetTo}, messageId=${messageId}`);
          return {
            otp,
            receivedAt: emailDate,
            messageId
          };
        }
      }

      console.log(`[IMAP] No matching OTP found for ${targetTo}`);
      return null;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Extract the 6-digit OTP from a CBTL email body.
 * CBTL emails follow this format:
 *   "Hi there, thanks for joining MyCBTL. Please use the code below ...
 *    [10 minutes validity disclaimer]
 *    855429
 *    Please ensure that the OTP reference code displayed on the app is AFAEFF."
 * Strategy: find the marker text, then return the FIRST 6-digit run AFTER it.
 * This avoids matching random 6-digit sequences in DKIM signatures / headers /
 * other random base64 content.
 */
export function extractCbtlOtp(body: string): string | null {
  if (!body) return null;

  const markerIdx = body.toLowerCase().indexOf(OTP_MARKER.toLowerCase());
  const searchScope = markerIdx >= 0 ? body.substring(markerIdx) : body;

  // Look for 6 digits that are not adjacent to other digits/letters
  const strict = searchScope.match(/(?<![A-Za-z0-9])\d{6}(?![A-Za-z0-9])/g);
  if (strict && strict.length > 0) {
    return strict[0];
  }
  const lenient = searchScope.match(/\d{6}/g);
  if (lenient && lenient.length > 0) {
    return lenient[0];
  }
  return null;
}

// Backwards-compat export name (used elsewhere if any)
export const extractSixDigitOtp = extractCbtlOtp;
