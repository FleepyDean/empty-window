import { NextResponse } from "next/server";
import { shopeePost } from "@/lib/shopee-api";

// TEMPORARY debug endpoint to test ship_order payload variants.
// POST /api/shopee/debug-ship { "order_sn": "xxx", "body": {...} }
export async function POST(request: Request) {
  const { order_sn, body } = (await request.json()) as {
    order_sn: string;
    body?: Record<string, unknown>;
  };

  if (!order_sn) {
    return NextResponse.json({ message: "order_sn required" }, { status: 400 });
  }

  try {
    const data = await shopeePost<unknown>("/api/v2/logistics/ship_order", {
      order_sn,
      ...(body ?? {})
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
