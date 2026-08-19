import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

async function run4CarsPlaywright() {
  console.log(`\n====================================================================`);
  console.log(`  4 EKSİKSİZ REGRESYON ARACI İÇİN GERÇEK BROWSER PLAYWRIGHT E2E TESTİ`);
  console.log(`  (BMW 2014 316i, AUDI A6 2025, HONDA CITY 2022, FORD ESCORT 1997)`);
  console.log(`====================================================================\n`);

  const screenshotDir = path.resolve(__dirname, '../../../artifacts_screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  page.on('console', async (msg) => {
    const args = await Promise.all(msg.args().map(arg => arg.jsonValue().catch(() => arg.toString())));
    if (msg.type() === 'error') {
      console.log(`[BROWSER CONSOLE ERROR]`, ...args);
    }
  });

  const apiLogs: Record<string, any> = {};

  page.on('response', async (response: any) => {
    const url = response.url();
    if (url.includes('/api/variants') || url.includes('/api/packages') || url.includes('/api/vehicle-evaluation')) {
      try {
        const data = await response.json();
        const key = `${response.request().method()} ${url.split('/api/')[1]}`;
        apiLogs[key] = { status: response.status(), data };
        console.log(`- [API RESPONSE INTERCEPT] ${key} -> Status: ${response.status()}`);
      } catch (e) {}
    }
  });

  async function bypassWelcomeModal() {
    await page.waitForTimeout(1000);
    const welcomeModal = page.locator('[data-testid="welcome-modal"]').first();
    if (await welcomeModal.isVisible()) {
      console.log(`  * Müşteri Bilgileri Welcome Modalı Dolduruluyor...`);
      await page.fill('[data-testid="welcome-first-name"]', 'Ahmet');
      await page.fill('[data-testid="welcome-last-name"]', 'Yılmaz');
      await page.fill('[data-testid="welcome-phone"]', '05321234567');
      await page.click('[data-testid="welcome-continue-button"]');
      await page.waitForTimeout(1000);
    }
  }

  async function fillStep2Form(plate: string, km: string, color: string, price: string) {
    await page.fill('input[data-testid="vehicle-plate"]', plate);
    await page.fill('input[data-testid="vehicle-mileage"]', km);
    await page.selectOption('select[data-testid="vehicle-color"]', color);
    await page.selectOption('select[data-testid="vehicle-timeline"]', '1_week');
    
    const priceInput = page.locator('input[data-testid="vehicle-desired-price"]').or(page.locator('input[name="userDesiredPrice"]')).first();
    if (await priceInput.isVisible()) {
      await priceInput.fill(price);
    }

    // Fill contact details if step 2 requests them
    const fnameInput = page.locator('input[data-testid="step2-first-name"]').or(page.locator('input[placeholder="Adınız"]')).first();
    if (await fnameInput.isVisible()) {
      await fnameInput.fill('Ahmet');
    }
    const lnameInput = page.locator('input[data-testid="step2-last-name"]').or(page.locator('input[placeholder="Soyadınız"]')).first();
    if (await lnameInput.isVisible()) {
      await lnameInput.fill('Yılmaz');
    }
    const phoneInput = page.locator('input[data-testid="step2-phone"]').or(page.locator('input[placeholder*="05xx"]')).first();
    if (await phoneInput.isVisible()) {
      await phoneInput.fill('05321234567');
    }

    await page.check('input[data-testid="vehicle-kvkk-checkbox"]');
    await page.waitForTimeout(500);
  }

  const results: Record<string, boolean> = {};

  try {
    // ------------------------------------------------------------------------
    // 1. BMW 2014 3 Serisi 316i M Sport
    // ------------------------------------------------------------------------
    console.log(`\n[1/4 TEST] BMW 2014 3 Serisi 316i M Sport Panel Akışı...`);
    await page.goto('http://localhost:3000/degerleme', { waitUntil: 'domcontentloaded' });
    await bypassWelcomeModal();

    const brandSelect = page.locator('select[data-testid="vehicle-brand"]').first();
    await brandSelect.waitFor({ state: 'attached', timeout: 10000 });
    const bmwVal = await brandSelect.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase() === 'bmw');
      return opt ? opt.value : '';
    });
    await brandSelect.selectOption(bmwVal);
    await page.waitForTimeout(1000);

    const yearSelect = page.locator('select[data-testid="vehicle-year"]:not([disabled])').first();
    await yearSelect.waitFor({ state: 'attached', timeout: 10000 });
    await yearSelect.selectOption('2014');
    await page.waitForTimeout(1000);

    const modelSelect = page.locator('select[data-testid="vehicle-model"]:not([disabled])').first();
    await modelSelect.waitFor({ state: 'attached', timeout: 10000 });
    const modelVal = await modelSelect.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase().includes('3 serisi'));
      return opt ? opt.value : '';
    });
    await modelSelect.selectOption(modelVal);
    await page.waitForTimeout(1500);

    const engineSelect = page.locator('select[data-testid="vehicle-engine"]:not([disabled])').first();
    await engineSelect.waitFor({ state: 'attached', timeout: 10000 });
    const engVal = await engineSelect.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase().includes('316i'));
      return opt ? opt.value : sel.options[1]?.value || '';
    });
    await engineSelect.selectOption(engVal);
    await page.waitForTimeout(1500);

    const trimSelect = page.locator('select[data-testid="vehicle-trim"]:not([disabled])').first();
    await trimSelect.waitFor({ state: 'attached', timeout: 10000 });
    const trimVal = await trimSelect.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase().includes('m sport'));
      return opt ? opt.value : sel.options[1]?.value || '';
    });
    await trimSelect.selectOption(trimVal);
    await page.waitForTimeout(1000);

    await page.click('button[data-testid="step1-next-btn"]');
    await page.waitForTimeout(1000);

    await fillStep2Form('34ABC123', '80000', 'Beyaz', '1750000');

    const submitBtn1 = page.locator('button[data-testid="vehicle-submit-button"]').first();
    await submitBtn1.click();
    
    const res1 = await page.waitForResponse(
      (res: any) => res.url().includes('/api/vehicle-evaluation') && res.request().method() === 'POST',
      { timeout: 25000 }
    );
    const status1 = res1.status();
    const payload1 = await res1.json();

    console.log(`  * POST HTTP Yanıt Kodu: ${status1}`);
    console.log(`  * FMV: ${payload1?.results?.fairMarketValue?.toLocaleString('tr-TR')} TL | Nakit: ${payload1?.results?.cashOffer?.toLocaleString('tr-TR')} TL`);

    const screen1Path = path.join(screenshotDir, 'playwright_bmw_2014_316i.png');
    await page.screenshot({ path: screen1Path, fullPage: true });
    results['BMW 2014 316i M Sport'] = status1 === 201;


    // ------------------------------------------------------------------------
    // 2. Audi A6 2025 40 TDI Quattro Advanced
    // ------------------------------------------------------------------------
    console.log(`\n[2/4 TEST] Audi A6 2025 40 TDI Quattro Advanced Panel Akışı...`);
    await page.goto('http://localhost:3000/degerleme', { waitUntil: 'domcontentloaded' });
    await bypassWelcomeModal();

    await brandSelect.waitFor({ state: 'attached', timeout: 10000 });
    const audiVal = await brandSelect.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase() === 'audi');
      return opt ? opt.value : '';
    });
    await brandSelect.selectOption(audiVal);
    await page.waitForTimeout(1000);

    const yearSelect2 = page.locator('select[data-testid="vehicle-year"]:not([disabled])').first();
    await yearSelect2.waitFor({ state: 'attached', timeout: 10000 });
    await yearSelect2.selectOption('2025');
    await page.waitForTimeout(1000);

    const modelSelect2 = page.locator('select[data-testid="vehicle-model"]:not([disabled])').first();
    await modelSelect2.waitFor({ state: 'attached', timeout: 10000 });
    const audiModelVal = await modelSelect2.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toUpperCase() === 'A6');
      return opt ? opt.value : '';
    });
    await modelSelect2.selectOption(audiModelVal);
    await page.waitForTimeout(1500);

    const engineSelect2 = page.locator('select[data-testid="vehicle-engine"]:not([disabled])').first();
    await engineSelect2.waitFor({ state: 'attached', timeout: 10000 });
    const audiEngVal = await engineSelect2.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase().includes('40 tdi'));
      return opt ? opt.value : sel.options[1]?.value || '';
    });
    await engineSelect2.selectOption(audiEngVal);
    await page.waitForTimeout(1500);

    const trimSelect2 = page.locator('select[data-testid="vehicle-trim"]:not([disabled])').first();
    await trimSelect2.waitFor({ state: 'attached', timeout: 10000 });
    const audiTrimVal = await trimSelect2.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase().includes('advanced'));
      return opt ? opt.value : sel.options[1]?.value || '';
    });
    await trimSelect2.selectOption(audiTrimVal);
    await page.waitForTimeout(1000);

    await page.click('button[data-testid="step1-next-btn"]');
    await page.waitForTimeout(1000);

    await fillStep2Form('34ABC123', '30000', 'Siyah', '4200000');

    const submitBtn2 = page.locator('button[data-testid="vehicle-submit-button"]').first();
    await submitBtn2.click();

    const res2 = await page.waitForResponse(
      (res: any) => res.url().includes('/api/vehicle-evaluation') && res.request().method() === 'POST',
      { timeout: 25000 }
    );
    const status2 = res2.status();
    const payload2 = await res2.json();

    console.log(`  * POST HTTP Yanıt Kodu: ${status2}`);
    console.log(`  * FMV: ${payload2?.results?.fairMarketValue?.toLocaleString('tr-TR')} TL | Nakit: ${payload2?.results?.cashOffer?.toLocaleString('tr-TR')} TL`);

    const screen2Path = path.join(screenshotDir, 'playwright_audi_2025_a6.png');
    await page.screenshot({ path: screen2Path, fullPage: true });
    results['Audi A6 2025 40 TDI Advanced'] = status2 === 201;


    // ------------------------------------------------------------------------
    // 3. Honda City 2022 1.5 i-VTEC Executive
    // ------------------------------------------------------------------------
    console.log(`\n[3/4 TEST] Honda City 2022 1.5 i-VTEC Executive Panel Akışı...`);
    await page.goto('http://localhost:3000/degerleme', { waitUntil: 'domcontentloaded' });
    await bypassWelcomeModal();

    await brandSelect.waitFor({ state: 'attached', timeout: 10000 });
    const hondaVal = await brandSelect.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase() === 'honda');
      return opt ? opt.value : '';
    });
    await brandSelect.selectOption(hondaVal);
    await page.waitForTimeout(1000);

    const yearSelect3 = page.locator('select[data-testid="vehicle-year"]:not([disabled])').first();
    await yearSelect3.waitFor({ state: 'attached', timeout: 10000 });
    await yearSelect3.selectOption('2022');
    await page.waitForTimeout(1000);

    const modelSelect3 = page.locator('select[data-testid="vehicle-model"]:not([disabled])').first();
    await modelSelect3.waitFor({ state: 'attached', timeout: 10000 });
    const hondaModelVal = await modelSelect3.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase().includes('city'));
      return opt ? opt.value : '';
    });
    await modelSelect3.selectOption(hondaModelVal);
    await page.waitForTimeout(1500);

    const engineSelect3 = page.locator('select[data-testid="vehicle-engine"]:not([disabled])').first();
    await engineSelect3.waitFor({ state: 'attached', timeout: 10000 });
    
    const hondaEngines = await engineSelect3.evaluate((sel: HTMLSelectElement) => Array.from(sel.options).map(o => o.text));
    console.log(`  * Honda City Panel Motor Seçenekleri:`, hondaEngines);

    const hondaEngVal = await engineSelect3.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase().includes('1.5 i-vtec'));
      return opt ? opt.value : sel.options[1]?.value || '';
    });
    await engineSelect3.selectOption(hondaEngVal);
    await page.waitForTimeout(1500);

    const trimSelect3 = page.locator('select[data-testid="vehicle-trim"]:not([disabled])').first();
    await trimSelect3.waitFor({ state: 'attached', timeout: 10000 });
    
    const hondaPackages = await trimSelect3.evaluate((sel: HTMLSelectElement) => Array.from(sel.options).map(o => o.text));
    console.log(`  * Honda City Panel Paket Seçenekleri:`, hondaPackages);

    const hondaTrimVal = await trimSelect3.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase().includes('executive'));
      return opt ? opt.value : sel.options[1]?.value || '';
    });
    await trimSelect3.selectOption(hondaTrimVal);
    await page.waitForTimeout(1000);

    await page.click('button[data-testid="step1-next-btn"]');
    await page.waitForTimeout(1000);

    await fillStep2Form('34ABC123', '40000', 'Beyaz', '950000');

    const submitBtn3 = page.locator('button[data-testid="vehicle-submit-button"]').first();
    await submitBtn3.click();

    const res3 = await page.waitForResponse(
      (res: any) => res.url().includes('/api/vehicle-evaluation') && res.request().method() === 'POST',
      { timeout: 25000 }
    );
    const status3 = res3.status();
    const payload3 = await res3.json();

    console.log(`  * POST HTTP Yanıt Kodu: ${status3}`);
    console.log(`  * FMV: ${payload3?.results?.fairMarketValue?.toLocaleString('tr-TR')} TL | Nakit: ${payload3?.results?.cashOffer?.toLocaleString('tr-TR')} TL`);

    const screen3Path = path.join(screenshotDir, 'playwright_honda_2022_city.png');
    await page.screenshot({ path: screen3Path, fullPage: true });
    results['Honda City 2022 1.5 i-VTEC Executive'] = status3 === 201;


    // ------------------------------------------------------------------------
    // 4. Ford Escort 1997 1.6 CLX
    // ------------------------------------------------------------------------
    console.log(`\n[4/4 TEST] Ford Escort 1997 1.6 CLX Panel Akışı...`);
    await page.goto('http://localhost:3000/degerleme', { waitUntil: 'domcontentloaded' });
    await bypassWelcomeModal();

    await brandSelect.waitFor({ state: 'attached', timeout: 10000 });
    const fordVal = await brandSelect.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase() === 'ford');
      return opt ? opt.value : '';
    });
    await brandSelect.selectOption(fordVal);
    await page.waitForTimeout(2000);

    const yearSelect4 = page.locator('select[data-testid="vehicle-year"]:not([disabled])').first();
    await yearSelect4.waitFor({ state: 'attached', timeout: 10000 });
    await page.waitForTimeout(1000);
    await yearSelect4.selectOption('1997');
    await page.waitForTimeout(2000);




    const modelSelect4 = page.locator('select[data-testid="vehicle-model"]:not([disabled])').first();
    await modelSelect4.waitFor({ state: 'attached', timeout: 10000 });
    const fordModelVal = await modelSelect4.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase().includes('escort'));
      return opt ? opt.value : '';
    });
    await modelSelect4.selectOption(fordModelVal);
    await page.waitForTimeout(1500);

    const engineSelect4 = page.locator('select[data-testid="vehicle-engine"]:not([disabled])').first();
    await engineSelect4.waitFor({ state: 'attached', timeout: 10000 });
    
    const fordEngines = await engineSelect4.evaluate((sel: HTMLSelectElement) => Array.from(sel.options).map(o => o.text));
    console.log(`  * Ford Escort Panel Motor Seçenekleri:`, fordEngines);

    const fordEngVal = await engineSelect4.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase().includes('1.6'));
      return opt ? opt.value : sel.options[1]?.value || '';
    });
    await engineSelect4.selectOption(fordEngVal);
    await page.waitForTimeout(1500);

    const trimSelect4 = page.locator('select[data-testid="vehicle-trim"]:not([disabled])').first();
    await trimSelect4.waitFor({ state: 'attached', timeout: 10000 });
    
    const fordPackages = await trimSelect4.evaluate((sel: HTMLSelectElement) => Array.from(sel.options).map(o => o.text));
    console.log(`  * Ford Escort Panel Paket Seçenekleri:`, fordPackages);

    const fordTrimVal = await trimSelect4.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase().includes('clx'));
      return opt ? opt.value : sel.options[1]?.value || '';
    });
    await trimSelect4.selectOption(fordTrimVal);
    await page.waitForTimeout(1000);

    await page.click('button[data-testid="step1-next-btn"]');
    await page.waitForTimeout(1000);

    await fillStep2Form('34ABC123', '180000', 'Kırmızı', '220000');

    const submitBtn4 = page.locator('button[data-testid="vehicle-submit-button"]').first();
    await submitBtn4.click();

    const res4 = await page.waitForResponse(
      (res: any) => res.url().includes('/api/vehicle-evaluation') && res.request().method() === 'POST',
      { timeout: 25000 }
    );
    const status4 = res4.status();
    const payload4 = await res4.json();

    console.log(`  * POST HTTP Yanıt Kodu: ${status4}`);
    console.log(`  * FMV: ${payload4?.results?.fairMarketValue?.toLocaleString('tr-TR')} TL | Nakit: ${payload4?.results?.cashOffer?.toLocaleString('tr-TR')} TL`);

    const screen4Path = path.join(screenshotDir, 'playwright_ford_1997_escort.png');
    await page.screenshot({ path: screen4Path, fullPage: true });
    results['Ford Escort 1997 1.6 CLX'] = status4 === 201;

  } catch (err: any) {
    console.error(`❌ PLAYWRIGHT TEST HATA:`, err.message);
  } finally {
    await browser.close();
  }

  console.log(`\n====================================================================`);
  console.log(`  4 REGRESYON ARAÇ PLAYWRIGHT E2E CANLI TEST SONUÇLARI`);
  console.log(`====================================================================`);
  for (const [carName, isPassed] of Object.entries(results)) {
    console.log(`- ${carName}: ${isPassed ? '✅ PASSED (HTTP 201 Created)' : '❌ FAILED'}`);
  }
  console.log(`- Ekran Görüntüleri Dizin Yolu: ${screenshotDir}\n`);

  console.log(`====================================================================`);
  console.log(`  YAKALANAN API YANITLARI LOGU (INTERCEPTED API RESPONSES)`);
  console.log(`====================================================================`);
  for (const [endpoint, logData] of Object.entries(apiLogs)) {
    console.log(`\n[API ENDPOINT] ${endpoint} (Status ${logData.status}):`);
    console.log(JSON.stringify(logData.data, null, 2).slice(0, 500) + '...');
  }
}

run4CarsPlaywright().catch(console.error);
