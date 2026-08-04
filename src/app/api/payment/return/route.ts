import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPaymentRequest } from "@/lib/hitpay";

// HitPay redirect URL after payment
// HitPay redirects with query params: reference (payment request ID) and status
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const paymentRequestId = searchParams.get("reference");
  const status = searchParams.get("status");

  if (!paymentRequestId) {
    return NextResponse.redirect(new URL("/checkout-failed", request.url));
  }

  try {
    // Find the payment record by HitPay payment request ID (stored as billCode)
    const payment = await prisma.payment.findUnique({
      where: { billCode: paymentRequestId },
      include: { order: true },
    });

    if (!payment || !payment.order) {
      return NextResponse.redirect(new URL("/checkout-failed", request.url));
    }

    const orderId = payment.orderId;

    // Verify payment status with HitPay API (don't trust redirect URL alone)
    const paymentRequest = await getPaymentRequest(paymentRequestId);

    if (paymentRequest.status === "completed") {
      // Payment successful - update order and payment if not already done by webhook
      if (payment.status !== "paid") {
        await prisma.$transaction([
          prisma.payment.update({
            where: { billCode: paymentRequestId },
            data: {
              status: "paid",
              paidAt: new Date(),
              transactionId: paymentRequestId,
            },
          }),
          prisma.order.update({
            where: { orderId },
            data: { status: "paid" },
          }),
        ]);
      }

      return NextResponse.redirect(
        new URL(`/payment-success?orderId=${orderId}`, request.url)
      );
    } else {
      // Payment failed or pending
      if (payment.status !== "paid") {
        await prisma.payment.update({
          where: { billCode: paymentRequestId },
          data: {
            status: paymentRequest.status === "failed" ? "failed" : "pending",
          },
        });
      }

      return NextResponse.redirect(new URL("/checkout-failed", request.url));
    }
  } catch (error) {
    console.error("Payment return error:", error);
    return NextResponse.redirect(new URL("/checkout-failed", request.url));
  }
}
