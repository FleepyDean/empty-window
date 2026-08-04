import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const orderIds = ["260804FB5EH9P7", "260804FB1KG8UV"];

const result = await prisma.order.updateMany({
  where: { orderId: { in: orderIds } },
  data: { status: "depleted" }
});

console.log(`Reverted ${result.count} orders back to depleted status`);

await prisma.$disconnect();
