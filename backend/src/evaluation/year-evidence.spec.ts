/**
 * YIL KANITI — SEYREK YIL GERI DUSUSU.
 *
 * Sabitlenen davranis: bir model yilinin kendi ilani az oldugunda kanit YOK
 * SAYILMAZ. Once yilin kendi ilanlari denenir; yetmezse pencere +-1, sonra
 * +-2 yila acilir ve odunc alinan ilanlar havuzun KENDI yil egrisiyle hedef
 * yila indirgenip daha dusuk agirlikla kullanilir.
 *
 * Bu dosya ayni zamanda demo veri setinin (build_demo_dataset.ts) sozlesmesi:
 * demo ile canli motor AYNI secimi yapar.
 */
import { PRICING_LIMITS } from './pricing-config';
import { RobustPricingCalculator } from './robust-pricing-calculator';
import {
  YEAR_BORROW_SPAN,
  buildYearCurve,
  learnAnnualDepreciation,
  normalizeToYear,
  selectYearEvidence,
  yearDistanceWeight,
} from './year-evidence';

/** Belirli bir yila n adet ilan uretir. */
const listings = (year: number, n: number, price: number) =>
  Array.from({ length: n }, () => ({ year, price }));

const POOL = [
  ...listings(2017, 2, 1_500_000),
  ...listings(2018, 3, 1_650_000),
  ...listings(2021, 40, 2_400_000),
  ...listings(2022, 40, 2_600_000),
];

const context = () => {
  const { rate } = learnAnnualDepreciation(POOL);
  return { rate, curve: buildYearCurve(POOL) };
};

const select = (year: number) =>
  selectYearEvidence(POOL, year, {
    ...context(),
    minCount: PRICING_LIMITS.minCompCountForPricing,
  });

describe('Yil uzakligi agirligi', () => {
  it('dogrudan gozlem tam, odunc alinan daha az agirlik tasir', () => {
    expect(yearDistanceWeight(0)).toBe(1);
    expect(yearDistanceWeight(1)).toBe(0.75);
    expect(yearDistanceWeight(-1)).toBe(0.75);
    expect(yearDistanceWeight(2)).toBe(0.5);
  });

  it('pencere disinda kanit alinmaz', () => {
    expect(yearDistanceWeight(YEAR_BORROW_SPAN + 1)).toBe(0);
    expect(yearDistanceWeight(-9)).toBe(0);
  });
});

describe('Kanit secimi: odunc alma GERI DUSUSTUR', () => {
  it('yogun yil yalnizca KENDI ilanlarini kullanir', () => {
    const evidence = select(2021);
    expect(evidence).toHaveLength(40);
    expect(evidence.every((e) => e.observation.year === 2021)).toBe(true);
    expect(evidence.every((e) => e.weight === 1)).toBe(true);
  });

  it('seyrek yil komsu yildan kanit odunc alir', () => {
    const evidence = select(2017);
    const direct = evidence.filter((e) => e.observation.year === 2017);
    const borrowed = evidence.filter((e) => e.observation.year !== 2017);

    expect(direct).toHaveLength(2);
    expect(borrowed).toHaveLength(3);
    expect(borrowed.every((e) => e.observation.year === 2018)).toBe(true);
    expect(borrowed.every((e) => e.weight === 0.75)).toBe(true);
  });

  it('pencere +-2 yildan oteye ACILMAZ', () => {
    const evidence = select(2017);
    for (const e of evidence) {
      expect(Math.abs(e.observation.year - 2017)).toBeLessThanOrEqual(
        YEAR_BORROW_SPAN,
      );
    }
    // 2021/2022 havuzda kalabalik ama 4 yil uzakta: hicbiri girmez.
    expect(evidence.some((e) => e.observation.year >= 2021)).toBe(false);
  });

  it('kanit yeterliyse pencere gereksiz yere genisletilmez', () => {
    // 2018 kendi basina 3 ilan; esik 5 oldugu icin +-1 acilir ve 2017 girer.
    const evidence = select(2018);
    expect(evidence).toHaveLength(5);
    expect(evidence.filter((e) => e.weight === 1)).toHaveLength(3);
  });
});

describe('Odunc alinan fiyat hedef yila indirgenir', () => {
  it('daha yeni yil indirgendiginde ucuzlar, eski yil pahalanir', () => {
    const { rate, curve } = context();
    const newerToOlder = normalizeToYear(2_600_000, 2022, 2021, rate, curve);
    const olderToNewer = normalizeToYear(2_400_000, 2021, 2022, rate, curve);

    expect(newerToOlder).toBeLessThan(2_600_000);
    expect(olderToNewer).toBeGreaterThan(2_400_000);
  });

  it('ayni yil icin fiyat DEGISMEZ', () => {
    const { rate, curve } = context();
    expect(normalizeToYear(1_500_000, 2017, 2017, rate, curve)).toBe(1_500_000);
  });
});

describe('Uc deger tek basina merkezi suruklemez', () => {
  it('3 ilanin biri absurt olsa da FMV medyanin yaninda kalir', () => {
    const cleanListings = [
      { make: 'x', model: 'y', year: 2018, mileageKm: 100_000, price: 1_000_000 },
      { make: 'x', model: 'y', year: 2018, mileageKm: 100_000, price: 1_050_000 },
      { make: 'x', model: 'y', year: 2018, mileageKm: 100_000, price: 5_000_000 },
    ];

    const result = RobustPricingCalculator.computeValuation({
      cleanListings: cleanListings as never,
      userYear: 2018,
      userMileage: 100_000,
      matchedLevel: 1,
      baseConfidenceScore: 0.9,
    } as never);

    const mean = (1_000_000 + 1_050_000 + 5_000_000) / 3;
    // Aritmetik ortalama 2,35 milyon; gozlemlerin ikisi 1,05 milyonun altinda.
    expect(result.fairMarketValue).toBeLessThan(1_500_000);
    expect(result.fairMarketValue).toBeLessThan(mean / 1.5);
    expect(result.fairMarketValue).toBeGreaterThan(800_000);
  });
});
