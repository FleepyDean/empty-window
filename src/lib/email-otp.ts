import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const IMAP_HOST = process.env.GMAIL_IMAP_HOST ?? "imap.gmail.com";
const IMAP_PORT = Number(process.env.GMAIL_IMAP_PORT ?? 993);
const IMAP_USER = process.env.GMAIL_BASE_EMAIL ?? "";
const IMAP_PASS = process.env.GMAIL_APP_PASSWORD ?? "";

// CBTL OTP email signature
// We ONLY accept OTP emails from no-reply@... (skip marketing@...)
const CBTL_FROM_EXACT = "no-reply@my.thecoffeebeanandtealeaf.com";
const CBTL_FROM_DOMAIN = "my.thecoffeebeanandtealeaf.com";
const CBTL_SUBJECT_CONTAINS = "OTP";  // Broader match
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
 * Search the configured Gmail inbox for the most recent CBTL OTP email
 * delivered to the given dotted-variation address.
 *
 * Returns the 6-digit OTP if found, or null if not yet received.
 *
 * Gmail dot-variations: even though we receive at the canonical inbox
 * (e.g. redshocker33@gmail.com), the "To:" header preserves whatever
 * dotted form the sender used (e.g. r.e.dshocker33@gmail.com), so we
 * filter by the To: header to pick the correct OTP for this claim.
 */
export async function fetchCbtlOtpForEmail(
  toEmail: string,
  since: Date,
  excludeOtps: string[] = [],
  excludeMessageIds: string[] = []
): Promise<EmailOtpResult | null> {
  assertConfig();

  // Log for debugging (these appear in Railway logs)
  console.log(`[IMAP] Searching for OTP email to: ${toEmail}, since: ${since.toISOString()}`);

  console.log(`[IMAP] Config: host=${IMAP_HOST}, port=${IMAP_PORT}, user=${IMAP_USER}, pass=${IMAP_PASS ? "SET (" + IMAP_PASS.length + " chars)" : "MISSING"}`);

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASS },
    logger: false
  });

  try {
    await client.connect();
    console.log(`[IMAP] Connected to ${IMAP_HOST}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[IMAP] CONNECT FAILED: ${msg}`);
    throw err;
  }

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // IMAP SINCE is date-only (no time), so we go back 2 days to be safe
      // We filter strictly by internalDate >= claim.createdAt below to avoid old emails
      const searchSince = new Date(since);
      searchSince.setDate(searchSince.getDate() - 2);

      console.log(`[IMAP] Searching emails from ${CBTL_FROM_DOMAIN} since ${searchSince.toISOString()} (claim created: ${since.toISOString()})`);

      const uids = await client.search(
        {
          from: CBTL_FROM_EXACT,
          since: searchSince
        },
        { uid: true }
      );

      const uidArray = Array.isArray(uids) ? uids : [];
      console.log(`[IMAP] Found ${uidArray.length} emails from ${CBTL_FROM_DOMAIN}`);

      if (uidArray.length === 0) return null;

      // Walk newest → oldest
      const sorted = [...uidArray].sort((a, b) => b - a);
      const targetTo = toEmail.toLowerCase().trim();
      console.log(`[IMAP] Target to: ${targetTo}`);

      for (const uid of sorted) {
        const msg = await client.fetchOne(
          String(uid),
          { envelope: true, source: true, internalDate: true },
          { uid: true }
        );
        if (!msg) continue;

        const env = msg.envelope;
        if (!env) continue;

        const fromAddr = env.from?.[0]?.address?.toLowerCase() ?? "";
        const toAddrs = (env.to ?? []).map((a: { address?: string }) => (a.address ?? "").toLowerCase());
        const subject = env.subject ?? "";
        const messageId = env.messageId ?? String(uid);
        const internalDate = msg.internalDate;

        // Skip if this exact email was already used by another claim
        if (excludeMessageIds.includes(messageId)) {
          console.log(`[IMAP] Skipping: messageId ${messageId} already used by another claim`);
          continue;
        }

        console.log(`[IMAP] Checking email: from=${fromAddr}, to=${toAddrs.join(", ")}, subject="${subject}", date=${internalDate}`);

        // Only accept emails from the exact no-reply sender (skip marketing@...)
        if (fromAddr !== CBTL_FROM_EXACT) {
          console.log(`[IMAP] Skipping: from address "${fromAddr}" is not ${CBTL_FROM_EXACT}`);
          continue;
        }

        // Strictly reject emails received BEFORE this claim was created
        const emailDate = msg.internalDate ? new Date(msg.internalDate) : null;
        if (!emailDate || emailDate < since) {
          console.log(`[IMAP] Skipping: email date ${emailDate?.toISOString()} is before claim created ${since.toISOString()}`);
          continue;
        }

        // Subject must contain "OTP"
        if (!subject.toLowerCase().includes(CBTL_SUBJECT_CONTAINS.toLowerCase())) {
          console.log(`[IMAP] Skipping: subject doesn't contain "${CBTL_SUBJECT_CONTAINS}"`);
          continue;
        }

        // Parse email to get raw headers (envelope may normalize dots in Gmail)
        if (!msg.source) {
          console.log(`[IMAP] Skipping: no source for uid ${uid}`);
          continue;
        }
        const parsed = await simpleParser(msg.source);

        // Match To: by EXACT address only — use parsed headers which preserve original dots
        const parsedToAddrs = (parsed.to
          ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to])
              .flatMap((t) => ("value" in t ? t.value : [t]))
              .map((a) => (a.address ?? "").toLowerCase())
          : toAddrs
        );
        console.log(`[IMAP] To addresses (envelope): ${toAddrs.join(", ")}, (parsed): ${parsedToAddrs.join(", ")}, looking for: ${targetTo}`);
        if (!parsedToAddrs.includes(targetTo)) {
          console.log(`[IMAP] Skipping: parsed to address doesn't match ${targetTo}`);
          continue;
        }
        const textBody = (parsed.text ?? "").trim();
        const htmlBody = typeof parsed.html === "string" ? parsed.html : "";
        const decodedHtmlText = htmlBody.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
        // Prefer plain text version; fall back to decoded HTML text
        const bodyForOtp = textBody.length > 0 ? textBody : decodedHtmlText;
        const bodyPreview = bodyForOtp.substring(0, 300).replace(/\n/g, " ");
        console.log(`[IMAP] Parsed body preview: ${bodyPreview}...`);
        const otp = extractCbtlOtp(bodyForOtp);
        console.log(`[IMAP] OTP extraction result: ${otp ?? "null"}`);

        if (otp) {
          if (excludeOtps.includes(otp)) {
            console.log(`[IMAP] Skipping: OTP ${otp} is in excludeOtps list (already used)`);
            continue;
          }
          console.log(`[IMAP] SUCCESS! Found OTP: ${otp}, messageId: ${messageId}`);
          return {
            otp,
            receivedAt: msg.internalDate ? new Date(msg.internalDate) : new Date(),
            messageId
          };
        }
      }

      console.log(`[IMAP] No matching OTP found in ${uidArray.length} emails`);
      return null;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
    console.log(`[IMAP] Disconnected`);
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
