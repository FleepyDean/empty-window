import { cancelNumber, getOtp } from "@/lib/herosms";
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
    try {
      await cancelNumber(claim.heroActivationId);
    } catch {
      // best-effort cancellation; still expire session locally
    }

    // Restore quantity and mark as expired
    const expiredClaim = await prisma.$transaction(async (tx) => {
      if (claim.quantityDeducted) {
        if (claim.orderItemId) {
          const orderItem = await tx.orderItem.findUnique({ where: { id: claim.orderItemId } });
          if (orderItem) {
            await tx.orderItem.update({
              where: { id: claim.orderItemId },
              data: { remainingQty: orderItem.remainingQty + 1 }
            });
          }
        } else {
          const order = await tx.order.findUnique({ where: { orderId: claim.orderId } });
          if (order) {
            await tx.order.update({
              where: { orderId: claim.orderId },
              data: { quantity: order.quantity + 1, status: "active" }
            });
          }
        }
      }

      return await tx.claim.update({
        where: { claimId },
        data: { status: "expired", quantityDeducted: false }
      });
    });

    return NextResponse.json({
      status: expiredClaim.status,
      otp: null
    });
  }

  if (claim.status === "cancelled" || claim.status === "expired") {
    return NextResponse.json({
      status: claim.status,
      otp: null
    });
  }

  if (claim.status === "success") {
    return NextResponse.json({
      status: "success",
      otp: claim.otp
    });
  }

  let result;
  try {
    result = await getOtp(claim.heroActivationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not check OTP status.";
    return NextResponse.json({ message }, { status: 502 });
  }

  if (result.status === "cancelled") {
    // HeroSMS cancelled the number, restore quantity
    const claim = await prisma.claim.findUnique({ where: { claimId } });
    if (claim && claim.quantityDeducted) {
      await prisma.$transaction(async (tx) => {
        if (claim.orderItemId) {
          const orderItem = await tx.orderItem.findUnique({ where: { id: claim.orderItemId } });
          if (orderItem) {
            await tx.orderItem.update({
              where: { id: claim.orderItemId },
              data: { remainingQty: orderItem.remainingQty + 1 }
            });
          }
        } else {
          const order = await tx.order.findUnique({ where: { orderId: claim.orderId } });
          if (order) {
            await tx.order.update({
              where: { orderId: claim.orderId },
              data: { quantity: order.quantity + 1, status: "active" }
            });
          }
        }
        await tx.claim.update({
          where: { claimId },
          data: { status: "cancelled", quantityDeducted: false }
        });
      });
    } else {
      await prisma.claim.update({
        where: { claimId },
        data: { status: "cancelled" }
      });
    }
    return NextResponse.json({
      status: "cancelled",
      otp: null
    });
  }

  if (!result.otp) {
    return NextResponse.json({
      status: "waiting_otp",
      otp: null
    });
  }

  const updatedClaim = await prisma.$transaction(async (tx) => {
    const currentClaim = await tx.claim.findUnique({ where: { claimId } });
    if (!currentClaim) {
      return null;
    }

    let nextClaim = currentClaim;
    if (currentClaim.status !== "success") {
      nextClaim = await tx.claim.update({
        where: { claimId },
        data: { status: "success", otp: result.otp, quantityDeducted: true }
      });
    }

    // Quantity was already deducted when claim started
    // Just need to check if order should be marked as depleted
    if (nextClaim.orderItemId) {
      const order = await tx.order.findUnique({
        where: { orderId: nextClaim.orderId },
        include: { items: true }
      });
      if (order) {
        const totalRemaining = order.items.reduce((sum, item) => sum + item.remainingQty, 0);
        if (totalRemaining === 0) {
          await tx.order.update({
            where: { orderId: order.orderId },
            data: { status: "depleted" }
          });
        }
      }
    } else {
      // Legacy single-product order
      const order = await tx.order.findUnique({ where: { orderId: nextClaim.orderId } });
      if (order && order.quantity <= 0) {
        await tx.order.update({
          where: { orderId: order.orderId },
          data: { status: "depleted" }
        });
      }
    }

    return nextClaim;
  });

  if (!updatedClaim) {
    return NextResponse.json({ message: "Could not update claim." }, { status: 500 });
  }

  return NextResponse.json({
    status: "success",
    otp: updatedClaim.otp
  });
}
