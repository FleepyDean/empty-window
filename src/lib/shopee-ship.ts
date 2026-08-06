import { prisma } from "@/lib/prisma";
import { shopeeGet, shopeePost } from "@/lib/shopee-api";

// In-flight lock so concurrent calls for the same order don't all hit Shopee.
const shippingLocks = new Set<string>();

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

type ShopeeOrderStatusResponse = {
  response?: {
    order_list?: Array<{ order_status: string }>;
  };
  error?: string;
  message?: string;
};

type ShopeeOrderDetailForBuyerResponse = {
  response?: {
    order_list?: Array<{ buyer_user_id?: number; order_sn: string }>;
  };
  error?: string;
  message?: string;
};

type ShopeeSendMessageResponse = {
  error?: string;
  message?: string;
  response?: {
 request_id?: string;
  };
};

const THANK_YOU_MESSAGE = "Thank you! Please click order received and rate us 5 stars yaa \uD83D\uDC95";

/**
 * Send a chat message to the buyer of a Shopee order via the Seller Chat API.
 * Fetches buyer_user_id from get_order_detail, then calls sellerchat/send_message.
 * Fails gracefully — only logs errors, never throws.
 */
export async function sendShopeeChatMessage(orderSn: string, text: string): Promise<void> {
  try {
    const detail = await shopeeGet<ShopeeOrderDetailForBuyerResponse>(
      "/api/v2/order/get_order_detail",
      {
        order_sn_list: orderSn,
        response_optional_fields: "buyer_user_id"
      }
    );

    const buyerUserId = detail.response?.order_list?.[0]?.buyer_user_id;
    if (!buyerUserId) {
      console.log(`[ShopeeChat] No buyer_user_id for ${orderSn}; skipping message`);
      return;
    }

    const sendRes = await shopeePost<ShopeeSendMessageResponse>(
      "/api/v2/sellerchat/send_message",
      {
        to_id: buyerUserId,
        message_type: "text",
        content: { text }
      }
    );

    if (sendRes.error && sendRes.error !== "" && sendRes.error !== "error_none") {
      console.error(`[ShopeeChat] Failed to send message to ${orderSn}: ${sendRes.message ?? sendRes.error}`);
      return;
    }

    console.log(`[ShopeeChat] Sent thank-you message to buyer ${buyerUserId} for order ${orderSn}`);
  } catch (err) {
    console.error(`[ShopeeChat] Error sending message for ${orderSn}:`, err);
  }
}

/**
 * Check whether an active Shopee order has been cancelled by the buyer. If it
 * has, delete it from our DB so it cannot be claimed. Returns true if the order
 * was cancelled (and deleted). Returns false for non-Shopee orders, already
 * shipped orders, or if the status check fails.
 */
export async function deleteOrderIfCancelledOnShopee(orderId: string): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { orderId },
    select: { source: true, externalRef: true, status: true, shippedOnShopee: true }
  });

  if (!order || order.source !== "shopee" || !order.externalRef) return false;
  if (order.status !== "active" || order.shippedOnShopee) return false;

  try {
    const detail = await shopeeGet<ShopeeOrderStatusResponse>(
      "/api/v2/order/get_order_detail",
      {
        order_sn_list: order.externalRef,
        response_optional_fields: "order_status"
      }
    );

    const status = detail.response?.order_list?.[0]?.order_status;
    if (status === "CANCELLED") {
      await prisma.order.delete({ where: { orderId } });
      console.log(`[ShopeeShip] Deleted cancelled Shopee order ${orderId} (externalRef=${order.externalRef})`);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[ShopeeShip] Failed to check Shopee status for ${orderId}:`, err);
    return false;
  }
}

/**
 * Mark an order as "shipped" once a claim starts so the Shopee order cannot be
 * cancelled by the buyer. For Shopee-sourced orders this also triggers the
 * logistics ship API. Safe to call multiple times — it is a no-op if the
 * order is not active or already processed.
 */
export async function markOrderAsShippedIfActive(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { orderId },
    select: { source: true, status: true }
  });

  if (order?.status !== "active") return;

  await prisma.order.update({
    where: { orderId },
    data: { status: "shipped" }
  });

  if (order.source === "shopee") {
    shipShopeeOrderIfNeeded(orderId).catch(() => {});
  }
}

/**
 * If the given order is a Shopee order that needs to be shipped (status is
 * "shipped" or "depleted" and shippedOnShopee is false), call the Shopee
 * logistics API. On success, mark shippedOnShopee.
 */
export async function shipShopeeOrderIfNeeded(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { orderId },
    select: { source: true, externalRef: true, status: true, shippedOnShopee: true },
  });

  if (!order || order.source !== "shopee" || (order.status !== "depleted" && order.status !== "shipped")) return;
  if (order.shippedOnShopee) return;
  if (!order.externalRef) return;

  const orderSn = order.externalRef;

  if (shippingLocks.has(orderId)) {
    console.log(`[ShopeeShip] ${orderSn} already being processed by another call; skipping duplicate`);
    return;
  }
  shippingLocks.add(orderId);

  try {
    // Re-check status in case another concurrent call already shipped it.
    const fresh = await prisma.order.findUnique({
      where: { orderId },
      select: { status: true }
    });
    if (fresh?.status !== "depleted") {
      console.log(`[ShopeeShip] ${orderSn} status is ${fresh?.status ?? "missing"}; skipping`);
      return;
    }

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
      data: { status: "shipped", shippedOnShopee: true },
    });

    console.log(`[ShopeeShip] Successfully shipped order ${orderSn}`);

    // Send thank-you message to buyer via Shopee chat (fire-and-forget)
    sendShopeeChatMessage(orderSn, THANK_YOU_MESSAGE).catch(() => {});
  } catch (err) {
    console.error(`[ShopeeShip] Error shipping ${orderSn}:`, err);
  } finally {
    shippingLocks.delete(orderId);
  }
}
