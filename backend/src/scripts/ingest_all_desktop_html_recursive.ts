import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { CanonicalNormalizer } from '../evaluation/canonical-normalizer';
import { RobustPricingCalculator } from '../evaluation/robust-pricing-calculator';

const prisma = new PrismaClient();
function getAndValidateHtmlSourceDir(): string {
  const dir = process.env.SAHIBINDEN_HTML_DIR || 'C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan';
  if (!fs.existsSync(dir)) {
    throw new Error('HTML_SOURCE_DIRECTORY_NOT_FOUND');
  }
  try {
    fs.accessSync(dir, fs.constants.R_OK);
  } catch (err) {
    throw new Error('HTML_SOURCE_DIRECTORY_NOT_ACCESSIBLE');
  }
  return dir;
}

const DESKTOP_DIR = getAndValidateHtmlSourceDir();

function scanHtmlFilesRecursively(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file.toLowerCase().endsWith('_files')) continue;
      scanHtmlFilesRecursively(filePath, fileList);
    } else {
      const lower = file.toLowerCase();
      if (lower.endsWith('.html') || lower.endsWith('.htm')) {
        fileList.push(filePath);
      }
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
  if (allHtmlPaths.length === 0) {
    throw new Error('NO_HTML_FILES_FOUND');
  }
  console.log(`✓ Toplam ${allHtmlPaths.length} adet HTML dosyası özyinelemeli (recursive) olarak tarandı.\n`);

  const rawListingMap = new Map<string, RawListingData>();
  const quarantinedList: any[] = [];

  for (const filePath of allHtmlPaths) {
    const relativePath = path.relative(DESKTOP_DIR, filePath);
    const pathParts = relativePath.split(path.sep);
    const rawMake = pathParts[0] || 'Genel';
    const fileName = path.basename(filePath, '.html');
    try {
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
    } catch (err: any) {
      console.error(`HTML Dosyası Ayrıştırılırken Hata Oluştu [${filePath}]:`, err.message || err);
      // REQUIREMENT 3: Log parser error and save to quarantinedList
      quarantinedList.push({
        rawListingId: `ERROR_${path.basename(filePath, '.html')}`,
        rawMake,
        rawModel: fileName,
        rawVariant: 'PARSER_ERROR',
        rawTitle: `Dosya ayrıştırma hatası: ${filePath}`,
        sourceFile: filePath,
        reason: `PARSER_EXCEPTION: ${err.message || String(err)}`,
      });
    }
  }

  console.log(`✓ Bellekte ${rawListingMap.size} geçerli tekil ilan ve ${quarantinedList.length} karantinalı kayıt toplandı.`);

  // Stage 1: Load all existing raw listings from DB
  console.log(`✓ Veritabanındaki mevcut ham ilanlar yükleniyor...`);
  const existingRaw = await prisma.rawVehicleListing.findMany();
  const existingRawMap = new Map(existingRaw.map(r => [r.sourceListingId, r]));

  // Combine HTML parsed listings and existing DB listings to ensure we re-normalize ALL of them
  const listingsToProcess = new Map<string, any>();

  // Add all existing DB listings
  for (const dbItem of existingRaw) {
    listingsToProcess.set(dbItem.sourceListingId, {
      source: dbItem.source,
      sourceListingId: dbItem.sourceListingId,
      sourceFile: dbItem.sourceFile,
      rawMake: dbItem.rawMake,
      rawModel: dbItem.rawModel,
      rawVariant: dbItem.rawVariant,
      rawTitle: dbItem.rawTitle,
      year: dbItem.year,
      price: dbItem.price,
      mileageKm: dbItem.mileageKm,
      isDamaged: dbItem.isDamaged,
      dbId: dbItem.id
    });
  }

  // Overwrite or add newly parsed items from HTML (since they are fresher)
  for (const item of rawListingMap.values()) {
    listingsToProcess.set(item.sourceListingId, {
      ...item,
      dbId: existingRawMap.get(item.sourceListingId)?.id
    });
  }

  // Also add parsed quarantined items from HTML
  for (const qItem of quarantinedList) {
    listingsToProcess.set(qItem.rawListingId, {
      source: 'SAHIBINDEN_HTML',
      sourceListingId: qItem.rawListingId,
      sourceFile: qItem.sourceFile,
      rawMake: qItem.rawMake,
      rawModel: qItem.rawModel,
      rawVariant: qItem.rawVariant,
      rawTitle: qItem.rawTitle,
      year: qItem.year || 0,
      price: qItem.price || 0,
      mileageKm: qItem.mileageKm || null,
      isDamaged: qItem.isDamaged || false,
      dbId: existingRawMap.get(qItem.rawListingId)?.id
    });
  }

  // Pre-fetch all specifications to resolve metadata and ambiguity
  console.log(`✓ Emsal teknik özellikleri (VehicleSpecification) yükleniyor...`);
  const specs = await prisma.vehicleSpecification.findMany({
    include: {
      manufacturer: true,
      model: true,
      variant: true,
      bodyType: true,
      fuelType: true,
      transmissionType: true,
      package: true,
    }
  });

  // Group specs by make + model + variant + year
  const specGroups = new Map<string, typeof specs>();
  for (const s of specs) {
    const variantName = s.variant?.name ? s.variant.name.trim().toLowerCase() : '';
    const key = `${s.manufacturer.name.trim().toLowerCase()}__${s.model.name.trim().toLowerCase()}__${variantName}__${s.year}`;
    if (!specGroups.has(key)) {
      specGroups.set(key, []);
    }
    specGroups.get(key)!.push(s);
  }

  let ambiguousSpecCount = 0;
  const toCreateRaw: any[] = [];
  const toUpdateRaw: any[] = [];
  const quarantinedListingsToUpsert: any[] = [];

  // Run normalization, pricing validations and spec metadata resolution on ALL listings
  for (const item of listingsToProcess.values()) {
    let parseStatus: 'VALID' | 'QUARANTINED' = 'VALID';
    let parseWarnings: string | null = null;
    let canonicalMake = '';
    let canonicalModel = '';
    let canonicalVariant = '';

    if (item.year === 0) {
      parseStatus = 'QUARANTINED';
      parseWarnings = 'INVALID_YEAR';
    } else if (item.price < 50000 || item.price > 150000000) {
      parseStatus = 'QUARANTINED';
      parseWarnings = 'INVALID_PRICE';
    } else {
      const canonical = CanonicalNormalizer.normalize(item.rawMake, item.rawModel, item.rawVariant, item.rawTitle);
      if (!canonical.isValid) {
        parseStatus = 'QUARANTINED';
        parseWarnings = canonical.quarantineReason || 'CANONICAL_TEST_BAŞARISIZ';
      } else {
        canonicalMake = canonical.canonicalMake;
        canonicalModel = canonical.canonicalModel;
        canonicalVariant = canonical.canonicalVariant || '';
      }
    }

    let canonicalTrim = '';
    let canonicalBodyType = '';
    let canonicalFuelType = '';
    let canonicalTransmission = '';

    if (parseStatus === 'VALID') {
      const lookupVariant = canonicalVariant ? canonicalVariant.trim().toLowerCase() : '';
      const specKey = `${canonicalMake.trim().toLowerCase()}__${canonicalModel.trim().toLowerCase()}__${lookupVariant}__${item.year}`;
      const group = specGroups.get(specKey);
      let spec: any = null;
      let isAmbiguous = false;

      if (group && group.length > 0) {
        if (group.length === 1) {
          spec = group[0];
        } else {
          const first = group[0];
          const hasDifferentCombos = group.some(s => 
            (s.package?.name || '') !== (first.package?.name || '') ||
            (s.bodyType?.name || '') !== (first.bodyType?.name || '') ||
            (s.fuelType?.name || '') !== (first.fuelType?.name || '') ||
            (s.transmissionType?.name || '') !== (first.transmissionType?.name || '')
          );

          if (hasDifferentCombos) {
            isAmbiguous = true;
            ambiguousSpecCount++;
          } else {
            spec = first;
          }
        }
      }

      if (spec && !isAmbiguous) {
        canonicalTrim = spec.package?.name || '';
        canonicalBodyType = spec.bodyType?.name || '';
        canonicalFuelType = spec.fuelType?.name || '';
        canonicalTransmission = spec.transmissionType?.name || '';
      }
    }

    const processedItem = {
      source: item.source,
      sourceListingId: item.sourceListingId,
      sourceFile: item.sourceFile,
      rawMake: item.rawMake,
      rawModel: item.rawModel,
      rawVariant: item.rawVariant,
      rawTitle: item.rawTitle,
      canonicalMake,
      canonicalModel,
      canonicalVariant,
      canonicalTrim,
      canonicalBodyType,
      canonicalFuelType,
      canonicalTransmission,
      year: item.year,
      mileageKm: item.mileageKm,
      price: item.price,
      isDamaged: item.isDamaged,
      parseStatus,
      parseWarnings,
      lastSeenAt: new Date(),
    };

    if (item.dbId) {
      toUpdateRaw.push({
        id: item.dbId,
        ...processedItem,
      });
    } else {
      toCreateRaw.push(processedItem);
    }

    if (parseStatus === 'QUARANTINED') {
      quarantinedListingsToUpsert.push({
        rawListingId: item.sourceListingId,
        rawMake: item.rawMake,
        rawModel: item.rawModel,
        rawVariant: item.rawVariant,
        rawTitle: item.rawTitle,
        sourceFile: item.sourceFile,
        reason: parseWarnings,
      });
    }
  }

  // Execute creates in chunks
  const chunkSize = 1000;
  for (let i = 0; i < toCreateRaw.length; i += chunkSize) {
    const chunk = toCreateRaw.slice(i, i + chunkSize);
    await prisma.rawVehicleListing.createMany({
      data: chunk,
    });
  }

  // Execute updates sequentially
  console.log(`✓ Mevcut ilanların güncelleme ve yeniden normalizasyon işlemleri yapılıyor (${toUpdateRaw.length} adet)...`);
  for (const item of toUpdateRaw) {
    await prisma.rawVehicleListing.update({
      where: { id: item.id },
      data: {
        sourceFile: item.sourceFile,
        rawMake: item.rawMake,
        rawModel: item.rawModel,
        rawVariant: item.rawVariant,
        rawTitle: item.rawTitle,
        canonicalMake: item.canonicalMake,
        canonicalModel: item.canonicalModel,
        canonicalVariant: item.canonicalVariant,
        canonicalTrim: item.canonicalTrim,
        canonicalBodyType: item.canonicalBodyType,
        canonicalFuelType: item.canonicalFuelType,
        canonicalTransmission: item.canonicalTransmission,
        year: item.year,
        mileageKm: item.mileageKm,
        price: item.price,
        isDamaged: item.isDamaged,
        parseStatus: item.parseStatus,
        parseWarnings: item.parseWarnings,
        lastSeenAt: new Date(),
      },
    });
  }

  // Upsert into QuarantinedListing idempotently
  console.log(`✓ Karantina tablosu güncelleniyor (${quarantinedListingsToUpsert.length} adet)...`);
  for (const item of quarantinedListingsToUpsert) {
    const reason = item.reason || 'CANONICAL_TEST_BAŞARISIZ';
    await prisma.quarantinedListing.upsert({
      where: {
        source_rawListingId_reason: {
          source: 'SAHIBINDEN_HTML',
          rawListingId: item.rawListingId,
          reason,
        }
      },
      create: {
        source: 'SAHIBINDEN_HTML',
        rawListingId: item.rawListingId,
        rawMake: item.rawMake,
        rawModel: item.rawModel,
        rawVariant: item.rawVariant,
        rawTitle: item.rawTitle,
        sourceFile: item.sourceFile,
        reason,
      },
      update: {
        rawMake: item.rawMake,
        rawModel: item.rawModel,
        rawVariant: item.rawVariant,
        rawTitle: item.rawTitle,
        sourceFile: item.sourceFile,
      }
    });
  }

  console.log(`✓ RawVehicleListing ve QuarantinedListing başarıyla güncellendi.`);
  console.log(`✓ Toplam ${ambiguousSpecCount} adet belirsiz (ambiguous) teknik özellik tespit edildi.\n`);

  // Stage 5: Atomic Snapshot Replacement
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
  // Re-use specGroups for lookup during snapshot processing
  console.log(`✓ Toplam ${specGroups.size} teknik özellik grubu eşleştirme için hazır.\n`);

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

    const lookupVariant = variant ? variant.trim().toLowerCase() : '';
    const specKey = `${make.trim().toLowerCase()}__${model.trim().toLowerCase()}__${lookupVariant}__${year}`;
    const group = specGroups.get(specKey);
    let spec: any = null;
    let isAmbiguous = false;

    if (group && group.length > 0) {
      if (group.length === 1) {
        spec = group[0];
      } else {
        const first = group[0];
        const hasDifferentCombos = group.some(s => 
          (s.package?.name || '') !== (first.package?.name || '') ||
          (s.bodyType?.name || '') !== (first.bodyType?.name || '') ||
          (s.fuelType?.name || '') !== (first.fuelType?.name || '') ||
          (s.transmissionType?.name || '') !== (first.transmissionType?.name || '')
        );

        if (hasDifferentCombos) {
          isAmbiguous = true;
        } else {
          spec = first;
        }
      }
    }

    const canonicalBodyType = (spec && !isAmbiguous) ? (spec.bodyType?.name || '') : '';
    const canonicalFuelType = (spec && !isAmbiguous) ? (spec.fuelType?.name || '') : '';
    const canonicalTransmission = (spec && !isAmbiguous) ? (spec.transmissionType?.name || '') : '';
    const canonicalTrim = (spec && !isAmbiguous) ? (spec.package?.name || '') : '';

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
          canonicalTrim,
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
        trim: canonicalTrim,
        bodyType: canonicalBodyType,
        fuelType: canonicalFuelType,
        transmission: canonicalTransmission,
        canonicalMake: make,
        canonicalModel: model,
        canonicalVariant: variant || '',
        canonicalTrim,
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
        trim: canonicalTrim,
        year,
        bodyType: canonicalBodyType,
        fuelType: canonicalFuelType,
        transmission: canonicalTransmission,
        canonicalMake: make,
        canonicalModel: model,
        canonicalVariant: variant || '',
        canonicalTrim,
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
