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
 * delivered to the given dotted-variation address since `since`.
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

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASS },
    logger: false
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Search by Subject + Since. We post-filter by To/From to be tolerant
      // of how IMAP servers handle plus/dot addressing in TO searches.
      const uids = await client.search(
        {
          subject: CBTL_SUBJECT,
          since
        },
        { uid: true }
      );

      if (!uids || uids.length === 0) return null;

      // Walk newest → oldest
      const sorted = [...uids].sort((a, b) => b - a);
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

        // From must be CBTL
        const fromAddr = env.from?.[0]?.address?.toLowerCase() ?? "";
        if (!fromAddr.includes(CBTL_FROM_DOMAIN)) continue;

        // To must match the exact dotted variation we assigned
        const toAddrs = (env.to ?? []).map((a: { address?: string }) => (a.address ?? "").toLowerCase());
        if (!toAddrs.includes(targetTo)) continue;

        // Extract OTP — first 6-digit run in body, ignoring alphanumeric
        // reference codes like "F89B45" which are mixed-case hex.
        const body = msg.source ? msg.source.toString("utf8") : "";
        const otp = extractSixDigitOtp(body);
        if (otp) {
          return {
            otp,
            receivedAt: msg.internalDate ?? new Date()
          };
        }
      }

      return null;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
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
