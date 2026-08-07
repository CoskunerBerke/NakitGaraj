const { chromium } = require('playwright');

(async () => {
  console.log('=== RUNNING VEHICLE SELECTION PANEL & CONSIGNMENT MODEL ACCEPTANCE TEST ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const totalTimeout = setTimeout(() => {
    console.error('TEST TIMEOUT: Total execution exceeded 60 seconds');
    process.exit(1);
  }, 60000);

  try {
    const startTime = Date.now();
    console.log('[1/7] Navigating to http://localhost:3000/degerleme...');
    await page.goto('http://localhost:3000/degerleme', { timeout: 15000 });

    // Handle Contact Welcome Modal if open
    try {
      const welcomeModal = page.getByTestId('welcome-modal');
      if (await welcomeModal.isVisible({ timeout: 4000 })) {
        console.log('Filling Welcome Contact Modal...');
        await page.getByTestId('welcome-first-name').fill('Test');
        await page.getByTestId('welcome-last-name').fill('Kullanıcı');
        await page.getByTestId('welcome-phone').fill('05301234567');
        await page.getByTestId('welcome-continue-button').click();
        await welcomeModal.waitFor({ state: 'hidden', timeout: 5000 });
        console.log('✓ Welcome Contact Modal completed and closed');
      }
    } catch (e) {
      console.log('No Welcome Modal presented or skipped.');
    }

    // Step 1: Select Brand (BMW)
    console.log('[2/7] Selecting Brand (BMW), Year (2015), Model (3 Serisi)...');
    await page.waitForSelector('[data-testid="brand-BMW"]', { timeout: 10000 });
    await page.getByTestId('brand-BMW').click();

    // Select Year (2015)
    await page.waitForSelector('select', { timeout: 5000 });
    const yearSelect = page.locator('select').first();
    await yearSelect.selectOption('2015');

    // Select Model (3 Serisi)
    const modelCard = page.locator('button', { hasText: '3 Serisi' }).first();
    await modelCard.waitFor({ state: 'visible', timeout: 5000 });
    await modelCard.click();

    // Measure engine variant loading speed
    console.log('[3/7] Measuring Engine / Variant Loading Speed...');
    const engineStart = Date.now();
    const engineSelect = page.getByTestId('vehicle-engine');
    await engineSelect.waitFor({ state: 'attached', timeout: 10000 });
    const engineLoadTime = Date.now() - engineStart;
    console.log(`✓ Engine options loaded in ${engineLoadTime} ms`);

    // Verify Engine options
    const engineOptions = await engineSelect.locator('option').allInnerTexts();
    console.log(`Engine options count: ${engineOptions.length}`);
    console.log('Engine options:', engineOptions);

    const count316i = engineOptions.filter((t) => t.trim() === '316i').length;
    console.log(`Count of '316i' option: ${count316i} (Expected: 1)`);
    if (count316i !== 1) {
      throw new Error(`Expected '316i' to appear exactly once, but found ${count316i}`);
    }

    // Select Engine (316i)
    const option316iVal = await engineSelect.evaluate((sel) => {
      const opt = Array.from(sel.options).find((o) => o.text.trim() === '316i');
      return opt ? opt.value : null;
    });

    if (!option316iVal) {
      throw new Error("Could not find value for '316i' in engine select!");
    }
    await engineSelect.selectOption(option316iVal);

    // Donanım Paketi (Trim) options verification
    console.log('[4/7] Verifying Donanım Paketi options...');
    const trimSelect = page.getByTestId('vehicle-trim');
    await trimSelect.waitFor({ state: 'attached', timeout: 5000 });
    const trimOptions = await trimSelect.locator('option').allInnerTexts();
    console.log('Trim options:', trimOptions);

    // Verify no empty white package options
    const emptyTrims = trimOptions.filter((t) => t.trim() === '' || t.trim() === '-' || t.trim() === 'null');
    if (emptyTrims.length > 0) {
      throw new Error(`Found empty or invalid package options: ${JSON.stringify(emptyTrims)}`);
    }

    // Select Trim (M Sport or Standart)
    const optionTrimVal = await trimSelect.evaluate((sel) => {
      const opt = Array.from(sel.options).find((o) => o.text.includes('M Sport') || o.text.includes('Standart'));
      return opt ? opt.value : sel.options[1]?.value;
    });
    if (optionTrimVal) {
      await trimSelect.selectOption(optionTrimVal);
    }

    // Step 1 completion badge check
    console.log('[5/7] Verifying Selection Completion Badge...');
    const completionBadge = page.locator('text=✓ SEÇİM TAMAMLANDI');
    await completionBadge.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Selection Completion Badge verified: "✓ SEÇİM TAMAMLANDI" is visible');

    // Click Next to Step 2
    const nextBtn = page.getByTestId('step1-next-btn');
    await nextBtn.click();

    // Step 2: Fill Form
    console.log('[6/7] Filling Step 2 Vehicle Form...');
    await page.getByTestId('vehicle-plate').fill('34ABC123');
    await page.getByTestId('vehicle-mileage').fill('150000');
    await page.getByTestId('vehicle-color').selectOption('Beyaz');
    await page.getByTestId('vehicle-desired-price').fill('1100000');

    // KVKK Checkbox
    const kvkkCb = page.getByTestId('vehicle-kvkk-checkbox');
    if (!(await kvkkCb.isChecked())) {
      await page.getByTestId('vehicle-kvkk-label').click();
    }

    // Intercept valuation API call to inspect HTTP response
    const apiResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/vehicle-evaluation') && resp.request().method() === 'POST',
      { timeout: 15000 }
    );

    // Submit Step 2 Form
    console.log('[7/7] Submitting Step 2 Form...');
    await page.getByTestId('vehicle-submit-button').click();

    const apiResp = await apiResponsePromise;
    console.log(`API HTTP Status: ${apiResp.status()}`);
    const resBody = await apiResp.json();
    console.log('=== API RESPONSE BODY ===');
    console.log(JSON.stringify(resBody, null, 2));

    if (apiResp.status() !== 201 || resBody.status !== 'SUCCESS') {
      throw new Error(`Valuation failed with HTTP ${apiResp.status()}, status=${resBody.status}`);
    }

    // Step 3 Result Screen Verification
    console.log('Verifying Step 3 Result Screen & Invariants...');
    await page.waitForSelector('[data-testid="valuation-success-card"]', { timeout: 15000 });

    const results = resBody.results;
    console.log('=== CONSIGNMENT MATHEMATICAL INVARIANTS CHECK ===');
    console.log(`recommendedPublicListingPrice: ${results.recommendedPublicListingPrice}`);
    console.log(`expectedSalePrice:             ${results.expectedSalePrice}`);
    console.log(`customerDesiredNet:            ${results.customerDesiredNet}`);
    console.log(`aiRecommendedCustomerNet:      ${results.aiRecommendedCustomerNet}`);
    console.log(`agreedCustomerNet:             ${results.agreedCustomerNet}`);
    console.log(`baseCommission:                ${results.baseCommission}`);
    console.log(`performanceMargin:             ${results.performanceMargin}`);
    console.log(`expectedCompanyGrossMargin:    ${results.expectedCompanyGrossMargin}`);

    // Invariant 1: recommendedPublicListingPrice >= expectedSalePrice
    if (results.recommendedPublicListingPrice < results.expectedSalePrice) {
      throw new Error(`Invariant 1 Broken: listing (${results.recommendedPublicListingPrice}) < sale (${results.expectedSalePrice})`);
    }

    // Invariant 2: agreedCustomerNet <= expectedSalePrice
    if (results.agreedCustomerNet > results.expectedSalePrice) {
      throw new Error(`Invariant 2 Broken: agreedNet (${results.agreedCustomerNet}) > sale (${results.expectedSalePrice})`);
    }

    // Invariant 3: expectedCompanyGrossMargin = expectedSalePrice - agreedCustomerNet
    if (results.expectedCompanyGrossMargin !== results.expectedSalePrice - results.agreedCustomerNet) {
      throw new Error(`Invariant 3 Broken: margin (${results.expectedCompanyGrossMargin}) != sale - net (${results.expectedSalePrice - results.agreedCustomerNet})`);
    }

    // Invariant 4: baseCommission + performanceMargin = expectedCompanyGrossMargin
    if (results.baseCommission + results.performanceMargin !== results.expectedCompanyGrossMargin) {
      throw new Error(`Invariant 4 Broken: base + perf (${results.baseCommission + results.performanceMargin}) != gross (${results.expectedCompanyGrossMargin})`);
    }

    // Invariant 5: agreedCustomerNet + expectedCompanyGrossMargin = expectedSalePrice
    if (results.agreedCustomerNet + results.expectedCompanyGrossMargin !== results.expectedSalePrice) {
      throw new Error(`Invariant 5 Broken: net + margin (${results.agreedCustomerNet + results.expectedCompanyGrossMargin}) != sale (${results.expectedSalePrice})`);
    }

    console.log('✓ ALL 5 MANDATORY MATHEMATICAL INVARIANTS STRICTLY PASSED!');
    console.log(`Total acceptance test duration: ${Date.now() - startTime} ms`);
    console.log('=== TEST PASSED 100% SUCCESSFULLY ===');

    clearTimeout(totalTimeout);
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ ACCEPTANCE TEST FAILED:', err.message);
    clearTimeout(totalTimeout);
    await browser.close();
    process.exit(1);
  }
})();
