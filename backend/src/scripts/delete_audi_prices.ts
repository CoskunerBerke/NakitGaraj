import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const audiSpecs = await prisma.vehicleSpecification.findMany({
    where: {
      variant: {
        model: {
          manufacturer: {
            name: 'Audi',
          },
        },
      },
    },
    select: { id: true },
  });

  const specIds = audiSpecs.map((s) => s.id);

  const result = await prisma.vehicleMarketPrice.deleteMany({
    where: {
      vehicleSpecificationId: {
        in: specIds,
      },
    },
  });

  console.log(`\n====================================================================`);
  console.log(`  VERİTABANINDAKİ ${result.count} ADET AUDİ FİYAT KAYDI BAŞARIYLA SİLİNDİ`);
  console.log(`====================================================================\n`);
}

main().catch(console.error);
