import { getProductCatalogWithPrices } from "@/lib/products";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const catalog = await getProductCatalogWithPrices();
    // Only show products with available quantity greater than 1
    const visibleProducts = catalog.filter((p) => p.availableQuantity > 1);
    return NextResponse.json({ products: visibleProducts });
  } catch {
    return NextResponse.json({ products: [] }, { status: 500 });
  }
}
