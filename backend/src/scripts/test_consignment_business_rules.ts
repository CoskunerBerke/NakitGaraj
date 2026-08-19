import * as path from 'path';
try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}
process.env.DATABASE_URL = 'file:' + path.resolve(__dirname, '../../prisma/dev.db');

import { PrismaClient } from '@prisma/client';
import { EvaluationService } from '../evaluation/evaluation.service';
import { EmsalMatcherService } from '../evaluation/emsal-matcher.service';
import { VehicleService } from '../vehicle/vehicle.service';

const prisma = new PrismaClient();

async function runTests() {
  console.log(`\n====================================================================`);
  console.log(`  NAKİTGARAJ KONSİNYE İŞ KURALLARI VE YENİ OTOMATİK TEST SUİTİ`);
  console.log(`====================================================================\n`);

  const emsalMatcher = new EmsalMatcherService(prisma as any);
  const mockTelegram = { sendMessage: async () => {}, sendEvaluationNotification: async () => {} };
  const evaluationService = new EvaluationService(
    prisma as any,
    mockTelegram as any,
    emsalMatcher,
  );
  const vehicleService = new VehicleService(prisma as any, { get: async () => null, set: async () => {} } as any);

  // Initial DB Listing Count Verification
  const initialCount = await prisma.rawVehicleListing.count();
  console.log(`✓ Test Öncesi Eşsiz İlan Sayısı: ${initialCount}`);
  if (initialCount !== 104537) {
    console.error(`❌ UYARI: DB ilan sayısı 104.537 değil (${initialCount})!`);
  }

  // Find dynamic spec for BMW 2015 316i
  const manufacturer = await prisma.manufacturer.findFirst({ where: { name: { equals: 'BMW' } } });
  const model = await prisma.model.findFirst({ where: { manufacturerId: manufacturer!.id, name: { contains: '3 Serisi' } } });
  const variant = await prisma.variant.findFirst({ where: { modelId: model!.id, name: { contains: '316i' } } });
  const spec = await prisma.vehicleSpecification.findFirst({
    where: { manufacturerId: manufacturer!.id, modelId: model!.id, variantId: variant!.id, year: 2015 },
  });

  const baseDto = {
    year: 2015,
    manufacturerId: manufacturer!.id,
    modelId: model!.id,
    variantId: variant!.id,
    packageId: spec!.packageId,
    licensePlate: '34ABC123',
    color: 'Beyaz',
    damageStatus: 'HASARSIZ',
    mileage: 120000,
    mileageKm: 120000,
    paintCondition: [],
    changedCondition: [],
  };

  // Test 1: userDesiredPrice < aiRecommendedCustomerNet (1.100.000 TL)
  const res1: any = (await evaluationService.evaluateVehicle({ ...baseDto, userDesiredPrice: 1100000 } as any)).results;
  const t1 = res1.agreedCustomerNet === 1100000;
  console.log(`- Test 1 (Kullanıcı İsteği < AI Net [1.100.000 TL]): ${t1 ? 'PASSED' : 'FAILED'} (agreed: ${res1.agreedCustomerNet})`);

  // Test 2: userDesiredPrice === aiRecommendedCustomerNet
  const aiNet = res1.aiRecommendedCustomerNet;
  const res2: any = (await evaluationService.evaluateVehicle({ ...baseDto, userDesiredPrice: aiNet } as any)).results;
  const t2 = res2.agreedCustomerNet === aiNet;
  console.log(`- Test 2 (Kullanıcı İsteği == AI Net [${aiNet} TL]): ${t2 ? 'PASSED' : 'FAILED'} (agreed: ${res2.agreedCustomerNet})`);

  // Test 3: userDesiredPrice > aiRecommendedCustomerNet (e.g. aiNet + 100.000 TL)
  const highPrice = aiNet + 100000;
  const res3: any = (await evaluationService.evaluateVehicle({ ...baseDto, userDesiredPrice: highPrice } as any)).results;
  const expectedMidpoint = Math.min(Math.round((highPrice + res3.aiRecommendedCustomerNet) / 2), res3.expectedSalePrice - res3.baseCommission);
  const t3 = res3.agreedCustomerNet === expectedMidpoint;
  console.log(`- Test 3 (Kullanıcı İsteği > AI Net [Orta Nokta ${expectedMidpoint} TL]): ${t3 ? 'PASSED' : 'FAILED'} (agreed: ${res3.agreedCustomerNet})`);

  // Test 4: userDesiredPrice Excessively High (3.000.000 TL)
  const res4: any = (await evaluationService.evaluateVehicle({ ...baseDto, userDesiredPrice: 3000000 } as any)).results;
  const maxSafeNet = res4.expectedSalePrice - res4.baseCommission;
  const t4 = res4.agreedCustomerNet <= maxSafeNet;
  console.log(`- Test 4 (Aşırı Yüksek Fiyat -> Max Güvenli Net [<= ${maxSafeNet} TL]): ${t4 ? 'PASSED' : 'FAILED'} (agreed: ${res4.agreedCustomerNet})`);

  // Test 5: User Desired Price Missing / 0
  const res5: any = (await evaluationService.evaluateVehicle({ ...baseDto, userDesiredPrice: 0 } as any)).results;
  const t5 = res5.agreedCustomerNet === res5.aiRecommendedCustomerNet;
  console.log(`- Test 5 (Fiyat Girilmemiş -> Güvenli AI Önerisi [${res5.aiRecommendedCustomerNet} TL]): ${t5 ? 'PASSED' : 'FAILED'} (agreed: ${res5.agreedCustomerNet})`);

  // Test 6: 5 Financial Invariants in all scenarios
  const allInvariantsPass = [res1, res2, res3, res4, res5].every(r => {
    const i1 = r.recommendedPublicListingPrice >= r.expectedSalePrice;
    const i2 = r.agreedCustomerNet <= r.expectedSalePrice;
    const i3 = r.expectedCompanyGrossMargin === (r.expectedSalePrice - r.agreedCustomerNet);
    const i4 = (r.baseCommission + r.performanceMargin) === r.expectedCompanyGrossMargin;
    const i5 = (r.agreedCustomerNet + r.expectedCompanyGrossMargin) === r.expectedSalePrice;
    return i1 && i2 && i3 && i4 && i5;
  });
  console.log(`- Test 6 (Bütün Senaryolarda 5 Finansal Invariant): ${allInvariantsPass ? 'PASSED' : 'FAILED'}`);

  // Test 7: Dropdown Cleanliness
  const manufacturers = await prisma.manufacturer.findMany();
  let sahibindenCount = 0, emptyCount = 0, duplicateCount = 0;
  for (const m of manufacturers.slice(0, 15)) {
    const models = await vehicleService.getModels(m.id);
    const names = new Set<string>();
    for (const mo of models) {
      const lower = mo.name.toLowerCase();
      if (lower.includes('sahibinden') || lower.includes('fiyatları') || lower.includes('.html')) sahibindenCount++;
      if (!mo.name || mo.name.trim() === '') emptyCount++;
      const norm = mo.name.trim().toLocaleLowerCase('tr-TR');
      if (names.has(norm)) duplicateCount++;
      names.add(norm);
    }
  }
  const t7 = sahibindenCount === 0 && emptyCount === 0 && duplicateCount === 0;
  console.log(`- Test 7 (Dropdown Cleanliness: "sahibinden": ${sahibindenCount}, Boş: ${emptyCount}, Mükerrer: ${duplicateCount}): ${t7 ? 'PASSED' : 'FAILED'}`);

  // Test 8: Final Count Verification
  const finalCount = await prisma.rawVehicleListing.count();
  const t8 = initialCount === 104537 && finalCount === 104537;
  console.log(`- Test 8 (Veritabanı İlan Sayısı Değişmedi [${finalCount}]): ${t8 ? 'PASSED' : 'FAILED'}`);

  const overallPassed = t1 && t2 && t3 && t4 && t5 && allInvariantsPass && t7 && t8;
  console.log(`\nOVERALL TEST SUITE RESULT: ${overallPassed ? 'PASSED (%100 SUCCESS)' : 'FAILED'}\n`);
}

runTests().catch(console.error).finally(() => prisma.$disconnect());
