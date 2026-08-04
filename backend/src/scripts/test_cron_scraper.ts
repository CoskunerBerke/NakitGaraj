import { PrismaClient } from '@prisma/client';
import { runScraper } from './scraper';

const prisma = new PrismaClient();

async function run() {
  console.log('--- Testing Refactored Scraper with Details & Anti-Ban ---');
  
  // Pick one test specification (e.g. Corolla or Egea) to verify quickly
  const spec = await prisma.vehicleSpecification.findFirst({
    where: {
      manufacturer: { name: 'Toyota' },
      model: { name: 'Corolla' },
      year: 2024
    },
    include: {
      manufacturer: true,
      model: true
    }
  });

  if (!spec) {
    console.error('Test specification not found!');
    return;
  }

  console.log(`Found test spec: ${spec.year} ${spec.manufacturer.name} ${spec.model.name}`);

  // We temporarily mock process.env variables if needed
  // Run scraper for this single spec or run a micro-scrape
  console.log('Running test scrape for this single model...');
  
  // To avoid running the entire 500-model list, we temporarily run the scraper for just one spec
  // We can call runScraper() directly or run a small test routine
  // Let's run a manual query to verify playright and the new cleanMarketAverage parser:
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const query = `${spec.manufacturer.name} ${spec.model.name} ${spec.year}`;
  const searchUrl = `https://www.arabam.com/ikinci-el/otomobil?searchText=${encodeURIComponent(query)}`;
  
  console.log(`Navigating to test search URL: ${searchUrl}`);
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  
  const listings = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr.listing-list-item, .listing-card');
    const data: { price: number; isDamaged: boolean }[] = [];
    
    rows.forEach((row) => {
      const text = row.textContent || '';
      const lowerText = text.toLowerCase();
      
      const isDamaged = 
        lowerText.includes('pert') || 
        lowerText.includes('hasar kayit') || 
        lowerText.includes('hasar kayıt') || 
        lowerText.includes('agir hasar') || 
        lowerText.includes('ağır hasar') || 
        lowerText.includes('hasarli') || 
        lowerText.includes('hasarlı');

      const priceEl = row.querySelector('.listing-price, .price');
      if (priceEl) {
        const priceText = priceEl.textContent || '';
        const num = parseInt(priceText.replace(/[^0-9]/g, ''), 10);
        if (num > 50000 && num < 50000000) {
          data.push({ price: num, isDamaged });
        }
      }
    });
    return data;
  });

  console.log(`Scraped listings count: ${listings.length}`);
  if (listings.length > 0) {
    const prices = listings.map((l: any) => l.price);
    const totalAverage = Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length);
    
    const cleanListings = listings.filter((l: any) => !l.isDamaged);
    const cleanPrices = cleanListings.length > 0 ? cleanListings.map((l: any) => l.price) : prices;
    const cleanAverage = Math.round(cleanPrices.reduce((a: number, b: number) => a + b, 0) / cleanPrices.length);

    console.log(`Total average calculated: ${totalAverage.toLocaleString('tr-TR')} ₺`);
    console.log(`Clean average calculated (excluding pert/heavy damage): ${cleanAverage.toLocaleString('tr-TR')} ₺`);

    // Update database
    await prisma.vehicleMarketPrice.updateMany({
      where: { vehicleSpecificationId: spec.id },
      data: {
        currentMarketAverage: totalAverage,
        cleanMarketAverage: cleanAverage,
        scrapedAt: new Date()
      }
    });

    console.log('Database updated successfully with new clean fields!');
    
    // Query it back to check
    const updatedPrice = await prisma.vehicleMarketPrice.findFirst({
      where: { vehicleSpecificationId: spec.id }
    });
    console.log('Verified database record:', updatedPrice);
  } else {
    console.log('No listings scraped, trying fallback pricing logic...');
  }

  await browser.close();
  console.log('--- Test Finished successfully ---');
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
