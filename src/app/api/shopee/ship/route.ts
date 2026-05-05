import { NextResponse } from "next/server";
import { shopeeGet, shopeePost } from "@/lib/shopee-api";
import { prisma } from "@/lib/prisma";

type ShopeeShipResponse = {
  error?: string;
  message?: string;
};

type ShopeeLogisticsInfoResponse = {
  response?: {
    logistics_info?: Array<{
      logistics_id?: number;
      logistics_channel_name?: string;
      is_virtual_goods?: boolean;
    }>;
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
    // Find all active orders from Shopee that haven't been shipped yet
    const orders = await prisma.order.findMany({
      where: {
        source: "shopee",
        status: "active",
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

        const logList = logisticsInfo.response?.logistics_info ?? [];
        const isVirtual = logList.some((l) => l.is_virtual_goods === true);

        // Ship the order
        const shipBody: Record<string, unknown> = {
          order_sn: orderSn
        };

        // Virtual goods: no pickup/dropoff needed
        if (!isVirtual && logList.length > 0) {
          // For non-virtual: use first logistics option with dropoff
          shipBody.pickup = null;
          shipBody.dropoff = {};
        }

        const shipRes = await shopeePost<ShopeeShipResponse>(
          "/api/v2/logistics/ship_order",
          shipBody
        );

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
