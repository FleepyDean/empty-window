import { NextResponse } from "next/server";

// POST /api/shopee/cron — automated sync + ship for cron/scheduler
// Can be triggered by Railway cron, cron-job.org, or any scheduler
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret") ?? request.headers.get("x-ingest-secret");
  const expected = process.env.SHOPEE_CRON_SECRET ?? process.env.SHOPEE_INGEST_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nishinae.store";
    const ingestSecret = process.env.SHOPEE_INGEST_SECRET;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (ingestSecret) headers["x-ingest-secret"] = ingestSecret;

    // 1. Sync orders from Shopee (READY_TO_SHIP + PROCESSED)
    // Short lookback window since this runs every 5-10 min via cron.
    // Already-known orders are skipped without hitting the detail API, so this stays fast.
    const syncRes = await fetch(`${baseUrl}/api/shopee/sync`, {
      method: "POST",
      headers,
      body: JSON.stringify({ statuses: ["READY_TO_SHIP", "PROCESSED"], hours: 2 })
    });
    const syncData = await syncRes.json().catch(() => ({ message: "Sync request failed" }));

    // Note: auto-ship is disabled. These are self-redeem virtual items that
    // don't go through Shopee's standard logistics API (get_shipping_parameter /
    // ship_order both fail with "not ready to ship" for this listing type).
    // Shipping is done manually via the Shopee Seller Center "To Ship" page for now.

    return NextResponse.json({
      sync: syncData,
      ranAt: new Date().toISOString()
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}
