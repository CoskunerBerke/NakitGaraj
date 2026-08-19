import * as path from 'path';
try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}
process.env.DATABASE_URL = 'file:' + path.resolve(__dirname, '../../prisma/dev.db');

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function run() {
  const specs = await p.vehicleSpecification.findMany({
    where: {
      year: 2015,
      manufacturer: { name: 'BMW' },
      model: { name: '3 Serisi' },
    },
    include: {
      variant: true,
      package: true,
      marketPrices: true,
    },
  });

  console.log('BMW 3 Serisi 2015 Specifications Count:', specs.length);
  specs.forEach(s => {
    console.log(`- Spec ID: ${s.id} | Variant: "${s.variant?.name}" | Package: "${s.package?.name}" | Price Avg: ${s.marketPrices[0]?.averageListingPrice || 'N/A'}`);
  });
}

run().catch(console.error).finally(() => p.$disconnect());
