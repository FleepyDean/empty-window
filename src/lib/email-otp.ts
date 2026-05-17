import { ImapFlow } from "imapflow";

const IMAP_HOST = process.env.GMAIL_IMAP_HOST ?? "imap.gmail.com";
const IMAP_PORT = Number(process.env.GMAIL_IMAP_PORT ?? 993);
const IMAP_USER = process.env.GMAIL_BASE_EMAIL ?? "";
const IMAP_PASS = process.env.GMAIL_APP_PASSWORD ?? "";

// CBTL OTP email signature
// The actual sender is no-reply@my.thecoffeebeanandtealeaf.com (MyCBTL)
const CBTL_FROM_DOMAIN = "my.thecoffeebeanandtealeaf.com";
const CBTL_SUBJECT_CONTAINS = "OTP";  // Broader match

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
          from: CBTL_FROM_DOMAIN,
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
      // Canonical form strips dots from local part (Gmail ignores dots)
      const canonicalize = (addr: string) => {
        const [local, domain] = addr.split("@");
        return `${(local ?? "").replace(/\./g, "")}@${domain ?? ""}`;
      };
      const targetCanonical = canonicalize(targetTo);
      console.log(`[IMAP] Target to: ${targetTo} (canonical: ${targetCanonical})`);

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

        // To must match — first try exact, then canonical (dot-stripped) comparison
        const toCanonicals = toAddrs.map(canonicalize);
        console.log(`[IMAP] To addresses: ${toAddrs.join(", ")} (canonicals: ${toCanonicals.join(", ")})`);
        const toMatches = toAddrs.includes(targetTo) || toCanonicals.includes(targetCanonical);
        if (!toMatches) {
          console.log(`[IMAP] Skipping: to address doesn't match ${targetTo} or ${targetCanonical}`);
          continue;
        }

        // Extract OTP — first 6-digit run in body, ignoring alphanumeric
        const body = msg.source ? msg.source.toString("utf8") : "";
        // Log first 500 chars of body for debugging
        const bodyPreview = body.substring(0, 500).replace(/\n/g, " ");
        console.log(`[IMAP] Body preview: ${bodyPreview}...`);
        const otp = extractSixDigitOtp(body);
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
 * Extract a 6-digit OTP from email body.
 * CBTL emails contain:
 *   - the OTP as a standalone 6-digit number (e.g. 292762)
 *   - an alphanumeric reference like "F89B45" — IGNORE this
 * Strategy: find all standalone 6-digit numeric runs and pick the first one.
 * Handles HTML emails by stripping tags first.
 */
export function extractSixDigitOtp(body: string): string | null {
  if (!body) return null;

  // Remove HTML tags for HTML emails
  const textOnly = body.replace(/<[^>]+>/g, " ");

  // First try: look for 6 digits that are not adjacent to other digits or letters
  // This avoids matching parts of longer numbers or alphanumeric codes
  const strictMatches = textOnly.match(/(?<![A-Za-z0-9])\d{6}(?![A-Za-z0-9])/g);
  if (strictMatches && strictMatches.length > 0) {
    return strictMatches[0];
  }

  // Second try: look for any 6 consecutive digits (more lenient)
  const lenientMatches = textOnly.match(/\d{6}/g);
  if (lenientMatches && lenientMatches.length > 0) {
    return lenientMatches[0];
  }

  return null;
}
