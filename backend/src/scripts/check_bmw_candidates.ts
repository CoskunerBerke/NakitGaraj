import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const m = await prisma.manufacturer.findFirst({ where: { name: 'BMW' } });
  const model = await prisma.model.findFirst({ where: { manufacturerId: m!.id, name: { contains: '3 Serisi' } } });
  const variant = await prisma.variant.findFirst({ where: { modelId: model!.id, name: { contains: '316i' } } });

  console.log('BMW ID:', m?.id);
  console.log('3 Serisi ID:', model?.id);
  console.log('316i ID:', variant?.id);

  // Check RawVehicleListing for BMW 3 Serisi
  const l1Listings = await prisma.rawVehicleListing.findMany({
    where: {
      rawMake: { contains: 'BMW' },
      rawModel: { contains: '3 Serisi' },
      rawVariant: { contains: '316i' },
      canonicalTrim: { contains: 'M Sport' },
      year: { gte: 2014, lte: 2016 }
    }
  });

  const l2Listings = await prisma.rawVehicleListing.findMany({
    where: {
      rawMake: { contains: 'BMW' },
      rawModel: { contains: '3 Serisi' },
      rawVariant: { contains: '316i' },
      NOT: { canonicalTrim: { contains: 'M Sport' } },
      year: { gte: 2014, lte: 2016 }
    }
  });

  const l3Listings = await prisma.rawVehicleListing.findMany({
    where: {
      rawMake: { contains: 'BMW' },
      rawModel: { contains: '3 Serisi' },
      NOT: { rawVariant: { contains: '316i' } },
      year: { gte: 2013, lte: 2017 }
    }
  });

  console.log('L1 Candidates (316i M Sport 2014-2016):', l1Listings.length);
  console.log('L2 Candidates (316i Other Trim 2014-2016):', l2Listings.length);
  console.log('L3 Candidates (Other Engine 2013-2017):', l3Listings.length);
}

run().catch(console.error).finally(() => prisma.$disconnect());
