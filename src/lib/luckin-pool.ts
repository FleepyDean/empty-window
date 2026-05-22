import { prisma } from "@/lib/prisma";

/**
 * Atomically reserve the oldest available LuckinAccount and bind it to the claim.
 * Marks status="used" immediately — once an account is handed to a user, it's
 * retired permanently (because the user may have already logged into Luckin).
 *
 * Returns the assigned account (email + password), or null if pool is exhausted.
 */
export async function assignLuckinAccountToClaim(claimId: string): Promise<{ email: string; password: string } | null> {
  return prisma.$transaction(async (tx) => {
    const next = await tx.luckinAccount.findFirst({
      where: { status: "available" },
      orderBy: { id: "asc" }
    });
    if (!next) return null;

    await tx.luckinAccount.update({
      where: { id: next.id },
      data: {
        status: "used",
        claimId,
        assignedAt: new Date()
      }
    });

    return { email: next.email, password: next.password };
  });
}

export async function getLuckinPoolStats() {
  const [available, used, disabled] = await Promise.all([
    prisma.luckinAccount.count({ where: { status: "available" } }),
    prisma.luckinAccount.count({ where: { status: "used" } }),
    prisma.luckinAccount.count({ where: { status: "disabled" } })
  ]);
  return { available, used, disabled, total: available + used + disabled };
}
