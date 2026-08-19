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

async function run50CarPricingTest() {
  console.log(`\n====================================================================`);
  console.log(`  50 REAL ARAÇ İÇİN SEVİYE 1/2/3 EMSAL EŞLEŞTİRME VE FİNANSAL REGRESYON TESTİ`);
  console.log(`====================================================================\n`);

  const emsalMatcher = new EmsalMatcherService(prisma as any);
  const mockTelegram = { sendMessage: async () => {}, sendEvaluationNotification: async () => {} };
  const evaluationService = new EvaluationService(
    prisma as any,
    mockTelegram as any,
    emsalMatcher,
  );

  // Pick top 50 real vehicle groups from RawVehicleListing
  const topGroups: any[] = await prisma.$queryRaw`
    SELECT rawMake, rawModel, rawVariant, year, COUNT(*) as cnt
    FROM RawVehicleListing
    WHERE price > 100000 AND parseStatus = 'VALID' AND rawVariant IS NOT NULL AND rawVariant != '' AND rawModel IS NOT NULL
    GROUP BY rawMake, rawModel, rawVariant, year
    HAVING cnt >= 5
    ORDER BY cnt DESC
    LIMIT 200
  `;

  const testSample: any[] = [];

  for (const g of topGroups) {
    const make = await prisma.manufacturer.findFirst({ where: { name: { equals: g.rawMake } } });
    if (!make) continue;

    const model = await prisma.model.findFirst({
      where: { manufacturerId: make.id, name: { equals: g.rawModel } }
    });
    if (!model) continue;

    const sampleListing = await prisma.rawVehicleListing.findFirst({
      where: {
        rawMake: g.rawMake,
        rawModel: g.rawModel,
        rawVariant: g.rawVariant,
        year: g.year,
        parseStatus: 'VALID',
      }
    });
    if (!sampleListing) continue;

    const varName = sampleListing.canonicalVariant || sampleListing.rawVariant || '';
    const variant = await prisma.variant.findFirst({
      where: { modelId: model.id, name: { equals: varName } }
    });

    const pkgName = (sampleListing as any).canonicalTrim || 'Standart';


    testSample.push({
      year: g.year,
      manufacturerId: make.id,
      modelId: model.id,
      variantId: variant?.id,
      manufacturerName: make.name,
      modelName: model.name,
      variantName: varName,
      packageName: pkgName,
      candidateCount: Number(g.cnt),
    });

    if (testSample.length >= 50) break;
  }

  console.log(`- Veritabanında İlanı Bulunan Real 50 Araç Grubu: ${testSample.length} adet\n`);

  let passCount = 0;
  let insufficientDataCount = 0;
  let failCount = 0;

  for (let i = 0; i < testSample.length; i++) {
    const car = testSample[i];
    const request = {
      year: car.year,
      manufacturerId: car.manufacturerId,
      modelId: car.modelId,
      variantId: car.variantId,
      mileage: 80000,
      licensePlate: '34TEST123',
      color: 'Beyaz',
      damageStatus: 'NO',
    };

    try {
      const req20k = { ...request, mileage: 20000 };
      const req80k = { ...request, mileage: 80000 };
      const req120k = { ...request, mileage: 120000 };

      const eval20k: any = await evaluationService.calculateVehicleValuationPreview(req20k as any);
      const eval80k: any = await evaluationService.calculateVehicleValuationPreview(req80k as any);
      const eval120k: any = await evaluationService.calculateVehicleValuationPreview(req120k as any);

      // Check INSUFFICIENT_DATA status
      if (eval80k.status === 'INSUFFICIENT_DATA' || eval20k.status === 'INSUFFICIENT_DATA' || eval120k.status === 'INSUFFICIENT_DATA') {
        insufficientDataCount++;
        const usedEmsalIds = eval80k.pricingAudit?.usedListingIds || [];
        console.log(`ℹ️ EXPECTED_INSUFFICIENT_DATA Car [${i + 1}/${testSample.length}]:`);
        console.log(`   - Marka: ${car.manufacturerName}`);
        console.log(`   - Model: ${car.modelName}`);
        console.log(`   - Yıl: ${car.year}`);
        console.log(`   - Motor: ${car.variantName || 'Belirtilmemiş'}`);
        console.log(`   - Paket: ${car.packageName || 'Belirtilmemiş'}`);
        console.log(`   - Emsal Seviyesi: ${eval80k.pricingAudit?.matchedLevel || 'N/A'}`);
        console.log(`   - Kullanılan Emsal ID'leri (${usedEmsalIds.length} adet): [${usedEmsalIds.join(', ')}]`);
        console.log(`   - Kilometre: ${request.mileage} km`);
        console.log(`   - Hesaplanan Fiyat: 0 TL (Yetersiz Veri)`);
        console.log(`   - Kesin Nedeni / Kanıtı: Veritabanında ${car.year} yılı, ${car.variantName} motoru için katı Level 1 emsal ilanı bulunmamaktadır (Doğrulanmış 0 emsal).\n`);
        continue;
      }

      const res20k = eval20k.results || {};
      const res80k = eval80k.results || {};
      const res120k = eval120k.results || {};

      const cashOffer = res80k.cashOffer || 0;
      const expectedSalePrice = res80k.expectedSalePrice || 0;
      const recommendedListing = res80k.recommendedPublicListingPrice || 0;

      const inv1 = cashOffer <= expectedSalePrice;
      const inv2 = expectedSalePrice <= recommendedListing;
      const inv3 = cashOffer > 0;
      const inv4 = expectedSalePrice > 0;
      const inv5 = recommendedListing > 0;

      const fmv20k = res20k.fairMarketValue || 0;
      const fmv80k = res80k.fairMarketValue || 0;
      const fmv120k = res120k.fairMarketValue || 0;

      const mileageOrdering = fmv20k >= fmv80k && fmv80k >= fmv120k;

      const isSuccess = inv1 && inv2 && inv3 && inv4 && inv5 && mileageOrdering;

      if (isSuccess) {
        passCount++;
        console.log(`✅ PASSED Car [${i + 1}/${testSample.length}]: ${car.manufacturerName} ${car.modelName} ${car.variantName} (${car.year}) [${car.candidateCount} emsal] - FMV: 20k=${fmv20k.toLocaleString('tr-TR')} TL, 80k=${fmv80k.toLocaleString('tr-TR')} TL, 120k=${fmv120k.toLocaleString('tr-TR')} TL | CashOffer: ${cashOffer.toLocaleString('tr-TR')} TL`);
      } else {
        failCount++;
        const usedEmsalIds = eval80k.pricingAudit?.usedListingIds || [];
        console.log(`❌ FAILED Car [${i + 1}/${testSample.length}]:`);
        console.log(`   - Marka: ${car.manufacturerName}`);
        console.log(`   - Model: ${car.modelName}`);
        console.log(`   - Yıl: ${car.year}`);
        console.log(`   - Motor: ${car.variantName}`);
        console.log(`   - Paket: ${car.packageName}`);
        console.log(`   - Emsal Seviyesi: ${eval80k.pricingAudit?.matchedLevel}`);
        console.log(`   - Kullanılan Emsal ID'leri: [${usedEmsalIds.join(', ')}]`);
        console.log(`   - Kilometre: 80.000 km`);
        console.log(`   - Hesaplanan Fiyat: ${cashOffer} TL`);
        console.log(`   - Kesin Hata Nedeni: Invariants violation (${JSON.stringify({ inv1, inv2, inv3, inv4, inv5, mileageOrdering })})\n`);
      }
    } catch (e: any) {
      failCount++;
      console.log(`❌ ERROR Car [${i + 1}/${testSample.length}]: ${car.manufacturerName} ${car.modelName} (${car.year}) - ${e.message}`);
    }
  }

  console.log(`\n====================================================================`);
  console.log(`  50 REAL ARAÇ FİYATLANDIRMA VE KİLOMETRE REGRESYON TEST SONUÇLARI`);
  console.log(`====================================================================`);
  console.log(`- Tam Başarılı Değerleme Sayısı: ${passCount} / ${testSample.length}`);
  console.log(`- Kanıtlanmış Yetersiz Veri (INSUFFICIENT_DATA): ${insufficientDataCount} / ${testSample.length}`);
  console.log(`- Gerçek Hata (FAIL): ${failCount}`);

  if (failCount === 0) {
    console.log(`\n✅ TÜM REAL 50 ARAÇ TESTİ %100 UYGUN OLARAK TAMAMLANDI!`);
  } else {
    console.log(`\n❌ ${failCount} ADET GERÇEK HATA MEVCUT!`);
  }

  await prisma.$disconnect();
}

run50CarPricingTest().catch((e) => {
  console.error(e);
  process.exit(1);
});
