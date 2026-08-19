import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const allRaw = await prisma.rawVehicleListing.findMany({
    where: {
      rawMake: 'BMW',
      OR: [{ rawModel: '3 Serisi' }, { rawModel: { contains: '3 Serisi' } }],
      parseStatus: 'VALID',
      price: { gt: 0 }
    }
  });

  const mSport316iListings = allRaw.filter(r => {
    const vMatch = (r.rawVariant || '').toLowerCase().includes('316i') || (r.rawTitle || '').toLowerCase().includes('316i');
    const tMatch = (r.canonicalTrim || '').toLowerCase().includes('m sport') || (r.rawTitle || '').toLowerCase().includes('m sport');
    return vMatch && tMatch;
  });

  const yearBreakdown: Record<number, number> = {};
  for (const r of mSport316iListings) {
    yearBreakdown[r.year] = (yearBreakdown[r.year] || 0) + 1;
  }

  const all316i = allRaw.filter(r => (r.rawVariant || '').toLowerCase().includes('316i') || (r.rawTitle || '').toLowerCase().includes('316i'));

  console.log({
    totalMSport316i: mSport316iListings.length,
    total316iAllPackages: all316i.length,
    totalBMW3SerisiAll: allRaw.length,
    yearBreakdown
  });
}

main().finally(() => prisma.$disconnect());
