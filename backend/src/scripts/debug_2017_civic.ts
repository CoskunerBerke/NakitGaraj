import { PrismaClient } from '@prisma/client';
import { EmsalMatcherService } from '../evaluation/emsal-matcher.service';

const prisma = new PrismaClient();
const matcher = new EmsalMatcherService(prisma as any);

async function main() {
  const makes = await prisma.manufacturer.findMany();
  const honda = makes.find(m => m.name.toLowerCase() === 'honda')!;
  const civic = await prisma.model.findFirst({ where: { manufacturerId: honda.id, name: 'Civic' } });

  console.log(`Honda: ${honda.id}, Civic: ${civic?.id}`);

  // Query raw listings for 2017 Honda Civic
  const rawListings = await prisma.rawVehicleListing.findMany({
    where: {
      rawMake: 'Honda',
      rawModel: { contains: 'Civic' },
      year: { gte: 2016, lte: 2018 }
    },
    take: 10
  });

  console.log(`Raw listings count for 2017 (+/-1) Honda Civic: ${rawListings.length}`);
  for (const r of rawListings) {
    console.log(`- ID: ${r.sourceListingId} | make: ${r.rawMake} | model: ${r.rawModel} | variant: ${r.rawVariant} | trim: ${r.canonicalTrim} | year: ${r.year} | price: ${r.price} | parseStatus: ${r.parseStatus}`);
  }

  const res = await matcher.matchComparableListings({
    make: 'Honda',
    model: 'Civic',
    variant: 'Eco Executive',
    year: 2017,
    mileageKm: 80000
  });

  console.log('Emsal Matcher Result:', JSON.stringify({
    level: res.level,
    matchedCount: res.matchedCount,
    explanation: res.explanationNote
  }, null, 2));

  await prisma.$disconnect();
}

main();
