import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { orderId } = await request.json();
  const trimmedOrderId = typeof orderId === "string" ? orderId.trim() : "";

  if (!trimmedOrderId) {
    return NextResponse.json(
      { valid: false, message: "Order ID is required." },
      { status: 400 }
    );
  }

  const order = await prisma.order.findUnique({ where: { orderId: trimmedOrderId } });
  if (!order) {
    return NextResponse.json(
      { valid: false, message: "Invalid order ID." },
      { status: 404 }
    );
  }

  if (order.quantity <= 0 && order.status !== "depleted") {
    await prisma.order.update({
      where: { orderId: trimmedOrderId },
      data: { status: "depleted" }
    });
  }

  return NextResponse.json({
    valid: order.quantity > 0,
    orderId: trimmedOrderId,
    productKey: order.productKey,
    productName: order.productName,
    serviceCode: order.serviceCode,
    quantity: order.quantity,
    status: order.quantity > 0 ? "active" : "depleted",
    message: order.quantity > 0 ? "Order validated." : "Order is depleted."
  });
}
