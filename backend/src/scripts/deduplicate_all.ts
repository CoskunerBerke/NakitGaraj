import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log(`\n====================================================================`);
  console.log(`  VERİTABANINDA MÜKERRER (AYNI) SPESİFİKASYON VE FİYAT TEMİZLİĞİ`);
  console.log(`====================================================================\n`);

  const initialSpecCount = await prisma.vehicleSpecification.count();
  const initialPriceCount = await prisma.vehicleMarketPrice.count();

  // Find all specs with their market prices
  const allSpecs = await prisma.vehicleSpecification.findMany({
    select: {
      id: true,
      manufacturerId: true,
      modelId: true,
      variantId: true,
      packageId: true,
      year: true,
      marketPrices: {
        select: {
          id: true,
          currentMarketAverage: true,
        },
      },
    },
  });

  const seenKeys = new Map<string, string>(); // key -> keepSpecId
  const specIdsToDelete: string[] = [];
  const priceIdsToDelete: string[] = [];

  allSpecs.forEach((spec) => {
    const priceAvg = spec.marketPrices[0]?.currentMarketAverage || 0;
    const key = `${spec.manufacturerId}_${spec.modelId}_${spec.variantId}_${spec.packageId}_${spec.year}_${priceAvg}`;

    if (seenKeys.has(key)) {
      specIdsToDelete.push(spec.id);
      spec.marketPrices.forEach((p) => priceIdsToDelete.push(p.id));
    } else {
      seenKeys.set(key, spec.id);
    }
  });

  console.log(`Bulunan Mükerrer Spesifikasyon Sayısı: ${specIdsToDelete.length}`);
  console.log(`Bulunan Mükerrer Fiyat Kaydı Sayısı   : ${priceIdsToDelete.length}`);

  if (priceIdsToDelete.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < priceIdsToDelete.length; i += chunkSize) {
      const chunk = priceIdsToDelete.slice(i, i + chunkSize);
      await prisma.vehicleMarketPrice.deleteMany({
        where: { id: { in: chunk } },
      });
    }
  }

  if (specIdsToDelete.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < specIdsToDelete.length; i += chunkSize) {
      const chunk = specIdsToDelete.slice(i, i + chunkSize);
      await prisma.vehicleSpecification.deleteMany({
        where: { id: { in: chunk } },
      });
    }
  }

  const finalSpecCount = await prisma.vehicleSpecification.count();
  const finalPriceCount = await prisma.vehicleMarketPrice.count();

  console.log(`\n--------------------------------------------------------------------`);
  console.log(` Başlangıç Spesifikasyon : ${initialSpecCount} -> Temizlik Sonrası: ${finalSpecCount}`);
  console.log(` Başlangıç Fiyat Kaydı   : ${initialPriceCount} -> Temizlik Sonrası: ${finalPriceCount}`);
  console.log(`--------------------------------------------------------------------\n`);
}

main().catch(console.error);
