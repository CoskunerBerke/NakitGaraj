import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const snapshots = await prisma.vehicleMarketSnapshot.findMany({
    where: {
      canonicalMake: 'BMW',
      canonicalModel: { contains: '5 Serisi' },
      year: 2016
    }
  });

  console.log('5 Serisi snapshots count:', snapshots.length);
  snapshots.forEach(s => {
    console.log(`- ID: ${s.id.slice(0, 8)} | Variant: "${s.canonicalVariant}" | Trim: "${s.canonicalTrim}" | Body: "${s.canonicalBodyType}" | Fuel: "${s.canonicalFuelType}" | Trans: "${s.canonicalTransmission}" | Count: ${s.matchedListingCount}`);
  });
}

run().catch(console.error).finally(() => prisma.$disconnect());
