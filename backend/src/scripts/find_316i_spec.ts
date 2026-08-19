import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const m = await prisma.manufacturer.findFirst({ where: { name: 'BMW' } });
  const model = await prisma.model.findFirst({ where: { manufacturerId: m!.id, name: { contains: '3 Serisi' } } });
  const variants = await prisma.variant.findMany({ where: { modelId: model!.id, name: { contains: '316i' } } });

  console.log('BMW ID:', m?.id);
  console.log('Model ID:', model?.id);
  console.log('Variants found:', variants.length);
  for (const v of variants) {
    console.log(`- Variant ID: ${v.id} | Name: "${v.name}"`);
    const specs = await prisma.vehicleSpecification.findMany({
      where: { manufacturerId: m!.id, modelId: model!.id, variantId: v.id, year: 2015 },
      include: { package: true, bodyType: true, fuelType: true, transmissionType: true }
    });
    console.log(`  Specs count for 2015: ${specs.length}`);
    specs.forEach(s => {
      console.log(`  - Spec ID: ${s.id} | Package: "${s.package?.name}" | Fuel: "${s.fuelType?.name}" | Trans: "${s.transmissionType?.name}"`);
    });
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
