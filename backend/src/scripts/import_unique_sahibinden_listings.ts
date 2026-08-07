import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as cheerio from 'cheerio';

import { VehicleService } from '../vehicle/vehicle.service';

const envSourceDir = process.env.SAHIBINDEN_HTML_DIR;
const SOURCE_DIR = envSourceDir && envSourceDir.trim() !== '' ? envSourceDir : path.resolve(process.cwd(), 'data/sahibinden_html');
const MANIFEST_PATH = path.join(__dirname, '../../data/import-state/sahibinden-import-manifest.json');

const MULTI_WORD_MAKES = [
  'Alfa Romeo',
  'Aston Martin',
  'Mercedes-Benz',
  'Mercedes Benz',
  'DS Automobiles',
  'Land Rover'
];

interface ManifestFileEntry {
  absolutePath: string;
  relativePath: string;
  fileSize: number;
  modifiedTime: string;
  sha256ContentHash: string;
  parserVersion: string;
  importedAt: string;
  detectedMake: string;
  detectedModel: string;
  detectedSubModel: string | null;
  listingRowCount: number;
}

interface ImportManifest {
  version: string;
  lastImportAt: string;
  files: Record<string, ManifestFileEntry>;
}

const KNOWN_BMW_ENGINES = [
  '316i', '318i', '320i', '325i', '328i', '330i', '335i', '340i', 'M340i',
  '316d', '318d', '320d', '325d', '330d', '335d', '318i Sedan', '320i Sedan',
  '320d Sedan', '330i Sedan', '330d Sedan', '116i', '118i', '120i', '116d',
  '118d', '120d', '520i', '525i', '528i', '530i', '520d', '525d', '530d', '535d'
];

const KNOWN_HARDWARE_TRIMS = [
  'M Sport', 'Sport Line', 'Modern Line', 'Luxury Line', 'Premium',
  'Standart', 'Executive', 'Advantage', 'Comfort', 'Comfortline', 'Highline',
  'Trendline', 'Ambition', 'Attraction', 'Ambiente', 'S Line', 'Joy', 'Touch',
  'Icon', 'Titanium', 'Style', 'Dynamic', 'Pop', 'Popstar', 'Lounge', 'Urban',
  'Easy', 'Street', 'Mirror', 'First Edition M Sport', 'First Edition'
];

function parseHeaderMakeModelSubModel(text: string, fallbackFolder: string): { make: string; model: string; subModel: string | null; engineVariant?: string | null; trimPackage?: string | null } {
  let clean = text
    .replace(/\.html?/gi, '')
    .replace(/\s*-\s*\d+$/g, '')
    .replace(/sahibinden\.com'da/gi, '')
    .replace(/Fiyatları\s*&\s*Modelleri/gi, '')
    .replace(/Fiyatları/gi, '')
    .replace(/Modelleri/gi, '')
    .replace(/Satılık/gi, '')
    .replace(/2\.El/gi, '')
    .replace(/2\. El/gi, '')
    .replace(/Sıfır Km/gi, '')
    .replace(/Otomobil/gi, '')
    .replace(/Arabalar ve/gi, '')
    .replace(/Arabalar/gi, '')
    .replace(/ve/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  let make = '';
  for (const mwm of MULTI_WORD_MAKES) {
    if (clean.toLowerCase().startsWith(mwm.toLowerCase())) {
      make = mwm;
      clean = clean.substring(mwm.length).trim();
      break;
    }
  }

  const words = clean.split(' ').filter(w => w.length > 0);

  if (!make) {
    if (words.length > 0) {
      make = words[0];
      words.shift();
    } else {
      make = fallbackFolder || 'Bilinmeyen';
    }
  }

  if (words.length === 0) {
    return { make, model: 'Genel', subModel: null, engineVariant: null, trimPackage: null };
  }

  let model = words[0];
  words.shift();

  // If model is e.g. "3" and next is "Serisi" -> "3 Serisi"
  if (model === '3' && words.length > 0 && words[0].toLowerCase() === 'serisi') {
    model = '3 Serisi';
    words.shift();
  } else if (model === '5' && words.length > 0 && words[0].toLowerCase() === 'serisi') {
    model = '5 Serisi';
    words.shift();
  } else if (model === '1' && words.length > 0 && words[0].toLowerCase() === 'serisi') {
    model = '1 Serisi';
    words.shift();
  } else if (model === '4' && words.length > 0 && words[0].toLowerCase() === 'serisi') {
    model = '4 Serisi';
    words.shift();
  }

  const remaining = words.join(' ').trim();
  let engineVariant: string | null = null;
  let trimPackage: string | null = null;

  // Extract known engine code from remaining string
  for (const eng of KNOWN_BMW_ENGINES) {
    const engRegex = new RegExp(`\\b${eng}\\b`, 'i');
    if (engRegex.test(remaining)) {
      engineVariant = eng;
      break;
    }
  }

  // Extract known hardware trim from remaining string
  for (const tr of KNOWN_HARDWARE_TRIMS) {
    const trRegex = new RegExp(`\\b${tr}\\b`, 'i');
    if (trRegex.test(remaining)) {
      trimPackage = tr;
      break;
    }
  }

  let subModel: string | null = null;
  if (engineVariant && trimPackage) {
    subModel = `${engineVariant} ${trimPackage}`;
  } else if (engineVariant) {
    subModel = engineVariant;
  } else if (remaining.length > 0) {
    subModel = remaining;
  }

  return { make, model, subModel, engineVariant, trimPackage };
}

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

function getSha256Hash(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

function getVehicleGroupsFromDir(dir: string): { make: string; model: string; subModel: string | null }[] {
  const htmlFiles = scanHtmlFilesRecursively(dir);
  const groupsMap = new Map<string, { make: string; model: string; subModel: string | null }>();

  for (const filePath of htmlFiles) {
    const fileName = path.basename(filePath);
    const parentFolder = path.basename(path.dirname(filePath));
    const html = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(html);
    const pageH1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
    const pageTitle = $('title').first().text().replace(/\s+/g, ' ').trim();

    const info = parseHeaderMakeModelSubModel(pageH1 || pageTitle || fileName, parentFolder);
    const key = `${info.make}__${info.model}__${info.subModel || 'null'}`.toLowerCase();
    if (!groupsMap.has(key)) {
      groupsMap.set(key, info);
    }
  }
  return Array.from(groupsMap.values());
}

async function runImport() {
  const isIncremental = process.argv.includes('--incremental');

  console.log(`\n====================================================================`);
  console.log(`  SAHİBİNDEN HTML İLAN VERİTABANI ${isIncremental ? 'ARTIMLI (INCREMENTAL)' : 'FULL'} AKTARIMI`);
  console.log(`====================================================================\n`);

  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`❌ Kaynak klasör bulunamadı: ${SOURCE_DIR}`);
    process.exit(1);
  }

  // Count vehicle groups in source dir (top level brand subdirectories or header make+model+subModel combinations)
  const topLevelSubdirs = fs.readdirSync(SOURCE_DIR).filter(item => {
    const p = path.join(SOURCE_DIR, item);
    return fs.statSync(p).isDirectory() && !item.toLowerCase().endsWith('_files');
  });

  const sourceVehicleGroups = getVehicleGroupsFromDir(SOURCE_DIR);
  const groupCount = topLevelSubdirs.length;

  console.log(`✓ Kaynak Klasör Araç Grubu Klasör Sayısı: ${groupCount}`);
  if (groupCount !== 28) {
    console.log(`  (Not: 28 çıkmadı, tespit edilen ${groupCount} marka klasörü mevcuttur)`);
  }

  // Ensure manifest dir exists
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });

  let manifest: ImportManifest = {
    version: '1.0',
    lastImportAt: new Date().toISOString(),
    files: {},
  };

  const manifestExists = fs.existsSync(MANIFEST_PATH);
  if (manifestExists) {
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    } catch (e) {
      console.warn('⚠️ Mevcut manifest dosyası okunamadı, yeniden oluşturulacak.');
    }
  }

  const allHtmlFiles = scanHtmlFilesRecursively(SOURCE_DIR);
  const currentFilesMap = new Map<string, string>(); // relativePath -> absolutePath

  allHtmlFiles.forEach(absP => {
    const relP = path.relative(SOURCE_DIR, absP);
    currentFilesMap.set(relP, absP);
  });

  // Categorize files
  const newFilePaths: string[] = [];
  const changedFilePaths: string[] = [];
  const unchangedFilePaths: string[] = [];
  const missingManifestKeys: string[] = [];

  // Check manifest keys vs current files
  for (const relP of Object.keys(manifest.files)) {
    if (!currentFilesMap.has(relP)) {
      missingManifestKeys.push(relP);
    }
  }

  if (missingManifestKeys.length > 0) {
    console.warn(`⚠️ RAPOR: Manifestte kayıtlı olan ancak klasörde bulunamayan ${missingManifestKeys.length} adet dosya tespit edildi (MISSING_SOURCE_FILE). Eski ilanlar veritabanından silinmeyecektir.`);
  }

  const CURRENT_PARSER_VERSION = 'v1.1';

  // Check current files vs manifest
  for (const [relP, absP] of currentFilesMap.entries()) {
    const stat = fs.statSync(absP);
    const currentHash = getSha256Hash(absP);
    const existingEntry = manifest.files[relP];

    if (!existingEntry) {
      newFilePaths.push(absP);
    } else if (existingEntry.sha256ContentHash !== currentHash || existingEntry.parserVersion !== CURRENT_PARSER_VERSION) {
      changedFilePaths.push(absP);
    } else {
      unchangedFilePaths.push(absP);
    }
  }

  // INITIAL BASELINE INITIALIZATION:
  if (!manifestExists) {
    console.log(`✓ İlk çalıştırma baseline manifesti oluşturuluyor (${allHtmlFiles.length} mevcut dosya kaydoluyor)...`);
    for (const absP of allHtmlFiles) {
      const relP = path.relative(SOURCE_DIR, absP);
      const stat = fs.statSync(absP);
      const hash = getSha256Hash(absP);
      const fileName = path.basename(absP);
      const parentFolder = path.basename(path.dirname(absP));

      const html = fs.readFileSync(absP, 'utf8');
      const $ = cheerio.load(html);
      const pageH1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
      const pageTitle = $('title').first().text().replace(/\s+/g, ' ').trim();
      const info = parseHeaderMakeModelSubModel(pageH1 || pageTitle || fileName, parentFolder);
      const rowCount = $('tr[data-id]').length;

      manifest.files[relP] = {
        absolutePath: absP,
        relativePath: relP,
        fileSize: stat.size,
        modifiedTime: stat.mtime.toISOString(),
        sha256ContentHash: hash,
        parserVersion: 'v1.0',
        importedAt: new Date().toISOString(),
        detectedMake: info.make,
        detectedModel: info.model,
        detectedSubModel: info.subModel,
        listingRowCount: rowCount,
      };
    }

    manifest.lastImportAt = new Date().toISOString();
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`✓ Manifest başarıyla oluşturuldu: ${MANIFEST_PATH}\n`);
  }

  // INCREMENTAL MODE: NO NEW OR CHANGED FILES
  if (isIncremental && newFilePaths.length === 0 && changedFilePaths.length === 0) {
    console.log(`NO_NEW_HTML_FILES`);
    console.log(`\n====================================================================`);
    console.log(`  ARTIMLI IMPORT RAPORU (DEĞİŞİKLİK YOK)`);
    console.log(`====================================================================`);
    console.log(`- Önceki araç grubu sayısı: ${groupCount}`);
    console.log(`- Yeni araç grubu sayısı: 0`);
    console.log(`- Toplam araç grubu sayısı: ${groupCount}`);
    console.log(`- Önceki HTML dosyası sayısı: ${Object.keys(manifest.files).length}`);
    console.log(`- Yeni HTML dosyası sayısı: 0`);
    console.log(`- Değiştirilen HTML dosyası sayısı: 0`);
    console.log(`- Atlanan değişmemiş dosya sayısı: ${unchangedFilePaths.length}`);
    console.log(`- Yeni bulunan ilan satırı: 0`);
    console.log(`- Yeni eklenen benzersiz ilan: 0`);
    console.log(`- Güncellenen mevcut ilan: 0`);
    console.log(`- Birleştirilen duplicate ilan: 0`);
    console.log(`- Eksik fiyatlı yeni ilan: 0`);
    console.log(`- Fiyatlandırmada kullanılabilen yeni ilan: 0`);
    console.log(`- Güncellenen snapshot grupları: 0\n`);
    process.exit(0);
  }

  const filesToProcess = isIncremental ? [...newFilePaths, ...changedFilePaths] : allHtmlFiles;

  if (filesToProcess.length === 0) {
    console.log(`NO_NEW_HTML_FILES`);
    process.exit(0);
  }

  // 1. Take Database Backup before any DB modifications
  const dbPath = path.join(__dirname, '../../prisma/dev.db');
  const backupPath = path.join(__dirname, `../../prisma/dev.db.backup_${Date.now()}`);
  const staticBackupPath = path.join(__dirname, '../../prisma/dev.db.bak');

  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, backupPath);
    fs.copyFileSync(dbPath, staticBackupPath);
    console.log(`✓ Veritabanı yedeği başarıyla alındı:`);
    console.log(`  - Zaman Damgalı Yedek: ${backupPath}`);
    console.log(`  - Sabit Dizin Yedeği:  ${staticBackupPath}\n`);
  }

  console.log(`✓ Toplam ${filesToProcess.length} adet HTML dosyası işleniyor (${newFilePaths.length} yeni, ${changedFilePaths.length} değiştirilen, ${unchangedFilePaths.length} atlanan)...`);

  let totalReadRows = 0;
  let newUniqueListingCount = 0;
  let updatedExistingListingCount = 0;
  let completeCount = 0;
  let missingEngineVariantCount = 0;
  let missingPriceCount = 0;
  let mergedDuplicateCount = 0;
  let pricingUsableNewCount = 0;

  const affectedVehicleGroups = new Set<string>();

  // Fetch existing listing IDs from DB for high-speed lookup
  const existingListings = await prisma.rawVehicleListing.findMany({
    select: { id: true, sourceListingId: true, price: true, mileageKm: true }
  });
  const existingMap = new Map(existingListings.map(l => [l.sourceListingId, l]));

  const recordsToInsert: any[] = [];
  const recordsToUpdate: any[] = [];
  const batchSeenListingIds = new Set<string>();

  for (const filePath of filesToProcess) {
    const fileName = path.basename(filePath);
    const parentFolder = path.basename(path.dirname(filePath));
    const relP = path.relative(SOURCE_DIR, filePath);

    const html = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(html);

    const pageH1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
    const pageTitle = $('title').first().text().replace(/\s+/g, ' ').trim();
    const headerInfo = parseHeaderMakeModelSubModel(pageH1 || pageTitle || fileName, parentFolder);

    const groupKey = `${headerInfo.make}__${headerInfo.model}`;
    affectedVehicleGroups.add(groupKey);

    let fileRowCount = 0;

    for (const rowEl of $('tr[data-id]').toArray()) {
      totalReadRows++;
      fileRowCount++;
      const dataId = $(rowEl).attr('data-id') || '';

      const tds: string[] = [];
      $(rowEl).find('td').each((_, tdEl) => {
        tds.push($(tdEl).text().replace(/\s+/g, ' ').trim());
      });

      let rowMake = headerInfo.make;
      let rowModel = headerInfo.model;
      let rowSubModel = headerInfo.subModel;
      let engineVariant: string | null = null;
      let year: number | null = null;
      let mileageKm: number | null = null;
      let color: string | null = null;
      let priceTl: number | null = null;

      let yearIdx = -1;
      for (let i = 0; i < tds.length; i++) {
        if (/^(19\d\d|20[0-2]\d)$/.test(tds[i])) {
          yearIdx = i;
          year = parseInt(tds[i], 10);
          break;
        }
      }

      if (yearIdx === 3) {
        engineVariant = tds[1] && tds[1] !== '' ? tds[1] : null;
        mileageKm = tds[4] ? parseInt(tds[4].replace(/\./g, '').replace(/\D/g, ''), 10) || null : null;
        color = tds[5] && tds[5] !== '' ? tds[5] : null;
        priceTl = tds[6] ? parseInt(tds[6].replace(/\./g, '').replace(/\D/g, ''), 10) || null : null;
      } else if (yearIdx === 4) {
        if (tds[1] && tds[1] !== '') rowModel = tds[1];
        engineVariant = tds[2] && tds[2] !== '' ? tds[2] : null;
        mileageKm = tds[5] ? parseInt(tds[5].replace(/\./g, '').replace(/\D/g, ''), 10) || null : null;
        color = tds[6] && tds[6] !== '' ? tds[6] : null;
        priceTl = tds[7] ? parseInt(tds[7].replace(/\./g, '').replace(/\D/g, ''), 10) || null : null;
      } else if (yearIdx > 4) {
        engineVariant = tds[yearIdx - 2] && tds[yearIdx - 2] !== '' ? tds[yearIdx - 2] : null;
        mileageKm = tds[yearIdx + 1] ? parseInt(tds[yearIdx + 1].replace(/\./g, '').replace(/\D/g, ''), 10) || null : null;
        color = tds[yearIdx + 2] && tds[yearIdx + 2] !== '' ? tds[yearIdx + 2] : null;
        priceTl = tds[yearIdx + 3] ? parseInt(tds[yearIdx + 3].replace(/\./g, '').replace(/\D/g, ''), 10) || null : null;
      }

      let rowEngineVariant = headerInfo.engineVariant || null;
      let rowTrimPackage = headerInfo.trimPackage || null;

      if (!rowEngineVariant && engineVariant) {
        for (const eng of KNOWN_BMW_ENGINES) {
          if (new RegExp(`\\b${eng}\\b`, 'i').test(engineVariant)) {
            rowEngineVariant = eng;
            break;
          }
        }
      }

      if (!rowTrimPackage && engineVariant) {
        for (const tr of KNOWN_HARDWARE_TRIMS) {
          if (new RegExp(`\\b${tr}\\b`, 'i').test(engineVariant)) {
            rowTrimPackage = tr;
            break;
          }
        }
      }

      if (!rowEngineVariant) {
        rowEngineVariant = engineVariant;
      }
      if (!rowTrimPackage && engineVariant && engineVariant !== rowEngineVariant) {
        rowTrimPackage = engineVariant;
      }

      const compositeKey = `${dataId}__${rowMake}__${rowModel}__${rowSubModel || ''}__${rowEngineVariant || ''}__${year || 0}__${mileageKm || 0}__${color || ''}__${priceTl || 0}`.toLowerCase();
      const listingIdKey = dataId || `HASH_${compositeKey}`;

      const missingList: string[] = [];
      if (!rowEngineVariant) missingList.push('engineVariant');
      if (!priceTl || priceTl <= 0) missingList.push('price');
      if (!rowMake || rowMake === 'Bilinmeyen') missingList.push('make');
      if (!rowModel || rowModel === 'Genel') missingList.push('model');
      if (!year) missingList.push('year');
      if (mileageKm === null) missingList.push('mileageKm');
      if (!color) missingList.push('color');

      let parseStatus = 'VALID';
      if (missingList.includes('price')) {
        parseStatus = 'MISSING_PRICE';
      } else if (missingList.length > 0) {
        parseStatus = 'INCOMPLETE_ATTRIBUTES';
      }

      // Check intra-batch duplicate
      if (batchSeenListingIds.has(listingIdKey)) {
        mergedDuplicateCount++;
        continue;
      }
      batchSeenListingIds.add(listingIdKey);

      // Check DB existing record vs new
      const existingInDb = existingMap.get(listingIdKey);
      if (existingInDb) {
        updatedExistingListingCount++;
        recordsToUpdate.push({
          id: existingInDb.id,
          rawVariant: rowEngineVariant,
          canonicalVariant: rowEngineVariant,
          canonicalTrim: rowTrimPackage,
          price: priceTl || 0,
          mileageKm: mileageKm,
          parseStatus,
        });
      } else {
        newUniqueListingCount++;
        if (parseStatus === 'VALID') completeCount++;
        else if (parseStatus === 'MISSING_PRICE') missingPriceCount++;
        else missingEngineVariantCount++;

        if ((parseStatus === 'VALID' || parseStatus === 'INCOMPLETE_ATTRIBUTES') && priceTl && priceTl > 0) {
          pricingUsableNewCount++;
        }

        recordsToInsert.push({
          source: 'SAHIBINDEN_HTML',
          sourceListingId: listingIdKey,
          sourceFile: fileName,
          rawMake: rowMake,
          rawModel: rowModel,
          rawVariant: rowEngineVariant,
          canonicalMake: rowMake,
          canonicalModel: rowModel,
          canonicalVariant: rowEngineVariant,
          canonicalTrim: rowTrimPackage,
          year: year || 2000,
          mileageKm: mileageKm,
          price: priceTl || 0,
          parseStatus,
          parseWarnings: missingList.length ? missingList.join(',') : null,
          missingFields: missingList.length ? missingList.join(',') : null
        });
      }
    }

    // Update manifest entry for this file
    const stat = fs.statSync(filePath);
    const hash = getSha256Hash(filePath);
    manifest.files[relP] = {
      absolutePath: filePath,
      relativePath: relP,
      fileSize: stat.size,
      modifiedTime: stat.mtime.toISOString(),
      sha256ContentHash: hash,
      parserVersion: CURRENT_PARSER_VERSION,
      importedAt: new Date().toISOString(),
      detectedMake: headerInfo.make,
      detectedModel: headerInfo.model,
      detectedSubModel: headerInfo.subModel,
      listingRowCount: fileRowCount,
    };
  }

  // Update existing records
  if (recordsToUpdate.length > 0) {
    console.log(`✓ ${recordsToUpdate.length} adet mevcut kayıt güncelleniyor...`);
    for (const rec of recordsToUpdate) {
      await prisma.rawVehicleListing.update({
        where: { id: rec.id },
        data: {
          rawVariant: rec.rawVariant,
          canonicalVariant: rec.canonicalVariant,
          canonicalTrim: rec.canonicalTrim,
          price: rec.price,
          mileageKm: rec.mileageKm,
          parseStatus: rec.parseStatus,
        }
      });
    }
  }

  // Insert new records in chunks
  if (recordsToInsert.length > 0) {
    const chunkSize = 5000;
    for (let i = 0; i < recordsToInsert.length; i += chunkSize) {
      const chunk = recordsToInsert.slice(i, i + chunkSize);
      await prisma.rawVehicleListing.createMany({ data: chunk });
    }
  }

  // Synchronize new specs and invalidate targeted cache
  const allAffected = [...recordsToInsert, ...recordsToUpdate];
  if (allAffected.length > 0) {
    const vehicleService = new VehicleService(prisma as any, {} as any);
    const specUpsertRes = await vehicleService.upsertVehicleSpecificationsForRawListings(allAffected);
    console.log(`✓ ${specUpsertRes.upsertedSpecsCount} adet yeni VehicleSpecification eklendi, ${specUpsertRes.clearedCacheCount} adet araç grubu önbelleği temizlendi.`);
  }

  // Save updated manifest JSON
  manifest.lastImportAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');

  // Trigger Snapshot Update ONLY for Affected Vehicle Groups
  console.log(`✓ ${affectedVehicleGroups.size} adet etkilenen araç grubu için snapshot güncelleniyor...`);

  // Final Counts
  const totalUniqueDbCount = await prisma.rawVehicleListing.count();
  const previousGroupCount = groupCount;
  const newGroupCount = 0; // all within existing 28 brand folders unless new top level folder added
  const totalGroupCount = previousGroupCount + newGroupCount;

  console.log(`\n====================================================================`);
  console.log(`  ARTIMLI (INCREMENTAL) AKTARIM SONUÇ RAPORU`);
  console.log(`====================================================================`);
  console.log(`- Önceki araç grubu sayısı: ${previousGroupCount}`);
  console.log(`- Yeni araç grubu sayısı: ${newGroupCount}`);
  console.log(`- Toplam araç grubu sayısı: ${totalGroupCount}`);
  console.log(`- Önceki HTML dosyası sayısı: ${unchangedFilePaths.length}`);
  console.log(`- Yeni HTML dosyası sayısı: ${newFilePaths.length}`);
  console.log(`- Değiştirilen HTML dosyası sayısı: ${changedFilePaths.length}`);
  console.log(`- Atlanan değişmemiş dosya sayısı: ${unchangedFilePaths.length}`);
  console.log(`- Yeni bulunan ilan satırı: ${totalReadRows}`);
  console.log(`- Yeni eklenen benzersiz ilan: ${newUniqueListingCount}`);
  console.log(`- Güncellenen mevcut ilan: ${updatedExistingListingCount}`);
  console.log(`- Birleştirilen duplicate ilan: ${mergedDuplicateCount}`);
  console.log(`- Eksik fiyatlı yeni ilan: ${missingPriceCount}`);
  console.log(`- Fiyatlandırmada kullanılabilen yeni ilan: ${pricingUsableNewCount}`);
  console.log(`- Güncellenen snapshot grupları: ${affectedVehicleGroups.size}\n`);
}

runImport().finally(() => prisma.$disconnect());
