import { getNumberCheapest, cancelNumber } from "@/lib/herosms";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function buildClaimId() {
  return `claim-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export async function POST(request: Request) {
  const { orderId, orderItemId } = await request.json();

  if (!orderId || typeof orderId !== "string") {
    return NextResponse.json({ message: "Order ID is required." }, { status: 400 });
  }

  const trimmedOrderId = orderId.trim();

  // Fetch order with items if it's a cart order
  const order = await prisma.order.findUnique({
    where: { orderId: trimmedOrderId },
    include: { items: true }
  });

  if (!order) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 });
  }

  // Determine if this is a cart order with OrderItems
  const isCartOrder = order.isCartOrder && order.items.length > 0;

  let heroServiceCode: string;
  let productName: string;
  let canClaim: boolean;
  let targetItemId: number | null = null;

  if (isCartOrder && orderItemId) {
    // Cart order: claim from specific OrderItem
    const item = order.items.find((i) => i.id === orderItemId);
    if (!item) {
      return NextResponse.json({ message: "Product not found in order." }, { status: 404 });
    }
    if (item.remainingQty <= 0) {
      return NextResponse.json({ message: "This product is depleted. Cannot claim a new number." }, { status: 409 });
    }
    heroServiceCode = item.heroServiceCode;
    productName = item.productName;
    canClaim = item.remainingQty > 0;
    targetItemId = item.id;
  } else if (isCartOrder && !orderItemId) {
    // Cart order but no specific item requested - find first available
    const availableItem = order.items.find((i) => i.remainingQty > 0);
    if (!availableItem) {
      return NextResponse.json({ message: "All products in this order are depleted." }, { status: 409 });
    }
    heroServiceCode = availableItem.heroServiceCode;
    productName = availableItem.productName;
    canClaim = true;
    targetItemId = availableItem.id;
  } else {
    // Legacy single-product order
    if (order.quantity <= 0) {
      if (order.status !== "depleted") {
        await prisma.order.update({
          where: { orderId: trimmedOrderId },
          data: { status: "depleted" }
        });
      }
      return NextResponse.json({ message: "Order is depleted. Cannot claim a new number." }, { status: 409 });
    }
    heroServiceCode = order.heroServiceCode;
    productName = order.productName;
    canClaim = order.quantity > 0;
  }

  if (!canClaim) {
    return NextResponse.json({ message: "Cannot claim - no remaining quantity." }, { status: 409 });
  }

  const now = new Date();
  const existingActiveClaim = await prisma.claim.findFirst({
    where: {
      orderId: trimmedOrderId,
      status: "waiting_otp",
      expiresAt: { gt: now }
    },
    orderBy: { createdAt: "desc" }
  });

  if (existingActiveClaim) {
    return NextResponse.json({
      claimId: existingActiveClaim.claimId,
      phoneNumber: existingActiveClaim.phoneNumber,
      expiresAt: existingActiveClaim.expiresAt.getTime(),
      productName
    });
  }

  // Before creating new claim, auto-cancel any expired claims and restore their quantities
  await cleanupExpiredClaims(trimmedOrderId);

  try {
    const heroNumber = await getNumberCheapest(heroServiceCode);

    // Create claim and deduct quantity in a transaction
    const claim = await prisma.$transaction(async (tx) => {
      // Deduct quantity immediately to prevent double claims
      if (targetItemId) {
        // Cart order: deduct from OrderItem
        const orderItem = await tx.orderItem.findUnique({ where: { id: targetItemId } });
        if (!orderItem || orderItem.remainingQty <= 0) {
          throw new Error("Product depleted during claim process.");
        }
        await tx.orderItem.update({
          where: { id: targetItemId },
          data: { remainingQty: orderItem.remainingQty - 1 }
        });
      } else {
        // Legacy single-product order
        const order = await tx.order.findUnique({ where: { orderId: trimmedOrderId } });
        if (!order || order.quantity <= 0) {
          throw new Error("Order depleted during claim process.");
        }
        await tx.order.update({
          where: { orderId: trimmedOrderId },
          data: { quantity: order.quantity - 1 }
        });
      }

      // Create the claim with quantityDeducted = true
      const newClaim = await tx.claim.create({
        data: {
          claimId: buildClaimId(),
          orderId: trimmedOrderId,
          orderItemId: targetItemId,
          phoneNumber: heroNumber.phoneNumber,
          heroActivationId: heroNumber.activationId,
          expiresAt: new Date(Date.now() + FIFTEEN_MINUTES_MS),
          status: "waiting_otp",
          quantityDeducted: true
        }
      });

      return newClaim;
    });

    return NextResponse.json({
      claimId: claim.claimId,
      phoneNumber: claim.phoneNumber,
      expiresAt: claim.expiresAt.getTime(),
      productName
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not claim number from HeroSMS.";
    return NextResponse.json({ message }, { status: 502 });
  }
}

// Helper function to auto-cancel expired claims and restore quantities
async function cleanupExpiredClaims(orderId: string) {
  const now = new Date();
  const expiredClaims = await prisma.claim.findMany({
    where: {
      orderId,
      status: "waiting_otp",
      expiresAt: { lte: now },
      quantityDeducted: true
    }
  });

  for (const claim of expiredClaims) {
    try {
      await prisma.$transaction(async (tx) => {
        // Restore quantity to OrderItem or Order
        if (claim.orderItemId) {
          const orderItem = await tx.orderItem.findUnique({ where: { id: claim.orderItemId } });
          if (orderItem) {
            await tx.orderItem.update({
              where: { id: claim.orderItemId },
              data: { remainingQty: orderItem.remainingQty + 1 }
            });
          }
        } else {
          const order = await tx.order.findUnique({ where: { orderId } });
          if (order) {
            await tx.order.update({
              where: { orderId },
              data: { quantity: order.quantity + 1, status: "active" }
            });
          }
        }

        // Update claim status to expired
        await tx.claim.update({
          where: { claimId: claim.claimId },
          data: { status: "expired", quantityDeducted: false }
        });

        // Try to cancel the number in HeroSMS (best effort)
        try {
          await cancelNumber(claim.heroActivationId);
        } catch {
          // Ignore cancellation errors
        }
      });
    } catch {
      // Continue with next claim if this one fails
    }
  }
}
