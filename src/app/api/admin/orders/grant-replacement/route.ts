import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Admin grants one extra replacement to a customer whose number was burned again.
// Decrements replacementCount by 1 (floored at 0) so the customer can replace once more.
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { orderId, itemId } = await request.json() as { orderId?: string; itemId?: number };

  if (!orderId) {
    return NextResponse.json({ message: "orderId is required." }, { status: 400 });
  }

  if (itemId !== undefined && itemId !== null) {
    // Cart order — grant on specific OrderItem
    const item = await prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!item || item.orderId !== orderId) {
      return NextResponse.json({ message: "Order item not found." }, { status: 404 });
    }
    if (item.replacementCount <= 0) {
      return NextResponse.json({ message: "Replacement count is already at 0." }, { status: 400 });
    }
    const updated = await prisma.orderItem.update({
      where: { id: itemId },
      data: { replacementCount: item.replacementCount - 1 }
    });
    return NextResponse.json({ message: "Replacement granted.", replacementCount: updated.replacementCount });
  } else {
    // Legacy single-product order
    const order = await prisma.order.findUnique({ where: { orderId } });
    if (!order) {
      return NextResponse.json({ message: "Order not found." }, { status: 404 });
    }
    if (order.replacementCount <= 0) {
      return NextResponse.json({ message: "Replacement count is already at 0." }, { status: 400 });
    }
    const updated = await prisma.order.update({
      where: { orderId },
      data: { replacementCount: order.replacementCount - 1 }
    });
    return NextResponse.json({ message: "Replacement granted.", replacementCount: updated.replacementCount });
  }
}
