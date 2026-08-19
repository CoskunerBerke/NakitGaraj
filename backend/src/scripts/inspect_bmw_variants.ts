import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const bmw = await prisma.manufacturer.findFirst({ where: { name: { contains: 'BMW' } } });
  const model = bmw ? await prisma.model.findFirst({ where: { manufacturerId: bmw.id, name: { contains: '3 Serisi' } } }) : null;
  if (model) {
    const vars = await prisma.variant.findMany({ where: { modelId: model.id } });
    console.log('BMW 3 Serisi Variants:', vars.map(v => ({ id: v.id, name: v.name })));
  }

  // Check duplicate models
  const models = await prisma.model.findMany({ include: { manufacturer: true } });
  const seen = new Map<string, any>();
  for (const m of models) {
    const key = `${m.manufacturerId}__${m.name.trim().toLowerCase()}`;
    if (seen.has(key)) {
      console.log('DUPLICATE MODEL:', m.manufacturer.name, m.name, 'IDs:', m.id, seen.get(key).id);
    } else {
      seen.set(key, m);
    }
  }
}

run().finally(() => prisma.$disconnect());
