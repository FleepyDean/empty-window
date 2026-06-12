import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const productKey = searchParams.get("productKey");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "24", 10);

  const where = productKey ? { productKey } : {};

  const skip = (page - 1) * limit;

  // If requesting a single image by id, return full data including imageUrl
  const imageId = searchParams.get("id");
  if (imageId) {
    const image = await prisma.voucherImage.findUnique({
      where: { id: parseInt(imageId, 10) },
      include: {
        claim: {
          select: { claimId: true, status: true, createdAt: true, orderId: true }
        }
      }
    });
    return NextResponse.json({ image });
  }

  const [images, total, available, used, disabled] = await Promise.all([
    prisma.voucherImage.findMany({
      where,
      orderBy: [{ status: "asc" }, { id: "desc" }],
      skip,
      take: limit,
      select: {
        id: true,
        productKey: true,
        status: true,
        claimId: true,
        assignedAt: true,
        createdAt: true,
        claim: {
          select: { claimId: true, status: true, createdAt: true, orderId: true }
        }
      }
    }),
    prisma.voucherImage.count({ where }),
    prisma.voucherImage.count({ where: { ...where, status: "available" } }),
    prisma.voucherImage.count({ where: { ...where, status: "used" } }),
    prisma.voucherImage.count({ where: { ...where, status: "disabled" } })
  ]);

  return NextResponse.json({
    images,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    stats: { available, used, disabled }
  });
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
