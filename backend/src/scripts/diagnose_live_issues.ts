import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== DIAGNOSING BMW 2014 316i M SPORT IN DB ===');

  // 1. Check Manufacturer, Model, Variant, Package in Catalog
  const bmw = await prisma.manufacturer.findFirst({ where: { name: 'BMW' } });
  console.log('BMW Manufacturer:', bmw?.id, bmw?.name);

  const model3 = await prisma.model.findFirst({ where: { name: '3 Serisi', manufacturerId: bmw?.id } });
  console.log('3 Serisi Model:', model3?.id, model3?.name);

  const variants = await prisma.variant.findMany({ where: { modelId: model3?.id } });
  console.log('Variants under 3 Serisi:', variants.map(v => ({ id: v.id, name: v.name, engineSize: v.engineSize })));

  const packages = await prisma.package.findMany();
  console.log('Packages total count:', packages.length);
  const mSport = packages.find(p => p.name.toLowerCase().includes('m sport'));
  console.log('M Sport package:', mSport);

  const spec2014 = await prisma.vehicleSpecification.findFirst({
    where: {
      manufacturerId: bmw?.id,
      modelId: model3?.id,
      year: 2014,
    },
    include: {
      variant: true,
      package: true,
    }
  });
  console.log('Sample 2014 3 Serisi Spec:', spec2014?.id, spec2014?.variant?.name, spec2014?.package?.name);

  // 2. Check RawVehicleListing table
  const rawListings = await prisma.rawVehicleListing.findMany({
    where: {
      rawMake: { contains: 'BMW' },
      rawModel: { contains: '3 Serisi' },
      year: 2014,
    }
  });

  console.log(`\nTotal 2014 BMW 3 Serisi Raw Listings: ${rawListings.length}`);
  
  const raw316i = rawListings.filter(r => 
    (r.rawVariant && r.rawVariant.includes('316i')) || 
    (r.rawTitle && r.rawTitle.includes('316i'))
  );
  console.log(`Raw Listings with 316i: ${raw316i.length}`);

  const raw316iMSport = raw316i.filter(r =>
    (r.canonicalTrim && r.canonicalTrim.toLowerCase().includes('m sport')) ||
    (r.rawTitle && r.rawTitle.toLowerCase().includes('m sport'))
  );
  console.log(`Raw Listings with 316i AND M Sport: ${raw316iMSport.length}`);

  console.log('\nSample 316i M Sport Raw Listings:');
  for (const item of raw316iMSport.slice(0, 10)) {
    console.log(`- ID: ${item.sourceListingId}, Year: ${item.year}, Km: ${item.mileageKm}, Price: ${item.price} TL, Variant: ${item.rawVariant}, Trim: ${item.canonicalTrim}, Title: ${item.rawTitle}`);
  }

  // 3. Check VehicleMarketSnapshot table for L1/L2/L3 snapshots
  const snapshots = await prisma.vehicleMarketSnapshot.findMany({
    where: {
      make: 'BMW',
      model: { contains: '3 Serisi' },
    }
  });
  console.log(`\nTotal Snapshots for BMW 3 Serisi: ${snapshots.length}`);
  for (const s of snapshots.slice(0, 15)) {
    console.log(`- Snapshot ID: ${s.id.slice(0, 8)}, Year: ${s.year}, Model: ${s.model}, Variant: ${s.variant}, Trim: ${s.canonicalTrim}, MatchedCount: ${s.matchedListingCount}, Version: ${s.snapshotVersion}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
