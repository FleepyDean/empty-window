import { prisma } from "@/lib/prisma";
import { shopeeGet, shopeePost } from "@/lib/shopee-api";

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

    const logList = logisticsInfo.response?.logistics_info ?? [];
    const isVirtual = logList.some((l) => l.is_virtual_goods === true);

    const shipBody: Record<string, unknown> = { order_sn: orderSn };

    if (!isVirtual && logList.length > 0) {
      shipBody.dropoff = {};
    }

    const shipRes = await shopeePost<ShopeeShipResponse>(
      "/api/v2/logistics/ship_order",
      shipBody
    );

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
