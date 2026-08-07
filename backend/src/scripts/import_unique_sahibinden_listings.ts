import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';

const prisma = new PrismaClient();
const SOURCE_DIR = process.env.SAHIBINDEN_HTML_DIR || 'C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan';

const MULTI_WORD_MAKES = [
  'Alfa Romeo',
  'Aston Martin',
  'Mercedes-Benz',
  'Mercedes Benz',
  'DS Automobiles',
  'Land Rover'
];

function parseHeaderMakeModelSubModel(text: string, fallbackFolder: string): { make: string; model: string; subModel: string | null } {
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
    return { make, model: 'Genel', subModel: null };
  }

  let model = words[0];
  words.shift();

  let subModel: string | null = null;
  if (words.length > 0) {
    if (words[0].toLowerCase() === model.toLowerCase()) {
      subModel = words.join(' ');
    } else {
      subModel = words.join(' ');
    }
  }

  return { make, model, subModel };
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

async function runImport() {
  console.log(`\n====================================================================`);
  console.log(`  SAHİBİNDEN HTML İLAN VERİTABANI YEDEKLEME VE HIZLI BATCH AKTARIMI`);
  console.log(`====================================================================\n`);

  // 1. Database Backup
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

  const htmlFiles = scanHtmlFilesRecursively(SOURCE_DIR);
  console.log(`✓ Toplam ${htmlFiles.length} adet HTML dosyası belleğe ayrıştırılıyor...\n`);

  let totalReadRows = 0;
  let completeCount = 0;
  let missingEngineVariantCount = 0;
  let missingPriceCount = 0;
  let mergedDuplicateCount = 0;

  const seenListingIds = new Set<string>();
  const recordsToInsert: any[] = [];

  for (const filePath of htmlFiles) {
    const fileName = path.basename(filePath);
    const parentFolder = path.basename(path.dirname(filePath));

    const html = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(html);

    const pageH1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
    const pageTitle = $('title').first().text().replace(/\s+/g, ' ').trim();

    const headerInfo = parseHeaderMakeModelSubModel(pageH1 || pageTitle || fileName, parentFolder);

    for (const rowEl of $('tr[data-id]').toArray()) {
      totalReadRows++;
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

      const compositeKey = `${dataId}__${rowMake}__${rowModel}__${rowSubModel || ''}__${engineVariant || ''}__${year || 0}__${mileageKm || 0}__${color || ''}__${priceTl || 0}`.toLowerCase();
      const listingIdKey = dataId || `HASH_${compositeKey}`;

      // Classification logic
      const missingList: string[] = [];
      if (!engineVariant) missingList.push('engineVariant');
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

      // Deduplication check
      if (seenListingIds.has(listingIdKey)) {
        mergedDuplicateCount++;
        continue;
      }

      seenListingIds.add(listingIdKey);
      if (parseStatus === 'VALID') {
        completeCount++;
      } else if (parseStatus === 'MISSING_PRICE') {
        missingPriceCount++;
      } else {
        missingEngineVariantCount++;
      }

      recordsToInsert.push({
        source: 'SAHIBINDEN_HTML',
        sourceListingId: listingIdKey,
        sourceFile: fileName,
        rawMake: rowMake,
        rawModel: rowModel,
        rawVariant: engineVariant,
        canonicalMake: rowMake,
        canonicalModel: rowModel,
        canonicalVariant: rowSubModel,
        canonicalTrim: engineVariant,
        year: year || 2000,
        mileageKm: mileageKm,
        price: priceTl || 0,
        parseStatus,
        parseWarnings: missingList.length ? missingList.join(',') : null,
        missingFields: missingList.length ? missingList.join(',') : null
      });
    }
  }

  console.log(`✓ Bellekte ${recordsToInsert.length} benzersiz kayıt hazırlandı. Veritabanına toplu yazılıyor...\n`);

  // Clear existing raw listings and perform high-speed createMany in chunks of 5000
  await prisma.rawVehicleListing.deleteMany();

  const chunkSize = 5000;
  for (let i = 0; i < recordsToInsert.length; i += chunkSize) {
    const chunk = recordsToInsert.slice(i, i + chunkSize);
    await prisma.rawVehicleListing.createMany({
      data: chunk
    });
  }

  const dbUniqueCount = await prisma.rawVehicleListing.count();
  const pricingUsableCount = await prisma.rawVehicleListing.count({
    where: {
      parseStatus: { in: ['VALID', 'INCOMPLETE_ATTRIBUTES'] },
      price: { gt: 0 }
    }
  });

  console.log(`====================================================================`);
  console.log(`  VERİTABANI AKTARIM VE TEKİLLEŞTİRME SONUÇ RAPORU`);
  console.log(`====================================================================\n`);
  console.log(`📊 KAPSAMLI İSTATİSTİKLER:`);
  console.log(`- Toplam Okunan Gerçek Satır: ${totalReadRows}`);
  console.log(`- Veritabanına Kaydedilen Benzersiz Gerçek İlan: ${dbUniqueCount}`);
  console.log(`- Eksiksiz İlan (VALID): ${completeCount}`);
  console.log(`- Eksik Motor/Versiyonlu İlan (INCOMPLETE_ATTRIBUTES): ${missingEngineVariantCount}`);
  console.log(`- Eksik Fiyatlı İlan (MISSING_PRICE): ${missingPriceCount}`);
  console.log(`- Tekrar Olduğu İçin Birleştirilen İlan: ${mergedDuplicateCount}`);
  console.log(`- Fiyatlandırmada Kullanılabilen Toplam Benzersiz İlan: ${pricingUsableCount}\n`);
}

runImport().finally(() => prisma.$disconnect());
