import { isAdminAuthenticated } from "@/lib/admin-auth";
import { fetchCbtlOtpForEmail } from "@/lib/email-otp";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/cbtl-register/email-otp?email=<email>
 * Poll the Gmail inbox for the most recent CBTL OTP email sent to the given address.
 * Used on the registration page — no claim record needed.
 */
export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const sinceParam = searchParams.get("since");

  if (!email) return NextResponse.json({ message: "email is required" }, { status: 400 });

  // Default: look back 30 minutes if no since provided
  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 30 * 60 * 1000);

  try {
    const result = await fetchCbtlOtpForEmail(email, since);
    if (result) {
      return NextResponse.json({ status: "success", otp: result.otp, receivedAt: result.receivedAt });
    }
    return NextResponse.json({ status: "waiting", otp: null });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "IMAP error" },
      { status: 502 }
    );
  }
}
