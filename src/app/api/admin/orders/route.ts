import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { isProductKey, PRODUCT_MAP, type ProductKey } from "@/lib/products";
import { NextResponse } from "next/server";

function buildOrderId() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${stamp}-${random}`;
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { claims: true } },
      items: true
    }
  });

  const stats = {
    total: orders.length,
    active: orders.filter((o) => o.status === "active").length,
    depleted: orders.filter((o) => o.status === "depleted").length,
    totalQuantity: orders.reduce((sum, o) => sum + o.quantity, 0)
  };

  return NextResponse.json({ orders, stats });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { productKey, quantity, cart } = await request.json();

  const orderItems: Array<{
    productKey: string;
    productName: string;
    serviceCode: string;
    heroServiceCode: string;
    quantity: number;
  }> = [];

  // Check if this is a cart order or single product
  if (cart && Array.isArray(cart) && cart.length > 0) {
    // Cart order - multiple products
    for (const item of cart) {
      if (!item.productKey || !isProductKey(item.productKey)) {
        return NextResponse.json({ message: `Invalid product key: ${item.productKey}` }, { status: 400 });
      }
      const qty = typeof item.quantity === "number" && item.quantity >= 1 ? item.quantity : 1;
      const product = PRODUCT_MAP[item.productKey as ProductKey];
      orderItems.push({
        productKey: product.key,
        productName: product.name,
        serviceCode: product.serviceCode,
        heroServiceCode: product.heroServiceCode,
        quantity: qty
      });
    }
  } else if (productKey && isProductKey(productKey)) {
    // Legacy single product order
    const qty = typeof quantity === "number" && quantity >= 1 ? quantity : 1;
    const product = PRODUCT_MAP[productKey];
    orderItems.push({
      productKey: product.key,
      productName: product.name,
      serviceCode: product.serviceCode,
      heroServiceCode: product.heroServiceCode,
      quantity: qty
    });
  } else {
    return NextResponse.json({ message: "Valid product key is required." }, { status: 400 });
  }

  const isCartOrder = orderItems.length > 1;
  const primaryItem = orderItems[0];
  const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);

  const order = await prisma.order.create({
    data: {
      orderId: buildOrderId(),
      productKey: primaryItem.productKey,
      productName: primaryItem.productName,
      serviceCode: primaryItem.serviceCode,
      heroServiceCode: primaryItem.heroServiceCode,
      quantity: totalQuantity,
      isCartOrder,
      status: "active",
      items: isCartOrder ? {
        create: orderItems.map((item) => ({
          productKey: item.productKey,
          productName: item.productName,
          serviceCode: item.serviceCode,
          heroServiceCode: item.heroServiceCode,
          quantity: item.quantity,
          remainingQty: item.quantity,
          pricePerUnit: 0 // Admin orders don't have price
        }))
      } : undefined
    },
    include: {
      items: true
    }
  });

  return NextResponse.json({ message: "Order created.", order });
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { orderId, newOrderId, newQuantity } = await request.json();
  if (!orderId) {
    return NextResponse.json({ message: "Order ID is required." }, { status: 400 });
  }

  const existing = await prisma.order.findUnique({ where: { orderId } });
  if (!existing) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (typeof newOrderId === "string" && newOrderId.trim() && newOrderId !== orderId) {
    const conflict = await prisma.order.findUnique({ where: { orderId: newOrderId.trim() } });
    if (conflict) {
      return NextResponse.json({ message: "New Order ID already exists." }, { status: 409 });
    }
    data.orderId = newOrderId.trim();
  }

  if (typeof newQuantity === "number" && newQuantity >= 0) {
    data.quantity = newQuantity;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.order.update({ where: { orderId }, data });
  return NextResponse.json({ message: "Order updated.", order: updated });
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { orderId } = await request.json();
  if (!orderId) {
    return NextResponse.json({ message: "Order ID is required." }, { status: 400 });
  }

  const existing = await prisma.order.findUnique({ where: { orderId } });
  if (!existing) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    // Delete order items first (if cart order)
    await tx.orderItem.deleteMany({ where: { orderId } });
    // Delete claims
    await tx.claim.deleteMany({ where: { orderId } });
    // Delete order
    await tx.order.delete({ where: { orderId } });
  });

  return NextResponse.json({ message: `Order ${orderId} deleted.` });
}
