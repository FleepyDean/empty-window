import { getNumberCheapest, cancelNumber, MY_OPERATORS, MAX_REPLACEMENTS } from "@/lib/herosms";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function buildClaimId() {
  return `claim-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export async function POST(request: Request) {
  const { claimId } = await request.json() as { claimId?: string };

  if (!claimId) {
    return NextResponse.json({ message: "claimId is required." }, { status: 400 });
  }

  const claim = await prisma.claim.findUnique({
    where: { claimId },
    include: {
      order: true,
      orderItem: true
    }
  });

  if (!claim) {
    return NextResponse.json({ message: "Claim not found." }, { status: 404 });
  }

  if (claim.status !== "waiting_otp") {
    return NextResponse.json({ message: "This claim is no longer active." }, { status: 409 });
  }

  // Get current replacement count from the relevant item/order
  const currentCount = claim.orderItem
    ? claim.orderItem.replacementCount
    : claim.order.replacementCount;

  if (currentCount >= MAX_REPLACEMENTS) {
    return NextResponse.json({
      message: `Maximum replacements (${MAX_REPLACEMENTS}) reached. Please contact support.`,
      replacementsLeft: 0
    }, { status: 409 });
  }

  // Pick next operator in rotation (index = currentCount)
  const nextOperator = MY_OPERATORS[currentCount];

  // Resolve the heroServiceCode from the item (cart orders) or order (legacy)
  const heroServiceCode = claim.orderItem
    ? claim.orderItem.heroServiceCode
    : claim.order.heroServiceCode;

  // Cancel current HeroSMS activation (best effort — no refund expected since OTP arrived)
  try {
    await cancelNumber(claim.heroActivationId);
  } catch { /* ignore */ }

  // Mark old claim as replaced (keep quantityDeducted=true, no qty restore needed)
  await prisma.claim.update({
    where: { claimId },
    data: { status: "replaced" }
  });

  // Increment replacement count on the order item or order
  if (claim.orderItemId) {
    await prisma.orderItem.update({
      where: { id: claim.orderItemId },
      data: { replacementCount: { increment: 1 } }
    });
  } else {
    await prisma.order.update({
      where: { orderId: claim.orderId },
      data: { replacementCount: { increment: 1 } }
    });
  }

  // Fetch new number from the next operator in rotation
  try {
    const heroNumber = await getNumberCheapest(heroServiceCode, nextOperator);

    const newClaim = await prisma.claim.create({
      data: {
        claimId: buildClaimId(),
        orderId: claim.orderId,
        orderItemId: claim.orderItemId,
        phoneNumber: heroNumber.phoneNumber,
        heroActivationId: heroNumber.activationId,
        expiresAt: new Date(Date.now() + FIFTEEN_MINUTES_MS),
        status: "waiting_otp",
        quantityDeducted: true,
        operator: nextOperator
      }
    });

    return NextResponse.json({
      claimId: newClaim.claimId,
      phoneNumber: newClaim.phoneNumber,
      expiresAt: newClaim.expiresAt.getTime(),
      operator: nextOperator,
      replacementsLeft: MAX_REPLACEMENTS - (currentCount + 1)
    });
  } catch (error) {
    // New number fetch failed — roll back replacement count and restore qty
    if (claim.orderItemId) {
      await prisma.orderItem.update({
        where: { id: claim.orderItemId },
        data: { remainingQty: { increment: 1 }, replacementCount: { decrement: 1 } }
      });
    } else {
      await prisma.order.update({
        where: { orderId: claim.orderId },
        data: { quantity: { increment: 1 }, replacementCount: { decrement: 1 } }
      });
    }

    const message = error instanceof Error ? error.message : "Could not get replacement number.";
    return NextResponse.json({ message }, { status: 502 });
  }
}
