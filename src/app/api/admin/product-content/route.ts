import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { PRODUCT_CATALOG, isProductKey } from "@/lib/products";
import { NextResponse } from "next/server";

// GET — return all product content (DB overrides merged with hardcoded defaults)
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = await (prisma as any).productSetting.findMany() as Array<{
    productKey: string;
    priceLabel: string;
    redemptionInstructions: string | null;
    tutorialSteps: string | null;
    tutorialVideoUrl: string | null;
  }>;

  const settingsMap = new Map(settings.map((s) => [s.productKey, s]));

  const result = PRODUCT_CATALOG.map((p) => {
    const override = settingsMap.get(p.key);
    let steps: string[] = [];
    if (override?.tutorialSteps) {
      try { steps = JSON.parse(override.tutorialSteps); } catch { steps = []; }
    }
    return {
      key: p.key,
      name: p.name,
      redemptionInstructions: override?.redemptionInstructions ?? p.redemptionInstructions,
      tutorialSteps: steps,
      tutorialVideoUrl: override?.tutorialVideoUrl ?? null,
      // flags for whether DB override exists
      hasCustomInstructions: !!override?.redemptionInstructions,
      hasCustomSteps: !!override?.tutorialSteps,
    };
  });

  return NextResponse.json({ products: result });
}

// PATCH — update redemptionInstructions, tutorialSteps, or tutorialVideoUrl
export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json() as {
    productKey?: string;
    redemptionInstructions?: string;
    tutorialSteps?: string[];
    tutorialVideoUrl?: string;
  };

  const { productKey } = body;

  if (!productKey || !isProductKey(productKey)) {
    return NextResponse.json({ message: "Valid product key required." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (typeof body.redemptionInstructions === "string") {
    data.redemptionInstructions = body.redemptionInstructions.trim() || null;
  }
  if (Array.isArray(body.tutorialSteps)) {
    data.tutorialSteps = JSON.stringify(body.tutorialSteps.filter((s) => s.trim()));
  }
  if (typeof body.tutorialVideoUrl === "string") {
    data.tutorialVideoUrl = body.tutorialVideoUrl.trim() || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "Nothing to update." }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (prisma as any).productSetting.findUnique({ where: { productKey } });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma as any).productSetting.upsert({
    where: { productKey },
    update: data,
    create: {
      productKey,
      priceLabel: existing?.priceLabel ?? "RM 0.00",
      ...data
    }
  });

  return NextResponse.json({ message: `Content updated for ${productKey}.` });
}
