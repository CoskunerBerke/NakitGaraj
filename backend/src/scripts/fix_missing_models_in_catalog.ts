import * as path from 'path';
import * as fs from 'fs';

try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}
const dbPath = path.resolve(__dirname, '../../prisma/dev.db');
process.env.DATABASE_URL = 'file:' + dbPath;

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  console.log('Ensuring all canonicalModels from RawVehicleListing exist in Model table...');
  const listings = await prisma.rawVehicleListing.findMany({
    select: { canonicalMake: true, canonicalModel: true },
  });

  const makeMap = new Map<string, string>();
  const makes = await prisma.manufacturer.findMany();
  for (const m of makes) makeMap.set(m.name.toLowerCase(), m.id);

  let createdCount = 0;
  const seenGroup = new Set<string>();

  for (const l of listings) {
    const makeName = (l.canonicalMake || '').trim();
    let modelName = (l.canonicalModel || '').trim();
    if (!makeName || !modelName || modelName === 'Genel Model') continue;

    // Strip redundant brand prefix (e.g. "Audi A1" -> "A1")
    modelName = modelName.replace(new RegExp('^' + makeName + '\\s+', 'i'), '').trim();
    if (!modelName) continue;

    const makeId = makeMap.get(makeName.toLowerCase());
    if (!makeId) continue;

    const groupKey = `${makeId}__${modelName.toLowerCase()}`;
    if (seenGroup.has(groupKey)) continue;
    seenGroup.add(groupKey);

    const existingModel = await prisma.model.findFirst({
      where: { manufacturerId: makeId, name: { equals: modelName } }
    });

    if (!existingModel) {
      await prisma.model.create({
        data: { manufacturerId: makeId, name: modelName }
      });
      createdCount++;
      console.log(`Created Model "${modelName}" for Make "${makeName}"`);
    }
  }

  console.log(`✓ Total Missing Models Created: ${createdCount}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
