import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const specs = await prisma.vehicleSpecification.findMany({
    take: 50,
    include: { manufacturer: true, model: true, variant: true, package: true }
  });

  console.log(`Found ${specs.length} specs. Sample:`);
  for (const s of specs.slice(0, 10)) {
    console.log(`${s.id} | ${s.year} ${s.manufacturer.name} ${s.model.name} (${s.variant?.name || 'NoVar'}, ${s.package?.name || 'NoPkg'})`);
  }

  await prisma.$disconnect();
}

main();
