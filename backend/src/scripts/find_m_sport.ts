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
      package: { name: { contains: 'M Sport' } },
    },
    include: {
      variant: true,
      package: true,
    },
  });

  console.log('BMW 3 Serisi 2015 M Sport Specs:', specs.map(s => ({
    specId: s.id,
    variant: s.variant?.name,
    package: s.package?.name,
  })));
}

run().catch(console.error).finally(() => p.$disconnect());
