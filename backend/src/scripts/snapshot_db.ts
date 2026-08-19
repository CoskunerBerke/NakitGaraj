import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const rawTotal = await prisma.rawVehicleListing.count();
  const uniqueListings = (await prisma.rawVehicleListing.groupBy({ by: ['sourceListingId'] })).length;
  const validCount = await prisma.rawVehicleListing.count({ where: { parseStatus: 'VALID' } });
  const pricingUsable = await prisma.rawVehicleListing.count({ where: { price: { gt: 0 } } });
  
  const manufacturers = await prisma.manufacturer.count();
  const models = await prisma.model.count();
  const variants = await prisma.variant.count();
  const packages = await prisma.package.count();
  const specs = await prisma.vehicleSpecification.count();

  const badModels = await prisma.model.findMany({
    where: {
      OR: [
        { name: { contains: 'sahibinden' } },
        { name: { contains: 'Fiyatları' } },
        { name: { contains: '.html' } },
      ],
    },
    include: {
      manufacturer: true,
      specifications: true,
      variants: true,
    },
  });

  const badVariants = await prisma.variant.findMany({
    where: {
      OR: [
        { name: { contains: 'sahibinden' } },
        { name: { contains: 'Fiyatları' } },
      ],
    },
  });

  const badPackages = await prisma.package.findMany({
    where: {
      OR: [
        { name: { contains: 'sahibinden' } },
        { name: { contains: 'Fiyatları' } },
      ],
    },
  });

  console.log('=== DATABASE SNAPSHOT ===');
  console.log(JSON.stringify({
    rawTotal,
    uniqueListings,
    validCount,
    pricingUsable,
    manufacturers,
    models,
    variants,
    packages,
    specs,
    badModelCount: badModels.length,
    badVariantCount: badVariants.length,
    badPackageCount: badPackages.length,
    badModelsList: badModels.map(m => ({
      id: m.id,
      brand: m.manufacturer.name,
      name: m.name,
      specCount: m.specifications.length,
      variantCount: m.variants.length,
    })),
  }, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
