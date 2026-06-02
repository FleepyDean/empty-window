import { resendOtp } from "@/lib/herosms";
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

  if (claim.status !== "success") {
    return NextResponse.json({ message: "OTP not yet received for this claim." }, { status: 409 });
  }

  if (claim.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ message: "Claim has expired. Cannot resend OTP." }, { status: 410 });
  }

  if (!claim.heroActivationId) {
    return NextResponse.json({ message: "No HeroSMS activation found for this claim." }, { status: 422 });
  }

  try {
    const result = await resendOtp(claim.heroActivationId);
    if (!result.success) {
      return NextResponse.json(
        { message: `HeroSMS resend failed: ${result.raw}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ message: "OTP resend requested successfully." });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to resend OTP." },
      { status: 500 }
    );
  }
}
