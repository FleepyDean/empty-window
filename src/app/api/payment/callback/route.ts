import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ToyyibPay webhook callback
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    
    const refNo = formData.get("refno") as string; // ToyyibPay reference
    const status = formData.get("status") as string; // 1 = success, 0 = pending, 3 = fail
    const reason = formData.get("reason") as string; // Failure reason
    const billCode = formData.get("billcode") as string;
    const orderId = formData.get("order_id") as string;
    const amount = formData.get("amount") as string;

    if (!billCode || !orderId) {
      return NextResponse.json({ message: "Invalid callback data" }, { status: 400 });
    }

    // Find payment record
    const payment = await prisma.payment.findUnique({
      where: { billCode },
      include: { order: true },
    });

    if (!payment) {
      return NextResponse.json({ message: "Payment not found" }, { status: 404 });
    }

    // Update payment status based on callback
    if (status === "1") {
      // Payment successful
      await prisma.$transaction([
        prisma.payment.update({
          where: { billCode },
          data: {
            status: "paid",
            paidAt: new Date(),
            transactionId: refNo,
            metadata: JSON.stringify({ callbackAmount: amount, reason }),
          },
        }),
        prisma.order.update({
          where: { orderId: payment.orderId },
          data: { status: "paid" },
        }),
      ]);
    } else if (status === "3") {
      // Payment failed
      await prisma.payment.update({
        where: { billCode },
        data: {
          status: "failed",
          metadata: JSON.stringify({ reason, callbackAmount: amount }),
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
