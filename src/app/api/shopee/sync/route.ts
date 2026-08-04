import { NextResponse } from "next/server";
import { shopeeGet } from "@/lib/shopee-api";
import { prisma } from "@/lib/prisma";
import { matchProductByKeyword } from "@/lib/product-matcher";

type ShopeeOrderListItem = { order_sn: string };

type ShopeeOrderListResponse = {
  response?: {
    order_list?: ShopeeOrderListItem[];
    more?: boolean;
    next_cursor?: string;
  };
  error?: string;
  message?: string;
};

type ShopeeOrderItem = {
  order_sn: string;
  order_status: string;
  item_list?: Array<{
    item_name: string;
    model_name?: string;
    model_quantity_purchased: number;
  }>;
};

type ShopeeOrderDetailResponse = {
  response?: {
    order_list?: ShopeeOrderItem[];
  };
  error?: string;
  message?: string;
};

const DEFAULT_STATUSES = ["READY_TO_SHIP", "PROCESSED"];
const PAGE_SIZE = 50;

// Fetch all order SNs for a given status with pagination
async function fetchOrderSnsForStatus(
  status: string,
  timeFrom: number,
  timeTo: number
): Promise<string[]> {
  const orderSns: string[] = [];
  let cursor = "";
  let hasMore = true;
  let page = 0;

  while (hasMore && page < 100) {
    const params: Record<string, string | number> = {
      time_range_field: "create_time",
      time_from: timeFrom,
      time_to: timeTo,
      page_size: PAGE_SIZE,
      order_status: status
    };
    if (cursor) params.cursor = cursor;

    const listData = await shopeeGet<ShopeeOrderListResponse>(
      "/api/v2/order/get_order_list",
      params
    );

    if (listData.error && listData.error !== "" && listData.error !== "error_none") {
      throw new Error(`Shopee list error for ${status}: ${listData.message ?? listData.error}`);
    }

    const list = listData.response?.order_list ?? [];
    orderSns.push(...list.map((o) => o.order_sn));

    hasMore = !!listData.response?.more;
    cursor = listData.response?.next_cursor ?? "";
    page++;

    if (list.length === 0) hasMore = false;
  }

  return orderSns;
}

async function fetchOrderDetails(orderSns: string[]): Promise<ShopeeOrderItem[]> {
  const all: ShopeeOrderItem[] = [];
  // API accepts up to 50 order SNs per call. get_order_detail is a GET request.
  for (let i = 0; i < orderSns.length; i += 50) {
    const batch = orderSns.slice(i, i + 50);
    const detailData = await shopeeGet<ShopeeOrderDetailResponse>(
      "/api/v2/order/get_order_detail",
      {
        order_sn_list: batch.join(","),
        response_optional_fields: "item_list,order_status"
      }
    );

    if (detailData.error && detailData.error !== "" && detailData.error !== "error_none") {
      throw new Error(`Shopee detail error: ${detailData.message ?? detailData.error}`);
    }

    all.push(...(detailData.response?.order_list ?? []));
  }
  return all;
}

async function ingestOrder(order: ShopeeOrderItem) {
  const sid = order.order_sn;

  const existing = await prisma.order.findFirst({
    where: { OR: [{ externalRef: sid }, { orderId: sid }] }
  });
  if (existing) {
    // Backfill externalRef for legacy rows that were ingested before this field existed
    if (!existing.externalRef) {
      await prisma.order.update({ where: { orderId: existing.orderId }, data: { externalRef: sid } });
    }
    return { shopeeOrderId: sid, status: "duplicate" as const };
  }

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
    return { shopeeOrderId: sid, status: "skipped" as const, reason: "No matching products" };
  }

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

  return { shopeeOrderId: sid, status: "created" as const };
}

// POST /api/shopee/sync — fetch orders from Shopee API and ingest them
export async function POST(request: Request) {
  const secret = request.headers.get("x-ingest-secret");
  if (process.env.SHOPEE_INGEST_SECRET && secret !== process.env.SHOPEE_INGEST_SECRET) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      statuses?: string[];
      days?: number;
    };

    const days = Math.min(body.days ?? 7, 30);
    const statuses = body.statuses?.length ? body.statuses : DEFAULT_STATUSES;
    const timeFrom = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
    const timeTo = Math.floor(Date.now() / 1000);

    // Fetch order SNs for each requested status
    const allSns: string[] = [];
    const statusSns: Record<string, string[]> = {};
    for (const status of statuses) {
      const sns = await fetchOrderSnsForStatus(status, timeFrom, timeTo);
      statusSns[status] = sns;
      allSns.push(...sns);
    }

    const uniqueSns = Array.from(new Set(allSns));
    if (uniqueSns.length === 0) {
      return NextResponse.json({ message: "No new orders to sync", synced: 0, statuses });
    }

    const orders = await fetchOrderDetails(uniqueSns);
    const results: Array<{
      shopeeOrderId: string;
      status: "created" | "duplicate" | "skipped" | "failed";
      reason?: string;
    }> = [];

    for (const order of orders) {
      try {
        const result = await ingestOrder(order);
        results.push(result);
      } catch (err) {
        results.push({
          shopeeOrderId: order.order_sn,
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
      failed: results.filter((r) => r.status === "failed").length,
      statuses
    };

    return NextResponse.json({ summary, results });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
