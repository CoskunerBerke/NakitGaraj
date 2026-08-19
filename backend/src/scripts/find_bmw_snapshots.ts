import * as path from 'path';
try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}
process.env.DATABASE_URL = 'file:' + path.resolve(__dirname, '../../prisma/dev.db');

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function run() {
  const snapshots = await p.vehicleMarketSnapshot.findMany({
    where: {
      canonicalMake: 'BMW',
      canonicalModel: '3 Serisi',
      year: 2015,
    },
  });
  console.log('BMW 3 Serisi 2015 Snapshots count:', snapshots.length);
  snapshots.forEach(s => {
    console.log(`- Level: ${s.matchedLevel} | Variant: "${s.canonicalVariant}" | Trim: "${s.canonicalTrim}" | P50: ${s.weightedP50} | Count: ${s.matchedListingCount}`);
  });
}

run().catch(console.error).finally(() => p.$disconnect());
