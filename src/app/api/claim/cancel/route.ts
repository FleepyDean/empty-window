import { cancelNumber } from "@/lib/herosms";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { claimId, reason } = await request.json();

  if (!claimId || typeof claimId !== "string") {
    return NextResponse.json({ message: "claimId is required." }, { status: 400 });
  }

  const claim = await prisma.claim.findUnique({ where: { claimId } });
  if (!claim) {
    return NextResponse.json({ message: "Claim session not found." }, { status: 404 });
  }

  if (claim.status === "success") {
    return NextResponse.json(
      { message: "OTP already received. Claim cannot be cancelled." },
      { status: 409 }
    );
  }

  if (claim.status === "waiting_otp") {
    try {
      await cancelNumber(claim.heroActivationId);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      const isEarlyCancel = raw.includes("EARLY_CANCEL");
      const message = isEarlyCancel
        ? "You can only cancel after 2 minutes. Please wait and try again."
        : "Cancellation failed. Please try again.";
      return NextResponse.json({ message }, { status: isEarlyCancel ? 409 : 502 });
    }
  }

  // Restore quantity if it was deducted
  const nextState = await prisma.$transaction(async (tx) => {
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
      data: { status: reason === "expired" ? "expired" : "cancelled", quantityDeducted: false }
    });
  });

  return NextResponse.json({
    status: nextState?.status ?? "cancelled",
    message:
      reason === "expired"
        ? "Claim expired and cancelled automatically."
        : "Claim cancelled successfully."
  });
}
