import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const models = await prisma.rawVehicleListing.groupBy({
    by: ['rawMake', 'rawModel'],
    where: { rawMake: { contains: 'BMW' } },
    _count: true
  });
  console.log('BMW Models in DB:', models);
}

main().finally(() => prisma.$disconnect());
