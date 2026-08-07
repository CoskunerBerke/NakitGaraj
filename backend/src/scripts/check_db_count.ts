import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const brands = await prisma.manufacturer.findMany({
    where: {
      specifications: {
        some: {
          marketPrices: {
            some: {
              regionalPriceDifferences: {
                contains: 'nakitAlisReferansi',
              },
            },
          },
        },
      },
    },
    select: { name: true },
    orderBy: { name: 'asc' },
  });

  console.log(`\n==================================================`);
  console.log(`SAHİBİNDEN'DEN İTHAL EDİLMİŞ GERÇEK MARKALAR (${brands.length} ADET):`);
  console.log(`==================================================`);
  console.log(brands.map((b: { name: string }) => b.name).join(', '));
  console.log('\n');
}

main().finally(() => prisma.$disconnect());
