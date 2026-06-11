import { prisma } from "@/lib/prisma";

/**
 * Atomically reserve the oldest available VoucherImage for a given product key
 * and bind it to the claim. Marks status="used" immediately.
 *
 * Returns the assigned image URL, or null if pool is exhausted.
 */
export async function assignVoucherImageToClaim(
  claimId: string,
  productKey: string
): Promise<{ imageUrl: string } | null> {
  return prisma.$transaction(async (tx) => {
    const next = await tx.voucherImage.findFirst({
      where: { productKey, status: "available" },
      orderBy: { id: "asc" }
    });
    if (!next) return null;

    await tx.voucherImage.update({
      where: { id: next.id },
      data: {
        status: "used",
        claimId,
        assignedAt: new Date()
      }
    });

    return { imageUrl: next.imageUrl };
  });
}

export async function getVoucherPoolStats(productKey?: string) {
  const where = productKey ? { productKey } : {};
  const [available, used, disabled] = await Promise.all([
    prisma.voucherImage.count({ where: { ...where, status: "available" } }),
    prisma.voucherImage.count({ where: { ...where, status: "used" } }),
    prisma.voucherImage.count({ where: { ...where, status: "disabled" } })
  ]);
  return { available, used, disabled, total: available + used + disabled };
}
