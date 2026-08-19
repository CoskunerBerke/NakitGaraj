import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

async function runLiveTests() {
  console.log(`\n====================================================================`);
  console.log(`  PLAYWRIGHT CANLI BROWSER KABUL TESTLERİ (localhost:3000 & localhost:3001)`);
  console.log(`====================================================================\n`);

  const screenshotDir = path.resolve(__dirname, '../../../artifacts_screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  let test1Passed = false;
  let test2Passed = false;
  let test3Passed = false;
  let test4Passed = false;

  const screenshots: Record<string, string> = {};

  async function dismissModal() {
    await page.evaluate(() => {
      sessionStorage.setItem('preEval_firstName', 'Ahmet');
      sessionStorage.setItem('preEval_lastName', 'Yılmaz');
      sessionStorage.setItem('preEval_phone', '05551234567');
    });
    const skipBtn = page.locator('button[data-testid="welcome-skip-button"]');
    if (await skipBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await skipBtn.click({ force: true });
      await page.waitForTimeout(300);
    }
  }

  try {
    // ------------------------------------------------------------------------
    // TEST 1: BMW -> 2021 -> M2
    // ------------------------------------------------------------------------
    console.log('[TEST 1] BMW -> 2021 -> M2 Testi Başlatılıyor...');
    await page.goto('http://localhost:3000/degerleme', { waitUntil: 'networkidle' });
    await dismissModal();

    // Select Brand BMW
    const bmwBtn = page.locator('button[data-testid="brand-BMW"]');
    if (await bmwBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await bmwBtn.click();
    } else {
      await page.selectOption('select[data-testid="vehicle-brand"]', { label: 'BMW' });
    }
    await page.waitForTimeout(500);

    // Select Year 2021
    await page.selectOption('select[data-testid="vehicle-year"]', '2021');
    await page.waitForTimeout(1000);

    // Select Model M2
    await page.selectOption('select[data-testid="vehicle-model"]', { label: 'M2' });
    await page.waitForTimeout(1000);

    // Verify "Seçim tamamlandı" is NOT visible before selecting motor
    const isCompletedBeforeMotor = await page.locator('text=✓ SEÇİM TAMAMLANDI').isVisible();
    console.log(`- Motor seçilmeden "Seçim tamamlandı" rozeti görünüyor mu?: ${isCompletedBeforeMotor} (Beklenen: false)`);

    // Verify motor options in combobox
    const motorComboboxTrigger = page.locator('button[data-testid="trigger-vehicle-engine"]');
    await page.waitForSelector('button[data-testid="trigger-vehicle-engine"]:not([disabled])', { timeout: 10000 });
    await motorComboboxTrigger.click();
    await page.waitForTimeout(500);

    const m2Options = await page.locator('button:has-text("M2")').allInnerTexts();
    console.log(`- BMW 2021 M2 Motor Seçenekleri:`, m2Options);

    // Click "M2" or "M2 Competition"
    await page.locator('button:has-text("M2")').first().click();
    await page.waitForTimeout(500);

    // Verify "Seçim tamamlandı" is NOW visible
    const isCompletedAfterMotor = await page.locator('text=✓ SEÇİM TAMAMLANDI').isVisible();
    console.log(`- Motor seçildikten sonra "Seçim tamamlandı" rozeti görünüyor mu?: ${isCompletedAfterMotor} (Beklenen: true)`);

    // Click Step 1 Next Button
    await page.click('button[data-testid="step1-next-btn"]');
    await page.waitForTimeout(1000);

    // Fill Step 2 Form (License Plate, Mileage, Timeline, Desired Price)
    await page.fill('input[data-testid="vehicle-plate"]', '34ABC123');
    await page.fill('input[data-testid="vehicle-mileage"]', '45000');

    const timelineSelect = page.locator('select[data-testid="vehicle-timeline"]');
    if (await timelineSelect.isVisible().catch(() => false)) {
      await timelineSelect.selectOption({ index: 1 });
    }

    const priceInput = page.locator('input[data-testid="vehicle-desired-price"]');
    if (await priceInput.isVisible().catch(() => false)) {
      await priceInput.fill('1650000');
    }

    // Submit Step 2 Form
    console.log('- Step 2 Formu DTO Doğrulamasıyla Gönderiliyor...');
    let hasConsoleError = false;
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('must be longer than')) {
        hasConsoleError = true;
        console.error('! CONSOLE DTO ERROR:', msg.text());
      }
    });

    const submitBtn = page.locator('button[data-testid="vehicle-submit-btn"]').or(page.locator('button[type="submit"]')).first();
    await submitBtn.click();
    await page.waitForTimeout(3000);

    const isValuationSuccess = await page.locator('text=Önerilen').or(page.locator('text=Tahmini')).or(page.locator('text=Net')).isVisible();
    console.log(`- Değerleme Raporu Ekranı Başarıyla Geldi mi?: ${isValuationSuccess} (Console DTO Hatası Var mı?: ${hasConsoleError})`);

    const screenshot1Path = path.join(screenshotDir, 'playwright_test1_bmw2021m2.png');
    await page.screenshot({ path: screenshot1Path });
    screenshots['Test 1 (BMW 2021 M2)'] = screenshot1Path;
    test1Passed = !isCompletedBeforeMotor && isCompletedAfterMotor && m2Options.length > 0 && !hasConsoleError;
    console.log(`✓ TEST 1 SONUCU: ${test1Passed ? 'PASSED %100' : 'FAILED'}\n`);

    // ------------------------------------------------------------------------
    // TEST 2: Honda -> 2008 -> S2000
    // ------------------------------------------------------------------------
    console.log('[TEST 2] Honda -> 2008 -> S2000 Testi Başlatılıyor...');
    await page.goto('http://localhost:3000/degerleme', { waitUntil: 'networkidle' });
    await dismissModal();

    // Select Brand Honda
    const hondaBtn = page.locator('button[data-testid="brand-Honda"]');
    if (await hondaBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await hondaBtn.click();
    } else {
      await page.selectOption('select[data-testid="vehicle-brand"]', { label: 'Honda' });
    }
    await page.waitForTimeout(500);

    // Select Year 2008
    await page.selectOption('select[data-testid="vehicle-year"]', '2008');
    await page.waitForTimeout(1000);

    // Verify S2000 option exists in select[data-testid="vehicle-model"]
    const honda2008Models = await page.locator('select[data-testid="vehicle-model"] option').allInnerTexts();
    console.log(`- Honda 2008 Model Listesi (${honda2008Models.length} seçenek):`, honda2008Models);

    const hasS2000 = honda2008Models.some(m => m.includes('S2000'));
    console.log(`- Honda 2008 listesinde S2000 var mı?: ${hasS2000} (Beklenen: true)`);

    if (hasS2000) {
      await page.selectOption('select[data-testid="vehicle-model"]', { label: 'S2000' });
      await page.waitForTimeout(1000);
    }

    const screenshot2Path = path.join(screenshotDir, 'playwright_test2_honda2008s2000.png');
    await page.screenshot({ path: screenshot2Path });
    screenshots['Test 2 (Honda 2008 S2000)'] = screenshot2Path;
    test2Passed = hasS2000;
    console.log(`✓ TEST 2 SONUCU: ${test2Passed ? 'PASSED %100' : 'FAILED'}\n`);

    // ------------------------------------------------------------------------
    // TEST 3: Honda Year Change 2008 -> 2025 in same session
    // ------------------------------------------------------------------------
    console.log('[TEST 3] Honda Yılını 2008\'den 2025\'e Değiştirme Testi...');
    // Change Year to 2025
    await page.selectOption('select[data-testid="vehicle-year"]', '2025');
    await page.waitForTimeout(1000);

    const honda2025Models = await page.locator('select[data-testid="vehicle-model"] option').allInnerTexts();
    console.log(`- Honda 2025 Model Listesi (${honda2025Models.length} seçenek):`, honda2025Models);

    const hasPrelude = honda2025Models.some(m => m.includes('Prelude'));
    console.log(`- Honda 2025 listesinde Prelude var mı?: ${hasPrelude}`);

    const screenshot3Path = path.join(screenshotDir, 'playwright_test3_honda2025change.png');
    await page.screenshot({ path: screenshot3Path });
    screenshots['Test 3 (Honda 2025 Change)'] = screenshot3Path;
    test3Passed = honda2025Models.length > 0;
    console.log(`✓ TEST 3 SONUCU: ${test3Passed ? 'PASSED %100' : 'FAILED'}\n`);

    // ------------------------------------------------------------------------
    // TEST 4: Audi -> 2016 -> A3
    // ------------------------------------------------------------------------
    console.log('[TEST 4] Audi -> 2016 -> A3 Temiz Model Testi...');
    await page.goto('http://localhost:3000/degerleme', { waitUntil: 'networkidle' });
    await dismissModal();

    // Select Brand Audi
    const audiBtn = page.locator('button[data-testid="brand-Audi"]');
    if (await audiBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await audiBtn.click();
    } else {
      await page.selectOption('select[data-testid="vehicle-brand"]', { label: 'Audi' });
    }
    await page.waitForTimeout(500);

    // Select Year 2016
    await page.selectOption('select[data-testid="vehicle-year"]', '2016');
    await page.waitForTimeout(1000);

    const audi2016Models = await page.locator('select[data-testid="vehicle-model"] option').allInnerTexts();
    console.log(`- Audi 2016 Model Listesi (${audi2016Models.length} seçenek):`, audi2016Models);

    const hasCleanA3 = audi2016Models.some(m => m.trim() === 'A3');
    const hasBadA3 = audi2016Models.some(m => m.includes('A3 A3 Sportback') || m.includes('1.5 TFSI'));
    console.log(`- Temiz 'A3' seçeneği var mı?: ${hasCleanA3} (Beklenen: true)`);
    console.log(`- Bozuk 'A3 A3 Sportback 1.5 TFSI' seçeneği var mı?: ${hasBadA3} (Beklenen: false)`);

    await page.selectOption('select[data-testid="vehicle-model"]', { label: 'A3' });
    await page.waitForTimeout(1000);

    const screenshot4Path = path.join(screenshotDir, 'playwright_test4_audi2016a3.png');
    await page.screenshot({ path: screenshot4Path });
    screenshots['Test 4 (Audi 2016 A3)'] = screenshot4Path;
    test4Passed = hasCleanA3 && !hasBadA3;
    console.log(`✓ TEST 4 SONUCU: ${test4Passed ? 'PASSED %100' : 'FAILED'}\n`);

  } catch (err) {
    console.error('Playwright Test Error:', err);
  } finally {
    await browser.close();
  }

  console.log(`====================================================================`);
  console.log(`  PLAYWRIGHT CANLI TEST SONUÇLARI ÖZETİ`);
  console.log(`====================================================================`);
  console.log(`- Test 1 (BMW 2021 M2): ${test1Passed ? 'PASSED ✓' : 'FAILED ❌'}`);
  console.log(`- Test 2 (Honda 2008 S2000): ${test2Passed ? 'PASSED ✓' : 'FAILED ❌'}`);
  console.log(`- Test 3 (Honda 2025 Yıl Değişimi): ${test3Passed ? 'PASSED ✓' : 'FAILED ❌'}`);
  console.log(`- Test 4 (Audi 2016 A3 Temiz Model): ${test4Passed ? 'PASSED ✓' : 'FAILED ❌'}`);
  console.log(`- Ekran Görüntüleri Dizin Yolu: ${screenshotDir}\n`);
}

runLiveTests().catch(console.error);
