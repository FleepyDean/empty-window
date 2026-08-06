import { NextResponse } from "next/server";
import { shopeeGet, shopeePost } from "@/lib/shopee-api";
import { prisma } from "@/lib/prisma";

type ShopeeShipResponse = {
  error?: string;
  message?: string;
};

type ShopeeLogisticsInfoResponse = {
  response?: {
    info_needed?: {
      pickup?: string[];
      dropoff?: string[];
      non_integrated?: string[];
    };
    pickup?: { branch_list?: unknown[] | null };
    dropoff?: { branch_list?: unknown[] | null };
    non_integrated?: unknown;
  };
  error?: string;
  message?: string;
};

// POST /api/shopee/ship — mark all unshipped Shopee orders as shipped
export async function POST(request: Request) {
  const secret = request.headers.get("x-ingest-secret");
  if (process.env.SHOPEE_INGEST_SECRET && secret !== process.env.SHOPEE_INGEST_SECRET) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find all depleted Shopee orders (all claims fulfilled) that need to be shipped
    const orders = await prisma.order.findMany({
      where: {
        source: "shopee",
        status: "depleted",
        externalRef: { not: null }
      },
      select: { orderId: true, externalRef: true }
    });

    if (orders.length === 0) {
      return NextResponse.json({ message: "No unshipped orders", shipped: 0 });
    }

    const results: Array<{
      shopeeOrderId: string;
      status: "shipped" | "failed" | "skipped";
      reason?: string;
    }> = [];

    for (const order of orders) {
      const orderSn = order.externalRef ?? order.orderId;

      try {
        // Get logistics info to check if virtual goods
        const logisticsInfo = await shopeeGet<ShopeeLogisticsInfoResponse>(
          "/api/v2/logistics/get_shipping_parameter",
          { order_sn: orderSn }
        );

        const infoNeeded = logisticsInfo.response?.info_needed ?? {};

        console.log(`[ShopeeShip] ${orderSn} logistics response:`, JSON.stringify(logisticsInfo));

        // Ship the order
        const shipBody: Record<string, unknown> = {
          order_sn: orderSn
        };

        // Prefer non_integrated (virtual / self-arranged goods), then dropoff, then pickup.
        // If a method requires a tracking number we don't have, skip it for the next option.
        if (Array.isArray(infoNeeded.non_integrated)) {
          shipBody.non_integrated = {};
        } else if (Array.isArray(infoNeeded.dropoff) && !infoNeeded.dropoff.includes("tracking_number")) {
          shipBody.dropoff = {};
        } else if (Array.isArray(infoNeeded.pickup)) {
          shipBody.pickup = {};
        }

        console.log(`[ShopeeShip] ${orderSn} ship body:`, JSON.stringify(shipBody));

        const shipRes = await shopeePost<ShopeeShipResponse>(
          "/api/v2/logistics/ship_order",
          shipBody
        );

        console.log(`[ShopeeShip] ${orderSn} ship response:`, JSON.stringify(shipRes));

        if (shipRes.error && shipRes.error !== "" && shipRes.error !== "error_none") {
          results.push({
            shopeeOrderId: orderSn,
            status: "failed",
            reason: shipRes.message ?? shipRes.error
          });
          continue;
        }

        // Mark as shipped in our DB
        await prisma.order.update({
          where: { orderId: order.orderId },
          data: { status: "shipped" }
        });

        results.push({ shopeeOrderId: orderSn, status: "shipped" });
      } catch (err) {
        results.push({
          shopeeOrderId: orderSn,
          status: "failed",
          reason: err instanceof Error ? err.message : "Unknown error"
        });
      }
    }

    const summary = {
      total: results.length,
      shipped: results.filter((r) => r.status === "shipped").length,
      failed: results.filter((r) => r.status === "failed").length,
      skipped: results.filter((r) => r.status === "skipped").length
    };

    return NextResponse.json({ summary, results });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Ship failed" },
      { status: 500 }
    );
  }
}
