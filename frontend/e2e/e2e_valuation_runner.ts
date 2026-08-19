import { chromium } from 'playwright';

async function runE2ETest() {
  console.log(`\n====================================================================`);
  console.log(`  PLAYWRIGHT GERÇEK TARAYICI E2E DEĞERLEME AKIŞ TESTİ`);
  console.log(`====================================================================\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', async (msg) => {
    const args = await Promise.all(msg.args().map(arg => arg.jsonValue().catch(() => arg.toString())));
    console.log(`[BROWSER LOG ${msg.type().toUpperCase()}]`, ...args);
  });

  let postResponseStatus = 0;
  let responsePayload: any = null;

  page.on('response', async (response: any) => {
    if (response.url().includes('/api/vehicle-evaluation') && response.request().method() === 'POST') {
      postResponseStatus = response.status();
      try {
        responsePayload = await response.json();
      } catch (e) {}
      console.log(`- [E2E NETWORK INTERCEPT] POST /api/vehicle-evaluation Status: ${postResponseStatus}`);
    }
  });

  try {
    // 1. Navigate to valuation page
    console.log(`- 1. http://localhost:3000/degerleme sayfasına gidiliyor...`);
    await page.goto('http://localhost:3000/degerleme', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Bypass initial welcome-modal if visible
    const welcomeModal = page.locator('[data-testid="welcome-modal"]').first();
    if (await welcomeModal.isVisible()) {
      console.log(`- Müşteri Bilgileri Welcome Modalı Dolduruluyor...`);
      await page.fill('[data-testid="welcome-first-name"]', 'Ahmet');
      await page.fill('[data-testid="welcome-last-name"]', 'Yılmaz');
      await page.fill('[data-testid="welcome-phone"]', '05321234567');
      await page.click('[data-testid="welcome-continue-button"]');
      await page.waitForTimeout(1000);
    }

    // Step 1: Select Brand (BMW)
    console.log(`- 2. Marka Seçiliyor: BMW...`);
    const brandSelect = page.locator('select[data-testid="vehicle-brand"]').first();
    await brandSelect.waitFor({ state: 'attached', timeout: 10000 });
    
    const bmwOptValue = await brandSelect.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase() === 'bmw');
      return opt ? opt.value : '';
    });
    console.log(`- BMW Option ID: ${bmwOptValue}`);
    await brandSelect.selectOption(bmwOptValue);
    await page.waitForTimeout(1000);

    // Step 2: Select Model Year (2014)
    console.log(`- 3. Yıl Seçiliyor: 2014...`);
    const yearSelect = page.locator('select[data-testid="vehicle-year"]:not([disabled])').first();
    await yearSelect.waitFor({ state: 'attached', timeout: 10000 });
    await yearSelect.selectOption('2014');
    await page.waitForTimeout(1000);

    // Step 3: Select Model (3 Serisi)
    console.log(`- 4. Model Seçiliyor: 3 Serisi...`);
    const modelSelect = page.locator('select[data-testid="vehicle-model"]:not([disabled])').first();
    await modelSelect.waitFor({ state: 'attached', timeout: 10000 });
    
    const modelOptValue = await modelSelect.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase().includes('3 serisi'));
      return opt ? opt.value : '';
    });
    console.log(`- 3 Serisi Option ID: ${modelOptValue}`);
    await modelSelect.selectOption(modelOptValue);
    await page.waitForTimeout(1500); // Allow async API fetch for variants

    // Step 4: Select Engine / Variant (316i)
    console.log(`- 5. Motor/Versiyon Seçiliyor: 316i...`);
    const engineSelect = page.locator('select[data-testid="vehicle-engine"]:not([disabled])').first();
    await engineSelect.waitFor({ state: 'attached', timeout: 10000 });
    
    const engValue = await engineSelect.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase().includes('316i'));
      return opt ? opt.value : sel.options[1]?.value || '';
    });
    console.log(`- 316i Engine Option ID: ${engValue}`);
    await engineSelect.selectOption(engValue);
    await page.waitForTimeout(1500); // Allow async API fetch for packages

    // Step 5: Select Package (M Sport)
    console.log(`- 6. Paket Seçiliyor: M Sport...`);
    const trimSelect = page.locator('select[data-testid="vehicle-trim"]:not([disabled])').first();
    await trimSelect.waitFor({ state: 'attached', timeout: 10000 });
    
    const trimValue = await trimSelect.evaluate((sel: HTMLSelectElement) => {
      const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase().includes('m sport'));
      return opt ? opt.value : sel.options[1]?.value || '';
    });
    console.log(`- M Sport Trim Option ID: ${trimValue}`);
    await trimSelect.selectOption(trimValue);
    await page.waitForTimeout(1000);

    // Step 2 Form Navigation
    console.log(`- 7. Adım 2 Formuna Geçiliyor...`);
    const nextBtn = page.locator('button[data-testid="step1-next-btn"]').first();
    await nextBtn.waitFor({ state: 'visible', timeout: 5000 });
    await nextBtn.click();
    await page.waitForTimeout(1000);

    // Fill Step 2 Form Fields
    console.log(`- 8. Plaka, Km, Renk, Satış Süresi ve İstenen Fiyat Bilgileri Dolduruluyor...`);
    
    // License Plate
    const plateInput = page.locator('input[data-testid="vehicle-plate"]').first();
    await plateInput.fill('34ABC123');

    // Mileage
    const kmInput = page.locator('input[data-testid="vehicle-mileage"]').first();
    await kmInput.fill('80000');

    // Color
    const colorSelect = page.locator('select[data-testid="vehicle-color"]').first();
    await colorSelect.selectOption('Beyaz');

    // Selling Timeline
    const timelineSelect = page.locator('select[data-testid="vehicle-timeline"]').first();
    await timelineSelect.selectOption('1_week');

    // User Desired Price
    const priceInput = page.locator('input[data-testid="vehicle-desired-price"]').or(page.locator('input[name="userDesiredPrice"]')).first();
    if (await priceInput.isVisible()) {
      await priceInput.fill('1750000');
    }

    // Customer Contact Details (Ad, Soyad, Telefon)
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

    // Check KVKK Consent Box
    console.log(`- 9. KVKK Onay Kutusu İşaretleniyor...`);
    const kvkkCheck = page.locator('input[data-testid="vehicle-kvkk-checkbox"]').first();
    await kvkkCheck.check();
    await page.waitForTimeout(500);

    // Click "Değerleme Hesapla" button WITHOUT force: true
    console.log(`- 10. Değerleme Hesapla Butonuna Doğal (force:false) Tıklanıyor...`);
    const submitBtn = page.locator('button[data-testid="vehicle-submit-button"]').first();
    await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
    
    // Natural click without force: true
    await submitBtn.click();

    // Wait for POST /api/vehicle-evaluation
    console.log(`- 11. POST /api/vehicle-evaluation Yanıtı Bekleniyor...`);
    await page.waitForResponse(
      (res: any) => res.url().includes('/api/vehicle-evaluation') && res.request().method() === 'POST',
      { timeout: 15000 }
    );

    console.log(`- POST HTTP Yanıt Kodu: ${postResponseStatus} (Beklenen: 201)`);
    console.log(`- Hesaplanan FMV: ${responsePayload?.results?.fairMarketValue?.toLocaleString('tr-TR')} TL`);
    console.log(`- Nakit Teklif: ${responsePayload?.results?.cashOffer?.toLocaleString('tr-TR')} TL`);

    // Verify Result Card is displayed
    await page.waitForTimeout(2000);
    const resultHeader = page.locator('text=Tahmini Piyasa Değeri').or(page.locator('text=Nakit Teklif')).or(page.locator('text=Fiyatlandırma Özeti')).or(page.locator('text=Emsal İlanlar'));
    const isResultVisible = await resultHeader.isVisible();

    console.log(`- Değerleme Sonuç Kartı Açıldı mı: ${isResultVisible ? '✅ EVET' : '❌ HAYIR'}`);

    const isSuccess = postResponseStatus === 201 && isResultVisible;
    if (isSuccess) {
      console.log(`\n====================================================================`);
      console.log(`✅ GERÇEK TARAYICI PLAYWRIGHT E2E TESTİ BAŞARIYLA TAMAMLANDI (HTTP 201)!`);
      console.log(`====================================================================\n`);
    } else {
      console.log(`\n❌ PLAYWRIGHT TESTİ BAŞARISIZ!`);
    }

  } catch (err: any) {
    console.error(`❌ E2E HATA: ${err.message}`);
  } finally {
    await browser.close();
  }
}

runE2ETest();
