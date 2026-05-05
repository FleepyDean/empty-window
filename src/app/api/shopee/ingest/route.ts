import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { matchProductByKeyword } from "@/lib/product-matcher";

// Optional shared secret to prevent random POSTs (set in .env)
const INGEST_SECRET = process.env.SHOPEE_INGEST_SECRET || "";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-ingest-secret",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function jsonWithCors(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, { status: init?.status, headers: CORS_HEADERS });
}

type IncomingItem = {
  productName: string;
  quantity: number;
};

type IncomingOrder = {
  shopeeOrderId: string;
  items: IncomingItem[];
};

export async function POST(request: Request) {
  // Optional auth check
  if (INGEST_SECRET) {
    const auth = request.headers.get("x-ingest-secret");
    if (auth !== INGEST_SECRET) {
      return jsonWithCors({ message: "Unauthorized" }, { status: 401 });
    }
  }

  let body: { orders?: IncomingOrder[] };
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ message: "Invalid JSON body." }, { status: 400 });
  }

  const orders = Array.isArray(body.orders) ? body.orders : [];
  if (orders.length === 0) {
    return jsonWithCors({ message: "No orders provided." }, { status: 400 });
  }

  const results: Array<{
    shopeeOrderId: string;
    status: "created" | "duplicate" | "skipped" | "failed";
    orderId?: string;
    reason?: string;
  }> = [];

  for (const incoming of orders) {
    const sid = (incoming.shopeeOrderId || "").trim();
    if (!sid) {
      results.push({ shopeeOrderId: "", status: "skipped", reason: "Missing shopeeOrderId" });
      continue;
    }

    // Dedup by externalRef
    const existing = await prisma.order.findUnique({ where: { externalRef: sid } });
    if (existing) {
      results.push({
        shopeeOrderId: sid,
        status: "duplicate",
        orderId: existing.orderId,
      });
      continue;
    }

    // Match each item to a known product
    const matched: Array<{
      productKey: string;
      productName: string;
      serviceCode: string;
      heroServiceCode: string;
      quantity: number;
    }> = [];

    for (const item of incoming.items || []) {
      const product = matchProductByKeyword(item.productName);
      if (!product) continue; // Skip unmatched items
      const qty = Math.max(1, Math.floor(item.quantity || 1));
      matched.push({
        productKey: product.key,
        productName: product.name,
        serviceCode: product.serviceCode,
        heroServiceCode: product.heroServiceCode,
        quantity: qty,
      });
    }

    if (matched.length === 0) {
      results.push({
        shopeeOrderId: sid,
        status: "skipped",
        reason: "No products matched our catalog",
      });
      continue;
    }

    // Merge duplicate products in same order
    const merged = new Map<string, typeof matched[0]>();
    for (const item of matched) {
      const existing = merged.get(item.productKey);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        merged.set(item.productKey, { ...item });
      }
    }
    const finalItems = Array.from(merged.values());

    const isCartOrder = finalItems.length > 1;
    const primary = finalItems[0];
    const totalQty = finalItems.reduce((sum, i) => sum + i.quantity, 0);

    try {
      const created = await prisma.order.create({
        data: {
          orderId: sid, // Use Shopee Order ID directly as our orderId
          externalRef: sid,
          source: "shopee",
          productKey: primary.productKey,
          productName: primary.productName,
          serviceCode: primary.serviceCode,
          heroServiceCode: primary.heroServiceCode,
          quantity: totalQty,
          isCartOrder,
          status: "active",
          totalPrice: 0,
          items: isCartOrder
            ? {
                create: finalItems.map((item) => ({
                  productKey: item.productKey,
                  productName: item.productName,
                  serviceCode: item.serviceCode,
                  heroServiceCode: item.heroServiceCode,
                  quantity: item.quantity,
                  remainingQty: item.quantity,
                  pricePerUnit: 0,
                })),
              }
            : undefined,
        },
      });

      results.push({
        shopeeOrderId: sid,
        status: "created",
        orderId: created.orderId,
      });
    } catch (error) {
      results.push({
        shopeeOrderId: sid,
        status: "failed",
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const summary = {
    total: results.length,
    created: results.filter((r) => r.status === "created").length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
  };

  return jsonWithCors({ summary, results });
}
