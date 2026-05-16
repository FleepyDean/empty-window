import { prisma } from "@/lib/prisma";

/**
 * Atomically reserve the oldest available EmailAccount and bind it to the claim.
 * Marks status="used" immediately — once an email is handed to a user, it's
 * retired permanently (because the user may have already typed it into CBTL).
 *
 * Returns the assigned email address, or null if pool is exhausted.
 */
export async function assignEmailToClaim(claimId: string): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const next = await tx.emailAccount.findFirst({
      where: { status: "available" },
      orderBy: { id: "asc" }
    });
    if (!next) return null;

    await tx.emailAccount.update({
      where: { id: next.id },
      data: {
        status: "used",
        claimId,
        assignedAt: new Date()
      }
    });

    return next.emailAddress;
  });
}

export async function getEmailPoolStats() {
  const [available, used, disabled] = await Promise.all([
    prisma.emailAccount.count({ where: { status: "available" } }),
    prisma.emailAccount.count({ where: { status: "used" } }),
    prisma.emailAccount.count({ where: { status: "disabled" } })
  ]);
  return { available, used, disabled, total: available + used + disabled };
}
