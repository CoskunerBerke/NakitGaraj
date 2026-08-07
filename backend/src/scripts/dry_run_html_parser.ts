import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';

const SOURCE_DIR = process.env.SAHIBINDEN_HTML_DIR || 'C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan';

interface ParsedListing {
  sourceFile: string;
  listingId: string;
  make: string;
  model: string;
  subModel: string | null;
  engineVariant: string | null;
  year: number | null;
  mileageKm: number | null;
  color: string | null;
  priceTl: number | null;
  isValid8Field: boolean;
}

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
    // If the next word is a duplicate model name, e.g. "A3 A3 Hatchback" -> model="A3", subModel="A3 Hatchback"
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

function runDryRun() {
  console.log(`\n====================================================================`);
  console.log(`  CHEERIO HTML PARSER DRY-RUN RAPORU (VERİTABANI DEĞİŞİKLİĞİ YOK)`);
  console.log(`====================================================================\n`);

  console.log(`Kullanılan kaynak klasörü: ${SOURCE_DIR}`);
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error('Hata: HTML_SOURCE_DIRECTORY_NOT_FOUND');
    process.exit(1);
  }

  const htmlFiles = scanHtmlFilesRecursively(SOURCE_DIR);
  if (htmlFiles.length === 0) {
    console.error('Hata: NO_HTML_FILES_FOUND');
    process.exit(1);
  }

  let totalListingRows = 0;
  let engineVariantFoundCount = 0;
  let engineVariantMissingCount = 0;
  let makeModelMissingCount = 0;
  let valid8FieldCount = 0;
  let duplicateCount = 0;

  const seenListingIds = new Set<string>();
  const parsedListings: ParsedListing[] = [];

  // Special targets to showcase in dry-run output
  const target1Name = "Audi A1 Fiyatları & Modelleri sahibinden.com'da - 2.html";
  const target2Name = "Audi A3 A3 Hatchback Fiyatları & Modelleri sahibinden.com'da - 5.html";
  const target1Rows: ParsedListing[] = [];
  const target2Rows: ParsedListing[] = [];

  for (const filePath of htmlFiles) {
    const fileName = path.basename(filePath);
    const parentFolder = path.basename(path.dirname(filePath));

    const html = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(html);

    const pageH1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
    const pageTitle = $('title').first().text().replace(/\s+/g, ' ').trim();

    const headerInfo = parseHeaderMakeModelSubModel(pageH1 || pageTitle || fileName, parentFolder);

    $('tr[data-id]').each((_, rowEl) => {
      totalListingRows++;
      const dataId = $(rowEl).attr('data-id') || '';

      if (dataId && seenListingIds.has(dataId)) {
        duplicateCount++;
      } else if (dataId) {
        seenListingIds.add(dataId);
      }

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

      // Detect year column position
      let yearIdx = -1;
      for (let i = 0; i < tds.length; i++) {
        if (/^(19\d\d|20[0-2]\d)$/.test(tds[i])) {
          yearIdx = i;
          year = parseInt(tds[i], 10);
          break;
        }
      }

      if (yearIdx === 3) {
        // Model-specific page layout:
        // td[1] = Engine Variant
        // td[2] = Listing Title
        // td[3] = Year
        // td[4] = KM
        // td[5] = Color
        // td[6] = Price
        engineVariant = tds[1] && tds[1] !== '' ? tds[1] : null;
        mileageKm = tds[4] ? parseInt(tds[4].replace(/\./g, '').replace(/\D/g, ''), 10) || null : null;
        color = tds[5] && tds[5] !== '' ? tds[5] : null;
        priceTl = tds[6] ? parseInt(tds[6].replace(/\./g, '').replace(/\D/g, ''), 10) || null : null;
      } else if (yearIdx === 4) {
        // Brand-level page layout:
        // td[1] = Model or SubModel
        // td[2] = Engine Variant
        // td[3] = Listing Title
        // td[4] = Year
        // td[5] = KM
        // td[6] = Color
        // td[7] = Price
        if (tds[1] && tds[1] !== '') {
          rowModel = tds[1];
        }
        engineVariant = tds[2] && tds[2] !== '' ? tds[2] : null;
        mileageKm = tds[5] ? parseInt(tds[5].replace(/\./g, '').replace(/\D/g, ''), 10) || null : null;
        color = tds[6] && tds[6] !== '' ? tds[6] : null;
        priceTl = tds[7] ? parseInt(tds[7].replace(/\./g, '').replace(/\D/g, ''), 10) || null : null;
      } else if (yearIdx > 4) {
        // Extended layout with additional attribute columns
        engineVariant = tds[yearIdx - 2] && tds[yearIdx - 2] !== '' ? tds[yearIdx - 2] : null;
        mileageKm = tds[yearIdx + 1] ? parseInt(tds[yearIdx + 1].replace(/\./g, '').replace(/\D/g, ''), 10) || null : null;
        color = tds[yearIdx + 2] && tds[yearIdx + 2] !== '' ? tds[yearIdx + 2] : null;
        priceTl = tds[yearIdx + 3] ? parseInt(tds[yearIdx + 3].replace(/\./g, '').replace(/\D/g, ''), 10) || null : null;
      }

      if (engineVariant) {
        engineVariantFoundCount++;
      } else {
        engineVariantMissingCount++;
      }

      if (!rowMake || rowMake === 'Bilinmeyen' || !rowModel || rowModel === 'Genel') {
        makeModelMissingCount++;
      }

      const isValid8 = Boolean(
        rowMake && rowMake !== 'Bilinmeyen' &&
        rowModel && rowModel !== 'Genel' &&
        engineVariant &&
        year && year >= 1970 && year <= 2026 &&
        mileageKm !== null && mileageKm >= 0 &&
        color &&
        priceTl && priceTl > 0
      );

      if (isValid8) {
        valid8FieldCount++;
      }

      const item: ParsedListing = {
        sourceFile: fileName,
        listingId: dataId,
        make: rowMake,
        model: rowModel,
        subModel: rowSubModel,
        engineVariant,
        year,
        mileageKm,
        color,
        priceTl,
        isValid8Field: isValid8
      };

      parsedListings.push(item);

      if (fileName.includes("Audi A1 Fiyatları & Modelleri sahibinden.com'da - 2")) {
        target1Rows.push(item);
      }
      if (fileName.includes("Audi A3 A3 Hatchback Fiyatları & Modelleri sahibinden.com'da - 5")) {
        target2Rows.push(item);
      }
    });
  }

  console.log(`📊 ÖZET İSTATİSTİKLER:`);
  console.log(`- HTML Dosyası Sayısı: ${htmlFiles.length}`);
  console.log(`- Gerçek İlan Satırı Sayısı: ${totalListingRows}`);
  console.log(`- Engine Variant Bulunan İlan Sayısı: ${engineVariantFoundCount}`);
  console.log(`- Engine Variant Bulunamayan İlan Sayısı: ${engineVariantMissingCount}`);
  console.log(`- Marka/Model Bulunamayan İlan Sayısı: ${makeModelMissingCount}`);
  console.log(`- Geçerli 8 Alanlı İlan Sayısı: ${valid8FieldCount}`);
  console.log(`- Duplicate İlan Sayısı: ${duplicateCount}\n`);

  console.log(`📌 ÖZEL HEDEF DOSYALARIN PARSE SONUÇLARI:\n`);

  console.log(`### 1. Dosya: ${target1Name}`);
  console.log(`| # | Marka | Model | Alt Model | Motor/Versiyon | Yıl | KM | Renk | Fiyat |`);
  console.log(`| :---: | :--- | :--- | :--- | :--- | :---: | :---: | :--- | :---: |`);
  target1Rows.slice(0, 5).forEach((r, idx) => {
    console.log(`| ${idx + 1} | ${r.make} | ${r.model} | ${r.subModel || '-'} | ${r.engineVariant || '-'} | ${r.year || '-'} | ${r.mileageKm?.toLocaleString('tr-TR') || '-'} | ${r.color || '-'} | ${r.priceTl ? r.priceTl.toLocaleString('tr-TR') + ' ₺' : '-'} |`);
  });

  console.log(`\n### 2. Dosya: ${target2Name}`);
  console.log(`| # | Marka | Model | Alt Model | Motor/Versiyon | Yıl | KM | Renk | Fiyat |`);
  console.log(`| :---: | :--- | :--- | :--- | :--- | :---: | :---: | :--- | :---: |`);
  target2Rows.slice(0, 5).forEach((r, idx) => {
    console.log(`| ${idx + 1} | ${r.make} | ${r.model} | ${r.subModel || '-'} | ${r.engineVariant || '-'} | ${r.year || '-'} | ${r.mileageKm?.toLocaleString('tr-TR') || '-'} | ${r.color || '-'} | ${r.priceTl ? r.priceTl.toLocaleString('tr-TR') + ' ₺' : '-'} |`);
  });

  console.log(`\n📈 30 ADET RASTGELE GERÇEK İLAN DRY-RUN ÖRNEK TABLOSU:\n`);
  console.log(`| # | Dosya | Marka | Model | Alt Model | Motor/Versiyon | Yıl | KM | Renk | Fiyat |`);
  console.log(`| :---: | :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- | :---: |`);

  // Pick 30 distinct samples across valid 8-field listings
  const validSamples = parsedListings.filter(l => l.isValid8Field).slice(0, 30);
  validSamples.forEach((r, idx) => {
    console.log(`| ${idx + 1} | ${r.sourceFile.substring(0, 25)}... | ${r.make} | ${r.model} | ${r.subModel || '-'} | ${r.engineVariant || '-'} | ${r.year} | ${r.mileageKm?.toLocaleString('tr-TR')} | ${r.color} | ${r.priceTl?.toLocaleString('tr-TR')} ₺ |`);
  });
}

runDryRun();
