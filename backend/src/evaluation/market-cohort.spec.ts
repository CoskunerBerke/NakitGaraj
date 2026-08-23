/**
 * market-cohort.spec.ts
 *
 * GLOBAL PIYASA KOHORTU KURALI — HER MARKA, HER MODEL, HER ARAC.
 *
 * 1) HEDEFTEN ESKI MODEL YILI HICBIR KADEMEDE EMSAL DEGILDIR.
 *    Musterinin aracindan daha eski bir ilan, o aracin fiyatinin kaniti
 *    olamaz. Onceki surumde pencere simetrikti (yil -/+2). Olculen: Audi A3
 *    Sedan 35 TFSI 2025 hedefinde 234 emsalin 102'si 2024; Fiat Egea 1.4
 *    Fire 2021 hedefinde 3.195 emsalin 1.024'u 2020 modeldi.
 *
 * 2) ONCE HEDEF YIL. Hedef yilda yeterli gercek kanit varken daha yeni
 *    yillar yalnizca emsal SAYISINI buyutmek icin havuza katilmaz.
 *
 * 3) ONCE HEDEF KILOMETRE VE ALTI; icinde de hedefe EN YAKIN olanlar.
 *    Olculen: 60.000 km'lik Clio 2022 icin kohort 6.350-224.850 km
 *    araligindan 502 ilandi; 502'nin 361'i hedefin UZERINDE.
 *
 * 4) Hedef km ve alti YOKSA en yakin GERCEK gozlemlere acilir; uzaga
 *    atlanmaz.
 *
 * Bu kurallar marka/model ayrimi YAPMAZ. Testler fiyat SABITLEMEZ; kurali
 * gercek veritabani uzerinde dogrular.
 */
import { PrismaClient } from '@prisma/client';
import { EmsalMatcherService } from './emsal-matcher.service';

/** Gercek sihirbaz uclarindan secilmis, farkli segmentleri temsil eden hedefler. */
const TARGETS: Array<{ tag: string; make: string; model: string; variant?: string; trim?: string; year: number; km: number }> = [
  { tag: 'Audi A3 (premium, dusuk km)', make: 'Audi', model: 'A3', variant: 'A3 Sedan 35 TFSI', trim: 'S Line', year: 2025, km: 5_000 },
  { tag: 'Renault Clio (yaygin)', make: 'Renault', model: 'Clio', variant: '1.0 TCe', trim: 'Joy', year: 2022, km: 60_000 },
  { tag: 'BMW 1 Serisi (premium, yuksek km)', make: 'BMW', model: '1 Serisi', variant: '116d', trim: 'Executive', year: 2015, km: 167_000 },
  { tag: 'Mercedes C Serisi (premium)', make: 'Mercedes-Benz', model: 'C Serisi C 200 AMG', trim: 'AMG', year: 2023, km: 42_000 },
  { tag: 'Toyota Corolla (yaygin)', make: 'Toyota', model: 'Corolla', variant: '1.6', year: 2018, km: 100_000 },
  { tag: 'Fiat Egea (yaygin)', make: 'Fiat', model: 'Egea', variant: '1.4 Fire', year: 2021, km: 50_000 },
  { tag: 'Alfa Romeo 146 (eski arac)', make: 'Alfa Romeo', model: '146', trim: '1.6 L', year: 1998, km: 272_000 },
  { tag: 'Abarth 500e (nadir arac)', make: 'Abarth', model: '500e', variant: 'Standart', trim: 'Coupe', year: 2024, km: 6_001 },
];

describe('Global piyasa kohortu (gercek veritabani)', () => {
  let prisma: PrismaClient;
  let matcher: EmsalMatcherService;
  beforeAll(() => { prisma = new PrismaClient(); matcher = new EmsalMatcherService(prisma as any); });
  afterAll(async () => { await prisma.$disconnect(); });

  const match = (t: (typeof TARGETS)[number]) =>
    matcher.matchComparableListings({
      make: t.make, model: t.model, variant: t.variant, trim: t.trim, year: t.year, mileageKm: t.km,
    });

  describe.each(TARGETS)('$tag', (t) => {
    test('hedeften ESKI model yili kohorta GIREMEZ', async () => {
      const m = await match(t);
      for (const c of m.cleanListings as any[]) expect(c.year).toBeGreaterThanOrEqual(t.year);
    }, 60000);

    test('yil genislemesi EN YAKINDAN baslar (Y+2 varsa Y+1 de olmali)', async () => {
      const m = await match(t);
      const years = new Set((m.cleanListings as any[]).map((c) => c.year));
      if (years.has(t.year + 2)) expect(years.has(t.year + 1) || years.has(t.year)).toBe(true);
    }, 60000);

    test('hedef km ve alti yeterliyse UZERI kohorta girmez', async () => {
      const m = await match(t);
      const kms = (m.cleanListings as any[]).map((c) => c.mileageKm).filter((k) => k > 0);
      if (kms.length === 0) return;
      const below = kms.filter((k) => k <= t.km);
      // Yeterli yerel kanit varsa (>= minCount) hedefin uzeri DISARIDA kalir.
      if (below.length >= 5) expect(kms.every((k) => k <= t.km)).toBe(true);
    }, 60000);

    test('hedef km alti YOKSA en yakin gercek gozlemlere acilir (uzaga atlanmaz)', async () => {
      const m = await match(t);
      const kms = (m.cleanListings as any[]).map((c) => c.mileageKm).filter((k) => k > 0);
      if (kms.length === 0) return;
      const below = kms.filter((k) => k <= t.km);
      if (below.length >= 5) return; // bu vaka ustteki testin konusu
      // Geri cekilme yaricapi olcekle sinirlidir: hedefin katbekat uzagina atlanmaz.
      const scale = Math.max(t.km * 0.5, 15_000);
      for (const k of kms) expect(Math.abs(k - t.km)).toBeLessThanOrEqual(scale);
    }, 60000);
  });

  test('hedef yilda yeterli kanit varsa daha yeni yil EKLENMEZ', async () => {
    // Yogun ayni-yil kohortu: genisleme gereksizdir ve yapilmamalidir.
    const t = TARGETS[1]; // Renault Clio 2022
    const m = await match(t);
    expect(m.matchedCount).toBeGreaterThanOrEqual(5);
    for (const c of m.cleanListings as any[]) expect(c.year).toBe(t.year);
  }, 60000);

  test('ayni yil KIT ise en yakin YENI yila acilir, eskiye ASLA', async () => {
    // 2025 Abarth 500e Coupe: gercek tek ilan 2024 modeldir ve ARTIK
    // kullanilamaz. Eskiye donmek yerine kohort BOS kalir.
    const m = await matcher.matchComparableListings({
      make: 'Abarth', model: '500e', variant: 'Standart', trim: 'Coupe', year: 2025, mileageKm: 6_001,
    });
    for (const c of m.cleanListings as any[]) expect(c.year).toBeGreaterThanOrEqual(2025);
  }, 60000);

  test('kohort baska bir araca TASMAZ (kimlik korunur)', async () => {
    const m = await matcher.matchComparableListings({
      make: 'Audi', model: 'A3', variant: 'A3 Sedan 35 TFSI', trim: 'S Line', year: 2025, mileageKm: 5_000,
    });
    for (const c of m.cleanListings as any[]) {
      expect(c.model).toBe('A3');
      expect(/35 tfsi/i.test(c.trim || '')).toBe(true);
    }
  }, 60000);
});

describe('Kilometre yakinlik agirligi', () => {
  let prisma: PrismaClient;
  let matcher: any;
  beforeAll(() => { prisma = new PrismaClient(); matcher = new EmsalMatcherService(prisma as any); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('hedefe YAKIN gercek gozlemler merkezi belirler (5k hedef: 6k/8k/15k >> 80k/120k)', () => {
    const target = 5_000;
    const near = [6_000, 8_000, 15_000].map((k) => matcher.mileageProximityWeight(k, target));
    const far = [80_000, 120_000].map((k) => matcher.mileageProximityWeight(k, target));
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    // Yakin uclunun toplam agirligi, uzak ikilininkinin en az 4 kati olmali.
    expect(sum(near)).toBeGreaterThan(sum(far) * 4);
    // Agirlik mesafeyle MONOTON azalir.
    expect(near[0]).toBeGreaterThan(near[1]);
    expect(near[1]).toBeGreaterThan(near[2]);
    expect(near[2]).toBeGreaterThan(far[0]);
    expect(far[0]).toBeGreaterThan(far[1]);
  });

  test('kilometresi BILINMEYEN ilan cezalandirilmaz (bilinmezlik celiski degildir)', () => {
    expect(matcher.mileageProximityWeight(0, 50_000)).toBe(1);
    expect(matcher.mileageProximityWeight(null, 50_000)).toBe(1);
  });
});
