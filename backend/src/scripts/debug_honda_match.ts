import { PrismaClient } from '@prisma/client';
import { EmsalMatcherService } from '../evaluation/emsal-matcher.service';

const prisma = new PrismaClient();
const matcher = new EmsalMatcherService(prisma as any);

async function main() {
  const makesMap = new Map<string, string>();
  const makes = await prisma.manufacturer.findMany();
  for (const m of makes) makesMap.set(m.name.toLowerCase(), m.id);

  const hondaId = makesMap.get('honda')!;
  const modelObj = await prisma.model.findFirst({ where: { manufacturerId: hondaId, name: 'Civic' } });

  console.log(`Honda ID: ${hondaId}, Model ID: ${modelObj?.id}`);

  const match = await matcher.matchComparableListings({
    make: 'Honda',
    model: 'Civic',
    variant: 'Eco Elegance',
    year: 2021,
    mileageKm: 80000,
  });

  console.log('Match Result:', JSON.stringify({
    level: match.level,
    matchedCount: match.matchedCount,
    confidenceScore: match.confidenceScore,
    explanationNote: match.explanationNote,
    actuallyUsedListingCount: match.actuallyUsedListingCount,
    sampleListings: match.cleanListings.slice(0, 3)
  }, null, 2));

  await prisma.$disconnect();
}

main();
