import { getProductCatalogWithPrices } from "@/lib/products";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const catalog = await getProductCatalogWithPrices();
    return NextResponse.json({ products: catalog });
  } catch {
    return NextResponse.json({ products: [] }, { status: 500 });
  }
}
