import { PRODUCT_MAP, isProductKey } from "@/lib/products";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

function buildOrderId(productKey: string) {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${productKey.toUpperCase()}-${stamp}-${random}`;
}

export async function POST(request: Request) {
  const { productKey, quantity } = await request.json();

  if (!productKey || typeof productKey !== "string" || !isProductKey(productKey)) {
    return NextResponse.json({ message: "Valid product is required." }, { status: 400 });
  }

  const qty = typeof quantity === "number" && quantity >= 1 ? quantity : 1;

  const product = PRODUCT_MAP[productKey];
  const order = await prisma.order.create({
    data: {
      orderId: buildOrderId(productKey),
      productKey: product.key,
      productName: product.name,
      serviceCode: product.serviceCode,
      quantity: qty,
      status: "active"
    }
  });

  return NextResponse.json({
    message: "Checkout successful",
    orderId: order.orderId,
    productName: order.productName,
    quantity: order.quantity
  });
}
