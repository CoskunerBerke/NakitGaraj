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
 * Kilometre duzeltmesi kapsam DISIDIR: o, AYNI ilanin farkli kilometreye
 * tasinmasidir (baska bir araca degil) ve fiyat cekirdeginin mevcut kanonik
 * yoludur. N >= 2 davranisi AYNEN korunur.
 */
import { PrismaClient } from '@prisma/client';
import { EmsalMatcherService } from './emsal-matcher.service';
import { EvaluationService } from './evaluation.service';
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

  test('B) tek emsal INSUFFICIENT_DATA DONDURMEZ, sayisal sonuc verir', async () => {
    const res: any = await core(SOLE.year, SOLE.km);
    expect(res.status).not.toBe('INSUFFICIENT_DATA');
    expect(res.results).not.toBeNull();
    for (const k of ['marketReferenceValue', 'cashOffer', 'customerConsignmentNet', 'consignmentListingPrice']) {
      expect(Number.isFinite(res.results[k])).toBe(true);
      expect(res.results[k]).toBeGreaterThan(0);
    }
  }, 60000);

  test('C) tek emsal KOMSU YILDAN fiyat cekmez (yil duzeltmesi uygulanmaz)', async () => {
    const m = await matcher.matchComparableListings({
      make: SOLE.make, model: SOLE.model, variant: 'Standart', trim: SOLE.trim,
      year: SOLE.year + 1, mileageKm: SOLE.km,
    });
    expect(m.matchedCount).toBe(1);
    // Ilanin fiyati AYNEN tasinir; genel amortisman orani UYGULANMAZ.
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
    expect(m.matchedCount).toBeGreaterThanOrEqual(50);
    // N >= 2: yil normalizasyonu ESKISI GIBI calisir.
    expect(m.yearAdjustmentSource).not.toBe('SINGLE_COMPARABLE_NO_YEAR_ADJUSTMENT');
  }, 60000);

  test('I) Renault Clio 1.0 TCe Joy 2022 birebir kohort korunur', async () => {
    const m = await matcher.matchComparableListings({
      make: 'Renault', model: 'Clio', variant: '1.0 TCe', trim: 'Joy', year: 2022, mileageKm: 60_000,
    });
    expect(m.level).toBe(1);
    expect(m.matchedCount).toBeGreaterThanOrEqual(300);
    expect(m.yearAdjustmentSource).not.toBe('SINGLE_COMPARABLE_NO_YEAR_ADJUSTMENT');
  }, 60000);
});
