import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

/**
 * Re-open a completed/expired CBTL claim to fetch a new OTP email.
 * Re-uses the SAME email address (same dot placement) so CBTL sends the
 * new OTP to the same address the user registered with.
 *
 * The order quantity is NOT deducted again — this is not a new claim,
 * just a re-poll for a fresh OTP on an already-consumed slot.
 */
export async function POST(request: Request) {
  const { claimId } = await request.json();

  if (!claimId || typeof claimId !== "string") {
    return NextResponse.json({ message: "claimId is required." }, { status: 400 });
  }

  const claim = await prisma.claim.findUnique({ where: { claimId } });
  if (!claim) {
    return NextResponse.json({ message: "Claim not found." }, { status: 404 });
  }

  if (!claim.emailAddress) {
    return NextResponse.json({ message: "No email address on this claim." }, { status: 400 });
  }

  // Only allow on CBTL claims that have succeeded or are already waiting
  const allowedStatuses = ["success", "waiting_otp", "expired"];
  if (!allowedStatuses.includes(claim.status)) {
    return NextResponse.json(
      { message: "Cannot request new OTP for a cancelled or replaced claim." },
      { status: 409 }
    );
  }

  const newExpiresAt = new Date(Date.now() + FIFTEEN_MINUTES_MS);

  // Reset OTP fields and extend expiry — keep same email address
  const updated = await prisma.claim.update({
    where: { claimId },
    data: {
      emailOtp: null,
      emailMessageId: null,
      emailFetchedAt: null,
      otp: null,
      status: "waiting_otp",
      expiresAt: newExpiresAt
    }
  });

  return NextResponse.json({
    claimId: updated.claimId,
    emailAddress: updated.emailAddress,
    expiresAt: updated.expiresAt.getTime(),
    status: updated.status
  });
}
