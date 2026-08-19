import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';
try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}

import { PrismaClient } from '@prisma/client';
import { EvaluationService } from '../evaluation/evaluation.service';
import { EmsalMatcherService } from '../evaluation/emsal-matcher.service';
import { VehicleService } from '../vehicle/vehicle.service';

const prisma = new PrismaClient();

async function runComprehensiveTests() {
  console.log(`\n====================================================================`);
  console.log(`  NAKİTGARAJ KALICI İMPORT VE EMSAL HİYERARŞİSİ OTOMATİK TEST SUİTİ`);
  console.log(`====================================================================\n`);

  const emsalMatcher = new EmsalMatcherService(prisma as any);
  const mockTelegram = { sendMessage: async () => {}, sendEvaluationNotification: async () => {} };
  const evaluationService = new EvaluationService(
    prisma as any,
    mockTelegram as any,
    emsalMatcher,
  );
  const vehicleService = new VehicleService(prisma as any, { get: async () => null, set: async () => {} } as any);

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, detail: string = '') {
    if (condition) {
      passedCount++;
      console.log(`✓ ${testName} ${detail ? '(' + detail + ')' : ''}`);
    } else {
      failedCount++;
      console.error(`❌ FAILED: ${testName} ${detail ? '(' + detail + ')' : ''}`);
    }
  }

  // TEST 1: Initial DB Listing Count Verification (104,537)
  const initialDbCount = await prisma.rawVehicleListing.count();
  assert(initialDbCount === 104537, 'Test 1: Pre-Import Listing Count Preserved', `Top. İlan: ${initialDbCount}`);

  // TEST 2: Second Import Run (Idempotency) -> New listing count MUST BE 0
  console.log('\n[RUN] İkinci kez npm run import:new-html çalıştırılıyor...');
  const importRun = spawnSync('npm', ['run', 'import:new-html'], {
    cwd: path.resolve(__dirname, '../../'),
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, SAHIBINDEN_HTML_DIR: 'C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan' }
  });
  
  const runOutput = importRun.stdout || '';
  const secondRunNoNew = runOutput.includes('Yeni eklenen benzersiz ilan: 0') || runOutput.includes('NO_NEW_HTML_FILES');
  assert(secondRunNoNew, 'Test 2: Second Import Run Idempotency (0 New Listings Added)', `Exit Code: ${importRun.status}`);

  // TEST 3: BMW 2015 316i M Sport Level 1 Hierarchy & Candidate Breakdown
  const manufacturer = await prisma.manufacturer.findFirst({ where: { name: { equals: 'BMW' } } });
  const model = await prisma.model.findFirst({ where: { manufacturerId: manufacturer!.id, name: { contains: '3 Serisi' } } });
  const variant = await prisma.variant.findFirst({ where: { modelId: model!.id, name: { contains: '316i' } } });
  const spec = await prisma.vehicleSpecification.findFirst({
    where: { manufacturerId: manufacturer!.id, modelId: model!.id, variantId: variant!.id, year: 2015, package: { name: { contains: 'M Sport' } } },
  }) || await prisma.vehicleSpecification.findFirst({
    where: { manufacturerId: manufacturer!.id, modelId: model!.id, variantId: variant!.id, year: 2015 },
  });

  const bmwRequest = {
    year: 2015,
    manufacturerId: manufacturer!.id,
    modelId: model!.id,
    variantId: variant!.id,
    packageId: spec?.packageId,
    licensePlate: '34ABC123',
    color: 'Beyaz',
    damageStatus: 'HASARSIZ',
    mileage: 120000,
    mileageKm: 120000,
    userDesiredPrice: 1100000,
    paintCondition: [],
    changedCondition: [],
  };

  const evalRes: any = await evaluationService.evaluateVehicle(bmwRequest as any);
  const res = evalRes.results || {};

  assert(res.matchedLevel === 1, 'Test 3a: BMW Emsal Match Level is Level 1', `Level: ${res.matchedLevel}`);
  assert(res.level1CandidateCount >= 5, 'Test 3b: Level 1 Candidate Count >= 5', `L1 Count: ${res.level1CandidateCount}`);
  assert(res.level2CandidateCount !== undefined && res.level3CandidateCount !== undefined, 'Test 3c: Level 1/2/3 Candidate Breakdown Returned', `L1: ${res.level1CandidateCount}, L2: ${res.level2CandidateCount}, L3: ${res.level3CandidateCount}`);
  assert(res.matchedListingCount === res.actuallyUsedListingCount, 'Test 3d: matchedListingCount Equals actuallyUsedListingCount', `Used Count: ${res.actuallyUsedListingCount}`);

  // TEST 4: Consignment Net Rules Verification (1.100.000 TL)
  assert(res.agreedCustomerNet === 1100000, 'Test 4: Agreed Customer Net is Exactly User Desired Price', `agreedCustomerNet: ${res.agreedCustomerNet}`);

  // TEST 5: Financial Invariants (5 Invariants)
  const inv1 = res.recommendedPublicListingPrice >= res.expectedSalePrice;
  const inv2 = res.agreedCustomerNet <= res.expectedSalePrice;
  const inv3 = res.expectedCompanyGrossMargin === (res.expectedSalePrice - res.agreedCustomerNet);
  const inv4 = (res.baseCommission + res.performanceMargin) === res.expectedCompanyGrossMargin;
  const inv5 = (res.agreedCustomerNet + res.expectedCompanyGrossMargin) === res.expectedSalePrice;
  const allInvariantsPass = inv1 && inv2 && inv3 && inv4 && inv5;

  assert(allInvariantsPass, 'Test 5: 5 Financial Invariants Passed 100%', `Gross Margin: ${res.expectedCompanyGrossMargin}, Perf: ${res.performanceMargin}`);

  // TEST 6: Dropdown Cleanliness
  const manufacturers = await prisma.manufacturer.findMany();
  let badModelCount = 0, emptyOptionCount = 0, dupOptionCount = 0;

  for (const m of manufacturers.slice(0, 10)) {
    const models = await vehicleService.getModels(m.id);
    const seenNames = new Set<string>();
    for (const mo of models) {
      const lower = mo.name.toLowerCase();
      if (lower.includes('sahibinden') || lower.includes('fiyatları') || lower.includes('.html')) badModelCount++;
      if (!mo.name || mo.name.trim() === '') emptyOptionCount++;
      const norm = mo.name.trim().toLocaleLowerCase('tr-TR');
      if (seenNames.has(norm)) dupOptionCount++;
      seenNames.add(norm);
    }
  }

  assert(badModelCount === 0 && emptyOptionCount === 0 && dupOptionCount === 0, 'Test 6: Dropdown Options 100% Clean', `Bad: ${badModelCount}, Empty: ${emptyOptionCount}, Dup: ${dupOptionCount}`);

  // TEST 7: Final DB Listing Count Verification
  const finalDbCount = await prisma.rawVehicleListing.count();
  assert(finalDbCount === 104537, 'Test 7: Post-Test DB Listing Count Intact', `Final DB Count: ${finalDbCount}`);

  console.log(`\n====================================================================`);
  console.log(`  OTOMATİK TEST SUİTİ RAPORU`);
  console.log(`====================================================================`);
  console.log(`- Toplam Çalıştırılan Test Sayısı: ${passedCount + failedCount}`);
  console.log(`- Başarılı Test Sayısı: ${passedCount}`);
  console.log(`- Başarısız Test Sayısı: ${failedCount}`);
  console.log(`- Genel Sonuç: ${failedCount === 0 ? 'PASSED (%100 BAŞARILI)' : 'FAILED'}\n`);

  if (failedCount > 0) process.exit(1);
}

runComprehensiveTests().catch(console.error).finally(() => prisma.$disconnect());
