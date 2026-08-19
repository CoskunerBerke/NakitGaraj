import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const listings = await prisma.rawVehicleListing.findMany({
    where: {
      rawMake: 'BMW',
      rawModel: '3 Serisi',
      year: 2014,
      parseStatus: 'VALID',
      price: { gt: 0 }
    }
  });

  const exact = listings.filter(l => {
    const vMatch = (l.rawVariant || '').toLowerCase().includes('316i') || (l.rawTitle || '').toLowerCase().includes('316i');
    const tMatch = (l.canonicalTrim || '').toLowerCase().includes('m sport') || (l.rawTitle || '').toLowerCase().includes('m sport');
    return vMatch && tMatch;
  });

  console.log(`Total 2014 BMW 3 Serisi VALID listings: ${listings.length}`);
  console.log(`Exact 2014 316i M Sport listings: ${exact.length}`);

  console.log('Sample exact listings (first 5):', exact.slice(0, 5).map(l => ({
    id: l.sourceListingId,
    rawVariant: l.rawVariant,
    canonicalTrim: l.canonicalTrim,
    rawTitle: l.rawTitle,
    price: l.price
  })));
}

main().finally(() => prisma.$disconnect());
