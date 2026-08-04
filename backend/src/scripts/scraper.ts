import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';

const prisma = new PrismaClient();

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
];

interface ScrapeResult {
  totalAverage: number;
  cleanAverage: number;
}

// Rotate proxies dynamically
function getNextProxy(proxyIndex: number): string | null {
  const proxiesStr = process.env.SCRAPER_PROXIES || '';
  if (!proxiesStr) {
    return process.env.SCRAPER_PROXY || null;
  }
  const proxies = proxiesStr.split(',').map(p => p.trim()).filter(Boolean);
  if (proxies.length === 0) return null;
  return proxies[proxyIndex % proxies.length];
}

async function scrapeCarPrice(page: any, brand: string, model: string, year: number): Promise<ScrapeResult | null> {
  try {
    const query = `${brand} ${model} ${year}`;
    console.log(`[Scraper] Querying Arabam.com for: ${query}`);
    
    const searchUrl = `https://www.arabam.com/ikinci-el/otomobil?searchText=${encodeURIComponent(query)}`;
    const response = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
    
    const content = await page.content();
    if (
      content.includes('cf-challenge') || 
      content.includes('challenges.cloudflare.com') || 
      content.includes('Access Denied') ||
      content.includes('Turnstile') ||
      response?.status() === 403
    ) {
      console.log(`[Scraper] Cloudflare block detected on Arabam.com!`);
      return null;
    }

    await page.waitForTimeout(300 + Math.random() * 400);

    // Extract listing detail texts and prices to identify pert/heavy damage
    const listings = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr.listing-list-item, .listing-card');
      const data: { price: number; isDamaged: boolean }[] = [];
      
      rows.forEach((row) => {
        const text = row.textContent || '';
        const lowerText = text.toLowerCase();
        
        // Check for damage and pert keywords
        const isDamaged = 
          lowerText.includes('pert') || 
          lowerText.includes('hasar kayit') || 
          lowerText.includes('hasar kayıt') || 
          lowerText.includes('agir hasar') || 
          lowerText.includes('ağır hasar') || 
          lowerText.includes('hasarli') || 
          lowerText.includes('hasarlı') || 
          lowerText.includes('tavan boyali') || 
          lowerText.includes('tavan boyalı') || 
          lowerText.includes('komple boyali') || 
          lowerText.includes('komple boyalı');

        // Extract price
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

    if (listings.length > 0) {
      const prices = listings.map((l: any) => l.price);
      const totalAverage = Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length);
      
      // Calculate clean average (excluding damaged/pert listings)
      const cleanListings = listings.filter((l: any) => !l.isDamaged);
      const cleanPrices = cleanListings.length > 0 ? cleanListings.map((l: any) => l.price) : prices;
      const cleanAverage = Math.round(cleanPrices.reduce((a: number, b: number) => a + b, 0) / cleanPrices.length);

      console.log(`[Scraper] Found ${listings.length} listings. Total Avg: ${totalAverage.toLocaleString('tr-TR')} ₺, Clean Avg: ${cleanAverage.toLocaleString('tr-TR')} ₺`);
      return { totalAverage, cleanAverage };
    }

    // Try Sahibinden.com
    console.log(`[Scraper] Arabam.com returned no listings. Trying Sahibinden.com...`);
    const shUrl = `https://www.sahibinden.com/kelime-ile-arama?query_text_mf=${encodeURIComponent(query)}`;
    const shResponse = await page.goto(shUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    const shContent = await page.content();
    if (
      shContent.includes('cf-challenge') || 
      shContent.includes('challenges.cloudflare.com') || 
      shContent.includes('Access Denied') ||
      shContent.includes('Turnstile') ||
      shResponse?.status() === 403
    ) {
      console.log(`[Scraper] Cloudflare block detected on Sahibinden.com!`);
      return null;
    }

    await page.waitForTimeout(400 + Math.random() * 400);
    
    const shListings = await page.evaluate(() => {
      const rows = document.querySelectorAll('.searchResultsItem, tr.searchResultsItem');
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
          lowerText.includes('hasarlı') || 
          lowerText.includes('tavan boyali') || 
          lowerText.includes('tavan boyalı') || 
          lowerText.includes('komple boyali') || 
          lowerText.includes('komple boyalı');

        const priceEl = row.querySelector('.searchResultsPriceValue, .price');
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

    if (shListings.length > 0) {
      const prices = shListings.map((l: any) => l.price);
      const totalAverage = Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length);
      
      const cleanListings = shListings.filter((l: any) => !l.isDamaged);
      const cleanPrices = cleanListings.length > 0 ? cleanListings.map((l: any) => l.price) : prices;
      const cleanAverage = Math.round(cleanPrices.reduce((a: number, b: number) => a + b, 0) / cleanPrices.length);

      console.log(`[Scraper] Found ${shListings.length} listings on Sahibinden. Total Avg: ${totalAverage.toLocaleString('tr-TR')} ₺, Clean Avg: ${cleanAverage.toLocaleString('tr-TR')} ₺`);
      return { totalAverage, cleanAverage };
    }

    console.log(`[Scraper] No listings found on both sources for: ${query}`);
    return null;
  } catch (error) {
    console.error(`[Scraper] Error scraping ${brand} ${model} ${year}:`, (error as Error).message);
    return null;
  }
}

export async function runScraper() {
  console.log('--- Starting Automated Anti-Ban Used Car Price Scraper ---');
  
  const specs = await prisma.vehicleSpecification.findMany({
    include: {
      manufacturer: true,
      model: true
    }
  });

  console.log(`[Scraper] Found ${specs.length} unique specifications in database to update.`);

  let proxyIndex = 0;
  let browser: any = null;
  let context: any = null;
  let page: any = null;

  const initBrowser = async () => {
    if (browser) {
      await browser.close();
    }
    
    const proxyUrl = getNextProxy(proxyIndex++);
    const proxyConfig = proxyUrl ? { server: proxyUrl } : undefined;
    if (proxyConfig) {
      console.log(`[Scraper] Rotating IP. Using proxy server: ${proxyConfig.server}`);
    } else {
      console.log(`[Scraper] No proxy config. Using local IP.`);
    }

    browser = await chromium.launch({
      headless: true,
      proxy: proxyConfig,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-size=1280,800'
      ]
    });

    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    context = await browser.newContext({
      userAgent: userAgent,
      viewport: { width: 1280, height: 800 },
      locale: 'tr-TR',
      timezoneId: 'Europe/Istanbul'
    });

    page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
    });
  };

  await initBrowser();

  let count = 0;
  for (const spec of specs) {
    const brand = spec.manufacturer.name;
    const model = spec.model.name;
    const year = spec.year;
    
    console.log(`\n[Scraper] Processing [${++count}/${specs.length}]: ${year} ${brand} ${model}...`);
    
    // Periodically recreate browser and rotate proxies (every 15 requests) to prevent session fingerprinting
    if (count % 15 === 0) {
      console.log(`[Scraper] Routine session reset to clear browser footprints...`);
      await initBrowser();
    }

    let result = await scrapeCarPrice(page, brand, model, year);
    let finalTotal: number;
    let finalClean: number;
    let source = 'Scraped';

    if (!result) {
      console.log(`[Scraper] Web scraping blocked or returned empty. Using fallback Turkish Floor Model...`);
      const age = Math.max(0, 2026 - year);
      let basePrice2026 = 1400000;
      let floorPrice = 300000;
      
      const lowerBrand = brand.toLowerCase();
      const lowerModel = model.toLowerCase();

      if (lowerBrand.includes('porsche') || lowerBrand.includes('maserati') || lowerBrand.includes('ferrari') || lowerBrand.includes('bentley') || lowerBrand.includes('mclaren')) {
        basePrice2026 = 12000000; floorPrice = 2500000;
      } else if (lowerBrand.includes('mercedes') || lowerBrand.includes('bmw') || lowerBrand.includes('audi') || lowerBrand.includes('volvo') || lowerBrand.includes('tesla')) {
        basePrice2026 = 4000000; floorPrice = 850000;
      } else if (lowerBrand.includes('fiat') || lowerBrand.includes('dacia') || lowerBrand.includes('tata') || lowerBrand.includes('tofaş') || lowerModel.includes('clio')) {
        basePrice2026 = 800000; floorPrice = 180000;
      }
      
      finalTotal = Math.round(floorPrice + (basePrice2026 - floorPrice) * Math.pow(0.88, age));
      finalClean = Math.round(finalTotal * 1.05); // Clean is generally 5% higher than average containing pert listings
      source = 'Fallback Model';
    } else {
      finalTotal = result.totalAverage;
      finalClean = result.cleanAverage;
    }

    console.log(`[Scraper] Final Price for ${year} ${brand} ${model}: Total Avg: ${finalTotal.toLocaleString('tr-TR')} ₺, Clean Avg: ${finalClean.toLocaleString('tr-TR')} ₺ (${source})`);

    await prisma.vehicleMarketPrice.updateMany({
      where: { vehicleSpecificationId: spec.id },
      data: {
        currentMarketAverage: finalTotal,
        cleanMarketAverage: finalClean,
        averageListingPrice: Math.round(finalClean * 1.03),
        minPrice: Math.round(finalClean * 0.92),
        maxPrice: Math.round(finalClean * 1.08),
        scrapedAt: new Date()
      }
    });
    
    console.log(`[Scraper] Database updated for: ${brand} ${model} (${year})`);
    
    // Safe random jitter delay (1.5s - 3s)
    await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1500));
  }

  if (browser) {
    await browser.close();
  }
  console.log('\n--- Automated Scraper Completed! Database updated successfully ---');
}

// Allow direct execution
if (require.main === module) {
  runScraper()
    .catch((err) => console.error('[Scraper Error]:', err))
    .finally(async () => {
      await prisma.$disconnect();
    });
}
