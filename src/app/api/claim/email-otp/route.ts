import { fetchCbtlOtpForEmail } from "@/lib/email-otp";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/**
 * Poll the assigned Gmail inbox for the CBTL email OTP.
 *
 * - If the claim already has an emailOtp stored, return it (cached).
 * - Otherwise, scan IMAP for a CBTL "Your OTP code" message addressed to
 *   the claim's assigned dotted-variation, since the claim was created.
 *
 * Status codes returned to the client:
 *   200 { status: "waiting_email_otp" | "email_otp_ready" | <claim status>, emailOtp, emailAddress }
 */
export async function POST(request: Request) {
  const { claimId } = await request.json();

  if (!claimId || typeof claimId !== "string") {
    return NextResponse.json({ message: "claimId is required." }, { status: 400 });
  }

  const claim = await prisma.claim.findUnique({ where: { claimId } });
  if (!claim) {
    return NextResponse.json({ message: "Claim session not found." }, { status: 404 });
  }

  if (!claim.emailAddress) {
    return NextResponse.json(
      { message: "This claim has no assigned email address." },
      { status: 400 }
    );
  }

  // Already have the email OTP stored — return it directly
  if (claim.emailOtp) {
    return NextResponse.json({
      status: "email_otp_ready",
      emailAddress: claim.emailAddress,
      emailOtp: claim.emailOtp
    });
  }

  // Don't poll IMAP for terminal claims
  if (claim.status === "cancelled" || claim.status === "expired" || claim.status === "replaced") {
    return NextResponse.json({
      status: claim.status,
      emailAddress: claim.emailAddress,
      emailOtp: null
    });
  }

  // Poll inbox — search since claim creation
  let result;
  try {
    result = await fetchCbtlOtpForEmail(claim.emailAddress, claim.createdAt);
  } catch (err) {
    const message = err instanceof Error ? err.message : "IMAP error";
    return NextResponse.json({ message }, { status: 502 });
  }

  if (!result) {
    return NextResponse.json({
      status: "waiting_email_otp",
      emailAddress: claim.emailAddress,
      emailOtp: null
    });
  }

  // For CBTL: mark as success after email OTP (no phone phase)
  const updated = await prisma.claim.update({
    where: { claimId },
    data: {
      emailOtp: result.otp,
      emailFetchedAt: result.receivedAt,
      status: "success",
      otp: result.otp,  // Use email OTP as the final OTP
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Extend validity for display
    }
  });

  return NextResponse.json({
    status: "success",
    emailAddress: updated.emailAddress,
    emailOtp: updated.emailOtp,
    otp: updated.otp
  });
}
