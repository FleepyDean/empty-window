import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getPrices } from "@/lib/herosms";
import { prisma } from "@/lib/prisma";
import { getProductCatalogWithPrices, isProductKey } from "@/lib/products";
import { NextResponse } from "next/server";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  try {
    const data = await getPrices();
    // data.prices is { "<country>": { "<service>": { "cost": X, "count": Y } } }
    // Flatten into per-product prices for our catalog
    const catalog = await getProductCatalogWithPrices();
    const productPrices = catalog.map((product) => {
      let cost: number | null = null;
      let count: number | null = null;

      // Search across all countries in response using heroServiceCode (not serviceCode)
      for (const countryData of Object.values(data.prices)) {
        const serviceData = (countryData as Record<string, { cost?: number; count?: number }>)[product.heroServiceCode];
        if (serviceData) {
          cost = serviceData.cost ?? null;
          count = serviceData.count ?? null;
          break;
        }
      }

      return {
        key: product.key,
        name: product.name,
        serviceCode: product.serviceCode,
        heroServiceCode: product.heroServiceCode,
        priceLabel: product.priceLabel,
        heroSmsCost: cost,
        availableCount: count
      };
    });

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

  const { productKey, priceLabel } = await request.json();

  if (!productKey || !isProductKey(productKey)) {
    return NextResponse.json({ message: "Valid product key is required." }, { status: 400 });
  }

  if (typeof priceLabel !== "string" || !priceLabel.trim()) {
    return NextResponse.json({ message: "Price label is required." }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma as any).productSetting.upsert({
    where: { productKey },
    update: { priceLabel: priceLabel.trim() },
    create: { productKey, priceLabel: priceLabel.trim() }
  });

  return NextResponse.json({ message: `Price updated for ${productKey}.` });
}
