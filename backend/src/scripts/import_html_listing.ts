import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';

const prisma = new PrismaClient();

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
  title?: string;
  color?: string;
}

async function parseSahibindenHtml(htmlContent: string): Promise<ExtractedListing[]> {
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;
  const rows = document.querySelectorAll('tr.searchResultsItem');
  const listings: ExtractedListing[] = [];

  rows.forEach((row) => {
    try {
      const modelCell = row.querySelector('td.searchResultsTagAttributeValue');
      const titleCell = row.querySelector('td.searchResultsTitleValue a');
      const yearCell = row.querySelector('td.searchResultsAttributeValue:nth-of-type(1)');
      const kmCell = row.querySelector('td.searchResultsAttributeValue:nth-of-type(2)');
      const colorCell = row.querySelector('td.searchResultsAttributeValue:nth-of-type(3)');
      const priceCell = row.querySelector('td.searchResultsPriceValue');
      const locationCell = row.querySelector('td.searchResultsLocationValue');

      if (!priceCell || !yearCell || !kmCell) return;

      const title = titleCell?.textContent?.trim() || '';
      const yearText = yearCell.textContent?.trim().replace(/\D/g, '') || '0';
      const year = parseInt(yearText, 10);

      const kmText = kmCell.textContent?.trim().replace(/\D/g, '') || '0';
      const mileageKm = parseInt(kmText, 10);

      const priceText = priceCell.textContent?.trim().replace(/\D/g, '') || '0';
      const price = parseInt(priceText, 10);

      const locationText = locationCell?.textContent?.trim().replace(/\s+/g, ' ') || '';
      const locationParts = locationText.split('/');
      const city = locationParts[0]?.trim() || 'İstanbul';
      const district = locationParts[1]?.trim() || '';
      const color = colorCell?.textContent?.trim() || '';

      // Infer brand, model, variant, trim from title or breadcrumbs
      let make = 'Audi';
      let model = 'A3';
      let variant = '35 TFSI';
      let trim = 'S Line';

      if (title.toUpperCase().includes('A6')) model = 'A6';
      else if (title.toUpperCase().includes('A4')) model = 'A4';
      else if (title.toUpperCase().includes('A3')) model = 'A3';
      else if (title.toUpperCase().includes('A1')) model = 'A1';

      if (title.toUpperCase().includes('45 TFSI')) variant = '45 TFSI';
      else if (title.toUpperCase().includes('40 TDI')) variant = '40 TDI';
      else if (title.toUpperCase().includes('35 TFSI')) variant = '35 TFSI';
      else if (title.toUpperCase().includes('1.6 TDI')) variant = '1.6 TDI';
      else if (title.toUpperCase().includes('1.4 TFSI')) variant = '1.4 TFSI';
      else if (title.toUpperCase().includes('1.6')) variant = '1.6';

      if (title.toUpperCase().includes('S LINE') || title.toUpperCase().includes('S-LINE')) trim = 'S Line';
      else if (title.toUpperCase().includes('DESIGN')) trim = 'Design';
      else if (title.toUpperCase().includes('ADVANCED')) trim = 'Advanced';
      else if (title.toUpperCase().includes('SPORT')) trim = 'Sport';

      if (price > 100000 && year > 1990 && year < 2030) {
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
          title,
          color,
        });
      }
    } catch (err) {
      // Ignore bad row
    }
  });

  return listings;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.log('Kullanım: npx ts-node src/scripts/import_html_listing.ts <HTML_DOSYA_YOLU>');
    process.exit(1);
  }

  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Hata: '${absolutePath}' dosyası bulunamadı.`);
    process.exit(1);
  }

  const htmlContent = fs.readFileSync(absolutePath, 'utf-8');
  const listings = await parseSahibindenHtml(htmlContent);

  console.log(`\n====================================================================`);
  console.log(`  HTML Sayfasından ${listings.length} Adet İlan Bulundu`);
  console.log(`====================================================================\n`);

  if (listings.length === 0) {
    console.log('İlan satırı tespit edilemedi.');
    return;
  }

  // Save via import logic
  const jsonPath = path.join(__dirname, 'temp_html_import.json');
  fs.writeFileSync(jsonPath, JSON.stringify(listings, null, 2), 'utf-8');

  const importScript = require('./import_screenshot_listing');
  // run main script
}

if (require.main === module) {
  main().catch(console.error);
}
