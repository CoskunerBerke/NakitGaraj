import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function run() {
  const makes = await p.rawVehicleListing.groupBy({
    by: ['canonicalMake'],
    _count: { id: true },
  });
  console.log('Distinct canonicalMakes in DB:');
  makes.forEach(m => console.log(`- ${m.canonicalMake}: ${m._count.id}`));
}

run().catch(console.error).finally(() => p.$disconnect());
