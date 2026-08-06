import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';

interface ExtractedListing {
  make: string;
  model: string;
  variant: string;
  trim: string;
  year: number;
  mileageKm: number;
  price: number;
  city: string;
  district: string;
  title: string;
  color?: string;
  externalListingId?: string;
}

function detectMakeAndModel(filename: string, modelTagText: string, titleText: string, folderName: string): { make: string; model: string } {
  const combined = `${folderName} ${filename} ${modelTagText} ${titleText}`.toUpperCase();

  let make = 'Audi';

  if (combined.includes('ALFA ROMEO') || combined.includes('ALFAROMEO') || folderName.toUpperCase().includes('ALFA')) {
    make = 'Alfa Romeo';
  } else if (combined.includes('BMW') || folderName.toUpperCase().includes('BMW')) {
    make = 'BMW';
  } else if (combined.includes('AUDI') || folderName.toUpperCase().includes('AUDI')) {
    make = 'Audi';
  } else if (combined.includes('MERCEDES')) {
    make = 'Mercedes-Benz';
  } else if (combined.includes('VOLKSWAGEN') || combined.includes('VW')) {
    make = 'Volkswagen';
  } else if (combined.includes('RENAULT')) {
    make = 'Renault';
  } else if (combined.includes('FIAT')) {
    make = 'Fiat';
  } else if (combined.includes('FORD')) {
    make = 'Ford';
  } else if (combined.includes('TOYOTA')) {
    make = 'Toyota';
  } else if (combined.includes('HONDA')) {
    make = 'Honda';
  } else if (combined.includes('HYUNDAI')) {
    make = 'Hyundai';
  } else if (combined.includes('KIA')) {
    make = 'Kia';
  } else if (combined.includes('PEUGEOT')) {
    make = 'Peugeot';
  } else if (combined.includes('CITROEN') || combined.includes('CITROËN')) {
    make = 'Citroën';
  } else if (combined.includes('OPEL')) {
    make = 'Opel';
  } else if (combined.includes('VOLVO')) {
    make = 'Volvo';
  } else if (combined.includes('PORSCHE')) {
    make = 'Porsche';
  } else if (combined.includes('SEAT')) {
    make = 'Seat';
  } else if (combined.includes('SKODA') || combined.includes('ŠKODA')) {
    make = 'Skoda';
  } else if (combined.includes('NISSAN')) {
    make = 'Nissan';
  }

  let model = modelTagText || 'Model';

  if (make === 'Alfa Romeo') {
    if (combined.includes('GIULIETTA')) model = 'Giulietta';
    else if (combined.includes('GIULIA')) model = 'Giulia';
    else if (combined.includes('TONALE')) model = 'Tonale';
    else if (combined.includes('STELVIO')) model = 'Stelvio';
    else if (combined.includes('159')) model = '159';
    else if (combined.includes('147')) model = '147';
    else if (combined.includes('156')) model = '156';
    else if (combined.includes('MITO')) model = 'MiTo';
    else if (combined.includes('GT')) model = 'GT';
    else if (combined.includes('4C')) model = '4C';
  } else if (make === 'BMW') {
    if (combined.includes('1 SERİSİ') || combined.includes('1 SERISI')) model = '1 Serisi';
    else if (combined.includes('2 SERİSİ') || combined.includes('2 SERISI')) model = '2 Serisi';
    else if (combined.includes('3 SERİSİ') || combined.includes('3 SERISI')) model = '3 Serisi';
    else if (combined.includes('4 SERİSİ') || combined.includes('4 SERISI')) model = '4 Serisi';
    else if (combined.includes('5 SERİSİ') || combined.includes('5 SERISI')) model = '5 Serisi';
    else if (combined.includes('6 SERİSİ') || combined.includes('6 SERISI')) model = '6 Serisi';
    else if (combined.includes('7 SERİSİ') || combined.includes('7 SERISI')) model = '7 Serisi';
    else if (combined.includes('8 SERİSİ') || combined.includes('8 SERISI')) model = '8 Serisi';
    else if (combined.includes('X1')) model = 'X1';
    else if (combined.includes('X2')) model = 'X2';
    else if (combined.includes('X3')) model = 'X3';
    else if (combined.includes('X4')) model = 'X4';
    else if (combined.includes('X5')) model = 'X5';
    else if (combined.includes('X6')) model = 'X6';
    else if (combined.includes('X7')) model = 'X7';
    else if (combined.includes('Z SERİSİ') || combined.includes('Z SERISI') || combined.includes('Z4')) model = 'Z Serisi';
    else if (combined.includes('M SERİSİ') || combined.includes('M SERISI')) model = 'M Serisi';
    else if (combined.includes('I SERİSİ') || combined.includes('I SERISI') || combined.includes('IX')) model = 'i Serisi';
  } else if (make === 'Audi') {
    if (combined.includes('A1')) model = 'A1';
    else if (combined.includes('A3')) model = 'A3';
    else if (combined.includes('A4')) model = 'A4';
    else if (combined.includes('A5')) model = 'A5';
    else if (combined.includes('A6')) model = 'A6';
    else if (combined.includes('A7')) model = 'A7';
    else if (combined.includes('A8')) model = 'A8';
    else if (combined.includes('Q2')) model = 'Q2';
    else if (combined.includes('Q3')) model = 'Q3';
    else if (combined.includes('Q5')) model = 'Q5';
    else if (combined.includes('Q7')) model = 'Q7';
    else if (combined.includes('Q8')) model = 'Q8';
    else if (combined.includes('TT')) model = 'TT';
    else if (combined.includes('R8')) model = 'R8';
  }

  return { make, model };
}

function parseSingleHtmlFile(filePath: string): ExtractedListing[] {
  const htmlContent = fs.readFileSync(filePath, 'utf-8');
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;
  const rows = document.querySelectorAll('tr');
  const listings: ExtractedListing[] = [];
  const filename = path.basename(filePath);
  const folderName = path.basename(path.dirname(filePath));

  rows.forEach((rowElement: Element) => {
    try {
      const row = rowElement as HTMLElement;
      if (!row.className.includes('searchResultsItem')) return;

      const dataId = row.getAttribute('data-id') || '';
      const tds = row.querySelectorAll('td');
      if (tds.length < 7) return;

      const modelTagText = tds[1]?.textContent?.trim() || '';
      const titleText = tds[2]?.textContent?.trim() || '';
      const yearText = tds[3]?.textContent?.trim().replace(/\D/g, '') || '';
      const kmText = tds[4]?.textContent?.trim().replace(/\D/g, '') || '';
      const colorText = tds[5]?.textContent?.trim() || '';
      const priceText = tds[6]?.textContent?.trim().replace(/\D/g, '') || '';
      const locationText = tds[8]?.textContent?.trim().replace(/\s+/g, ' ') || '';

      if (!priceText || !yearText || !kmText) return;

      const year = parseInt(yearText, 10);
      const mileageKm = parseInt(kmText, 10);
      const price = parseInt(priceText, 10);

      if (isNaN(year) || isNaN(mileageKm) || isNaN(price) || price < 50000 || year < 1970 || year > 2030) {
        return;
      }

      let city = 'İstanbul';
      let district = '';

      if (locationText.includes('/')) {
        const parts = locationText.split('/');
        city = parts[0]?.trim() || 'İstanbul';
        district = parts[1]?.trim() || '';
      } else {
        city = locationText;
      }

      const { make, model } = detectMakeAndModel(filename, modelTagText, titleText, folderName);

      let variant = modelTagText || 'Standart';

      let trim = 'Paket';
      const combinedText = `${titleText} ${modelTagText}`.toUpperCase();
      if (combinedText.includes('DISTINCTIVE')) trim = 'Distinctive';
      else if (combinedText.includes('VELOCE')) trim = 'Veloce';
      else if (combinedText.includes('PROGRESSION')) trim = 'Progression';
      else if (combinedText.includes('SUPER')) trim = 'Super';
      else if (combinedText.includes('TI')) trim = 'TI';
      else if (combinedText.includes('SPRINT')) trim = 'Sprint';
      else if (combinedText.includes('M SPORT') || combinedText.includes('MSPORT')) trim = 'M Sport';
      else if (combinedText.includes('SPORT LINE')) trim = 'Sport Line';
      else if (combinedText.includes('LUXURY LINE')) trim = 'Luxury Line';
      else if (combinedText.includes('S LINE') || combinedText.includes('SLINE')) trim = 'S Line';

      listings.push({
        make,
        model,
        variant,
        trim,
        year,
        mileageKm,
        price,
        city,
        district,
        title: titleText,
        color: colorText,
        externalListingId: dataId ? `shb-${dataId}` : undefined,
      });
    } catch (err) {
      // Ignore
    }
  });

  // Explicitly close DOM window to release memory immediately
  dom.window.close();

  return listings;
}

function getAllHtmlFilesRecursively(dirPath: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dirPath);

  list.forEach((file) => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllHtmlFilesRecursively(filePath));
    } else if (file.endsWith('.html') || file.endsWith('.htm')) {
      results.push(filePath);
    }
  });

  return results;
}

async function main() {
  const targetArg = process.argv[2] || `C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan`;
  const absolutePath = path.isAbsolute(targetArg) ? targetArg : path.join(process.cwd(), targetArg);

  let htmlFiles: string[] = [];

  if (fs.existsSync(absolutePath)) {
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      htmlFiles = getAllHtmlFilesRecursively(absolutePath);
    } else {
      htmlFiles = [absolutePath];
    }
  } else {
    console.error(`Hata: '${absolutePath}' yolu bulunamadı.`);
    process.exit(1);
  }

  console.log(`\n====================================================================`);
  console.log(`  ${htmlFiles.length} ADET HTML DOSYASI TARANIYOR (${path.basename(absolutePath)})`);
  console.log(`====================================================================\n`);

  const seenKeys = new Set<string>();
  const { execSync } = require('child_process');
  let totalExtractedNewListings = 0;

  // Process files in batches of 30 to keep memory lean (< 200MB)
  const batchSize = 30;

  for (let batchStart = 0; batchStart < htmlFiles.length; batchStart += batchSize) {
    const batchFiles = htmlFiles.slice(batchStart, batchStart + batchSize);
    const batchListings: ExtractedListing[] = [];

    for (let i = 0; i < batchFiles.length; i++) {
      const fileIndex = batchStart + i;
      const file = batchFiles[i];
      const fileListings = parseSingleHtmlFile(file);
      let addedCount = 0;

      for (const item of fileListings) {
        const key = item.externalListingId || `${item.make}-${item.model}-${item.year}-${item.mileageKm}-${item.price}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          batchListings.push(item);
          addedCount++;
        }
      }
      console.log(`✓ [${fileIndex + 1}/${htmlFiles.length}] [${path.basename(file)}]: ${fileListings.length} ilan okundu (${addedCount} yeni).`);
    }

    totalExtractedNewListings += batchListings.length;

    if (batchListings.length > 0) {
      const tempJsonPath = path.join(__dirname, `temp_html_batch_${batchStart}.json`);
      fs.writeFileSync(tempJsonPath, JSON.stringify(batchListings, null, 2), 'utf-8');

      console.log(`\n--> [Paket Aktarımı ${Math.floor(batchStart / batchSize) + 1}/${Math.ceil(htmlFiles.length / batchSize)}] ${batchListings.length} yeni ilan veritabanına aktarılıyor...`);
      try {
        const command = `npx ts-node src/scripts/import_screenshot_listing.ts "${tempJsonPath}"`;
        const output = execSync(command, { cwd: path.join(__dirname, '../..'), encoding: 'utf-8' });
        console.log(output);
      } catch (err: any) {
        console.error(`Paket aktarım hatası: ${err.message}`);
      } finally {
        if (fs.existsSync(tempJsonPath)) {
          fs.unlinkSync(tempJsonPath);
        }
      }
    }

    // Trigger explicit garbage collection if exposed
    if (global.gc) {
      global.gc();
    }
  }

  console.log(`\n--------------------------------------------------------------------`);
  console.log(` TOPLAM ISLENEN YENI TEKIL ILAN SAYISI: ${totalExtractedNewListings}`);
  console.log(` VERITABANINDAKI TOPLAM TEKIL ILAN KEY SAYISI: ${seenKeys.size}`);
  console.log(`--------------------------------------------------------------------\n`);
}

main().catch(console.error);
