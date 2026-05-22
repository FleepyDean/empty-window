import { cancelNumber } from "@/lib/herosms";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { claimId } = await request.json();

  if (!claimId || typeof claimId !== "string") {
    return NextResponse.json({ message: "claimId is required." }, { status: 400 });
  }

  const claim = await prisma.claim.findUnique({
    where: { claimId },
    include: {
      orderItem: true,
      order: true,
      luckinAccount: true
    }
  });
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

    await prisma.claim.update({
      where: { claimId },
      data: { status: "expired" }
    });

    // Refetch with relations for product info
    const expiredClaimWithRelations = await prisma.claim.findUnique({
      where: { claimId },
      include: { orderItem: true, order: true, luckinAccount: true }
    });

    return NextResponse.json({
      claimId: expiredClaimWithRelations!.claimId,
      phoneNumber: expiredClaimWithRelations!.phoneNumber,
      emailAddress: expiredClaimWithRelations!.emailAddress,
      emailOtp: expiredClaimWithRelations!.emailOtp,
      expiresAt: expiredClaimWithRelations!.expiresAt.getTime(),
      status: expiredClaimWithRelations!.status,
      otp: expiredClaimWithRelations!.otp,
      productKey: expiredClaimWithRelations!.orderItem?.productKey ?? expiredClaimWithRelations!.order?.productKey ?? null,
      productName: expiredClaimWithRelations!.orderItem?.productName ?? expiredClaimWithRelations!.order?.productName ?? null,
      accountPassword: expiredClaimWithRelations!.luckinAccount?.password ?? null
    });
  }

  return NextResponse.json({
    claimId: claim.claimId,
    phoneNumber: claim.phoneNumber,
    emailAddress: claim.emailAddress,
    emailOtp: claim.emailOtp,
    expiresAt: claim.expiresAt.getTime(),
    status: claim.status,
    otp: claim.otp,
    productKey: claim.orderItem?.productKey ?? claim.order?.productKey ?? null,
    productName: claim.orderItem?.productName ?? claim.order?.productName ?? null,
    accountPassword: claim.luckinAccount?.password ?? null
  });
}
