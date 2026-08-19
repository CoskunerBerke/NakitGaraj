import * as path from 'path';
try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}
process.env.DATABASE_URL = 'file:' + path.resolve(__dirname, '../../prisma/dev.db');

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function run() {
  const fordCount = await p.rawVehicleListing.count({
    where: {
      OR: [
        { canonicalMake: { contains: 'Ford' } },
        { rawMake: { contains: 'Ford' } },
        { sourceFile: { contains: 'Ford' } },
      ],
    },
  });
  const totalCount = await p.rawVehicleListing.count();
  const sampleFord = await p.rawVehicleListing.findFirst({
    where: { sourceFile: { contains: 'Ford' } },
  });
  console.log(`Current Ford listings in DB: ${fordCount}`);
  console.log(`Current Total listings in DB: ${totalCount}`);
  if (sampleFord) {
    console.log('Sample Ford Listing:', {
      id: sampleFord.sourceListingId,
      make: sampleFord.canonicalMake,
      rawMake: sampleFord.rawMake,
      model: sampleFord.canonicalModel,
      variant: sampleFord.canonicalVariant,
      year: sampleFord.year,
      price: sampleFord.price,
    });
  }
}

run().catch(console.error).finally(() => p.$disconnect());
