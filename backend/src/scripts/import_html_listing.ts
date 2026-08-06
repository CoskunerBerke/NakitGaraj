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

function parseSingleHtmlFile(filePath: string): ExtractedListing[] {
  const htmlContent = fs.readFileSync(filePath, 'utf-8');
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;
  const rows = document.querySelectorAll('tr');
  const listings: ExtractedListing[] = [];

  rows.forEach((rowElement: Element) => {
    try {
      const row = rowElement as HTMLElement;
      if (!row.className.includes('searchResultsItem')) return;

      const dataId = row.getAttribute('data-id') || '';
      const tds = row.querySelectorAll('td');
      if (tds.length < 7) return;

      // Find price cell and title cell
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

      if (isNaN(year) || isNaN(mileageKm) || isNaN(price) || price < 100000 || year < 1980 || year > 2030) {
        return;
      }

      // Location split
      let city = 'İstanbul';
      let district = '';

      if (locationText.includes('/')) {
        const parts = locationText.split('/');
        city = parts[0]?.trim() || 'İstanbul';
        district = parts[1]?.trim() || '';
      } else {
        city = locationText;
      }

      // Brand & Model
      const filename = path.basename(filePath);
      let make = 'Audi';
      let model = 'A5';

      const combinedText = `${filename} ${modelTagText} ${titleText}`.toUpperCase();

      if (combinedText.includes('A6')) model = 'A6';
      else if (combinedText.includes('A5')) model = 'A5';
      else if (combinedText.includes('A4')) model = 'A4';
      else if (combinedText.includes('A3')) model = 'A3';
      else if (combinedText.includes('A1')) model = 'A1';

      // Variant
      let variant = '2.0 TDI';
      if (combinedText.includes('45 TFSI')) variant = '45 TFSI';
      else if (combinedText.includes('40 TDI')) variant = '40 TDI';
      else if (combinedText.includes('50 TDI')) variant = '50 TDI';
      else if (combinedText.includes('55 TFSI')) variant = '55 TFSI';
      else if (combinedText.includes('35 TFSI')) variant = '35 TFSI';
      else if (combinedText.includes('2.0 TDI')) variant = '2.0 TDI';
      else if (combinedText.includes('2.0 TFSI')) variant = '2.0 TFSI';
      else if (combinedText.includes('1.8 TFSI') || combinedText.includes('1.8 T')) variant = '1.8 TFSI';
      else if (combinedText.includes('1.6 TDI')) variant = '1.6 TDI';
      else if (combinedText.includes('1.4 TFSI')) variant = '1.4 TFSI';
      else if (combinedText.includes('1.6')) variant = '1.6';

      // Trim
      let trim = 'Quattro S Line';
      if (combinedText.includes('DESIGN') || combinedText.includes('DESİNG')) trim = 'Quattro Design';
      else if (combinedText.includes('SPORT')) trim = 'Quattro Sport';
      else if (combinedText.includes('ADVANCED')) trim = 'Quattro Advanced';
      else if (combinedText.includes('S LINE') || combinedText.includes('S-LINE') || combinedText.includes('SLINE')) trim = 'Quattro S Line';
      else if (combinedText.includes('DYNAMIC')) trim = 'Dynamic';

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

  return listings;
}

async function main() {
  const targetArg = process.argv[2] || `C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan`;
  const absolutePath = path.isAbsolute(targetArg) ? targetArg : path.join(process.cwd(), targetArg);

  let htmlFiles: string[] = [];

  if (fs.existsSync(absolutePath)) {
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(absolutePath);
      htmlFiles = files
        .filter((f) => f.endsWith('.html') || f.endsWith('.htm'))
        .map((f) => path.join(absolutePath, f));
    } else {
      htmlFiles = [absolutePath];
    }
  } else {
    console.error(`Hata: '${absolutePath}' yolu bulunamadı.`);
    process.exit(1);
  }

  console.log(`\n====================================================================`);
  console.log(`  ${htmlFiles.length} ADET HTML DOSYASI AŞAMALI OLARAK TARANIYOR`);
  console.log(`====================================================================\n`);

  let allListings: ExtractedListing[] = [];
  const seenKeys = new Set<string>();

  for (const file of htmlFiles) {
    const fileListings = parseSingleHtmlFile(file);
    let addedCount = 0;
    for (const item of fileListings) {
      const key = item.externalListingId || `${item.make}-${item.model}-${item.year}-${item.mileageKm}-${item.price}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        allListings.push(item);
        addedCount++;
      }
    }
    console.log(`✓ [${path.basename(file)}]: ${fileListings.length} ilan okundu (${addedCount} yeni).`);
  }

  console.log(`\n--------------------------------------------------------------------`);
  console.log(` Toplam Ayıklanan Tekil İlan Sayısı: ${allListings.length}`);
  console.log(`--------------------------------------------------------------------\n`);

  if (allListings.length === 0) {
    console.log('Hiç ilan bulunamadı.');
    return;
  }

  // Save to JSON and call importer
  const jsonPath = path.join(__dirname, 'extracted_html_batch.json');
  fs.writeFileSync(jsonPath, JSON.stringify(allListings, null, 2), 'utf-8');

  // Execute import_screenshot_listing
  const { execSync } = require('child_process');
  const command = `npx ts-node src/scripts/import_screenshot_listing.ts "${jsonPath}"`;
  console.log(`Veritabanına aktarım başlatılıyor...`);
  const output = execSync(command, { cwd: path.join(__dirname, '../..'), encoding: 'utf-8' });
  console.log(output);

  // Clean temp json
  if (fs.existsSync(jsonPath)) {
    fs.unlinkSync(jsonPath);
  }
}

main().catch(console.error);
