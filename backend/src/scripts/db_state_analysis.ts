import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const raw = await prisma.rawVehicleListing.count();
  const valid = await prisma.rawVehicleListing.count({ where: { parseStatus: 'VALID' } });
  const incomplete = await prisma.rawVehicleListing.count({ where: { parseStatus: 'INCOMPLETE_ATTRIBUTES' } });
  const missing = await prisma.rawVehicleListing.count({ where: { parseStatus: 'MISSING_PRICE' } });
  const q = await prisma.quarantinedListing.count();
  const makes = await prisma.manufacturer.count();
  const models = await prisma.model.count();
  const variants = await prisma.variant.count();
  const pkgs = await prisma.package.count();
  const specs = await prisma.vehicleSpecification.count();
  const snaps = await prisma.vehicleMarketSnapshot.count();
  
  // Count distinct sourceListingIds
  const distinctSources: any[] = await prisma.$queryRaw`SELECT COUNT(DISTINCT sourceListingId) as cnt FROM RawVehicleListing`;
  const distinctMakes: any[] = await prisma.$queryRaw`SELECT DISTINCT rawMake FROM RawVehicleListing WHERE parseStatus = 'VALID' ORDER BY rawMake`;
  
  // Count DB manufacturers
  const dbMakes = await prisma.manufacturer.findMany({ select: { name: true }, orderBy: { name: 'asc' } });
  
  console.log(JSON.stringify({
    rawVehicleListing: raw,
    validListings: valid,
    incompleteListings: incomplete,
    missingPriceListings: missing,
    quarantinedListings: q,
    distinctSourceListingIds: Number(distinctSources[0]?.cnt),
    manufacturers: makes,
    models,
    variants,
    packages: pkgs,
    vehicleSpecifications: specs,
    vehicleMarketSnapshots: snaps,
    distinctRawMakes: distinctMakes.map(m => m.rawMake),
    dbManufacturerNames: dbMakes.map(m => m.name),
  }, null, 2));
  
  await prisma.$disconnect();
}

main();
