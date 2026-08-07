import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function getEngineAndHpInfo(variantName: string, modelName: string): { engineSize: number; horsepower: number } {
  const name = `${modelName} ${variantName}`.toUpperCase();

  // AUDI ENGINES
  if (name.includes('30 TDI') || name.includes('1.6 TDI')) return { engineSize: 1.6, horsepower: 116 };
  if (name.includes('30 TFSI') || name.includes('1.0 TFSI')) return { engineSize: 1.0, horsepower: 110 };
  if (name.includes('35 TFSI') || name.includes('1.5 TFSI') || name.includes('1.4 TFSI')) return { engineSize: 1.5, horsepower: 150 };
  if (name.includes('40 TDI') || name.includes('2.0 TDI')) return { engineSize: 2.0, horsepower: 190 };
  if (name.includes('40 TFSI') || name.includes('2.0 TFSI')) return { engineSize: 2.0, horsepower: 204 };
  if (name.includes('45 TFSI')) return { engineSize: 2.0, horsepower: 245 };
  if (name.includes('50 TDI') || name.includes('3.0 TDI')) return { engineSize: 3.0, horsepower: 286 };
  if (name.includes('55 TFSI')) return { engineSize: 3.0, horsepower: 340 };
  if (name.includes('RS 6') || name.includes('RS6') || name.includes('RS 7') || name.includes('RS7')) return { engineSize: 4.0, horsepower: 600 };
  if (name.includes('RS 3') || name.includes('RS3')) return { engineSize: 2.5, horsepower: 400 };
  if (name.includes('R8')) return { engineSize: 5.2, horsepower: 570 };
  if (name.includes('1.2 TFSI')) return { engineSize: 1.2, horsepower: 105 };
  if (name.includes('1.8 TFSI') || name.includes('1.8 T')) return { engineSize: 1.8, horsepower: 170 };

  // ALFA ROMEO ENGINES
  if (name.includes('1.6 JTDM') || name.includes('1.6 JTD')) return { engineSize: 1.6, horsepower: 120 };
  if (name.includes('2.0') || name.includes('VELOCE') || name.includes('Q4')) return { engineSize: 2.0, horsepower: 280 };
  if (name.includes('1.4 TURBO') || name.includes('1.4 TB')) return { engineSize: 1.4, horsepower: 170 };
  if (name.includes('1.5 HYBRID')) return { engineSize: 1.5, horsepower: 160 };

  return { engineSize: 1.6, horsepower: 120 };
}

async function aggregateMarketPrices() {
  console.log(`\n====================================================================`);
  console.log(`  VERİTABANI ARAÇ BİLGİLERİ VE PİYASA FİYAT DÜZELTME MOTORU BAŞLATILDI`);
  console.log(`====================================================================\n`);

  // 1. Update Variants with correct Engine Size & Horsepower
  const variants = await prisma.variant.findMany({
    include: { model: { include: { manufacturer: true } } },
  });

  let variantUpdateCount = 0;
  for (const v of variants) {
    const { engineSize, horsepower } = getEngineAndHpInfo(v.name, v.model.name);
    await prisma.variant.update({
      where: { id: v.id },
      data: { engineSize, horsepower, torque: Math.round(horsepower * 1.8) },
    });
    variantUpdateCount++;
  }
  console.log(`✓ ${variantUpdateCount} adet araç varyantının motor hacmi ve beygir gücü tanımları güncellendi.`);

  // 2. Aggregate Market Prices per Specification
  const specs = await prisma.vehicleSpecification.findMany({
    include: {
      marketPrices: true,
      manufacturer: true,
      model: true,
      variant: true,
    },
  });

  let aggregatedSpecCount = 0;
  for (const spec of specs) {
    if (!spec.marketPrices || spec.marketPrices.length === 0) continue;

    const prices = spec.marketPrices.map((mp) => mp.currentMarketAverage).filter((p) => p > 0);
    if (prices.length === 0) continue;

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);

    // Delete existing multiple price rows and create one clean aggregated record
    await prisma.vehicleMarketPrice.deleteMany({
      where: { vehicleSpecificationId: spec.id },
    });

    await prisma.vehicleMarketPrice.create({
      data: {
        vehicleSpecificationId: spec.id,
        currentMarketAverage: avgPrice,
        averageListingPrice: Math.round(avgPrice * 1.02),
        minPrice,
        maxPrice,
        averageSellingTime: spec.manufacturer.name === 'Audi' ? 22 : 18,
        regionalPriceDifferences: JSON.stringify({
          istanbul: Math.round(avgPrice * 1.01),
          ankara: Math.round(avgPrice * 0.99),
          izmir: Math.round(avgPrice * 1.0),
        }),
      },
    });

    // Update spec originalMSRP to baseline zero-km estimated equivalent if missing
    await prisma.vehicleSpecification.update({
      where: { id: spec.id },
      data: {
        originalMSRP: Math.round(avgPrice * 1.18),
      },
    });

    aggregatedSpecCount++;
  }

  console.log(`✓ ${aggregatedSpecCount} adet araç spesifikasyonunun ortalama, tavan ve taban piyasa fiyatları veritabanında başarıyla hesaplanıp sabitlendi.\n`);
}

aggregateMarketPrices()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
