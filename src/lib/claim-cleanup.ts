import { prisma } from "@/lib/prisma";
import { cancelNumber } from "@/lib/herosms";

/**
 * Auto-expire any waiting_otp claims past their expiresAt:
 * - Restore quantity to OrderItem (cart) or Order (legacy)
 * - Mark claim as "expired" with quantityDeducted=false
 * - Best-effort cancel on HeroSMS
 *
 * If orderId is provided, only that order's claims are cleaned. Otherwise all orders.
 */
export async function cleanupExpiredClaims(orderId?: string): Promise<number> {
  const now = new Date();
  const expiredClaims = await prisma.claim.findMany({
    where: {
      ...(orderId ? { orderId } : {}),
      status: "waiting_otp",
      expiresAt: { lte: now },
      quantityDeducted: true
    }
  });

  let cleaned = 0;
  for (const claim of expiredClaims) {
    try {
      await prisma.$transaction(async (tx) => {
        if (claim.orderItemId) {
          const orderItem = await tx.orderItem.findUnique({ where: { id: claim.orderItemId } });
          if (orderItem) {
            await tx.orderItem.update({
              where: { id: claim.orderItemId },
              data: { remainingQty: orderItem.remainingQty + 1 }
            });
          }
        } else {
          const ord = await tx.order.findUnique({ where: { orderId: claim.orderId } });
          if (ord) {
            await tx.order.update({
              where: { orderId: claim.orderId },
              data: { quantity: ord.quantity + 1, status: "active" }
            });
          }
        }

        // Release email back to pool if this was a CBTL claim
        const emailAccount = await tx.emailAccount.findFirst({ where: { claimId: claim.claimId } });
        if (emailAccount) {
          await tx.emailAccount.update({
            where: { id: emailAccount.id },
            data: { status: "available", claimId: null, assignedAt: null }
          });
        }

        await tx.claim.update({
          where: { claimId: claim.claimId },
          data: { status: "expired", quantityDeducted: false }
        });
      });

      // Best-effort HeroSMS cancel — outside the transaction
      // For CBTL: if no heroActivationId yet (still in email phase), skip HeroSMS cancel
      if (claim.heroActivationId) {
        try {
          await cancelNumber(claim.heroActivationId);
        } catch {
          // ignore
        }
      }

      cleaned++;
    } catch {
      // continue with next
    }
  }

  return cleaned;
}
