import * as path from 'path';
try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}
process.env.DATABASE_URL = 'file:' + path.resolve(__dirname, '../../prisma/dev.db');

import { PrismaClient } from '@prisma/client';
import { EvaluationService } from '../evaluation/evaluation.service';
import { EmsalMatcherService } from '../evaluation/emsal-matcher.service';

const prisma = new PrismaClient();

async function run() {
  const emsalMatcher = new EmsalMatcherService(prisma as any);
  const mockTelegram = { sendMessage: async () => {}, sendEvaluationNotification: async () => {} };
  const evaluationService = new EvaluationService(
    prisma as any,
    mockTelegram as any,
    emsalMatcher,
  );

  // Dynamically look up IDs by name
  const manufacturer = await prisma.manufacturer.findFirst({
    where: { name: { equals: 'BMW' } },
  });
  if (!manufacturer) throw new Error('BMW manufacturer not found in DB');

  const model = await prisma.model.findFirst({
    where: { manufacturerId: manufacturer.id, name: { contains: '3 Serisi' } },
  });
  if (!model) throw new Error('3 Serisi model not found in DB');

  const variant = await prisma.variant.findFirst({
    where: { modelId: model.id, name: { contains: '316i' } },
  });
  if (!variant) throw new Error('316i variant not found in DB');

  const spec = await prisma.vehicleSpecification.findFirst({
    where: {
      manufacturerId: manufacturer.id,
      modelId: model.id,
      variantId: variant.id,
      year: 2015,
    },
    include: { package: true },
  });

  if (!spec) throw new Error('BMW 2015 316i spec not found in DB');

  const requestBody = {
    year: 2015,
    manufacturerId: manufacturer.id,
    modelId: model.id,
    variantId: variant.id,
    packageId: spec.packageId,
    licensePlate: '34ABC123',
    color: 'Beyaz',
    damageStatus: 'HASARSIZ',
    mileage: 120000,
    mileageKm: 120000,
    userDesiredPrice: 1100000,
    paintCondition: [],
    changedCondition: [],
  };

  const evalRes: any = await evaluationService.evaluateVehicle(requestBody as any);
  const res = evalRes.results || {};

  console.log('\n=== BMW DYNAMİK REQUEST BODY ===');
  console.log(requestBody);

  console.log('\n=== BMW VALUATION ACCEPTANCE RESULT ===');
  console.log({
    matchedListingCount: res.matchedListingCount,
    matchedLevel: res.matchedLevel,
    recommendedPublicListingPrice: res.recommendedPublicListingPrice,
    expectedSalePrice: res.expectedSalePrice,
    userDesiredPrice: 1100000,
    aiRecommendedCustomerNet: res.aiRecommendedCustomerNet,
    agreedCustomerNet: res.agreedCustomerNet,
    baseCommission: res.baseCommission,
    performanceMargin: res.performanceMargin,
    expectedCompanyGrossMargin: res.expectedCompanyGrossMargin,
  });

  const inv1 = res.recommendedPublicListingPrice >= res.expectedSalePrice;
  const inv2 = res.agreedCustomerNet <= res.expectedSalePrice;
  const inv3 = res.expectedCompanyGrossMargin === (res.expectedSalePrice - res.agreedCustomerNet);
  const inv4 = (res.baseCommission + res.performanceMargin) === res.expectedCompanyGrossMargin;
  const inv5 = (res.agreedCustomerNet + res.expectedCompanyGrossMargin) === res.expectedSalePrice;
  const invRule1 = res.agreedCustomerNet === 1100000;

  const allPassed = inv1 && inv2 && inv3 && inv4 && inv5 && invRule1;

  console.log(`\n=== 5 FINANCIAL INVARIANTS & USER DESIRED RULE CHECK ===`);
  console.log(`Invariant 1 (listing >= sale): ${inv1 ? 'PASSED' : 'FAILED'}`);
  console.log(`Invariant 2 (net <= sale):     ${inv2 ? 'PASSED' : 'FAILED'}`);
  console.log(`Invariant 3 (margin = sale - net): ${inv3 ? 'PASSED' : 'FAILED'}`);
  console.log(`Invariant 4 (base + perf = margin): ${inv4 ? 'PASSED' : 'FAILED'}`);
  console.log(`Invariant 5 (net + margin = sale): ${inv5 ? 'PASSED' : 'FAILED'}`);
  console.log(`Rule 1 (agreed = 1.100.000 TL): ${invRule1 ? 'PASSED' : 'FAILED'}`);
  console.log(`Financial Invariants Result: ${allPassed ? 'PASSED (%100 STRICT MATCH)' : 'FAILED'}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
