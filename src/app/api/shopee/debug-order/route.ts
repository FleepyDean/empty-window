import { NextResponse } from "next/server";
import { shopeeGet } from "@/lib/shopee-api";

type ShopeeOrderDetailResponse = {
  response?: unknown;
  error?: string;
  message?: string;
};

// TEMPORARY debug endpoint — returns raw Shopee order detail for inspection.
// GET /api/shopee/debug-order?order_sn=xxx,yyy
// GET /api/shopee/debug-order?order_sn=xxx&shipping_param=1
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderSns = searchParams.get("order_sn");
  const shippingParam = searchParams.get("shipping_param");

  if (!orderSns) {
    return NextResponse.json({ message: "Provide order_sn query param" }, { status: 400 });
  }

  try {
    if (shippingParam === "shipment_list") {
      const data = await shopeeGet<unknown>(
        "/api/v2/order/get_shipment_list",
        { cursor: "", page_size: 100 }
      );
      return NextResponse.json(data);
    }

    if (shippingParam) {
      const data = await shopeeGet<unknown>(
        "/api/v2/logistics/get_shipping_parameter",
        { order_sn: orderSns }
      );
      return NextResponse.json(data);
    }

    const data = await shopeeGet<ShopeeOrderDetailResponse>(
      "/api/v2/order/get_order_detail",
      {
        order_sn_list: orderSns,
        response_optional_fields: "item_list,order_status,total_amount"
      }
    );
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
