/**
 * YIL NORMALIZASYONU — SERT KIRPMA YERINE HAVUZUN KENDI EGRISI.
 *
 * OLCULEN SORUN (gercek korpus, `audi/a6/a6-sedan/2-0-tdi`, 1000+ ilan):
 * havuzdan ogrenilen yillik deger farki %13,7. Bir 2020 ilanini 2006 hedefine
 * indirgemek icin gereken faktor 0,166'dir. Eski kod faktoru [0,5 - 2,0]
 * araligina KIRPIYORDU:
 *
 *     2006 hedefi: ham 0,166 -> kirpilmis 0,500  => emsal 3,02 KATINA cikti
 *     2008 hedefi: ham 0,214 -> kirpilmis 0,500  => 2,33 kat
 *     2010 hedefi: ham 0,277 -> kirpilmis 0,500  => 1,80 kat
 *
 * Kirpma, ~9 yildan buyuk HER yil farkinda devreye giriyordu; yani havuzu
 * yeni araclardan olusan her eski hedef sistematik olarak yukari sapiyordu.
 *
 * 40 buyuk havuz x 327 (havuz, yogun yil) noktasinda olculen sonuc:
 *   |sapma| p90        %8,8 -> %6,3
 *   |sapma| <= %10     %92  -> %98
 *   nakit > gercek medyan   %5 -> %2
 */
import { PRICING_LIMITS } from './pricing-config';
import { EmsalMatcherService } from './emsal-matcher.service';

type Row = { price: number; year: number };

/**
 * `normalizeToYear` ve `buildYearCurve` private'tir. Testin ilgilendigi sey
 * DAVRANISTIR; ic yuzey burada TIPLI bir goruntuyle cagrilir.
 */
interface YearNormalizationSurface {
  normalizeToYear(
    price: number,
    listingYear: number,
    targetYear: number,
    rate: number,
    curve?: Map<number, number>,
  ): number;
  buildYearCurve(rows: Row[]): Map<number, number>;
}
const matcher = new EmsalMatcherService(
  {} as never,
) as unknown as YearNormalizationSurface;
const normalize = (
  price: number,
  listingYear: number,
  targetYear: number,
  rate: number,
  curve?: Map<number, number>,
): number =>
  matcher.normalizeToYear(price, listingYear, targetYear, rate, curve);
const buildCurve = (rows: Row[]): Map<number, number> =>
  matcher.buildYearCurve(rows);

describe('sert [0,5 - 2,0] kirpmasi kaldirildi', () => {
  it('14 yillik fark, gercek orani uygular (kirpilmaz)', () => {
    const rate = 0.137;
    const got = normalize(1_000_000, 2020, 2006, rate);
    const expected = 1_000_000 * Math.pow(1 + rate, -14); // ~166.000
    expect(got).toBeCloseTo(expected, -3);
    // Eski davranis 500.000 uretiyordu: 3 KATINDAN fazla sisme.
    expect(got).toBeLessThan(250_000);
  });

  it('kirpmanin devreye girdigi tum bantta artik sisme YOK', () => {
    const rate = 0.137;
    for (const target of [2006, 2008, 2010, 2013]) {
      const got = normalize(1_000_000, 2020, target, rate);
      const raw = 1_000_000 * Math.pow(1 + rate, target - 2020);
      // Sapma %1'in altinda: faktor artik gercek oranin kendisi.
      expect(Math.abs(got - raw) / raw).toBeLessThan(0.01);
      expect(got).toBeLessThan(500_000); // eski kirpilmis taban
    }
  });

  it('ayni yil fiyati DEGISTIRMEZ', () => {
    expect(normalize(1_234_567, 2019, 2019, 0.12)).toBe(1_234_567);
  });

  it('sinir hala korur: yil farkina gore en sert orandan turetilir', () => {
    // Bozuk/asiri bir oran gelse bile faktor yil farkinin sinirini asamaz.
    const diff = 3;
    const bound = Math.pow(1 + PRICING_LIMITS.yearBoundMaxAnnualRate, diff);
    const up = normalize(1_000_000, 2020, 2023, 0.9);
    expect(up).toBeLessThanOrEqual(Math.round(1_000_000 * bound) + 1);
    const down = normalize(1_000_000, 2023, 2020, 0.9);
    expect(down).toBeGreaterThanOrEqual(Math.round(1_000_000 / bound) - 1);
  });
});

describe('havuzun kendi yil egrisi', () => {
  /** Gercek bir amortisman sekli: basta sert, sonra yavaslayan. */
  const rows: Row[] = [
    ...Array(5)
      .fill(0)
      .map(() => ({ year: 2024, price: 2_000_000 })),
    ...Array(5)
      .fill(0)
      .map(() => ({ year: 2022, price: 1_500_000 })),
    ...Array(5)
      .fill(0)
      .map(() => ({ year: 2020, price: 1_200_000 })),
    ...Array(5)
      .fill(0)
      .map(() => ({ year: 2016, price: 900_000 })),
    ...Array(5)
      .fill(0)
      .map(() => ({ year: 2012, price: 800_000 })),
  ];

  it('yeterli ilani olan yillar egriye girer, seyrekler girmez', () => {
    const curve = buildCurve([...rows, { year: 2010, price: 700_000 }]);
    expect([...curve.keys()].sort()).toEqual([2012, 2016, 2020, 2022, 2024]);
    // 2010'da tek ilan var: kanit sayilmaz.
    expect(curve.has(2010)).toBe(false);
    expect(Math.exp(curve.get(2020)!)).toBeCloseTo(1_200_000, -1);
  });

  it('gozlenen iki yil arasinda ORAN degil, GERCEK medyan orani kullanilir', () => {
    const curve = buildCurve(rows);
    // 2024 -> 2012 gercekte 2.000.000 -> 800.000 (x0,40).
    const got = normalize(2_000_000, 2024, 2012, 0.08, curve);
    expect(got).toBe(800_000);
    // Sabit %8 oran olsaydi 2.000.000 * 0,92^12 = ~723.000 cikardi: egri daha dogru.
    expect(got).not.toBeCloseTo(2_000_000 * Math.pow(0.92, 12), -4);
  });

  it('aralik ICI bosluk log-uzayda interpolasyonla doldurulur', () => {
    const curve = buildCurve(rows);
    // 2018, 2016 ile 2020 arasinda; egride yok.
    const got = normalize(1_200_000, 2020, 2018, 0.08, curve);
    expect(got).toBeLessThan(1_200_000); // 2018 < 2020 degeri
    expect(got).toBeGreaterThan(900_000); // ama 2016'dan iyi
  });

  it('aralik DISI uzatma SONUMLENIR (km tarafiyla ayni gerekce)', () => {
    const curve = buildCurve(rows);
    const rate = 0.1;
    const damped = normalize(800_000, 2012, 2008, rate, curve);
    const undamped = 800_000 * Math.pow(1 + rate, -4);
    // Sonumleme, veri disinda egimi oldugu gibi tasimaz: dusus daha yumusak.
    expect(damped).toBeGreaterThan(undamped);
    expect(damped).toBeLessThan(800_000);
    expect(PRICING_LIMITS.yearExtrapolationDamping).toBeLessThan(1);
  });

  it('egri yoksa davranis eskisi gibi orana duser', () => {
    const rate = 0.09;
    const withoutCurve = normalize(1_000_000, 2020, 2017, rate);
    const emptyCurve = normalize(1_000_000, 2020, 2017, rate, new Map());
    expect(emptyCurve).toBe(withoutCurve);
    expect(withoutCurve).toBeCloseTo(1_000_000 * Math.pow(1 + rate, -3), -3);
  });
});
