import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { CanonicalNormalizer } from '../evaluation/canonical-normalizer';
import { RobustPricingCalculator } from '../evaluation/robust-pricing-calculator';

const prisma = new PrismaClient();
const DESKTOP_DIR = 'C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan';

function scanHtmlFilesRecursively(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      scanHtmlFilesRecursively(filePath, fileList);
    } else if (file.toLowerCase().endsWith('.html')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

interface RawListingData {
  source: string;
  sourceListingId: string;
  sourceFile: string;
  rawMake: string;
  rawModel: string;
  rawVariant?: string;
  rawTitle?: string;
  canonicalMake: string;
  canonicalModel: string;
  canonicalVariant: string | null;
  year: number;
  mileageKm: number | null;
  price: number;
  isDamaged: boolean;
  parseStatus: string;
}

async function main() {
  console.log(`\n====================================================================`);
  console.log(`  CANONICAL NORMALİZASYON VE ULTRA HIZLI İLAN AKTARIMI`);
  console.log(`====================================================================\n`);

  const startTime = Date.now();
  const allHtmlPaths = scanHtmlFilesRecursively(DESKTOP_DIR);
  console.log(`✓ Toplam ${allHtmlPaths.length} adet HTML dosyası özyinelemeli (recursive) olarak tarandı.\n`);

  const rawListingMap = new Map<string, RawListingData>();
  const quarantinedList: any[] = [];

  for (const filePath of allHtmlPaths) {
    try {
      const relativePath = path.relative(DESKTOP_DIR, filePath);
      const pathParts = relativePath.split(path.sep);
      const rawMake = pathParts[0] || 'Genel';
      const fileName = path.basename(filePath, '.html');

      const html = fs.readFileSync(filePath, 'utf8');

      // Fast TR row extraction using regular expression pattern matching
      const trMatches = html.match(/<tr[^>]*data-id="(\d+)"[\s\S]*?<\/tr>/gi) || [];

      for (const trHtml of trMatches) {
        const idMatch = trHtml.match(/data-id="(\d+)"/i);
        if (!idMatch) continue;
        const dataId = idMatch[1];

        // Price extraction
        const priceMatch = trHtml.match(/<td[^>]*class="[^"]*searchResultsPriceValue[^"]*"[^>]*>[\s\S]*?([\d.]+)\s*TL/i) || trHtml.match(/([\d\.]+)\s*TL/i);
        if (!priceMatch) continue;
        const priceStr = priceMatch[1].replace(/\./g, '').replace(/\D/g, '');
        const price = parseInt(priceStr, 10);

        // Attribute cells extraction (0 = Year, 1 = Mileage, 2 = Color)
        const attrMatches = trHtml.match(/<td[^>]*class="[^"]*searchResultsAttributeValue[^"]*"[^>]*>([\s\S]*?)<\/td>/gi) || [];
        const attrTexts = attrMatches.map(cell => cell.replace(/<[^>]+>/g, '').trim());

        let year = 0;
        if (attrTexts[0]) {
          const parsedYear = parseInt(attrTexts[0].replace(/\D/g, ''), 10);
          if (!isNaN(parsedYear) && parsedYear >= 1980 && parsedYear <= 2026) {
            year = parsedYear;
          }
        }

        if (price < 50000 || price > 150000000 || year === 0) {
          continue;
        }

        // Section 1.B: Mileage Validations
        let mileageKm: number | null = null;
        if (attrTexts[1]) {
          const parsedKm = parseInt(attrTexts[1].replace(/\./g, '').replace(/\D/g, ''), 10);
          if (!isNaN(parsedKm) && parsedKm >= 0 && parsedKm <= 2000000 && parsedKm !== year && parsedKm !== price) {
            mileageKm = parsedKm;
          }
        }

        // Title and Variant extraction
        const titleMatch = trHtml.match(/<td[^>]*class="[^"]*searchResultsTitleValue[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
        const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

        const tagMatch = trHtml.match(/<td[^>]*class="[^"]*searchResultsTagAttributeValue[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
        const rawVariant = tagMatch ? tagMatch[1].replace(/<[^>]+>/g, '').trim() : fileName;

        const isDamaged = trHtml.toLowerCase().includes('ağır hasar') || trHtml.toLowerCase().includes('pert');

        // CANONICAL NORMALIZATION LAYER (Section 1.A)
        const canonical = CanonicalNormalizer.normalize(rawMake, fileName, rawVariant, rawTitle);

        if (!canonical.isValid) {
          quarantinedList.push({
            rawListingId: dataId,
            rawMake,
            rawModel: fileName,
            rawVariant,
            rawTitle,
            sourceFile: filePath,
            reason: canonical.quarantineReason || 'CANONICAL_TEST_BAŞARISIZ',
          });
          continue;
        }

        const uniqueKey = `SAHIBINDEN_HTML_${dataId}`;

        if (!rawListingMap.has(uniqueKey)) {
          rawListingMap.set(uniqueKey, {
            source: 'SAHIBINDEN_HTML',
            sourceListingId: dataId,
            sourceFile: filePath,
            rawMake,
            rawModel: fileName,
            rawVariant,
            rawTitle,
            canonicalMake: canonical.canonicalMake,
            canonicalModel: canonical.canonicalModel,
            canonicalVariant: canonical.canonicalVariant,
            year,
            mileageKm,
            price,
            isDamaged,
            parseStatus: 'VALID',
          });
        }
      }
    } catch (err) {}
  }

  console.log(`✓ Bellekte ${rawListingMap.size} geçerli tekil ilan ve ${quarantinedList.length} karantinalı kayıt toplandı.`);

  // Batch insert into RawVehicleListing
  const rawListingsArray = Array.from(rawListingMap.values());

  // Wipe old raw listings for idempotent re-ingestion
  await prisma.rawVehicleListing.deleteMany({});
  await prisma.quarantinedListing.deleteMany({});

  const chunkSize = 1000;
  for (let i = 0; i < rawListingsArray.length; i += chunkSize) {
    const chunk = rawListingsArray.slice(i, i + chunkSize);
    await prisma.rawVehicleListing.createMany({
      data: chunk as any,
    });
  }

  for (let i = 0; i < quarantinedList.length; i += chunkSize) {
    const chunk = quarantinedList.slice(i, i + chunkSize);
    await prisma.quarantinedListing.createMany({
      data: chunk,
    });
  }

  console.log(`✓ RawVehicleListing (${rawListingsArray.length}) ve QuarantinedListing (${quarantinedList.length}) veritabanına yazıldı.\n`);

  // 2. GENERATE VERSIONED MARKET SNAPSHOTS FROM RawVehicleListing (Section 2)
  console.log(`====================================================================`);
  console.log(`  SÜRÜMLÜ PİYASA SNAPSHOT'LARI ÜRETİLİYOR (snapshotVersion = "v2.0")`);
  console.log(`====================================================================\n`);

  const validRawListings = await prisma.rawVehicleListing.findMany({
    where: { parseStatus: 'VALID', isDamaged: false },
  });

  const groupMap = new Map<string, typeof validRawListings>();

  for (const item of validRawListings) {
    const key = `${item.canonicalMake}__${item.canonicalModel}__${item.canonicalVariant || 'STANDART'}__${item.year}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key)!.push(item);
  }

  let snapshotsCreated = 0;

  for (const [key, items] of groupMap.entries()) {
    const [make, model, variantStr, yearStr] = key.split('__');
    const year = parseInt(yearStr, 10);
    const variant = variantStr === 'STANDART' ? null : variantStr;

    const rawPrices = items.map(i => i.price);
    const cleanedPrices = RobustPricingCalculator.cleanOutliersIQR(rawPrices);
    const percentiles = RobustPricingCalculator.calculatePercentiles(cleanedPrices);

    if (cleanedPrices.length === 0) continue;

    // Section 3: Robust Mileage Decay Computation
    const validKmItems = items.filter(i => i.mileageKm !== null && i.mileageKm! > 0);
    const kmSampleCount = validKmItems.length;

    let medianMileage: number | null = null;
    let averageMileage: number | null = null;
    let kmDecayPer10k = 0.0025; // Default 0.25% per 10k km
    let mileageAdjustmentSource = 'DEFAULT_FALLBACK';

    if (kmSampleCount > 0) {
      const kms = validKmItems.map(i => i.mileageKm!).sort((a, b) => a - b);
      medianMileage = kms[Math.floor(kms.length / 2)];
      averageMileage = Math.round(kms.reduce((sum, val) => sum + val, 0) / kms.length);

      if (kmSampleCount >= 8) {
        // Robust Regression with >= 8 pairs
        const meanX = validKmItems.reduce((s, item) => s + (item.mileageKm! / 10000), 0) / kmSampleCount;
        const meanY = validKmItems.reduce((s, item) => s + item.price, 0) / kmSampleCount;

        let num = 0;
        let den = 0;
        for (const item of validKmItems) {
          const x = item.mileageKm! / 10000;
          const y = item.price;
          num += (x - meanX) * (y - meanY);
          den += (x - meanX) * (x - meanX);
        }

        if (den > 0) {
          const slope = num / den;
          if (slope < 0 && percentiles.p50 > 0) {
            kmDecayPer10k = Math.min(0.015, Math.max(0.001, Math.abs(slope) / percentiles.p50));
            mileageAdjustmentSource = 'LEARNED_FROM_LISTINGS';
          }
        }
      } else if (kmSampleCount >= 4) {
        mileageAdjustmentSource = 'LIMITED_SAMPLE';
      }
    }

    const uniqueListingIds = items.map(i => i.sourceListingId);

    const snapshotDataObj = {
      uniqueListingIds,
      medianMileage: medianMileage || 100000,
      averageMileage: averageMileage || 100000,
      mileageSampleCount: kmSampleCount,
      kmDecayPer10k,
      mileageAdjustmentSource,
      iqrLowerBound: Math.min(...cleanedPrices),
      iqrUpperBound: Math.max(...cleanedPrices),
    };

    await prisma.vehicleMarketSnapshot.upsert({
      where: {
        make_model_year_variant: {
          make,
          model,
          year,
          variant: variant || '',
        },
      },
      update: {
        canonicalMake: make,
        canonicalModel: model,
        canonicalVariant: variant,
        snapshotVersion: 'v2.0',
        matchedListingCount: items.length,
        uniqueListingCount: items.length,
        weightedP5: percentiles.p5,
        weightedP35: percentiles.p35,
        weightedP50: percentiles.p50,
        weightedP60: percentiles.p60,
        weightedP95: percentiles.p95,
        medianMileage,
        averageMileage,
        mileageSampleCount: kmSampleCount,
        mileageAdjustmentSource,
        kmDecayPer10k,
        confidenceScore: items.length >= 12 ? 98 : (items.length >= 6 ? 88 : 72),
        dataQualityScore: 100.0,
        snapshotDataJson: JSON.stringify(snapshotDataObj),
      },
      create: {
        make,
        model,
        variant: variant || '',
        year,
        canonicalMake: make,
        canonicalModel: model,
        canonicalVariant: variant,
        snapshotVersion: 'v2.0',
        matchedListingCount: items.length,
        uniqueListingCount: items.length,
        weightedP5: percentiles.p5,
        weightedP35: percentiles.p35,
        weightedP50: percentiles.p50,
        weightedP60: percentiles.p60,
        weightedP95: percentiles.p95,
        medianMileage,
        averageMileage,
        mileageSampleCount: kmSampleCount,
        mileageAdjustmentSource,
        kmDecayPer10k,
        confidenceScore: items.length >= 12 ? 98 : (items.length >= 6 ? 88 : 72),
        dataQualityScore: 100.0,
        snapshotDataJson: JSON.stringify(snapshotDataObj),
      },
    });

    snapshotsCreated++;
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✓ TOPLAM ${snapshotsCreated} ADET v2.0 SÜRÜMLÜ CANONICAL PİYASA SNAPSHOT'I ${durationSec} SANİYEDE YENİLENDİ!\n`);
}

main().finally(() => prisma.$disconnect());
