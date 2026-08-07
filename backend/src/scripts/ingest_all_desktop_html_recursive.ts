import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
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

function calculateDataQualityScore(params: {
  matchedListingCount: number;
  mileageSampleCount: number;
  prices: number[];
  canonicalVariant: string | null;
  canonicalBodyType: string | null;
  canonicalFuelType: string | null;
  canonicalTransmission: string | null;
}): number {
  let score = 50.0; // Base score

  // 1. Unique listing count contribution (max 20 points)
  const countFactor = Math.min(20, params.matchedListingCount * 1.5);
  score += countFactor;

  // 2. Mileage coverage ratio contribution (max 15 points)
  if (params.matchedListingCount > 0) {
    const kmRatio = params.mileageSampleCount / params.matchedListingCount;
    score += kmRatio * 15;
  }

  // 3. Metadata completeness contribution (max 15 points)
  if (params.canonicalVariant) score += 4;
  if (params.canonicalBodyType && params.canonicalBodyType !== '') score += 4;
  if (params.canonicalFuelType && params.canonicalFuelType !== '') score += 4;
  if (params.canonicalTransmission && params.canonicalTransmission !== '') score += 3;

  // 4. Price consistency / distribution contribution (max 15 points)
  if (params.prices.length >= 3) {
    const mean = params.prices.reduce((sum, p) => sum + p, 0) / params.prices.length;
    const variance = params.prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / params.prices.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 0.5;

    // Lower CV (coefficient of variation) means higher price consistency
    const priceConsistencyFactor = Math.max(0, 15 - (cv * 30));
    score += priceConsistencyFactor;
  } else {
    score += 5; // default fallback if too few listings to compute stddev
  }

  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

async function main() {
  console.log(`\n====================================================================`);
  console.log(`  CHEERIO SATIR PARSER VE ATOMİK İLAN YAZMA`);
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

      // Slice table or tbody block to keep Cheerio loading sub-second per file
      const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i) || html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
      const htmlToLoad = tableMatch ? tableMatch[0] : html;
      const $ = cheerio.load(htmlToLoad);
      const rows = $('tr[data-id]');

      rows.each((_, el) => {
        const tr = $(el);
        const dataId = tr.attr('data-id');
        if (!dataId) return;

        const title = tr.find('td.searchResultsTitleValue').text().trim();
        const priceTd = tr.find('td.searchResultsPriceValue').text().trim();
        const priceStr = priceTd.replace(/\./g, '').replace(/\D/g, '');
        const price = parseInt(priceStr, 10);

        const attrs = tr.find('td.searchResultsAttributeValue').map((_, cell) => $(cell).text().trim()).get();
        const tagText = tr.find('td.searchResultsTagAttributeValue').text().trim();

        let year = 0;
        if (attrs[0]) {
          const parsedYear = parseInt(attrs[0].replace(/\D/g, ''), 10);
          if (!isNaN(parsedYear) && parsedYear >= 1980 && parsedYear <= 2026) {
            year = parsedYear;
          }
        }

        if (price < 50000 || price > 150000000 || year === 0) {
          return;
        }

        let mileageKm: number | null = null;
        if (attrs[1]) {
          const parsedKm = parseInt(attrs[1].replace(/\./g, '').replace(/\D/g, ''), 10);
          if (!isNaN(parsedKm) && parsedKm >= 0 && parsedKm <= 2000000 && parsedKm !== year && parsedKm !== price) {
            mileageKm = parsedKm;
          }
        }

        const rawVariant = tagText || fileName;
        const isDamaged = tr.text().toLowerCase().includes('ağır hasar') || tr.text().toLowerCase().includes('pert');

        // Clean and normalize listing (Requirement 3)
        const canonical = CanonicalNormalizer.normalize(rawMake, fileName, rawVariant, title);

        if (!canonical.isValid) {
          quarantinedList.push({
            rawListingId: dataId,
            rawMake,
            rawModel: fileName,
            rawVariant,
            rawTitle: title,
            sourceFile: filePath,
            reason: canonical.quarantineReason || 'CANONICAL_TEST_BAŞARISIZ',
          });
          return;
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
            rawTitle: title,
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
      });
    } catch (err) {}
  }

  console.log(`✓ Bellekte ${rawListingMap.size} geçerli tekil ilan ve ${quarantinedList.length} karantinalı kayıt toplandı.`);

  // Requirement 6: Non-destructive raw listing writing (use upsert/compare in memory, don't use deleteMany)
  console.log(`✓ Veritabanı ile karşılaştırma yapılıyor...`);
  const existingRaw = await prisma.rawVehicleListing.findMany({
    select: { id: true, sourceListingId: true, price: true, mileageKm: true }
  });
  const existingRawMap = new Map(existingRaw.map(r => [r.sourceListingId, r]));

  const toCreateRaw: any[] = [];
  const toUpdateRaw: any[] = [];

  for (const item of rawListingMap.values()) {
    const existing = existingRawMap.get(item.sourceListingId);
    if (existing) {
      if (existing.price !== item.price || existing.mileageKm !== item.mileageKm) {
        toUpdateRaw.push({
          id: existing.id,
          price: item.price,
          mileageKm: item.mileageKm,
        });
      }
    } else {
      toCreateRaw.push(item);
    }
  }

  // Create new raw listings in chunks
  const chunkSize = 1000;
  for (let i = 0; i < toCreateRaw.length; i += chunkSize) {
    const chunk = toCreateRaw.slice(i, i + chunkSize);
    await prisma.rawVehicleListing.createMany({
      data: chunk as any,
    });
  }

  // Update existing raw listings (update lastSeenAt and latest price/mileage)
  console.log(`✓ Mevcut ilanların güncelleme işlemleri yapılıyor (${toUpdateRaw.length} adet)...`);
  for (let i = 0; i < toUpdateRaw.length; i += chunkSize) {
    const chunk = toUpdateRaw.slice(i, i + chunkSize);
    await prisma.$transaction(
      chunk.map(item =>
        prisma.rawVehicleListing.update({
          where: { id: item.id },
          data: {
            price: item.price,
            mileageKm: item.mileageKm,
            lastSeenAt: new Date(),
          }
        })
      )
    );
  }

  // Update quarantined listings
  const existingQuarantined = await prisma.quarantinedListing.findMany({
    select: { rawListingId: true }
  });
  const existingQuarSet = new Set(existingQuarantined.map(q => q.rawListingId).filter(Boolean));

  const toCreateQuar = quarantinedList.filter(q => !existingQuarSet.has(q.rawListingId));
  for (let i = 0; i < toCreateQuar.length; i += chunkSize) {
    const chunk = toCreateQuar.slice(i, i + chunkSize);
    await prisma.quarantinedListing.createMany({
      data: chunk,
    });
  }

  console.log(`✓ RawVehicleListing ve QuarantinedListing başarıyla güncellendi.\n`);

  // Requirement 7: Atomic Snapshot Replacement
  console.log(`====================================================================`);
  console.log(`  SÜRÜMLÜ PİYASA SNAPSHOT'LARI ÜRETİLİYOR (v2.0_temp)`);
  console.log(`====================================================================\n`);

  // Clear any leftover v2.0_temp snapshots first
  await prisma.vehicleMarketSnapshot.deleteMany({
    where: { snapshotVersion: 'v2.0_temp' },
  });

  const validRawListings = await prisma.rawVehicleListing.findMany({
    where: { parseStatus: 'VALID', isDamaged: false },
  });

  const groupMap = new Map<string, typeof validRawListings>();

  for (const item of validRawListings) {
    const key = `${item.canonicalMake}__${item.canonicalModel}__${item.canonicalVariant || ''}__${item.year}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key)!.push(item);
  }

  console.log(`✓ Emsal teknik özellikleri (VehicleSpecification) önbelleğe alınıyor...`);
  const distinctMakes = Array.from(new Set(validRawListings.map(l => l.canonicalMake)));
  const specs = await prisma.vehicleSpecification.findMany({
    where: {
      manufacturer: { name: { in: distinctMakes } },
    },
    include: {
      manufacturer: true,
      model: true,
      bodyType: true,
      fuelType: true,
      transmissionType: true,
    }
  });

  const specMap = new Map<string, typeof specs[0]>();
  for (const s of specs) {
    const key = `${s.manufacturer.name.trim()}__${s.model.name.trim()}__${s.year}`;
    if (!specMap.has(key)) {
      specMap.set(key, s);
    }
  }
  console.log(`✓ Toplam ${specMap.size} teknik özellik eşleştirme için hazır.\n`);

  let snapshotsCreated = 0;

  for (const [key, items] of groupMap.entries()) {
    const [make, model, variantStr, yearStr] = key.split('__');
    const year = parseInt(yearStr, 10);
    const variant = variantStr === '' ? null : variantStr;

    const rawPrices = items.map(i => i.price);
    const cleanedPrices = RobustPricingCalculator.cleanOutliersIQR(rawPrices);
    const percentiles = RobustPricingCalculator.calculatePercentiles(cleanedPrices);

    if (cleanedPrices.length === 0) continue;

    // Mileage Stats
    const validKmItems = items.filter(i => i.mileageKm !== null && i.mileageKm! > 0);
    const kmSampleCount = validKmItems.length;

    let medianMileage: number | null = null;
    let averageMileage: number | null = null;
    let kmDecayPer10k = 0.0025;
    let mileageAdjustmentSource = 'DEFAULT_FALLBACK';

    if (kmSampleCount > 0) {
      const kms = validKmItems.map(i => i.mileageKm!).sort((a, b) => a - b);
      medianMileage = kms[Math.floor(kms.length / 2)];
      averageMileage = Math.round(kms.reduce((sum, val) => sum + val, 0) / kms.length);

      if (kmSampleCount >= 8) {
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

    // Lookup specification from in-memory pre-fetched map
    const specKey = `${make.trim()}__${model.trim()}__${year}`;
    const spec = specMap.get(specKey);

    const canonicalBodyType = spec?.bodyType?.name || '';
    const canonicalFuelType = spec?.fuelType?.name || '';
    const canonicalTransmission = spec?.transmissionType?.name || '';

    // Requirement 11: Dynamic dataQualityScore
    const dataQualityScore = calculateDataQualityScore({
      matchedListingCount: items.length,
      mileageSampleCount: kmSampleCount,
      prices: cleanedPrices,
      canonicalVariant: variant,
      canonicalBodyType,
      canonicalFuelType,
      canonicalTransmission,
    });

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

    // Upsert into v2.0_temp snapshot version
    await prisma.vehicleMarketSnapshot.upsert({
      where: {
        canonicalMake_canonicalModel_canonicalVariant_canonicalTrim_year_canonicalBodyType_canonicalFuelType_canonicalTransmission_snapshotVersion: {
          canonicalMake: make,
          canonicalModel: model,
          canonicalVariant: variant || '',
          canonicalTrim: '',
          year,
          canonicalBodyType,
          canonicalFuelType,
          canonicalTransmission,
          snapshotVersion: 'v2.0_temp',
        }
      },
      update: {
        make,
        model,
        variant: variant || '',
        bodyType: canonicalBodyType,
        fuelType: canonicalFuelType,
        transmission: canonicalTransmission,
        canonicalMake: make,
        canonicalModel: model,
        canonicalVariant: variant || '',
        canonicalTrim: '',
        canonicalBodyType,
        canonicalFuelType,
        canonicalTransmission,
        snapshotVersion: 'v2.0_temp',
        isActive: false,
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
        dataQualityScore,
        snapshotDataJson: JSON.stringify(snapshotDataObj),
      },
      create: {
        make,
        model,
        variant: variant || '',
        year,
        bodyType: canonicalBodyType,
        fuelType: canonicalFuelType,
        transmission: canonicalTransmission,
        canonicalMake: make,
        canonicalModel: model,
        canonicalVariant: variant || '',
        canonicalTrim: '',
        canonicalBodyType,
        canonicalFuelType,
        canonicalTransmission,
        snapshotVersion: 'v2.0_temp',
        isActive: false,
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
        dataQualityScore,
        snapshotDataJson: JSON.stringify(snapshotDataObj),
      },
    });

    snapshotsCreated++;
  }

  // ATOMIC DATABASE SWAP TRANSACTION
  console.log(`✓ Atomik veri geçişi başlatılıyor...`);
  await prisma.$transaction([
    prisma.vehicleMarketSnapshot.deleteMany({ where: { snapshotVersion: 'v2.0' } }),
    prisma.vehicleMarketSnapshot.updateMany({
      where: { snapshotVersion: 'v2.0_temp' },
      data: { snapshotVersion: 'v2.0', isActive: true },
    }),
  ]);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✓ TOPLAM ${snapshotsCreated} ADET v2.0 SÜRÜMLÜ CANONICAL PİYASA SNAPSHOT'I ${durationSec} SANİYEDE YENİLENDİ!\n`);
}

main().finally(() => prisma.$disconnect());
