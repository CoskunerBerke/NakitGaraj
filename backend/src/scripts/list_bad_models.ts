import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const badModels = await prisma.model.findMany({
    where: {
      OR: [
        { name: { contains: 'sahibinden' } },
        { name: { contains: 'Fiyatları' } },
        { name: { contains: '.html' } },
      ],
    },
    include: {
      manufacturer: true,
      _count: {
        select: {
          specifications: true,
          variants: true,
        },
      },
    },
  });

  console.log(`Found ${badModels.length} corrupted Model records:`);
  badModels.forEach(m => {
    console.log(`- [${m.manufacturer.name}] "${m.name}" (Specs: ${m._count.specifications}, Variants: ${m._count.variants})`);
  });

  const badVariants = await prisma.variant.findMany({
    where: {
      OR: [
        { name: { contains: 'sahibinden' } },
        { name: { contains: 'Fiyatları' } },
      ],
    },
    include: {
      model: {
        include: {
          manufacturer: true,
        },
      },
    },
  });

  console.log(`\nFound ${badVariants.length} corrupted Variant records:`);
  badVariants.forEach(v => {
    console.log(`- [${v.model.manufacturer.name} ${v.model.name}] "${v.name}"`);
  });
}

run().catch(console.error).finally(() => prisma.$disconnect());
