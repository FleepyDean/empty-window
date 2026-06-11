import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const productKey = searchParams.get("productKey");

  const where = productKey ? { productKey } : {};

  const images = await prisma.voucherImage.findMany({
    where,
    orderBy: [{ status: "asc" }, { id: "desc" }],
    include: {
      claim: {
        select: { claimId: true, status: true, createdAt: true, orderId: true }
      }
    }
  });

  return NextResponse.json({ images });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { productKey, imageUrl, images: bulkImages } = await request.json();

  // Bulk upload: array of { productKey, imageUrl }
  if (Array.isArray(bulkImages) && bulkImages.length > 0) {
    const created = await prisma.voucherImage.createMany({
      data: bulkImages.map((img: { productKey: string; imageUrl: string }) => ({
        productKey: img.productKey,
        imageUrl: img.imageUrl
      }))
    });
    return NextResponse.json({ created: created.count });
  }

  // Single upload
  if (!productKey || !imageUrl) {
    return NextResponse.json({ message: "productKey and imageUrl are required" }, { status: 400 });
  }

  const image = await prisma.voucherImage.create({
    data: { productKey, imageUrl }
  });

  return NextResponse.json({ image });
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id, status } = await request.json();

  if (!id || typeof id !== "number") {
    return NextResponse.json({ message: "id is required" }, { status: 400 });
  }

  // When re-enabling a used voucher, also clear the claim association
  const updateData = status === "available"
    ? { status, claimId: null, assignedAt: null }
    : { status };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const updated = await prisma.voucherImage.update({
    where: { id },
    data: updateData as any
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return NextResponse.json({ image: updated });
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await request.json();
  if (!id || typeof id !== "number") {
    return NextResponse.json({ message: "id is required" }, { status: 400 });
  }

  await prisma.voucherImage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
