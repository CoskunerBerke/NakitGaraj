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

  // 2. PERCENTILE-BASED PRICING ENGINE
  // ─────────────────────────────────────────────────────────────
  // P5  = Taban (outlier hasarlı/yüksek km ilanları hariç tutma)
  // P35 = Nakit Alış Referansı (doğal olarak piyasanın altında)
  // P50 = Medyan (gerçek piyasa merkezi)
  // P60 = Konsinye Satış Referansı (müşteriye çekici fiyat)
  // P95 = Tavan (outlier sıfır gibi/şişirilmiş ilanları hariç tutma)
  // Trimmed Mean = Alt %10 ve üst %10 atılarak kırpılmış ortalama
  // ─────────────────────────────────────────────────────────────

  const specs = await prisma.vehicleSpecification.findMany({
    include: {
      marketPrices: true,
      manufacturer: true,
      model: true,
      variant: true,
    },
  });

  function percentile(sortedArr: number[], p: number): number {
    if (sortedArr.length === 0) return 0;
    if (sortedArr.length === 1) return sortedArr[0];
    const index = (p / 100) * (sortedArr.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sortedArr[lower];
    const weight = index - lower;
    return Math.round(sortedArr[lower] * (1 - weight) + sortedArr[upper] * weight);
  }

  function trimmedMean(sortedArr: number[], trimPct: number = 10): number {
    if (sortedArr.length <= 4) {
      // Çok az veri varsa normal ortalama kullan
      return Math.round(sortedArr.reduce((a, b) => a + b, 0) / sortedArr.length);
    }
    const trimCount = Math.max(1, Math.floor(sortedArr.length * (trimPct / 100)));
    const trimmed = sortedArr.slice(trimCount, sortedArr.length - trimCount);
    if (trimmed.length === 0) {
      return Math.round(sortedArr.reduce((a, b) => a + b, 0) / sortedArr.length);
    }
    return Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
  }

  let aggregatedSpecCount = 0;
  for (const spec of specs) {
    if (!spec.marketPrices || spec.marketPrices.length === 0) continue;

    const prices = spec.marketPrices
      .map((mp) => mp.currentMarketAverage)
      .filter((p) => p > 0)
      .sort((a, b) => a - b); // Küçükten büyüğe sırala

    if (prices.length === 0) continue;

    // ─── YÜZDELİK DİLİM HESAPLAMALARI ───
    const p5  = percentile(prices, 5);   // Taban (outlier hariç)
    const p35 = percentile(prices, 35);  // Nakit Alış Referansı
    const p50 = percentile(prices, 50);  // Medyan (Gerçek Piyasa Merkezi)
    const p60 = percentile(prices, 60);  // Konsinye Satış Referansı
    const p95 = percentile(prices, 95);  // Tavan (outlier hariç)

    const cleanAvg = trimmedMean(prices, 10); // Kırpılmış ortalama (alt+üst %10 atılmış)

    // Delete existing multiple price rows and create one clean aggregated record
    await prisma.vehicleMarketPrice.deleteMany({
      where: { vehicleSpecificationId: spec.id },
    });

    await prisma.vehicleMarketPrice.create({
      data: {
        vehicleSpecificationId: spec.id,
        // currentMarketAverage artık P50 Medyan (gerçek piyasa merkezi)
        currentMarketAverage: p50,
        // averageListingPrice artık P60 Konsinye Satış Referansı
        averageListingPrice: p60,
        // minPrice artık P5 (hasarlı/çürük outlier'lar hariç gerçek taban)
        minPrice: p5,
        // maxPrice artık P95 (şişirilmiş fiyatlı outlier'lar hariç gerçek tavan)
        maxPrice: p95,
        // Kırpılmış ortalama → cleanMarketAverage alanına yazılır
        cleanMarketAverage: cleanAvg,
        averageSellingTime: spec.manufacturer.name === 'Audi' ? 22 : 18,
        regionalPriceDifferences: JSON.stringify({
          istanbul: Math.round(p50 * 1.01),
          ankara: Math.round(p50 * 0.99),
          izmir: p50,
          nakitAlisReferansi: p35,
          konsinyeReferansi: p60,
          trimmedMean: cleanAvg,
          ilanSayisi: prices.length,
        }),
      },
    });

    // Update spec originalMSRP to baseline zero-km estimated equivalent
    await prisma.vehicleSpecification.update({
      where: { id: spec.id },
      data: {
        originalMSRP: Math.round(p95 * 1.10),
      },
    });

    aggregatedSpecCount++;
  }

  console.log(`✓ ${aggregatedSpecCount} adet araç spesifikasyonunun YÜZDELİK DİLİM tabanlı fiyatları hesaplandı.`);
  console.log(`  → P35 (Nakit Alış Ref.) | P50 (Medyan) | P60 (Konsinye Ref.) | P5-P95 (Taban-Tavan)`);
  console.log(`  → Kırpılmış Ortalama (Trimmed Mean %10) ile temiz piyasa verisi sabitlendi.\n`);
}

aggregateMarketPrices()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
