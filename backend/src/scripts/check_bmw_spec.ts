import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkBmwSpec() {
  const bmw = await prisma.manufacturer.findFirst({ where: { name: 'BMW' } });
  const model = await prisma.model.findFirst({ where: { manufacturerId: bmw!.id, name: { contains: '3 Serisi' } } });
  const variant = await prisma.variant.findFirst({ where: { modelId: model!.id, name: '316i' } });
  const packages = await prisma.package.findMany({ where: { variantId: variant!.id } });

  console.log('BMW:', bmw?.id);
  console.log('Model 3 Serisi:', model?.id);
  console.log('Variant 316i:', variant?.id);
  console.log('Packages for 316i:', packages.map(p => ({ id: p.id, name: p.name })));

  const specs = await prisma.vehicleSpecification.findMany({
    where: {
      year: 2015,
      manufacturerId: bmw!.id,
      modelId: model!.id,
      variantId: variant!.id,
    },
    include: { package: true }
  });

  console.log('VehicleSpecifications for 2015 BMW 3 Serisi 316i:');
  specs.forEach(s => {
    console.log(`Spec ID: ${s.id}, Package ID: ${s.packageId}, Package Name: ${s.package?.name}`);
  });
}

checkBmwSpec().finally(() => prisma.$disconnect());
