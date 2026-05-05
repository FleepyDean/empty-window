import { prisma } from "@/lib/prisma";
import { PRODUCT_CATALOG } from "@/lib/products";
import { NextResponse } from "next/server";

// Public endpoint — returns tutorial steps, video URL, and redemption instructions
// for each product (DB overrides merged with hardcoded defaults)
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = await (prisma as any).productSetting.findMany() as Array<{
    productKey: string;
    redemptionInstructions: string | null;
    tutorialSteps: string | null;
    tutorialVideoUrl: string | null;
  }>;

  const settingsMap = new Map(settings.map((s) => [s.productKey, s]));

  const products = PRODUCT_CATALOG.map((p) => {
    const override = settingsMap.get(p.key);
    let tutorialSteps: string[] = [];
    if (override?.tutorialSteps) {
      try { tutorialSteps = JSON.parse(override.tutorialSteps); } catch { tutorialSteps = []; }
    }
    return {
      key: p.key,
      name: p.name,
      redemptionInstructions: override?.redemptionInstructions ?? p.redemptionInstructions,
      tutorialSteps,
      tutorialVideoUrl: override?.tutorialVideoUrl ?? null
    };
  });

  return NextResponse.json({ products });
}
