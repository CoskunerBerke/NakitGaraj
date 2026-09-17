/**
 * YIL KANITI — bir emsali hedef yila tasimanin TEK kaynagi.
 *
 * Bu dosya yeni bir formul GETIRMEZ. `emsal-matcher.service.ts` icinde
 * gelistirilmis olan yil egrisi / normalizasyon / yil-uzakligi agirligi
 * mantigi buraya tasindi ki hem canli motor hem de demo veri seti
 * (`scripts/build_demo_dataset.ts`) AYNI kurali kullansin. Demo, urunun
 * sadik bir temsili olmali; kendine ait ikinci bir fiyat mantigi olamaz.
 *
 * Ozet: bir havuzda hedef yilin kendi ilani az olabilir. O zaman komsu
 * yillarin ilanlari, havuzun KENDI yil egrisiyle hedef yila indirgenir ve
 * yil uzakligina gore daha dusuk agirlikla kullanilir. Kanit yok sayilmaz,
 * ama dogrudan gozlemle esit de sayilmaz.
 */
import { PRICING_LIMITS, clamp } from './pricing-config';

/** Yil egrisi/normalizasyonu icin bir ilandan gereken en az bilgi. */
export interface YearPricePoint {
  year: number;
  price: number;
}

/**
 * Komsu yildan kanit odunc alinabilecek EN BUYUK yil farki.
 *
 * Emsal merdiveninin en gevsek kademesi de ±2 yila kadar acilir
 * (`emsal-matcher.service.ts` -> levels[].yearSpan). Daha uzagi tasimak,
 * ogrenilen egrinin gozlem araligindan cikip sonumlenmis ekstrapolasyona
 * yaslanmak demektir; orada fiyat uydurmak yerine kanit yok sayilir.
 */
export const YEAR_BORROW_SPAN = 2;

/**
 * Yil uzakligi agirligi — merdivenin kullandigi degerlerin AYNISI
 * (`buildResult` icindeki quality carpanlari).
 *
 * Sabit bir "0,65 / 0,40" tablosu YERINE bu degerler kullanilir, cunku
 * normalizasyonun kendisi zaten havuzun olculen yil egrisinden gelir;
 * agirlik yalnizca artik belirsizligi cezalandirir.
 */
export function yearDistanceWeight(yearDiff: number): number {
  const diff = Math.abs(yearDiff);
  if (diff === 0) return 1;
  if (diff === 1) return 0.75;
  if (diff <= YEAR_BORROW_SPAN) return 0.5;
  return 0;
}

/**
 * Havuzun yillik deger degisim orani, ilanlardan OGRENILIR.
 *
 * En az uc yil noktasi (her biri >= 3 ilan) ister; yoksa kanit yoktur ve
 * varsayilan orana duser. Regresyon log-fiyat uzerinde, yil basina ilan
 * sayisiyla agirliklandirilmis olarak yapilir.
 */
export function learnAnnualDepreciation(rows: YearPricePoint[]): {
  rate: number;
  source: string;
} {
  const byYear = new Map<number, number[]>();
  for (const r of rows) {
    if (r.price <= 0) continue;
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year)!.push(r.price);
  }

  const points: Array<{ year: number; logPrice: number; n: number }> = [];
  for (const [year, prices] of byYear) {
    if (prices.length < 3) continue;
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median > 0)
      points.push({ year, logPrice: Math.log(median), n: prices.length });
  }

  if (points.length >= 3) {
    const totalN = points.reduce((s, p) => s + p.n, 0);
    const meanX = points.reduce((s, p) => s + p.year * p.n, 0) / totalN;
    const meanY = points.reduce((s, p) => s + p.logPrice * p.n, 0) / totalN;
    let num = 0;
    let den = 0;
    for (const p of points) {
      num += p.n * (p.year - meanX) * (p.logPrice - meanY);
      den += p.n * (p.year - meanX) ** 2;
    }
    if (den > 0) {
      const slope = num / den; // log-fiyat / yil
      const rate = Math.exp(slope) - 1; // yillik artis orani (yeni model daha pahali)
      if (Number.isFinite(rate) && rate > 0) {
        return {
          rate: clamp(
            rate,
            PRICING_LIMITS.annualDepreciationRange[0],
            PRICING_LIMITS.annualDepreciationRange[1],
          ),
          source: 'LEARNED_FROM_LISTINGS',
        };
      }
    }
  }

  return {
    rate: PRICING_LIMITS.defaultAnnualDepreciation,
    source: 'DEFAULT_ANNUAL_RATE',
  };
}

/**
 * Havuzun KENDI yil egrisi: yil -> log(medyan fiyat).
 *
 * Tek bir ussel oran, gozlem araliginin uzagina tasindiginda bozulur:
 * gercek deger kaybi ilk yillarda sert, sonra yavaslar. Yeterli ilani olan
 * her yil icin gercek medyan KANITTIR; oran yalnizca bosluklarda ve aralik
 * disinda kullanilir.
 */
export function buildYearCurve(rows: YearPricePoint[]): Map<number, number> {
  const byYear = new Map<number, number[]>();
  for (const r of rows) {
    if (r.price <= 0 || !r.year) continue;
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year)!.push(r.price);
  }

  const curve = new Map<number, number>();
  for (const [year, prices] of byYear) {
    if (prices.length < PRICING_LIMITS.yearCurveMinListings) continue;
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median > 0) curve.set(year, Math.log(median));
  }
  return curve;
}

/** Egrideki bir yilin log-fiyati; bosluklar interpole, aralik disi sonumlenir. */
export function logPriceAtYear(
  year: number,
  curve: Map<number, number>,
  rate: number,
): number | null {
  const observed = curve.get(year);
  if (observed !== undefined) return observed;

  const years = [...curve.keys()].sort((a, b) => a - b);
  if (years.length === 0) return null;

  const lo = years[0];
  const hi = years[years.length - 1];
  if (year < lo || year > hi) {
    // Aralik DISI: olculen egim tasinmaz, sonumlenerek uygulanir.
    const edge = year < lo ? lo : hi;
    return (
      curve.get(edge)! +
      Math.log(1 + rate) *
        (year - edge) *
        PRICING_LIMITS.yearExtrapolationDamping
    );
  }

  // Aralik ICI bosluk: komsu gozlemler arasinda log-uzayda interpolasyon.
  let before = lo;
  let after = hi;
  for (const candidate of years) {
    if (candidate <= year) before = candidate;
    if (candidate >= year) {
      after = candidate;
      break;
    }
  }
  if (before === after) return curve.get(before)!;

  const t = (year - before) / (after - before);
  return curve.get(before)! * (1 - t) + curve.get(after)! * t;
}

/**
 * Emsali hedef yila indirger.
 *
 * SERT [0,5 - 2,0] KIRPMASI KULLANILMAZ. Olculen: ogrenilen oranin %13,7
 * oldugu bir havuzda 2020 ilanini 2006'ya indirgemek icin gereken faktor
 * 0,166 iken kirpma onu 0,500'e cekiyor ve emsali 3,02 KATINA sisiriyordu;
 * ~9 yildan buyuk her yil farkinda ayni sey oluyordu. Sinir artik yil
 * farkina gore, mumkun olan EN SERT yillik orandan turetilir.
 */
export function normalizeToYear(
  price: number,
  listingYear: number,
  targetYear: number,
  rate: number,
  curve?: Map<number, number>,
): number {
  const diff = targetYear - listingYear;
  if (diff === 0) return price;

  let factor = Math.pow(1 + rate, diff);
  if (curve && curve.size > 0) {
    const from = logPriceAtYear(listingYear, curve, rate);
    const to = logPriceAtYear(targetYear, curve, rate);
    if (from !== null && to !== null) factor = Math.exp(to - from);
  }

  const bound = Math.pow(
    1 + PRICING_LIMITS.yearBoundMaxAnnualRate,
    Math.abs(diff),
  );
  return Math.max(1, Math.round(price * clamp(factor, 1 / bound, bound)));
}

/** Hedef yila indirgenmis tek bir emsal. */
export interface WeightedYearEvidence<T> {
  observation: T;
  /** Yil uzakligi agirligi: dogrudan gozlem 1, odunc alinan daha az. */
  weight: number;
  /** Hedef yila indirgenmis fiyat. */
  price: number;
}

/**
 * HEDEF YIL ICIN KANIT SECIMI — ODUNC ALMA BIR GERI DUSUSTUR.
 *
 * Emsal merdiveninin yil kapisiyla ayni sira izlenir: once yilin KENDI
 * ilanlari; sayi yetmiyorsa pencere +-1, sonra +-2 yila acilir ve yeterli
 * olan ILK kademe kullanilir. Yogun bir yil komsularindan kanit almaz —
 * aksi halde hem fiyat hem gosterilen referans kilometre kayar.
 *
 * Odunc alinan ilanlar havuzun KENDI yil egrisiyle hedef yila indirgenir
 * ve yil uzakligina gore daha dusuk agirlik tasir.
 */
export function selectYearEvidence<T extends YearPricePoint>(
  observations: T[],
  targetYear: number,
  options: { rate: number; curve: Map<number, number>; minCount: number },
): Array<WeightedYearEvidence<T>> {
  const gather = (span: number) =>
    observations
      .filter((o) => Math.abs(o.year - targetYear) <= span)
      .map((o) => ({
        observation: o,
        weight: yearDistanceWeight(o.year - targetYear),
        price: normalizeToYear(
          o.price,
          o.year,
          targetYear,
          options.rate,
          options.curve,
        ),
      }))
      .filter((e) => e.weight > 0);

  let evidence = gather(0);
  for (let span = 1; span <= YEAR_BORROW_SPAN; span += 1) {
    if (evidence.length >= options.minCount) break;
    evidence = gather(span);
  }
  return evidence;
}
