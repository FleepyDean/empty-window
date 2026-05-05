import { NextResponse } from "next/server";
import { shopeeGet, shopeePost } from "@/lib/shopee-api";
import { prisma } from "@/lib/prisma";
import { matchProductByKeyword } from "@/lib/product-matcher";

type ShopeeOrderListResponse = {
  response?: {
    order_list?: Array<{ order_sn: string }>;
    more?: boolean;
  };
  error?: string;
  message?: string;
};

type ShopeeOrderDetailResponse = {
  response?: {
    order_list?: Array<{
      order_sn: string;
      order_status: string;
      item_list?: Array<{
        item_name: string;
        model_name?: string;
        model_quantity_purchased: number;
      }>;
    }>;
  };
  error?: string;
  message?: string;
};

// POST /api/shopee/sync — fetch To Ship orders from Shopee API and ingest them
export async function POST(request: Request) {
  const secret = request.headers.get("x-ingest-secret");
  if (process.env.SHOPEE_INGEST_SECRET && secret !== process.env.SHOPEE_INGEST_SECRET) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const timeFrom = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60; // last 7 days
    const timeTo = Math.floor(Date.now() / 1000);

    // Step 1: Get list of READY_TO_SHIP orders
    const listData = await shopeeGet<ShopeeOrderListResponse>(
      "/api/v2/order/get_order_list",
      {
        time_range_field: "create_time",
        time_from: timeFrom,
        time_to: timeTo,
        page_size: 100,
        order_status: "READY_TO_SHIP"
      }
    );

    if (listData.error && listData.error !== "" && listData.error !== "error_none") {
      return NextResponse.json(
        { message: listData.message ?? listData.error },
        { status: 400 }
      );
    }

    const orderList = listData.response?.order_list ?? [];
    if (orderList.length === 0) {
      return NextResponse.json({ message: "No new orders to sync", synced: 0 });
    }

    const orderSns = orderList.map((o) => o.order_sn);

    // Step 2: Get order details (product names + quantities)
    const detailData = await shopeePost<ShopeeOrderDetailResponse>(
      "/api/v2/order/get_order_detail",
      {
        order_sn_list: orderSns,
        response_optional_fields:
          "item_list,order_status,buyer_username"
      }
    );

    const orders = detailData.response?.order_list ?? [];

    // Step 3: Ingest into our DB (same logic as manual ingest endpoint)
    const results: Array<{
      shopeeOrderId: string;
      status: "created" | "duplicate" | "skipped" | "failed";
      reason?: string;
    }> = [];

    for (const order of orders) {
      const sid = order.order_sn;

      // Dedup
      const existing = await prisma.order.findUnique({ where: { externalRef: sid } });
      if (existing) {
        results.push({ shopeeOrderId: sid, status: "duplicate" });
        continue;
      }

      // Match products
      const matched: Array<{
        productKey: string;
        productName: string;
        serviceCode: string;
        heroServiceCode: string;
        quantity: number;
      }> = [];

      for (const item of order.item_list ?? []) {
        const rawName = item.model_name
          ? `${item.item_name} ${item.model_name}`
          : item.item_name;
        const product = matchProductByKeyword(rawName);
        if (!product) continue;
        matched.push({
          productKey: product.key,
          productName: product.name,
          serviceCode: product.serviceCode,
          heroServiceCode: product.heroServiceCode,
          quantity: item.model_quantity_purchased
        });
      }

      if (matched.length === 0) {
        results.push({ shopeeOrderId: sid, status: "skipped", reason: "No matching products" });
        continue;
      }

      // Merge duplicate product keys
      const merged = new Map<string, typeof matched[0]>();
      for (const item of matched) {
        const ex = merged.get(item.productKey);
        if (ex) ex.quantity += item.quantity;
        else merged.set(item.productKey, { ...item });
      }
      const finalItems = Array.from(merged.values());
      const isCartOrder = finalItems.length > 1;
      const primary = finalItems[0];
      const totalQty = finalItems.reduce((sum, i) => sum + i.quantity, 0);

      try {
        await prisma.order.create({
          data: {
            orderId: sid,
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
                    pricePerUnit: 0
                  }))
                }
              : undefined
          }
        });
        results.push({ shopeeOrderId: sid, status: "created" });
      } catch (err) {
        results.push({
          shopeeOrderId: sid,
          status: "failed",
          reason: err instanceof Error ? err.message : "DB error"
        });
      }
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.status === "created").length,
      duplicates: results.filter((r) => r.status === "duplicate").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length
    };

    return NextResponse.json({ summary, results });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
