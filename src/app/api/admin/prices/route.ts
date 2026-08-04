import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { getProductCatalogWithPrices, isProductKey } from "@/lib/products";
import { NextResponse } from "next/server";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  try {
    const catalog = await getProductCatalogWithPrices();
    const productPrices = catalog.map((product) => ({
      key: product.key,
      name: product.name,
      serviceCode: product.serviceCode,
      heroServiceCode: product.heroServiceCode,
      price: product.price,
      priceLabel: product.priceLabel,
      availableQuantity: product.availableQuantity,
    }));

    return NextResponse.json({ productPrices });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to fetch prices." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { productKey, price, availableQuantity } = await request.json();

  if (!productKey || !isProductKey(productKey)) {
    return NextResponse.json({ message: "Valid product key is required." }, { status: 400 });
  }

  if (typeof price !== "number" || price < 0) {
    return NextResponse.json({ message: "Price must be a non-negative number." }, { status: 400 });
  }

  if (typeof availableQuantity !== "number" || availableQuantity < 0 || !Number.isInteger(availableQuantity)) {
    return NextResponse.json({ message: "Quantity must be a non-negative integer." }, { status: 400 });
  }

  const priceLabel = `RM ${price.toFixed(2)}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma as any).productSetting.upsert({
    where: { productKey },
    update: { price, availableQuantity, priceLabel },
    create: { productKey, price, availableQuantity, priceLabel }
  });

  return NextResponse.json({ message: `Price and quantity updated for ${productKey}.` });
}
