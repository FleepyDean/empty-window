import { cancelNumber } from "@/lib/herosms";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { claimId } = await request.json();

  if (!claimId || typeof claimId !== "string") {
    return NextResponse.json({ message: "claimId is required." }, { status: 400 });
  }

  const claim = await prisma.claim.findUnique({ where: { claimId } });
  if (!claim) {
    return NextResponse.json({ message: "Claim session not found." }, { status: 404 });
  }

  if (claim.status === "waiting_otp" && claim.expiresAt.getTime() <= Date.now()) {
    // For CBTL: if no heroActivationId yet (still in email phase), skip HeroSMS cancel
    if (claim.heroActivationId) {
      try {
        await cancelNumber(claim.heroActivationId);
      } catch {
        // best-effort cancellation; still expire session locally
      }
    }

    const expiredClaim = await prisma.claim.update({
      where: { claimId },
      data: { status: "expired" }
    });

    return NextResponse.json({
      claimId: expiredClaim.claimId,
      phoneNumber: expiredClaim.phoneNumber,
      emailAddress: expiredClaim.emailAddress,
      emailOtp: expiredClaim.emailOtp,
      expiresAt: expiredClaim.expiresAt.getTime(),
      status: expiredClaim.status,
      otp: expiredClaim.otp
    });
  }

  return NextResponse.json({
    claimId: claim.claimId,
    phoneNumber: claim.phoneNumber,
    emailAddress: claim.emailAddress,
    emailOtp: claim.emailOtp,
    expiresAt: claim.expiresAt.getTime(),
    status: claim.status,
    otp: claim.otp
  });
}
