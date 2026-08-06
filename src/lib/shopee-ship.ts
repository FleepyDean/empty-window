import { prisma } from "@/lib/prisma";
import { shopeeGet, shopeePost } from "@/lib/shopee-api";

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

/**
 * If the given order is a depleted Shopee order, attempt to ship it via the
 * Shopee logistics API. On success the order status is updated to "shipped".
 * This is safe to call on any order — non-Shopee or non-depleted orders are
 * silently skipped.
 */
export async function shipShopeeOrderIfNeeded(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { orderId },
    select: { source: true, externalRef: true, status: true },
  });

  if (!order || order.source !== "shopee" || order.status !== "depleted") return;
  if (!order.externalRef) return;

  const orderSn = order.externalRef;

  try {
    const logisticsInfo = await shopeeGet<ShopeeLogisticsInfoResponse>(
      "/api/v2/logistics/get_shipping_parameter",
      { order_sn: orderSn }
    );

    const infoNeeded = logisticsInfo.response?.info_needed ?? {};

    console.log(`[ShopeeShip] ${orderSn} logistics response:`, JSON.stringify(logisticsInfo));

    const shipBody: Record<string, unknown> = { order_sn: orderSn };

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
      console.error(`[ShopeeShip] Failed to ship ${orderSn}: ${shipRes.message ?? shipRes.error}`);
      return;
    }

    await prisma.order.update({
      where: { orderId },
      data: { status: "shipped" },
    });

    console.log(`[ShopeeShip] Successfully shipped order ${orderSn}`);
  } catch (err) {
    console.error(`[ShopeeShip] Error shipping ${orderSn}:`, err);
  }
}
