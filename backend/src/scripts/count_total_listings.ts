import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const totalRaw = await prisma.rawVehicleListing.count();
  const validRaw = await prisma.rawVehicleListing.count({ where: { parseStatus: 'VALID' } });
  const withPrice = await prisma.rawVehicleListing.count({ where: { parseStatus: 'VALID', price: { gt: 0 } } });
  const quarantined = await prisma.quarantinedListing.count().catch(() => 0);

  console.log({ totalRaw, validRaw, withPrice, quarantined });
}

main().finally(() => prisma.$disconnect());
