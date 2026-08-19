import { test, expect } from '@playwright/test';

test.describe('NakitGaraj Değerleme E2E Gerçek Tarayıcı Akış Testi', () => {
  test('Araç seçimi, kullanıcı ve araç bilgileri girilip Değerleme Hesapla butonuna force:true olmadan tıklanır, HTTP 201 ve sonuç kartı doğrulanır', async ({ page }) => {
    // Enable request interception to catch POST /api/vehicle-evaluation
    let postResponseStatus = 0;
    page.on('response', (response) => {
      if (response.url().includes('/api/vehicle-evaluation') && response.request().method() === 'POST') {
        postResponseStatus = response.status();
        console.log(`[E2E INTERCEPT] POST /api/vehicle-evaluation Status: ${postResponseStatus}`);
      }
    });

    // 1. Navigate to valuation page
    await page.goto('http://localhost:3000/degerleme', { waitUntil: 'networkidle' });

    // Handle initial user modal if present
    const modalInput = page.locator('input[placeholder*="Adınız"]').or(page.locator('input[name="firstName"]'));
    if (await modalInput.isVisible()) {
      console.log('[E2E] Müşteri Bilgileri Modalı Dolduruluyor...');
      await page.fill('input[placeholder*="Adınız"]', 'Ahmet');
      await page.fill('input[placeholder*="Soyadınız"]', 'Yılmaz');
      await page.fill('input[placeholder*="Telefon"]', '05321234567');
      await page.click('button:has-text("Devam Et")');
      await page.waitForTimeout(500);
    }

    // 2. Select Brand (BMW)
    console.log('[E2E] Marka Seçiliyor (BMW)...');
    await page.waitForSelector('button:has-text("BMW"), div:has-text("BMW")');
    const bmwButton = page.locator('button').filter({ hasText: /^BMW$/i }).first();
    await bmwButton.click();

    // 3. Select Year (2014)
    console.log('[E2E] Yıl Seçiliyor (2014)...');
    await page.waitForSelector('button:has-text("2014")');
    const yearButton = page.locator('button').filter({ hasText: /^2014$/i }).first();
    await yearButton.click();

    // 4. Select Model (3 Serisi)
    console.log('[E2E] Model Seçiliyor (3 Serisi)...');
    await page.waitForSelector('button:has-text("3 Serisi")');
    const modelButton = page.locator('button').filter({ hasText: /^3 Serisi$/i }).first();
    await modelButton.click();

    // 5. Select Variant (316i) if available
    const variantBtn = page.locator('button').filter({ hasText: /316i/i }).first();
    if (await variantBtn.isVisible()) {
      console.log('[E2E] Motor Seçiliyor (316i)...');
      await variantBtn.click();
    }

    // 6. Select Package (M Sport) if available
    const packageBtn = page.locator('button').filter({ hasText: /M Sport/i }).first();
    if (await packageBtn.isVisible()) {
      console.log('[E2E] Paket Seçiliyor (M Sport)...');
      await packageBtn.click();
    }

    // Proceed to Step 2 if "İleri" button is shown
    const nextStepBtn = page.locator('button:has-text("İleri")');
    if (await nextStepBtn.isVisible()) {
      await nextStepBtn.click();
      await page.waitForTimeout(500);
    }

    // 7. Fill Vehicle Details in Form Step 2
    console.log('[E2E] Araç Detayları Dolduruluyor...');
    
    // License Plate
    const plateInput = page.locator('input[name="licensePlate"]').or(page.locator('input[placeholder*="34"]'));
    await plateInput.fill('34ABC123');

    // Mileage
    const kmInput = page.locator('input[name="mileage"]').or(page.locator('input[placeholder*="80"]'));
    await kmInput.fill('80000');

    // Color (Select 'Beyaz' or first option)
    const colorSelect = page.locator('select[name="color"]').or(page.locator('select:has-text("Beyaz")'));
    if (await colorSelect.isVisible()) {
      await colorSelect.selectOption({ label: 'Beyaz' });
    }

    // Selling timeline / Desired Price if needed
    const priceInput = page.locator('input[name="userDesiredPrice"]');
    if (await priceInput.isVisible()) {
      await priceInput.fill('1700000');
    }

    // Check KVKK Consent Box
    console.log('[E2E] KVKK Onay Kutusu İşaretleniyor...');
    const kvkkCheckbox = page.locator('input[type="checkbox"]');
    if (await kvkkCheckbox.isVisible()) {
      await kvkkCheckbox.check();
    }

    // 8. Click "Değerleme Hesapla" button WITHOUT force: true!
    console.log('[E2E] Değerleme Hesapla Butonuna Tıklanıyor (Natural click)...');
    const submitBtn = page.locator('button:has-text("Değerleme Hesapla"), button:has-text("Hesapla")').first();
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click(); // Natural click without force: true

    // 9. Wait for POST response 201
    await page.waitForResponse(
      res => res.url().includes('/api/vehicle-evaluation') && res.request().method() === 'POST',
      { timeout: 15000 }
    );

    expect(postResponseStatus).toBe(201);
    console.log('✅ POST /api/vehicle-evaluation HTTP Status 201 Başarıyla Alındı!');

    // 10. Verify Valuation Result Card is displayed
    console.log('[E2E] Sonuç Kartı Doğrulanıyor...');
    await page.waitForSelector('text=Piyasa Değeri, text=Nakit Teklif, text=TL', { timeout: 10000 });

    // Verify NO error card is present
    const errorCard = page.locator('text=Hata Oluştu, text=Runtime Error, text=500 Internal Server Error');
    await expect(errorCard).not.toBeVisible();

    console.log('✅ GERÇEK TARAYICI PLAYWRIGHT E2E TESTİ %100 BAŞARILI OLDU!');
  });
});
