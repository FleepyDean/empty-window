import { ImapFlow } from "imapflow";

const IMAP_HOST = process.env.GMAIL_IMAP_HOST ?? "imap.gmail.com";
const IMAP_PORT = Number(process.env.GMAIL_IMAP_PORT ?? 993);
const IMAP_USER = process.env.GMAIL_BASE_EMAIL ?? "";
const IMAP_PASS = process.env.GMAIL_APP_PASSWORD ?? "";

// CBTL OTP email signature
const CBTL_FROM_DOMAIN = "thecoffeebeanandtealeaf.com";
const CBTL_SUBJECT = "Your OTP code";

export type EmailOtpResult = {
  otp: string;
  receivedAt: Date;
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
  since: Date
): Promise<EmailOtpResult | null> {
  assertConfig();

  // Log for debugging (these appear in Railway logs)
  console.log(`[IMAP] Searching for OTP email to: ${toEmail}, since: ${since.toISOString()}`);

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASS },
    logger: false
  });

  await client.connect();
  console.log(`[IMAP] Connected to ${IMAP_HOST}`);

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Use a broader search: look at emails from last 24 hours to handle timezone issues
      // IMAP SINCE is date-only, so we search recent emails and filter by envelope
      const searchSince = new Date(since);
      searchSince.setHours(searchSince.getHours() - 24); // Go back 24 hours to be safe

      console.log(`[IMAP] Searching with subject "${CBTL_SUBJECT}" since ${searchSince.toISOString()}`);

      // Search by Subject + Since (broader time window)
      const uids = await client.search(
        {
          subject: CBTL_SUBJECT,
          since: searchSince
        },
        { uid: true }
      );

      const uidArray = Array.isArray(uids) ? uids : [];
      console.log(`[IMAP] Found ${uidArray.length} emails with subject "${CBTL_SUBJECT}"`);

      if (uidArray.length === 0) return null;

      // Walk newest → oldest
      const sorted = [...uidArray].sort((a, b) => b - a);
      const targetTo = toEmail.toLowerCase().trim();

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
        const internalDate = msg.internalDate;

        console.log(`[IMAP] Checking email: from=${fromAddr}, to=${toAddrs.join(", ")}, subject="${subject}", date=${internalDate}`);

        // From must be CBTL
        if (!fromAddr.includes(CBTL_FROM_DOMAIN)) {
          console.log(`[IMAP] Skipping: from address doesn't match ${CBTL_FROM_DOMAIN}`);
          continue;
        }

        // To must match the exact dotted variation we assigned
        if (!toAddrs.includes(targetTo)) {
          console.log(`[IMAP] Skipping: to address doesn't match ${targetTo}`);
          continue;
        }

        // Extract OTP — first 6-digit run in body, ignoring alphanumeric
        const body = msg.source ? msg.source.toString("utf8") : "";
        const otp = extractSixDigitOtp(body);
        console.log(`[IMAP] OTP extraction result: ${otp ?? "null"}`);

        if (otp) {
          console.log(`[IMAP] SUCCESS! Found OTP: ${otp}`);
          return {
            otp,
            receivedAt: msg.internalDate ? new Date(msg.internalDate) : new Date()
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
 * Extract a 6-digit OTP from email body.
 * CBTL emails contain:
 *   - the OTP as a standalone 6-digit number (e.g. 292762)
 *   - an alphanumeric reference like "F89B45" — IGNORE this
 * Strategy: find all standalone 6-digit numeric runs (not adjacent to
 * letters/digits) and pick the first one.
 */
export function extractSixDigitOtp(body: string): string | null {
  if (!body) return null;
  // Match exactly 6 digits with non-alphanumeric (or boundary) on both sides
  const matches = body.match(/(?<![A-Za-z0-9])\d{6}(?![A-Za-z0-9])/g);
  if (!matches || matches.length === 0) return null;
  return matches[0];
}
