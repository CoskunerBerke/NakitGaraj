import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const bmw = await prisma.manufacturer.findFirst({ where: { name: { contains: 'BMW' } } });
  const bmw3Model = await prisma.model.findFirst({ where: { manufacturerId: bmw!.id, name: { contains: '3 Serisi' } } });
  const bmw316Variant = await prisma.variant.findFirst({ where: { modelId: bmw3Model!.id, name: { contains: '316i' } } });

  console.log('bmw.id:', bmw?.id);
  console.log('bmw3Model.id:', bmw3Model?.id);
  console.log('bmw316Variant:', bmw316Variant);

  const specs = await prisma.vehicleSpecification.findMany({
    where: {
      manufacturerId: bmw!.id,
      modelId: bmw3Model!.id,
      variantId: bmw316Variant!.id,
      year: 2015,
    },
    include: {
      variant: true,
      package: true,
    }
  });

  console.log('Specs count:', specs.length);
  for (const s of specs) {
    console.log(`Spec ID: ${s.id} | Variant: "${s.variant?.name}" | Package: "${s.package?.name}"`);
  }
}

run().finally(() => prisma.$disconnect());
