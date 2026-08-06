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
const CANCELLED_STATUS = "CANCELLED";
const PAGE_SIZE = 50;
const DEFAULT_LOOKBACK_HOURS = 24;

// Given a list of Shopee order SNs, split into known (already in DB) and new.
// Known rows missing externalRef are backfilled in the same pass.
async function partitionKnownOrders(
  orderSns: string[]
): Promise<{ newSns: string[]; duplicateSns: string[] }> {
  if (orderSns.length === 0) return { newSns: [], duplicateSns: [] };

  const existingRows = await prisma.order.findMany({
    where: { OR: [{ externalRef: { in: orderSns } }, { orderId: { in: orderSns } }] },
    select: { orderId: true, externalRef: true }
  });

  const knownSet = new Set<string>();
  for (const row of existingRows) {
    knownSet.add(row.orderId);
    if (row.externalRef) knownSet.add(row.externalRef);
    // Backfill externalRef for legacy rows ingested before this field existed
    if (!row.externalRef && orderSns.includes(row.orderId)) {
      await prisma.order.update({ where: { orderId: row.orderId }, data: { externalRef: row.orderId } });
    }
  }

  const newSns = orderSns.filter((sid) => !knownSet.has(sid));
  const duplicateSns = orderSns.filter((sid) => knownSet.has(sid));
  return { newSns, duplicateSns };
}

// Delete active Shopee orders that were cancelled on Shopee before any claim was made.
// Returns the number of deleted orders.
async function removeCancelledOrders(orderSns: string[]): Promise<{ deleted: number; skipped: number }> {
  if (orderSns.length === 0) return { deleted: 0, skipped: 0 };

  const rows = await prisma.order.findMany({
    where: {
      OR: [{ externalRef: { in: orderSns } }, { orderId: { in: orderSns } }],
      source: "shopee"
    },
    select: { orderId: true, externalRef: true, status: true, shippedOnShopee: true }
  });

  let deleted = 0;
  let skipped = 0;
  for (const row of rows) {
    // Only delete if the order is still active and has not been shipped on Shopee.
    if (row.status !== "active" || row.shippedOnShopee) {
      skipped++;
      continue;
    }
    await prisma.order.delete({ where: { orderId: row.orderId } });
    deleted++;
    console.log(`[ShopeeSync] Deleted cancelled order ${row.orderId} (externalRef=${row.externalRef})`);
  }

  return { deleted, skipped };
}

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
      sourceDetail: "api",
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
      hours?: number;
    };

    const statuses = body.statuses?.length ? body.statuses : DEFAULT_STATUSES;
    const lookbackHours = body.hours ?? (body.days ? body.days * 24 : DEFAULT_LOOKBACK_HOURS);
    const cappedHours = Math.min(lookbackHours, 30 * 24); // Shopee max 15 days per status call, enforced per-status below
    const timeTo = Math.floor(Date.now() / 1000);
    const timeFrom = timeTo - cappedHours * 60 * 60;

    // Shopee enforces max 15-day range per call; split into 15-day chunks if needed
    const MAX_RANGE_SECONDS = 15 * 24 * 60 * 60;

    // Fetch order SNs for each requested status
    const allSns: string[] = [];
    for (const status of statuses) {
      let chunkStart = timeFrom;
      while (chunkStart < timeTo) {
        const chunkEnd = Math.min(chunkStart + MAX_RANGE_SECONDS, timeTo);
        const sns = await fetchOrderSnsForStatus(status, chunkStart, chunkEnd);
        allSns.push(...sns);
        chunkStart = chunkEnd;
      }
    }

    // Always check for cancelled orders in the same time window
    const cancelledSns: string[] = [];
    let chunkStart = timeFrom;
    while (chunkStart < timeTo) {
      const chunkEnd = Math.min(chunkStart + MAX_RANGE_SECONDS, timeTo);
      const sns = await fetchOrderSnsForStatus(CANCELLED_STATUS, chunkStart, chunkEnd);
      cancelledSns.push(...sns);
      chunkStart = chunkEnd;
    }
    const cancelledRemoval = await removeCancelledOrders(cancelledSns);

    const uniqueSns = Array.from(new Set(allSns));
    if (uniqueSns.length === 0) {
      return NextResponse.json({
        message: "No new orders to sync",
        synced: 0,
        statuses,
        cancelled: cancelledRemoval
      });
    }

    // Skip detail fetch for orders we already have (fast path for recurring cron runs)
    const { newSns, duplicateSns } = await partitionKnownOrders(uniqueSns);

    const results: Array<{
      shopeeOrderId: string;
      status: "created" | "duplicate" | "skipped" | "failed";
      reason?: string;
    }> = duplicateSns.map((sid) => ({ shopeeOrderId: sid, status: "duplicate" as const }));

    if (newSns.length > 0) {
      const orders = await fetchOrderDetails(newSns);
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
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.status === "created").length,
      duplicates: results.filter((r) => r.status === "duplicate").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
      cancelledDeleted: cancelledRemoval.deleted,
      cancelledSkipped: cancelledRemoval.skipped,
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
