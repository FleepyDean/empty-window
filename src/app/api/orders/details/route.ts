import { prisma } from "@/lib/prisma";
import { PRODUCT_MAP } from "@/lib/products";
import { cleanupExpiredClaims } from "@/lib/claim-cleanup";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { orderId } = await request.json();
  const trimmedOrderId = typeof orderId === "string" ? orderId.trim() : "";

  if (!trimmedOrderId) {
    return NextResponse.json(
      { valid: false, message: "Order ID is required." },
      { status: 400 }
    );
  }

  // Auto-expire any stuck waiting_otp claims for this order before reading state
  await cleanupExpiredClaims(trimmedOrderId);

  const order = await prisma.order.findUnique({
    where: { orderId: trimmedOrderId },
    include: {
      items: {
        include: {
          claims: {
            orderBy: { createdAt: "desc" }
          }
        }
      },
      claims: {
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!order) {
    return NextResponse.json(
      { valid: false, message: "Invalid order ID." },
      { status: 404 }
    );
  }

  // Check if legacy order (single product) or cart order (multi-product)
  const isCartOrder = order.isCartOrder && order.items.length > 0;

  // Format products/items for display
  const products = isCartOrder
    ? order.items.map((item) => ({
        itemId: item.id,
        productKey: item.productKey,
        productName: item.productName,
        serviceCode: item.serviceCode,
        heroServiceCode: item.heroServiceCode,
        totalQuantity: item.quantity,
        remainingQty: item.remainingQty,
        canClaim: item.remainingQty > 0,
        logoUrl: getLogoUrl(item.productKey),
        productType: PRODUCT_MAP[item.productKey as keyof typeof PRODUCT_MAP]?.productType ?? "otp",
        linkUrl: PRODUCT_MAP[item.productKey as keyof typeof PRODUCT_MAP]?.linkUrl ?? null
      }))
    : [
        {
          itemId: null,
          productKey: order.productKey,
          productName: order.productName,
          serviceCode: order.serviceCode,
          heroServiceCode: order.heroServiceCode,
          totalQuantity: order.quantity,
          remainingQty: order.quantity,
          canClaim: order.quantity > 0,
          logoUrl: getLogoUrl(order.productKey),
          productType: PRODUCT_MAP[order.productKey as keyof typeof PRODUCT_MAP]?.productType ?? "otp",
          linkUrl: PRODUCT_MAP[order.productKey as keyof typeof PRODUCT_MAP]?.linkUrl ?? null
        }
      ];

  // Format claims history
  const allClaims = isCartOrder
    ? order.items.flatMap((item) =>
        item.claims.map((claim) => ({
          claimId: claim.claimId,
          productKey: item.productKey,
          productName: item.productName,
          phoneNumber: claim.phoneNumber,
          otp: claim.otp,
          status: claim.status,
          createdAt: claim.createdAt.toISOString(),
          expiresAt: claim.expiresAt.toISOString()
        }))
      )
    : order.claims.map((claim) => ({
        claimId: claim.claimId,
        productKey: order.productKey,
        productName: order.productName,
        phoneNumber: claim.phoneNumber,
        otp: claim.otp,
        status: claim.status,
        createdAt: claim.createdAt.toISOString(),
        expiresAt: claim.expiresAt.toISOString()
      }));

  // Sort claims by date descending
  allClaims.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({
    valid: true,
    orderId: trimmedOrderId,
    status: order.status,
    isCartOrder,
    products,
    claims: allClaims,
    totalRemaining: isCartOrder
      ? order.items.reduce((sum, item) => sum + item.remainingQty, 0)
      : order.quantity,
    message: "Order details retrieved."
  });
}

function getLogoUrl(productKey: string): string {
  const logos: Record<string, string> = {
    zus: "https://resources.wobbjobs.com/jobs-malaysia/companies/2cced996-255d-4525-812b-e9319b8ce8f2/company_logo/original/13f90cff-059d-435e-b166-794a51360600-logo.jpg",
    chagee: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT5oclmn4Q6h0t7hgLN8_S2N7QzrlczmdW0rw&s",
    tealive: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTEaSAISBahRRXbolEAdKw2fFKL6sqd0pOKyg&s",
    kfc: "https://media.tenor.com/kkb548hIQfUAAAAe/kfc-logo.png",
    cbtl: "https://play-lh.googleusercontent.com/Qmm4QXPiOycGYwkaF9QFX1qxZKdMYHp-Ff8x7meL_T_ExwRyOb0An4WYkt53eN_Itg",
    gigi: "https://www.gigicoffee.com/wp-content/uploads/2023/04/logo-gigicoffee.png",
    winrar: "https://images.wincrunch.com/winrar-logo.png"
  };
  return logos[productKey] || "";
}
