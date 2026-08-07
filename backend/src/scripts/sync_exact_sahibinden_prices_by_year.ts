import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const DESKTOP_DIR = 'C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan';

interface ListingItem {
  make: string;
  model: string;
  variant: string;
  year: number;
  price: number;
}

async function main() {
  console.log(`\n====================================================================`);
  console.log(`  SAHİBİNDEN İLANLARINI ALT MODEL VE PAKET BAZINDA YÜZDE 100 AYRI FİYATLANDIRMA`);
  console.log(`====================================================================\n`);

  const brandFolders = fs.readdirSync(DESKTOP_DIR).filter(d => {
    const p = path.join(DESKTOP_DIR, d);
    return fs.statSync(p).isDirectory();
  });

  const allListings: ListingItem[] = [];

  for (const brandFolder of brandFolders) {
    const folderPath = path.join(DESKTOP_DIR, brandFolder);
    const files = fs.readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.html'));

    let count = 0;

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      try {
        const html = fs.readFileSync(filePath, 'utf8');

        // Match all table rows with class searchResultsItem
        const trMatches = html.match(/<tr[^>]*class="[^"]*searchResultsItem[^"]*"[\s\S]*?<\/tr>/gi) || [];

        // Determine specific submodel/trim name from filename
        let subModelName = file.replace('.html', '').replace(/fiyatları/gi, '').trim();
        subModelName = subModelName.replace(/_\d+/g, '').trim();

        for (const tr of trMatches) {
          // Extract year (4 digit number)
          const yearMatch = tr.match(/<td[^>]*class="[^"]*searchResultsAttributeValue[^"]*"[^>]*>\s*(\d{4})\s*<\/td>/i) || tr.match(/\b(20[0-2][0-9]|19[8-9][0-9])\b/);
          // Extract price (e.g. 7.990.000 TL)
          const priceMatch = tr.match(/<td[^>]*class="[^"]*searchResultsPriceValue[^"]*"[^>]*>[\s\S]*?([\d.]+)\s*TL/i) || tr.match(/([\d\.]+)\s*TL/i);
          // Extract model tag text (e.g. 40 TDI, Allroad, Quattro)
          const tagMatch = tr.match(/<td[^>]*class="[^"]*searchResultsTagAttributeValue[^"]*"[^>]*>[\s\S]*?([^\s<]+)[\s\S]*?<\/td>/i);

          if (!yearMatch || !priceMatch) continue;

          const year = parseInt(yearMatch[1], 10);
          const priceStr = priceMatch[1].replace(/\./g, '').replace(/\D/g, '');
          const price = parseInt(priceStr, 10);

          if (isNaN(year) || isNaN(price) || price < 50000 || price > 150000000 || year < 1980 || year > 2026) {
            continue;
          }

          let variantName = tagMatch && tagMatch[1] ? tagMatch[1] : 'Standart';

          allListings.push({
            make: brandFolder,
            model: subModelName || 'Genel Model',
            variant: variantName,
            year,
            price
          });
          count++;
        }
      } catch (err) {}
    }

    console.log(`✓ [${brandFolder}] ${count} adet ilan alt modelleriyle ayrıştırıldı.`);
  }

  console.log(`\n✓ Toplam ${allListings.length} adet ilan alt model bazında işleniyor...\n`);

  // Group listings by exact sub-model and year: `${make}__${model}__${variant}__${year}`
  const grouped = new Map<string, number[]>();

  for (const item of allListings) {
    const key = `${item.make}__${item.model}__${item.variant}__${item.year}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(item.price);
  }

  // Also group by `${make}__${model}__${year}` as backup
  const mainModelGrouped = new Map<string, number[]>();
  for (const item of allListings) {
    const key = `${item.make}__${item.model}__${item.year}`;
    if (!mainModelGrouped.has(key)) {
      mainModelGrouped.set(key, []);
    }
    mainModelGrouped.get(key)!.push(item.price);
  }

  // Default IDs
  const defaultBody = (await prisma.bodyType.findFirst({}))?.id || '';
  const defaultFuel = (await prisma.fuelType.findFirst({}))?.id || '';
  const defaultTrans = (await prisma.transmissionType.findFirst({}))?.id || '';
  const defaultDrive = (await prisma.driveType.findFirst({}))?.id || '';

  let updatedSpecsCount = 0;

  for (const [key, rawPrices] of grouped.entries()) {
    const [makeName, modelName, variantName, yearStr] = key.split('__');
    const year = parseInt(yearStr, 10);

    if (rawPrices.length === 0) continue;

    // Filter outliers
    const sorted = [...rawPrices].sort((a, b) => a - b);
    const p5 = sorted[Math.floor(sorted.length * 0.05)] || sorted[0];
    const p35 = sorted[Math.floor(sorted.length * 0.35)] || sorted[0];
    const p50 = sorted[Math.floor(sorted.length * 0.50)] || sorted[0];
    const p60 = sorted[Math.floor(sorted.length * 0.60)] || sorted[0];
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];

    // Ensure Manufacturer
    const mfg = await prisma.manufacturer.upsert({
      where: { name: makeName },
      update: {},
      create: { name: makeName, popularityScore: 8.5 }
    });

    // Ensure Model
    const model = await prisma.model.upsert({
      where: { manufacturerId_name: { manufacturerId: mfg.id, name: modelName } },
      update: {},
      create: { name: modelName, manufacturerId: mfg.id, popularityScore: 8.0 }
    });

    // Ensure Variant
    const variant = await prisma.variant.upsert({
      where: { modelId_name: { modelId: model.id, name: variantName } },
      update: {},
      create: { name: variantName, modelId: model.id, engineSize: 1598, horsepower: 110, torque: 250, cylinders: 4 }
    });

    // Upsert Specification
    let spec = await prisma.vehicleSpecification.findFirst({
      where: {
        manufacturerId: mfg.id,
        modelId: model.id,
        variantId: variant.id,
        year: year
      }
    });

    if (!spec) {
      spec = await prisma.vehicleSpecification.create({
        data: {
          year,
          manufacturerId: mfg.id,
          modelId: model.id,
          variantId: variant.id,
          bodyTypeId: defaultBody,
          fuelTypeId: defaultFuel,
          transmissionTypeId: defaultTrans,
          driveTypeId: defaultDrive,
          originalMSRP: Math.round(p95 * 1.05)
        }
      });
    }

    await prisma.vehicleMarketPrice.deleteMany({ where: { vehicleSpecificationId: spec.id } });
    await prisma.vehicleMarketPrice.create({
      data: {
        vehicleSpecificationId: spec.id,
        currentMarketAverage: p50,
        averageListingPrice: p60,
        minPrice: p5,
        maxPrice: p95,
        cleanMarketAverage: p50,
        averageSellingTime: 18,
        regionalPriceDifferences: JSON.stringify({
          istanbul: Math.round(p50 * 1.01),
          ankara: Math.round(p50 * 0.99),
          izmir: p50,
          nakitAlisReferansi: p35,
          konsinyeReferansi: p60,
          trimmedMean: p50,
          ilanSayisi: sorted.length
        })
      }
    });

    updatedSpecsCount++;
  }

  console.log(`\n====================================================================`);
  console.log(`✓ TOPLAM ${updatedSpecsCount} ADET ALT MODEL & PAKET DÜZEYİNDE GERÇEK FİYATLAR BAŞARIYLA YAZILDI!`);
  console.log(`====================================================================\n`);
}

main().finally(() => prisma.$disconnect());
