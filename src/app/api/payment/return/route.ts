import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBillTransactions } from "@/lib/toyyibpay";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const billCode = searchParams.get("billcode");
  const statusId = searchParams.get("status_id");
  const orderId = searchParams.get("order_id");

  if (!billCode || !orderId) {
    return NextResponse.redirect(new URL("/checkout-failed", request.url));
  }

  try {
    // Find the order and payment
    const order = await prisma.order.findUnique({
      where: { orderId },
      include: { payment: true },
    });

    if (!order || !order.payment) {
      return NextResponse.redirect(new URL("/checkout-failed", request.url));
    }

    // Verify payment status with ToyyibPay
    const transactions = await getBillTransactions(billCode);
    const paidTransaction = (transactions as Array<{ status: string }>).find(
      (t) => t.status === "1" || t.status === "Success"
    );

    if (paidTransaction || statusId === "1") {
      // Payment successful - update order and payment
      await prisma.$transaction([
        prisma.payment.update({
          where: { billCode },
          data: {
            status: "paid",
            paidAt: new Date(),
            transactionId: (paidTransaction as { transactionId?: string })?.transactionId || null,
          },
        }),
        prisma.order.update({
          where: { orderId },
          data: {
            status: "paid",
          },
        }),
      ]);

      // Redirect to success page
      return NextResponse.redirect(
        new URL(`/payment-success?orderId=${orderId}`, request.url)
      );
    } else {
      // Payment failed or pending
      await prisma.payment.update({
        where: { billCode },
        data: { status: statusId === "3" ? "failed" : "pending" },
      });

      return NextResponse.redirect(new URL("/checkout-failed", request.url));
    }

  } catch (error) {
    console.error("Payment return error:", error);
    return NextResponse.redirect(new URL("/checkout-failed", request.url));
  }
}
