import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Find Shopee orders created today (recently) that are marked "shipped"
// but may have been falsely backfilled without an actual Shopee ship_order call.
const cutoff = new Date("2026-08-04T00:00:00.000Z");

const orders = await prisma.order.findMany({
  where: {
    source: "shopee",
    status: "shipped",
    createdAt: { gte: cutoff },
    externalRef: { not: null }
  },
  select: { orderId: true, quantity: true, createdAt: true, updatedAt: true }
});

console.log(`Found ${orders.length} recent orders marked shipped:`);
console.log(JSON.stringify(orders, null, 2));

await prisma.$disconnect();
