import { NextResponse } from "next/server";
import { shopeeGet } from "@/lib/shopee-api";

type ShopeeOrderDetailResponse = {
  response?: unknown;
  error?: string;
  message?: string;
};

// TEMPORARY debug endpoint — returns raw Shopee order detail for inspection.
// GET /api/shopee/debug-order?order_sn=xxx,yyy
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderSns = searchParams.get("order_sn");

  if (!orderSns) {
    return NextResponse.json({ message: "Provide order_sn query param" }, { status: 400 });
  }

  try {
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
