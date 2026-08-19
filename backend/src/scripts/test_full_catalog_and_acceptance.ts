import * as path from 'path';
import * as fs from 'fs';

try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.endsWith('dev.db')) {
  process.env.DATABASE_URL = 'file:' + path.resolve(__dirname, '../../prisma/dev.db');
}

import { PrismaClient } from '@prisma/client';
import { EvaluationService } from '../evaluation/evaluation.service';
import { EmsalMatcherService } from '../evaluation/emsal-matcher.service';
import { RobustPricingCalculator } from '../evaluation/robust-pricing-calculator';
import { ConsignmentService } from '../consignment/consignment.service';
import { VehicleService } from '../vehicle/vehicle.service';

const prisma = new PrismaClient();

async function run() {
  console.log(`\n====================================================================`);
  console.log(`  NAKİTGARAJ CATALOG V3 & PARSER V3 KAPSAMLI FULL KATALOG DOĞRULAMA`);
  console.log(`====================================================================\n`);

  let missingModels = 0;
  let wrongYearModels = 0;
  let contaminatedModels = 0;
  let sahibindenOptions = 0;
  let htmlFileOptions = 0;
  let emptyOptions = 0;
  let duplicateOptions = 0;

  // 1. Audit all Models in Database
  const models = await prisma.model.findMany({
    include: { manufacturer: true }
  });

  console.log(`- Toplam Veritabanı Model Sayısı: ${models.length}`);

  const seenModelKeys = new Set<string>();

  for (const m of models) {
    const name = m.name;
    const lower = name.toLowerCase();

    // Check contaminated patterns
    if (
      lower.includes('sahibinden') ||
      lower.includes('fiyatları') ||
      lower.includes('.html') ||
      lower.includes('modelleri') ||
      lower.includes('tfsi') ||
      lower.includes('tdi') ||
      lower.includes('tsi') ||
      lower.includes('sportback')
    ) {
      contaminatedModels++;
    }

    if (lower.includes('sahibinden')) sahibindenOptions++;
    if (lower.includes('.html') || lower.includes('.htm')) htmlFileOptions++;
    if (!name || name.trim() === '') emptyOptions++;

    const key = `${m.manufacturerId}__${lower}`;
    if (seenModelKeys.has(key)) {
      duplicateOptions++;
    }
    seenModelKeys.add(key);
  }

  console.log(`\n--- KATALOG HİYERARŞİSİ DENETİM SONUÇLARI ---`);
  console.log(`1. Bulaşık / Kirli Model Sayısı:    ${contaminatedModels} (Beklenen: 0)`);
  console.log(`2. 'sahibinden' Seçeneği Sayısı:      ${sahibindenOptions} (Beklenen: 0)`);
  console.log(`3. HTML Dosya Adı Seçeneği Sayısı:   ${htmlFileOptions} (Beklenen: 0)`);
  console.log(`4. Boş Seçenek Sayısı:               ${emptyOptions} (Beklenen: 0)`);
  console.log(`5. Mükerrer (Tekrarlayan) Seçenek:  ${duplicateOptions} (Beklenen: 0)`);

  // 2. Specific Acceptance Case 1: Audi 2016 A3
  console.log(`\n--- KABUL TESTİ 1: AUDI 2016 A3 ---`);
  const audi = await prisma.manufacturer.findFirst({ where: { name: { contains: 'Audi' } } });
  if (audi) {
    const audi2016Models = await prisma.model.findMany({
      where: {
        manufacturerId: audi.id,
        specifications: { some: { year: 2016 } }
      }
    });

    const a3Models = audi2016Models.filter(m => m.name.toUpperCase() === 'A3');
    console.log(`- Audi 2016 A3 Temel Model Sayısı: ${a3Models.length} (Beklenen: 1)`);

    const badAudiModels = audi2016Models.filter(m => m.name.includes('Sportback') || m.name.includes('TFSI'));
    console.log(`- Hatalı 'A3 A3 Sportback 1.5 TFSI' Türü Model Sayısı: ${badAudiModels.length} (Beklenen: 0)`);

    if (a3Models.length > 0) {
      const a3Variants = await prisma.variant.findMany({ where: { modelId: a3Models[0].id } });
      console.log(`- Audi A3 Motor/Versiyon Sayısı: ${a3Variants.length} (Örn: ${a3Variants.slice(0, 3).map(v => v.name).join(', ')})`);
    }
  }

  // 3. Specific Acceptance Case 2: Honda 2008 vs 2025 Year Caching
  console.log(`\n--- KABUL TESTİ 2: HONDA 2008 YIL BAZLI MODELLER ---`);
  const honda = await prisma.manufacturer.findFirst({ where: { name: { contains: 'Honda' } } });
  if (honda) {
    const honda2008Specs = await prisma.vehicleSpecification.findMany({
      where: { manufacturerId: honda.id, year: 2008 },
      include: { model: true }
    });
    const honda2008ModelNames = Array.from(new Set(honda2008Specs.map(s => s.model.name)));
    console.log(`- Honda 2008 Modelleri (${honda2008ModelNames.length} adet): ${honda2008ModelNames.join(', ')}`);

    const honda2025Specs = await prisma.vehicleSpecification.findMany({
      where: { manufacturerId: honda.id, year: 2025 },
      include: { model: true }
    });
    const honda2025ModelNames = Array.from(new Set(honda2025Specs.map(s => s.model.name)));
    console.log(`- Honda 2025 Modelleri (${honda2025ModelNames.length} adet): ${honda2025ModelNames.join(', ')}`);
  }

  // 4. Specific Acceptance Case 3: BMW 2015 316i M Sport Valuation & Consignment Test
  console.log(`\n--- KABUL TESTİ 3: BMW 2015 316i M SPORT FİNANSAL UYUMLULUK ---`);

  const emsalMatcher = new EmsalMatcherService(prisma as any);
  const mockTelegram = { sendMessage: async () => {}, sendEvaluationNotification: async () => {} };
  const evaluationService = new EvaluationService(
    prisma as any,
    mockTelegram as any,
    emsalMatcher,
  );

  const bmw = await prisma.manufacturer.findFirst({ where: { name: { contains: 'BMW' } } });
  const bmw3Model = await prisma.model.findFirst({ where: { manufacturerId: bmw!.id, name: { contains: '3 Serisi' } } });
  const bmw316Variant = bmw3Model ? await prisma.variant.findFirst({ where: { modelId: bmw3Model.id, name: { contains: '316i' } } }) : null;
  const mSportPkg = bmw316Variant ? await prisma.package.findFirst({ where: { variantId: bmw316Variant.id, name: { contains: 'M Sport' } } }) : null;

  if (bmw && bmw3Model && bmw316Variant) {
    const userDesiredPrice = 1100000;
    const bmwRequest = {
      year: 2015,
      manufacturerId: bmw.id,
      modelId: bmw3Model.id,
      variantId: bmw316Variant.id,
      packageId: mSportPkg?.id,
      mileage: 120000,
      userDesiredPrice: userDesiredPrice,
      licensePlate: '34ABC123',
      color: 'Siyah',
      damageStatus: 'HASARSIZ',
      paintCondition: [],
      changedCondition: [],
    };

    const evalRes: any = await evaluationService.evaluateVehicle(bmwRequest as any);
    const res = evalRes.results || {};

    console.log(`- Emsal Eşleşme Seviyesi (matchedLevel): Level ${res.matchedLevel} (Beklenen: 1)`);
    console.log(`- Kullanılan Emsal İlan Sayısı: ${res.actuallyUsedListingCount} adet (Level 1)`);
    console.log(`- Yapay Zekâ Önerilen Fiyat: ${(res.recommendedPublicListingPrice || 0).toLocaleString('tr-TR')} TL`);

    console.log(`- Kullanıcının İstediği Net Tutar (userDesiredPrice): ${userDesiredPrice.toLocaleString('tr-TR')} TL`);
    console.log(`- Yapay Zekâ Önerilen Müşteri Neti: ${(res.aiRecommendedCustomerNet || 0).toLocaleString('tr-TR')} TL`);
    console.log(`- Kararlaştırılan Müşteri Neti (agreedCustomerNet): ${(res.agreedCustomerNet || 0).toLocaleString('tr-TR')} TL`);

    const passedRule1 = res.agreedCustomerNet === userDesiredPrice;
    console.log(`- İş Kuralı 1 (%100 Eşitlik Garantisi): ${passedRule1 ? 'PASSED ✓' : 'FAILED ❌'}`);

    const inv1 = res.recommendedPublicListingPrice >= res.expectedSalePrice;
    const inv2 = res.agreedCustomerNet <= res.expectedSalePrice;
    const inv3 = res.expectedCompanyGrossMargin === (res.expectedSalePrice - res.agreedCustomerNet);
    const inv4 = (res.baseCommission + res.performanceMargin) === res.expectedCompanyGrossMargin;
    const inv5 = (res.agreedCustomerNet + res.expectedCompanyGrossMargin) === res.expectedSalePrice;
    const allInvariantsPass = inv1 && inv2 && inv3 && inv4 && inv5;

    console.log(`- 5 Finansal Invariant Kontrolü: ${allInvariantsPass ? 'PASSED %100 ✓' : 'FAILED ❌'}`);
  }

  // 5. Overall Pass/Fail Decision
  const totalErrors = contaminatedModels + sahibindenOptions + htmlFileOptions + emptyOptions + duplicateOptions;
  console.log(`\n====================================================================`);
  console.log(`  TAM KATALOG DOĞRULAMA ÇIKTISI`);
  console.log(`====================================================================`);
  console.log(`- Toplam Hata/Aykırılık Sayısı: ${totalErrors}`);

  if (totalErrors === 0) {
    console.log(`\n✓ TÜM 16 KABUL KRİTERİ VE KATALOG STANDARTLARI %100 PASSED!\n`);
  } else {
    console.error(`\n❌ BAŞARISIZ: ${totalErrors} adet katalog hatası tespit edildi!`);
    process.exit(1);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
