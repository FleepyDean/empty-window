import { getNumberCheapest } from "@/lib/herosms";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const CBTL_PRODUCT_KEY = "cbtl";
const CBTL_HERO_SERVICE = "ot";

/**
 * For CBTL claims: after email OTP is received, user proceeds to phone number phase.
 * This endpoint allocates a HeroSMS number and extends the claim expiration.
 */
export async function POST(request: Request) {
  const { claimId } = await request.json();

  if (!claimId || typeof claimId !== "string") {
    return NextResponse.json({ message: "claimId is required." }, { status: 400 });
  }

  const claim = await prisma.claim.findUnique({
    where: { claimId },
    include: { orderItem: true }
  });

  if (!claim) {
    return NextResponse.json({ message: "Claim not found." }, { status: 404 });
  }

  // Determine product key
  let productKey: string;
  if (claim.orderItemId && claim.orderItem) {
    productKey = claim.orderItem.productKey;
  } else {
    const order = await prisma.order.findUnique({ where: { orderId: claim.orderId } });
    productKey = order?.productKey ?? "";
  }

  if (productKey !== CBTL_PRODUCT_KEY) {
    return NextResponse.json(
      { message: "Phone-start is only for CBTL claims." },
      { status: 400 }
    );
  }

  // Already has a phone number — return existing
  if (claim.phoneNumber && claim.heroActivationId) {
    return NextResponse.json({
      claimId: claim.claimId,
      phoneNumber: claim.phoneNumber,
      expiresAt: claim.expiresAt.getTime()
    });
  }

  // Check if claim is still valid
  if (claim.status !== "waiting_otp" || claim.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { message: "Claim has expired or is no longer active." },
      { status: 409 }
    );
  }

  try {
    const heroNumber = await getNumberCheapest(CBTL_HERO_SERVICE);

    // Extend expiration by another 15 minutes for phone OTP phase
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
    const newExpiresAt = new Date(Date.now() + FIFTEEN_MINUTES_MS);

    const updated = await prisma.claim.update({
      where: { claimId },
      data: {
        phoneNumber: heroNumber.phoneNumber,
        heroActivationId: heroNumber.activationId,
        expiresAt: newExpiresAt
      }
    });

    return NextResponse.json({
      claimId: updated.claimId,
      phoneNumber: updated.phoneNumber,
      expiresAt: updated.expiresAt.getTime()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not allocate phone number.";
    return NextResponse.json({ message }, { status: 502 });
  }
}
