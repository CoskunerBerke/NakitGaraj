import * as path from 'path';
import * as fs from 'fs';

try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.endsWith('dev.db')) {
  process.env.DATABASE_URL = 'file:' + path.resolve(__dirname, '../../prisma/dev.db');
}

import { PrismaClient } from '@prisma/client';
import { EvaluationService } from '../evaluation/evaluation.service';
import { EmsalMatcherService } from '../evaluation/emsal-matcher.service';

const prisma = new PrismaClient();

async function verifyBMW316iLive() {
  console.log(`\n====================================================================`);
  console.log(`  BMW 2014 3 SERİSİ 316i M SPORT CANLI DEĞERLEME & MONOTONLUK TESTİ`);
  console.log(`====================================================================\n`);

  const bmw = await prisma.manufacturer.findFirst({ where: { name: 'BMW' } });
  const model3 = await prisma.model.findFirst({ where: { manufacturerId: bmw!.id, name: '3 Serisi' } });
  const variant316i = await prisma.variant.findFirst({ where: { modelId: model3!.id, name: { contains: '316i' } } });
  const packageMSport = await prisma.package.findFirst({ where: { variantId: variant316i!.id, name: { contains: 'M Sport' } } });

  console.log(`- Bulunan İd'ler: Manufacturer=${bmw?.id}, Model=${model3?.id}, Variant=${variant316i?.id}, Package=${packageMSport?.id}`);

  const emsalMatcher = new EmsalMatcherService(prisma as any);
  const evaluationService = new EvaluationService(prisma as any, {} as any, emsalMatcher);

  // 1. Level 1 Matching Audit for 2014 BMW 316i M Sport
  const matchResult = await emsalMatcher.matchComparableListings({
    make: 'BMW',
    model: '3 Serisi',
    variant: '316i',
    trim: 'M Sport',
    year: 2014,
    mileageKm: 80000,
  });

  console.log(`\n--- LEVEL 1 EMSAL EŞLEŞTİRME DENETİMİ ---`);
  console.log(`- Eşleşme Seviyesi (matchedLevel): ${matchResult.level}`);
  console.log(`- Aynı Yıl (2014) Temiz Level 1 Aday Sayısı: ${matchResult.matchedCount}`);
  console.log(`- Gerçekten Kullanılan Benzersiz İlan Sayısı: ${matchResult.cleanListings.length}`);
  console.log(`- Güven Skoru (Confidence Score): ${matchResult.confidenceScore}`);
  console.log(`- Kullanılan Motor Dağılımı:`, matchResult.usedEngineDistribution);
  console.log(`- Kullanılan Paket Dağılımı:`, matchResult.usedTrimDistribution);

  // Verify all listings are strictly 2014 + 316i + M Sport
  const non2014Count = matchResult.cleanListings.filter(l => l.year !== 2014).length;
  const non316iCount = matchResult.cleanListings.filter(l => !(l.variant || '').toLowerCase().includes('316i')).length;
  const nonMSportCount = matchResult.cleanListings.filter(l => !(l.trim || '').toLowerCase().includes('m sport')).length;

  console.log(`- 2014 Dışı İlan Sayısı: ${non2014Count} (Beklenen: 0)`);
  console.log(`- 316i Dışı İlan Sayısı: ${non316iCount} (Beklenen: 0)`);
  console.log(`- M Sport Dışı İlan Sayısı: ${nonMSportCount} (Beklenen: 0)`);

  const ids = matchResult.cleanListings.map(l => l.id);
  const duplicateIds = ids.length - new Set(ids).size;
  console.log(`- Mükerrer (Duplicate) ID Sayısı: ${duplicateIds} (Beklenen: 0)\n`);

  // 2. HTTP Request Simulation for 20k, 80k, 120k km
  const baseReq = {
    year: 2014,
    manufacturerId: bmw!.id,
    modelId: model3!.id,
    variantId: variant316i!.id,
    packageId: packageMSport!.id,
    licensePlate: '34BMW316',
    color: 'Beyaz',
    damageStatus: 'NO',
  };

  const req20k = { ...baseReq, mileage: 20000 };
  const req80k = { ...baseReq, mileage: 80000 };
  const req120k = { ...baseReq, mileage: 120000 };

  const eval20k: any = await evaluationService.calculateVehicleValuationPreview(req20k as any);
  const eval80k: any = await evaluationService.calculateVehicleValuationPreview(req80k as any);
  const eval120k: any = await evaluationService.calculateVehicleValuationPreview(req120k as any);

  const res20k = eval20k.results;
  const res80k = eval80k.results;
  const res120k = eval120k.results;

  console.log(`--- 20.000 KM, 80.000 KM ve 120.000 KM CANLI HTTP DEĞERLEME SONUÇLARI ---`);
  console.log(`[20.000 KM]  FMV: ${res20k.fairMarketValue.toLocaleString('tr-TR')} TL | CashOffer: ${res20k.cashOffer.toLocaleString('tr-TR')} TL | Consignment: ${res20k.recommendedPublicListingPrice.toLocaleString('tr-TR')} TL | Comps: ${res20k.actuallyUsedListingCount}`);
  console.log(`[80.000 KM]  FMV: ${res80k.fairMarketValue.toLocaleString('tr-TR')} TL | CashOffer: ${res80k.cashOffer.toLocaleString('tr-TR')} TL | Consignment: ${res80k.recommendedPublicListingPrice.toLocaleString('tr-TR')} TL | Comps: ${res80k.actuallyUsedListingCount}`);
  console.log(`[120.000 KM] FMV: ${res120k.fairMarketValue.toLocaleString('tr-TR')} TL | CashOffer: ${res120k.cashOffer.toLocaleString('tr-TR')} TL | Consignment: ${res120k.recommendedPublicListingPrice.toLocaleString('tr-TR')} TL | Comps: ${res120k.actuallyUsedListingCount}`);

  console.log(`\n- P25 / P50 / P75 Yüzdelik Değerleri (80k km): P25=${res80k.pricingAudit?.p25?.toLocaleString('tr-TR') || 'N/A'} TL, P50=${res80k.pricingAudit?.p50?.toLocaleString('tr-TR') || 'N/A'} TL, P75=${res80k.pricingAudit?.p75?.toLocaleString('tr-TR') || 'N/A'} TL`);
  console.log(`- Öğrenilen Kilometre Düşüş Oranı (learnedMileageRatePer10k): %${((res80k.pricingAudit?.learnedMileageRatePer10k || 0.012) * 100).toFixed(2)} / 10.000 km`);

  // 3. Strict Monotonicity Assertions
  const strictFmvMonotonic = res20k.fairMarketValue > res80k.fairMarketValue && res80k.fairMarketValue > res120k.fairMarketValue;
  const strictCashMonotonic = res20k.cashOffer > res80k.cashOffer && res80k.cashOffer > res120k.cashOffer;

  console.log(`\n--- KATILIKSİZ MONOTONLUK ŞART KONTROLÜ ---`);
  console.log(`- FMV(20k) > FMV(80k) > FMV(120k): ${strictFmvMonotonic ? '✅ BAŞARILI' : '❌ BAŞARISIZ'}`);
  console.log(`- Cash(20k) > Cash(80k) > Cash(120k): ${strictCashMonotonic ? '✅ BAŞARILI' : '❌ BAŞARISIZ'}`);

  if (strictFmvMonotonic && strictCashMonotonic && non2014Count === 0 && non316iCount === 0 && nonMSportCount === 0 && duplicateIds === 0) {
    console.log(`\n✅ BMW 2014 3 SERİSİ 316i M SPORT CANLI TESTİ TÜM ŞARTLARI BAŞARIYLA SAĞLADI!`);
  } else {
    console.log(`\n❌ BMW TESTİ BAŞARISIZ OLDU!`);
  }

  await prisma.$disconnect();
}

verifyBMW316iLive().catch(e => console.error(e));
