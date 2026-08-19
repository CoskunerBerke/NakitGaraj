import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const models = await prisma.model.findMany({ include: { manufacturer: true } });
  console.log('Inspecting remaining models:');
  for (const m of models) {
    const name = m.name;
    const lower = name.toLowerCase();
    if (
      lower.includes('sahibinden') ||
      lower.includes('fiyatları') ||
      lower.includes('.html') ||
      lower.includes('modelleri') ||
      lower.includes('tfsi') ||
      lower.includes('tdi') ||
      lower.includes('tsi') ||
      lower.includes('sportback')
    ) {
      console.log(`BAD MODEL ID: ${m.id} | Make: ${m.manufacturer.name} | Name: "${m.name}"`);
    }
  }
}

run().finally(() => prisma.$disconnect());
