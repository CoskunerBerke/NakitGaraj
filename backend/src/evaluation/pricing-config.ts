/**
 * pricing-config.ts
 *
 * NakitGaraj Fiyatlama Motoru V3 - MERKEZI KONFIGURASYON
 *
 * Buradaki tablolar galerinin ticari politikasidir. Kod degistirmeden
 * kar basamaklari / komisyon / maliyet varsayimlari buradan ayarlanir.
 *
 * Tum esikler "beklenen gercekci satis fiyati" (expectedSalePrice) uzerinden
 * degerlendirilir; ilan (asking) fiyati uzerinden DEGIL.
 */

export interface PricingSegment {
  /** Segment adi (raporlama/log icin) */
  name: string;
  /** Bu segmentin ust siniri (beklenen satis fiyati, TL). Sonuncusu Infinity. */
  maxExpectedSale: number;

  /** Hedef galeri kari: max(minProfit, rate * beklenenSatis) */
  targetProfit: { min: number; rate: number };

  /**
   * Operasyon + elde tutma maliyeti:
   * base (ekspertiz, detayli temizlik, noter/plaka, ilan) + rate * beklenenSatis
   * (sermaye maliyeti, garanti/onarim payi)
   */
  operatingCost: { base: number; rate: number };

  /** Beklenen pazarlik payi taban orani (ilan fiyati -> gercek satis) */
  baseNegotiationRate: number;

  /** Konsinye komisyonu: max(min, rate * beklenenSatis) */
  commission: { min: number; rate: number };

  /**
   * Musteriyi korumak icin: nakit teklif, beklenen satis fiyatinin bu oraninin
   * altina inemez. Inmesi gerekiyorsa fiyat gosterilmez, manuel degerlendirme
   * istenir (yanlis/korkutucu teklif uretmek yerine).
   */
  minCashRatioOfExpectedSale: number;

  /** Tahmini satis suresi araligi (gun) */
  daysToSell: [number, number];

  /** Konsinye ilan fiyati, beklenen satisin uzerine eklenen minimum pazarlik marji */
  minListingUplift: number;
}

/**
 * Segment sinirlari veritabanindaki gercek Sahibinden fiyat dagilimina gore
 * belirlenmistir (ekonomik hatchback ~300-600k, C segment ~0.8-1.5M,
 * premium orta sinif ~2-4M, ust segment 4M+).
 */
export const PRICING_SEGMENTS: PricingSegment[] = [
  {
    name: 'ekonomik',
    maxExpectedSale: 600_000,
    targetProfit: { min: 20_000, rate: 0.045 },
    operatingCost: { base: 14_000, rate: 0.008 },
    baseNegotiationRate: 0.030,
    commission: { min: 15_000, rate: 0.035 },
    // Musteri kabul esigi: bu oranin altina inen teklif gosterilmez, manuel istenir.
    minCashRatioOfExpectedSale: 0.85,
    daysToSell: [10, 24],
    minListingUplift: 0.030,
  },
  {
    name: 'orta-alt',
    maxExpectedSale: 1_200_000,
    targetProfit: { min: 30_000, rate: 0.040 },
    operatingCost: { base: 18_000, rate: 0.008 },
    baseNegotiationRate: 0.032,
    commission: { min: 22_000, rate: 0.032 },
    minCashRatioOfExpectedSale: 0.87,
    daysToSell: [12, 28],
    minListingUplift: 0.032,
  },
  {
    name: 'orta',
    maxExpectedSale: 2_000_000,
    targetProfit: { min: 40_000, rate: 0.038 },
    operatingCost: { base: 22_000, rate: 0.008 },
    baseNegotiationRate: 0.034,
    commission: { min: 30_000, rate: 0.030 },
    minCashRatioOfExpectedSale: 0.885,
    daysToSell: [14, 32],
    minListingUplift: 0.034,
  },
  {
    name: 'ust-orta',
    maxExpectedSale: 4_000_000,
    targetProfit: { min: 60_000, rate: 0.034 },
    operatingCost: { base: 28_000, rate: 0.009 },
    baseNegotiationRate: 0.036,
    commission: { min: 45_000, rate: 0.028 },
    minCashRatioOfExpectedSale: 0.895,
    daysToSell: [18, 40],
    minListingUplift: 0.036,
  },
  {
    name: 'yuksek',
    maxExpectedSale: 8_000_000,
    targetProfit: { min: 140_000, rate: 0.032 },
    operatingCost: { base: 40_000, rate: 0.010 },
    baseNegotiationRate: 0.040,
    commission: { min: 90_000, rate: 0.026 },
    minCashRatioOfExpectedSale: 0.90,
    daysToSell: [25, 55],
    minListingUplift: 0.040,
  },
  {
    name: 'premium',
    maxExpectedSale: Number.POSITIVE_INFINITY,
    targetProfit: { min: 280_000, rate: 0.035 },
    operatingCost: { base: 60_000, rate: 0.012 },
    baseNegotiationRate: 0.045,
    commission: { min: 180_000, rate: 0.025 },
    minCashRatioOfExpectedSale: 0.90,
    daysToSell: [35, 75],
    minListingUplift: 0.045,
  },
];

export const PRICING_LIMITS = {
  /** Pazarlik payi bu araligin disina cikamaz */
  negotiationRateRange: [0.02, 0.075] as [number, number],

  /** Risk maliyeti orani araligi (veri kalitesi + hasar kaynakli) */
  riskRateRange: [0.003, 0.035] as [number, number],

  /**
   * Konsinye komisyonu, nakit kanalinin toplam marjindan en az bu kadar dusuk
   * olmali. Bu, "konsinye musteriye her zaman nakitten fazla birakir"
   * invariantini yapisal olarak garanti eder.
   */
  consignmentAdvantageMin: { abs: 15_000, rate: 0.010 },

  /** Emsal sayisi bu degerin altindaysa fiyat guveni dusuk kabul edilir */
  lowCompCountThreshold: 8,

  /** Fiyat uretmek icin gereken mutlak minimum emsal sayisi */
  minCompCountForPricing: 5,

  /** Bu gun sayisindan eski ilanlar tazelik agirligini tamamen kaybeder */
  freshnessHalfLifeDays: 45,
  freshnessFloorWeight: 0.25,

  /** Yil normalizasyonu icin varsayilan yillik deger kaybi (ogrenilemezse) */
  defaultAnnualDepreciation: 0.08,
  annualDepreciationRange: [0.02, 0.18] as [number, number],

  /** Km duzeltmesi 10.000 km basina oran araligi */
  kmDecayRange: [0.006, 0.030] as [number, number],
  defaultKmDecayPer10k: 0.015,

  /** Tek bir ilanin km duzeltmesi, fiyatinin bu oranindan fazlasini degistiremez */
  maxKmAdjustmentRatio: 0.35,

  /** Gecerli ilan fiyat araligi (TL) */
  priceSanityRange: [50_000, 150_000_000] as [number, number],
};

export function getSegment(expectedSalePrice: number): PricingSegment {
  for (const seg of PRICING_SEGMENTS) {
    if (expectedSalePrice <= seg.maxExpectedSale) return seg;
  }
  return PRICING_SEGMENTS[PRICING_SEGMENTS.length - 1];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
