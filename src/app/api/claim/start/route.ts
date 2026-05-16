import { getNumberCheapest } from "@/lib/herosms";
import { prisma } from "@/lib/prisma";
import { cleanupExpiredClaims } from "@/lib/claim-cleanup";
import { assignEmailToClaim } from "@/lib/email-pool";
import { NextResponse } from "next/server";

const CBTL_PRODUCT_KEY = "cbtl";

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
  let productKey: string;
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
    productKey = item.productKey;
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
    productKey = availableItem.productKey;
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
    productKey = order.productKey;
    canClaim = order.quantity > 0;
  }

  const isEmailFirst = productKey === CBTL_PRODUCT_KEY;

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
      emailAddress: existingActiveClaim.emailAddress,
      emailOtp: existingActiveClaim.emailOtp,
      expiresAt: existingActiveClaim.expiresAt.getTime(),
      productName
    });
  }

  // Before creating new claim, auto-cancel any expired claims and restore their quantities
  await cleanupExpiredClaims(trimmedOrderId);

  try {
    if (isEmailFirst) {
      // CBTL: email phase first, no HeroSMS yet
      const newClaimId = buildClaimId();

      // Deduct quantity + create claim shell first (without email yet)
      await prisma.$transaction(async (tx) => {
        if (targetItemId) {
          const orderItem = await tx.orderItem.findUnique({ where: { id: targetItemId } });
          if (!orderItem || orderItem.remainingQty <= 0) {
            throw new Error("Product depleted during claim process.");
          }
          await tx.orderItem.update({
            where: { id: targetItemId },
            data: { remainingQty: orderItem.remainingQty - 1 }
          });
        } else {
          const ord = await tx.order.findUnique({ where: { orderId: trimmedOrderId } });
          if (!ord || ord.quantity <= 0) {
            throw new Error("Order depleted during claim process.");
          }
          await tx.order.update({
            where: { orderId: trimmedOrderId },
            data: { quantity: ord.quantity - 1 }
          });
        }

        await tx.claim.create({
          data: {
            claimId: newClaimId,
            orderId: trimmedOrderId,
            orderItemId: targetItemId,
            expiresAt: new Date(Date.now() + FIFTEEN_MINUTES_MS),
            status: "waiting_otp",
            quantityDeducted: true
          }
        });
      });

      // Reserve an email from the pool. If pool is exhausted, roll back.
      const emailAddress = await assignEmailToClaim(newClaimId);
      if (!emailAddress) {
        // Rollback: restore quantity and delete the claim shell
        await prisma.$transaction(async (tx) => {
          await tx.claim.delete({ where: { claimId: newClaimId } }).catch(() => {});
          if (targetItemId) {
            const oi = await tx.orderItem.findUnique({ where: { id: targetItemId } });
            if (oi) {
              await tx.orderItem.update({
                where: { id: targetItemId },
                data: { remainingQty: oi.remainingQty + 1 }
              });
            }
          } else {
            const ord = await tx.order.findUnique({ where: { orderId: trimmedOrderId } });
            if (ord) {
              await tx.order.update({
                where: { orderId: trimmedOrderId },
                data: { quantity: ord.quantity + 1 }
              });
            }
          }
        });
        return NextResponse.json(
          { message: "No emails available in the pool. Please contact support." },
          { status: 503 }
        );
      }

      const claim = await prisma.claim.update({
        where: { claimId: newClaimId },
        data: { emailAddress }
      });

      return NextResponse.json({
        claimId: claim.claimId,
        phoneNumber: null,
        emailAddress: claim.emailAddress,
        emailOtp: null,
        expiresAt: claim.expiresAt.getTime(),
        productName
      });
    }

    // Default flow (non-CBTL): claim a HeroSMS number immediately
    const heroNumber = await getNumberCheapest(heroServiceCode);

    const claim = await prisma.$transaction(async (tx) => {
      if (targetItemId) {
        const orderItem = await tx.orderItem.findUnique({ where: { id: targetItemId } });
        if (!orderItem || orderItem.remainingQty <= 0) {
          throw new Error("Product depleted during claim process.");
        }
        await tx.orderItem.update({
          where: { id: targetItemId },
          data: { remainingQty: orderItem.remainingQty - 1 }
        });
      } else {
        const ord = await tx.order.findUnique({ where: { orderId: trimmedOrderId } });
        if (!ord || ord.quantity <= 0) {
          throw new Error("Order depleted during claim process.");
        }
        await tx.order.update({
          where: { orderId: trimmedOrderId },
          data: { quantity: ord.quantity - 1 }
        });
      }

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
      emailAddress: null,
      emailOtp: null,
      expiresAt: claim.expiresAt.getTime(),
      productName
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not claim number from HeroSMS.";
    return NextResponse.json({ message }, { status: 502 });
  }
}

