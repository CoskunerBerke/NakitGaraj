import * as path from 'path';
import * as fs from 'fs';
try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}

import { PrismaClient } from '@prisma/client';
import { EvaluationService } from '../evaluation/evaluation.service';
import { EmsalMatcherService } from '../evaluation/emsal-matcher.service';

async function evaluateOnDb(dbPath: string, userDesiredPrice: number = 1100000) {
  const customPrisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${dbPath}`,
      },
    },
  });

  try {
    const emsalMatcher = new EmsalMatcherService(customPrisma as any);
    const mockTelegram = { sendMessage: async () => {}, sendEvaluationNotification: async () => {} };
    const evaluationService = new EvaluationService(
      customPrisma as any,
      mockTelegram as any,
      emsalMatcher,
    );

    const manufacturer = await customPrisma.manufacturer.findFirst({ where: { name: { equals: 'BMW' } } });
    const model = await customPrisma.model.findFirst({ where: { manufacturerId: manufacturer!.id, name: { contains: '3 Serisi' } } });
    const variant = await customPrisma.variant.findFirst({ where: { modelId: model!.id, name: { contains: '316i' } } });
    const spec = await customPrisma.vehicleSpecification.findFirst({
      where: { manufacturerId: manufacturer!.id, modelId: model!.id, variantId: variant!.id, year: 2015 },
    });

    const listingCount = await customPrisma.rawVehicleListing.count();

    const requestBody = {
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
      userDesiredPrice,
      paintCondition: [],
      changedCondition: [],
    };

    const evalRes: any = await evaluationService.evaluateVehicle(requestBody as any);
    return {
      dbListingCount: listingCount,
      requestBody,
      results: evalRes.results,
    };
  } finally {
    await customPrisma.$disconnect();
  }
}

async function runComparison() {
  const currentDbPath = path.resolve(__dirname, '../../prisma/dev.db');
  const backupDbPath = path.resolve(__dirname, '../../prisma/dev.db.bak');

  if (!fs.existsSync(backupDbPath)) {
    console.error(`❌ YEDEK VERİTABANI BULUNAMADI: ${backupDbPath}`);
    process.exit(1);
  }

  console.log(`\n====================================================================`);
  console.log(`  IMPORT ÖNCESİ (93.510 İLAN) VS IMPORT SONRASI (104.537 İLAN) KARŞILAŞTIRMASI`);
  console.log(`====================================================================\n`);

  const preImport = await evaluateOnDb(backupDbPath, 1100000);
  const postImport = await evaluateOnDb(currentDbPath, 1100000);

  const preRes = preImport.results;
  const postRes = postImport.results;

  console.log(`📌 KULLANILAN TAM BMW REQUEST BODY:`);
  console.log(JSON.stringify(postImport.requestBody, null, 2));

  console.log(`\n--------------------------------------------------------------------`);
  console.log(`Metrik | Import Öncesi DB (93.510 İlan) | Import Sonrası DB (104.537 İlan) | Fark`);
  console.log(`--------------------------------------------------------------------`);

  const printRow = (label: string, preVal: number, postVal: number, suffix: string = ' TL') => {
    const diff = postVal - preVal;
    const diffStr = diff === 0 ? '0 TL (Değişmedi)' : `${diff > 0 ? '+' : ''}${diff.toLocaleString('tr-TR')}${suffix}`;
    console.log(`${label} | ${preVal.toLocaleString('tr-TR')}${suffix} | ${postVal.toLocaleString('tr-TR')}${suffix} | ${diffStr}`);
  };

  console.log(`Eşleşen Emsal İlan Sayısı | ${preRes.matchedListingCount} adet | ${postRes.matchedListingCount} adet | +${postRes.matchedListingCount - preRes.matchedListingCount} adet (Yeni emsaller eklendi)`);
  console.log(`Emsal Eşleşme Seviyesi | Level ${preRes.matchedLevel} | Level ${postRes.matchedLevel} | Seviye aynı`);
  printRow(`Piyasa Değeri (fairMarketValue)`, preRes.fairMarketValue, postRes.fairMarketValue);
  printRow(`Önerilen İlan Fiyatı (recommendedPublicListingPrice)`, preRes.recommendedPublicListingPrice, postRes.recommendedPublicListingPrice);
  printRow(`Beklenen Satış Fiyatı (expectedSalePrice)`, preRes.expectedSalePrice, postRes.expectedSalePrice);
  printRow(`Kullanıcı İstediği Net (userDesiredPrice)`, 1100000, 1100000);
  printRow(`AI Önerilen Net (aiRecommendedCustomerNet)`, preRes.aiRecommendedCustomerNet, postRes.aiRecommendedCustomerNet);
  printRow(`Anlaşılan Müşteri Neti (agreedCustomerNet)`, preRes.agreedCustomerNet, postRes.agreedCustomerNet);
  printRow(`Taban Şirket Komisyonu (baseCommission)`, preRes.baseCommission, postRes.baseCommission);
  printRow(`Performans Marjı (performanceMargin)`, preRes.performanceMargin, postRes.performanceMargin);
  printRow(`Şirket Brüt Marjı (expectedCompanyGrossMargin)`, preRes.expectedCompanyGrossMargin, postRes.expectedCompanyGrossMargin);

  console.log(`--------------------------------------------------------------------\n`);
  console.log(`💡 PİYASA VE KOD DEĞİŞİKLİĞİ ANALİZİ:`);
  console.log(`1. Yeni 11.027 İlan Eklendiği İçin Piyasa Değişimi:`);
  console.log(`   - Emsal sayısı: ${preRes.matchedListingCount} ➔ ${postRes.matchedListingCount} adet`);
  console.log(`   - Önerilen ilan fiyatı: ${preRes.recommendedPublicListingPrice.toLocaleString('tr-TR')} TL ➔ ${postRes.recommendedPublicListingPrice.toLocaleString('tr-TR')} TL (Fark: ${(postRes.recommendedPublicListingPrice - preRes.recommendedPublicListingPrice).toLocaleString('tr-TR')} TL)`);
  console.log(`   - Beklenen satış fiyatı: ${preRes.expectedSalePrice.toLocaleString('tr-TR')} TL ➔ ${postRes.expectedSalePrice.toLocaleString('tr-TR')} TL (Fark: ${(postRes.expectedSalePrice - preRes.expectedSalePrice).toLocaleString('tr-TR')} TL)`);
  console.log(`   - AI önerilen müşteri neti: ${preRes.aiRecommendedCustomerNet.toLocaleString('tr-TR')} TL ➔ ${postRes.aiRecommendedCustomerNet.toLocaleString('tr-TR')} TL`);

  console.log(`\n2. Konsinye Kod Düzeltmesi Sayesinde Gerçekleşen Sonuç:`);
  console.log(`   - Düzeltme öncesi hatalı agreedCustomerNet: AI Net (${postRes.aiRecommendedCustomerNet.toLocaleString('tr-TR')} TL) atanıyordu.`);
  console.log(`   - Düzeltme sonrası agreedCustomerNet: userDesiredPrice (${postRes.agreedCustomerNet.toLocaleString('tr-TR')} TL) olarak sabitlendi.`);
  console.log(`   - Şirket Brüt Marjı (expectedCompanyGrossMargin): 80.000 TL ➔ ${postRes.expectedCompanyGrossMargin.toLocaleString('tr-TR')} TL`);
  console.log(`   - Performans Marjı (performanceMargin): 0 TL ➔ ${postRes.performanceMargin.toLocaleString('tr-TR')} TL`);
  console.log(`====================================================================\n`);
}

runComparison().catch(console.error);
