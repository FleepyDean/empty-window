import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.order.upsert({
    where: { orderId: "ZUS-1001" },
    update: {},
    create: {
      orderId: "ZUS-1001",
      productKey: "zus",
      productName: "ZUS Coffee",
      serviceCode: "aik",
      quantity: 3,
      status: "active"
    }
  });

  await prisma.order.upsert({
    where: { orderId: "ZUS-2002" },
    update: {},
    create: {
      orderId: "ZUS-2002",
      productKey: "zus",
      productName: "ZUS Coffee",
      serviceCode: "aik",
      quantity: 1,
      status: "active"
    }
  });

  await prisma.order.upsert({
    where: { orderId: "ZUS-9999" },
    update: {},
    create: {
      orderId: "ZUS-9999",
      productKey: "zus",
      productName: "ZUS Coffee",
      serviceCode: "aik",
      quantity: 0,
      status: "depleted"
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
