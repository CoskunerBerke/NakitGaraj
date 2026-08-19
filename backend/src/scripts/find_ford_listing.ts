import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function run() {
  const listing = await p.rawVehicleListing.findFirst({
    where: { sourceListingId: '1238466184' },
  });
  console.log('Listing 1238466184:', listing);

  const anyFordFile = await p.rawVehicleListing.findFirst({
    where: { sourceFile: { contains: 'Ford' } },
  });
  console.log('Any listing with sourceFile containing Ford:', anyFordFile);
}

run().catch(console.error).finally(() => p.$disconnect());
