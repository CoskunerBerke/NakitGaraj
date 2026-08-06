import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log(`\n====================================================================`);
  console.log(`  VERİTABANINDA MÜKERRER (AYNI) İLAN VE FİYAT TEMİZLİĞİ BAŞLATILDI`);
  console.log(`====================================================================\n`);

  const initialCount = await prisma.vehicleMarketPrice.count();

  // Find all market price records
  const allPrices = await prisma.vehicleMarketPrice.findMany({
    select: {
      id: true,
      vehicleSpecificationId: true,
      currentMarketAverage: true,
      averageListingPrice: true,
      minPrice: true,
      maxPrice: true,
    },
  });

  const seen = new Set<string>();
  const duplicateIds: string[] = [];

  allPrices.forEach((p) => {
    // Unique signature key
    const key = `${p.vehicleSpecificationId}_${p.currentMarketAverage}_${p.averageListingPrice}_${p.minPrice}_${p.maxPrice}`;
    if (seen.has(key)) {
      duplicateIds.push(p.id);
    } else {
      seen.add(key);
    }
  });

  if (duplicateIds.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < duplicateIds.length; i += chunkSize) {
      const chunk = duplicateIds.slice(i, i + chunkSize);
      await prisma.vehicleMarketPrice.deleteMany({
        where: { id: { in: chunk } },
      });
    }
  }

  const finalCount = await prisma.vehicleMarketPrice.count();

  console.log(`--------------------------------------------------------------------`);
  console.log(` Başlangıçtaki Fiyat Kaydı Sayısı : ${initialCount}`);
  console.log(` Silinen Mükerrer / Aynı Kayıt Sayısı: ${duplicateIds.length}`);
  console.log(` Kalan Tamamen Tekil İlan Sayısı   : ${finalCount}`);
  console.log(`--------------------------------------------------------------------\n`);
}

main().catch(console.error);
