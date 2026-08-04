import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const orderIds = ["260804FB5EH9P7", "260804FB1KG8UV"];

for (const id of orderIds) {
  const claims = await prisma.claim.findMany({ where: { orderId: id } });
  console.log(id, JSON.stringify(claims, null, 2));
  console.log("---");
}

await prisma.$disconnect();
