/**
 * single-comparable.spec.ts
 *
 * IS KURALI: TEK GERCEK EMSAL VARSA PIYASA REFERANSI O ILANIN FIYATIDIR.
 *
 * Gozlenebilir piyasa tek bir isteme fiyatindan ibaretse, sistem sahip
 * OLMADIGI bir piyasa bilgisini biliyormus gibi davranmaz: baska model yili,
 * baska donanim, aile medyani ya da genel bir yillik deger kaybi orani ile
 * "daha stabil" bir fiyat URETILMEZ.
 *
 * Bulunan hata: tek emsal, `learnAnnualDepreciation`in tek-ilanli havuzda
 * daima dondurdugu DEFAULT_ANNUAL_RATE ile hedef model yilina tasiniyordu.
 * Olculen: Abarth 500e Coupe icin tek gercek ilan 2024 / 3.500.000 TL iken
 * 2025 hedefinde piyasa referansi 3.695.000 TL — hic gozlenmemis bir fiyat.
 *
 * KILOMETRE de ayni kurala tabidir: tek ilanli havuzda km/fiyat egimi
 * OGRENILEMEZ (`withKm.length >= 6` saglanmaz) ve daima varsayilan segment
 * orani kullanilirdi. Bu orani musterinin kilometresine tasimak, gozlenmemis
 * bir fiyat uretir. Tek gozlem 3.500.000 TL ise piyasa referansi 6.001 km'de
 * de, 75.000 km'de de 3.500.000 TL'dir. Belirsizlik fiyata degil, guven
 * skoruna (ekstrapolasyon cezasi -> manuel kontrol) yansir.
 *
 * N >= 2 davranisi AYNEN korunur.
 */
import { PrismaClient } from '@prisma/client';
import { EmsalMatcherService } from './emsal-matcher.service';
import { EvaluationService } from './evaluation.service';
import { RobustPricingCalculator } from './robust-pricing-calculator';
import { roundToStep } from './quote-rounding';

const ordered = (r: any) =>
  r.cashOffer < r.customerConsignmentNet &&
  r.customerConsignmentNet < r.expectedSalePrice &&
  r.expectedSalePrice <= r.consignmentListingPrice;

/** Tek gercek ilanli aile: Abarth 500e Coupe (2024, 6.001 km, 3.500.000 TL). */
const SOLE = { make: 'Abarth', model: '500e', trim: 'Coupe', year: 2024, km: 6001, price: 3_500_000 };

describe('Tek emsal — piyasa referansi (gercek veritabani)', () => {
  let prisma: PrismaClient;
  let matcher: EmsalMatcherService;
  let svc: any;

  beforeAll(() => {
    prisma = new PrismaClient();
    matcher = new EmsalMatcherService(prisma as any);
    svc = new EvaluationService(prisma as any, { sendEvaluationNotification: async () => undefined } as any, matcher);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  const core = async (year: number, mileage: number, extra: any = {}) => {
    const make = await prisma.manufacturer.findUnique({ where: { name: SOLE.make } });
    const model = await prisma.model.findFirst({ where: { manufacturerId: make!.id, name: SOLE.model } });
    return svc.calculateValuationCore({
      year, manufacturerId: make!.id, modelId: model!.id,
      observedMake: SOLE.make, observedModel: SOLE.model, observedTrim: SOLE.trim,
      mileage, color: 'Beyaz', damageStatus: 'NO', tramerAmount: '0 TL', paintScheme: '{}',
      chassisState: '{"Şasi":""}', vehicleStatus: '{}', licensePlate: '34QA0000',
      firstName: 'T', lastName: 'T', phone: '05550000000', sellingTimeline: 'hemen', userDesiredPrice: 0,
      ...extra,
    });
  };

  test('A) tek gecerli emsal 3.500.000 -> piyasa referansi 3.500.000', async () => {
    const res: any = await core(SOLE.year, SOLE.km);
    expect(res.results.matchedListingCount).toBe(1);
    expect(res.results.marketReferenceValue).toBe(roundToStep(SOLE.price));
  }, 60000);

  test('A2) piyasa referansi MUSTERI KILOMETRESINDEN bagimsizdir', async () => {
    // Tek gozlem 3.500.000 TL. 6.001 / 35.000 / 75.000 km'de AYNI referans.
    for (const km of [6001, 35_000, 75_000]) {
      const res: any = await core(SOLE.year, km);
      expect(res.results.matchedListingCount).toBe(1);
      expect(res.results.marketReferenceValue).toBe(roundToStep(SOLE.price));
    }
  }, 120000);

  test('A3) km duzeltmesi UYGULANMAZ (denetim alani)', async () => {
    const m = await matcher.matchComparableListings({
      make: SOLE.make, model: SOLE.model, variant: 'Standart', trim: SOLE.trim,
      year: SOLE.year, mileageKm: 75_000,
    });
    expect(m.matchedCount).toBe(1);
    const out: any = RobustPricingCalculator.computeValuation({
      cleanListings: m.cleanListings as any, userYear: SOLE.year, userMileage: 75_000,
      matchedLevel: m.level, baseConfidenceScore: m.confidenceScore,
      realMatchedListingCount: 1, listingWeights: m.listingWeights,
    });
    expect(out.mileageAdjustmentSource).toBe('SINGLE_COMPARABLE_NO_MILEAGE_ADJUSTMENT');
    expect(out.mileageAdjustment).toBe(0);
    expect(out.pricingAudit.mileageAdjustmentAmount).toBe(0);
    // Emsalin fiyati fiyat dagilimina AYNEN girer.
    expect(out.pricingAudit.fairMarketValueRaw).toBe(SOLE.price);
    // Belirsizlik fiyata degil GUVENE yansir: ekstrapolasyon cezasi durur.
    expect(out.pricingAudit.extrapolationConfidencePenalty).toBeGreaterThan(0);
  }, 60000);

  test('B) tek emsal INSUFFICIENT_DATA DONDURMEZ, sayisal sonuc verir', async () => {
    const res: any = await core(SOLE.year, SOLE.km);
    expect(res.status).not.toBe('INSUFFICIENT_DATA');
    expect(res.results).not.toBeNull();
    for (const k of ['marketReferenceValue', 'cashOffer', 'customerConsignmentNet', 'consignmentListingPrice']) {
      expect(Number.isFinite(res.results[k])).toBe(true);
      expect(res.results[k]).toBeGreaterThan(0);
    }
  }, 60000);

  test('C) tek emsal ESKI YILDAN fiyat cekmez (2024 ilan, 2025 hedefe giremez)', async () => {
    // GLOBAL KOHORT KURALI: hedeften ESKI ilan emsal degildir. 2024 model tek
    // ilan, 2025 hedefi icin kanit SAYILMAZ; genel amortisman orani ile
    // "yeni model yiline tasinarak" da kullanilamaz.
    const m = await matcher.matchComparableListings({
      make: SOLE.make, model: SOLE.model, variant: 'Standart', trim: SOLE.trim,
      year: SOLE.year + 1, mileageKm: SOLE.km,
    });
    expect(m.matchedCount).toBe(0);
    for (const c of m.cleanListings as any[]) expect(c.year).toBeGreaterThanOrEqual(SOLE.year + 1);
  }, 60000);

  test('C2) tek emsal KENDI yilinda aynen kullanilir (N=1 sozlesmesi)', async () => {
    const m = await matcher.matchComparableListings({
      make: SOLE.make, model: SOLE.model, variant: 'Standart', trim: SOLE.trim,
      year: SOLE.year, mileageKm: SOLE.km,
    });
    expect(m.matchedCount).toBe(1);
    expect(m.cleanListings[0].price).toBe(SOLE.price);
    expect(m.yearAdjustmentSource).toBe('SINGLE_COMPARABLE_NO_YEAR_ADJUSTMENT');
  }, 60000);

  test('D) tek emsal BASKA donanim/model ailesinden fiyat cekmez', async () => {
    const m = await matcher.matchComparableListings({
      make: SOLE.make, model: SOLE.model, variant: 'Standart', trim: SOLE.trim,
      year: SOLE.year, mileageKm: SOLE.km,
    });
    expect(m.matchedCount).toBe(1);
    for (const c of m.cleanListings as any[]) {
      expect(c.model).toBe(SOLE.model);
      expect(/coupe/i.test(c.trim || '')).toBe(true);
    }
  }, 60000);

  test('E) kondisyon duzeltmesi piyasa referansindan SONRA uygulanir', async () => {
    const clean: any = await core(SOLE.year, SOLE.km);
    const painted: any = await core(SOLE.year, SOLE.km, {
      damageStatus: 'YES',
      paintScheme: JSON.stringify({ 'Sol Ön Kapı': 'BOYALI' }),
      vehicleStatus: JSON.stringify({ heavyDamage: false, scratchOrDent: false, crackedGlass: false, airbagDeployed: false, engineProblem: false, transmissionProblem: false }),
    });
    // Piyasa referansi ayni ilandan gelir ve kondisyondan ETKILENMEZ.
    expect(painted.results.marketReferenceValue).toBe(clean.results.marketReferenceValue);
    // Kondisyon sonrasi beklenen deger DUSER.
    expect(painted.results.conditionAdjustedSaleValue).toBeLessThan(clean.results.conditionAdjustedSaleValue);
  }, 60000);

  test('E2) yuksek kilometrede de kondisyon piyasa referansini DEGISTIRMEZ', async () => {
    const painted: any = await core(SOLE.year, 75_000, {
      damageStatus: 'YES',
      paintScheme: JSON.stringify({ 'Sol Ön Kapı': 'BOYALI' }),
      vehicleStatus: JSON.stringify({ heavyDamage: false, scratchOrDent: false, crackedGlass: false, airbagDeployed: false, engineProblem: false, transmissionProblem: false }),
    });
    expect(painted.results.marketReferenceValue).toBe(roundToStep(SOLE.price));
    expect(painted.results.conditionAdjustedSaleValue).toBeLessThan(painted.results.marketReferenceValue);
  }, 60000);

  test('F+G) nakit/net/ilan uretilir ve ekonomik siralama korunur', async () => {
    const res: any = await core(SOLE.year, SOLE.km);
    expect(ordered(res.results)).toBe(true);
    for (const k of ['marketReferenceValue', 'cashOffer', 'customerConsignmentNet', 'consignmentListingPrice']) {
      expect(res.results[k] % 5000).toBe(0);
    }
  }, 60000);

  test('musteriye kademe/emsal sayisi gibi ic terminoloji SIZDIRILMAZ', async () => {
    const res: any = await core(SOLE.year, SOLE.km);
    const text = JSON.stringify(res.aiAnalysis || []);
    expect(/Seviye\s*\d/.test(text)).toBe(false);
    expect(/N\s*=\s*1/.test(text)).toBe(false);
    expect(/LEARNED_|DEFAULT_ANNUAL|SINGLE_COMPARABLE/.test(text)).toBe(false);
  }, 60000);
});

describe('Yuksek destekli kohortlar DEGISMEDI', () => {
  let prisma: PrismaClient;
  let matcher: EmsalMatcherService;
  beforeAll(() => { prisma = new PrismaClient(); matcher = new EmsalMatcherService(prisma as any); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('H) Audi A3 Sedan 35 TFSI 2025 yuksek destek korunur', async () => {
    const m = await matcher.matchComparableListings({
      make: 'Audi', model: 'A3', variant: 'A3 Sedan 35 TFSI', trim: 'S Line', year: 2025, mileageKm: 15_000,
    });
    expect(m.level).toBeLessThan(4);
    // Pakete sadik yerel kohort (bkz. quote-fallback): 15+ acik S Line emsali.
    expect(m.matchedCount).toBeGreaterThanOrEqual(15);
    // N >= 2: yil normalizasyonu ESKISI GIBI calisir.
    expect(m.yearAdjustmentSource).not.toBe('SINGLE_COMPARABLE_NO_YEAR_ADJUSTMENT');
  }, 60000);

  test('I) Renault Clio 1.0 TCe Joy 2022 birebir kohort korunur', async () => {
    const m = await matcher.matchComparableListings({
      make: 'Renault', model: 'Clio', variant: '1.0 TCe', trim: 'Joy', year: 2022, mileageKm: 60_000,
    });
    expect(m.level).toBe(1);
    // Yerel kohort: sayi kuculdu (bkz. quote-fallback), kanit yerellesti.
    expect(m.matchedCount).toBeGreaterThanOrEqual(100);
    expect(m.yearAdjustmentSource).not.toBe('SINGLE_COMPARABLE_NO_YEAR_ADJUSTMENT');
  }, 60000);
});
