import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/hitpay";

// HitPay webhook callback
// HitPay sends JSON body with HMAC-SHA256 signature in Hitpay-Signature header
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("hitpay-signature") ?? "";

    // Verify webhook signature
    if (!verifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ message: "Invalid signature" }, { status: 401 });
    }

    const data = JSON.parse(rawBody);

    // HitPay payment_request webhook payload
    const paymentRequestId = data.id as string;
    const status = data.status as string; // "completed" | "failed" | "pending" | etc.
    const referenceNumber = data.reference_number as string; // Our orderId

    if (!paymentRequestId || !referenceNumber) {
      return NextResponse.json({ message: "Invalid callback data" }, { status: 400 });
    }

    // Find payment record by billCode (HitPay payment request ID)
    const payment = await prisma.payment.findUnique({
      where: { billCode: paymentRequestId },
      include: { order: true },
    });

    if (!payment) {
      return NextResponse.json({ message: "Payment not found" }, { status: 404 });
    }

    if (status === "completed") {
      // Payment successful
      await prisma.$transaction([
        prisma.payment.update({
          where: { billCode: paymentRequestId },
          data: {
            status: "paid",
            paidAt: new Date(),
            transactionId: paymentRequestId,
            metadata: JSON.stringify({ hitpayStatus: status, amount: data.amount }),
          },
        }),
        prisma.order.update({
          where: { orderId: payment.orderId },
          data: { status: "paid" },
        }),
      ]);
    } else if (status === "failed") {
      // Payment failed
      await prisma.payment.update({
        where: { billCode: paymentRequestId },
        data: {
          status: "failed",
          metadata: JSON.stringify({ hitpayStatus: status, reason: data.status_reason ?? null }),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Payment callback error:", error);
    return NextResponse.json(
      { message: "Callback processing failed" },
      { status: 500 }
    );
  }
}
