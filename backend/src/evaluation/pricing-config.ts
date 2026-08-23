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

  /**
   * Ogrenilen km egiminin guvenilirligi, havuzdaki km yayilimina baglidir.
   * p10-p90 yayilimi bu degere ulastiginda egime tam guvenilir; daha dar
   * havuzlarda egim varsayilana dogru buzulur (dar aralikta olculen egim
   * gurultudur ve uzak km degerlerine tasinamaz).
   */
  kmSlopeFullTrustSpread: 60_000,

  /**
   * Hedef kilometre havuzun gozlenen [p10, p90] araligi disindaysa, disarida
   * kalan mesafeye egimin yalnizca bu orani uygulanir (ekstrapolasyon
   * sonimlemesi). Aralik ICINDE davranis degismez.
   */
  kmExtrapolationDamping: 0.35,

  /** Gecerli ilan fiyat araligi (TL) */
  priceSanityRange: [50_000, 150_000_000] as [number, number],
};

/**
 * SUREKLI EKONOMI EGRILERI (V5)
 *
 * Hedef kar ve operasyon maliyeti artik SEGMENT BASAMAKLARIYLA degil, surekli
 * ve monoton egrilerle hesaplanir. Basamakli tablo iki uctan bozuyordu:
 *
 *  - Ucuz araclarda `targetProfit.min` mutlak tabani ile operasyon tabani
 *    birlesince oran cok yukseliyordu.
 *  - Pahali araclarda kar ORANI neredeyse sabit kaldigi icin mutlak TL marj
 *    dogrusal buyuyordu (50M araca 1.750.000 TL hedef kar).
 *  - Segment sinirlarinda (4M, 8M) arac degeri 10.000 TL artinca musterinin
 *    ham nakdi 10.150 ve 50.520 TL DUSUYORDU (olculen ucurumlar).
 *
 * Egriler mevcut tablonun kendi capa noktalarina oturtulmustur; orta pazar
 * (750K-2,5M) davranisi BIREBIR korunur. Segment tablosu musteri tabani,
 * komisyon, ilan uplift'i ve satis suresi icin kullanilmaya devam eder.
 */
export const PRICING_ECONOMICS = {
  /** Kar egrisinin capa noktasi: bu degerde hedef kar tam referenceProfit'tir. */
  referenceValue: 1_000_000,

  /**
   * Hedef kar (galerinin TICARI kari):
   *   profit(V) = max(minimum, referenceProfit * (V / referenceValue)^exponent)
   * exponent < 1 oldugu icin TL kari artmaya devam eder ama dogrusal degil.
   * `minimum`, cok ucuz araclarda galeriyi anlamsiz kara birakmayan tabandir
   * ve mevcut ekonomik segment tabaniyla AYNI tutulmustur (degistirilmedi).
   */
  targetProfit: {
    /**
     * REKABETCILIK V1 (olculen): 1.204 gercek yol uzerinde offline replay,
     * uc aday politika (bazal / ilimli / azami-guvenli). Secilen egri, tum
     * sert kapilarda SIFIR ihlalle (zarar 0, min-kar ihlali 0, siralama 0,
     * klif 0) en yuksek musteri teklifini verendir. `minimum` MECBURI kar
     * tabanidir ve DEGISMEDI; dusuk deger bandinda teklifler zaten sabit
     * operasyon maliyeti + bu tabanla sinirlidir (bilincli olarak korunur).
     * Ust bantta mutlak kar buyumesi yavaslatildi (20M'de ~439k -> ~273k
     * hedef kar): deger buyudu diye kar orantisiz buyumez.
     */
    referenceProfit: 28_000,
    exponent: 0.76,
    minimum: 20_000,
  },

  /**
   * Konsinye komisyon OLCEGI: segment tablosundaki oranlara uygulanir
   * (taban `min` degerleri DEGISMEZ). Olculen: 0,8 olceginde komisyon
   * kanali anlamli kalirken musteri neti belirgin artar ve
   * nakit < net < satis siralamasi tum orneklemde korunur.
   */
  commissionScale: 0.8,

  /**
   * Operasyon + elde tutma maliyeti:
   *   base(V) = fixedFloor * max(1, V / floorUpTo)^baseExponent
   *   rate(V) = rateMin + (rateMax - rateMin) * V / (V + rateHalfValue)
   *   operating(V) = base(V) + rate(V) * V
   * `fixedFloor` gercek sabit maliyettir (ekspertiz, detayli temizlik,
   * noter/plaka, ilan) ve ucuz araclarda KUCULTULMEZ.
   */
  operating: {
    fixedFloor: 14_000,
    floorUpTo: 600_000,
    baseExponent: 0.42,
    rateMin: 0.008,
    rateMax: 0.012,
    rateHalfValue: 10_000_000,
  },
};

/** Hedef kar: surekli, monoton artan, alt-dogrusal. */
export function targetProfitFor(expectedSalePrice: number): number {
  const { referenceValue, targetProfit: T } = PRICING_ECONOMICS;
  const v = Math.max(0, expectedSalePrice);
  const curve = T.referenceProfit * Math.pow(v / referenceValue, T.exponent);
  return Math.round(Math.max(T.minimum, curve));
}

/** Operasyon maliyeti: surekli, monoton artan; sabit taban korunur. */
export function operatingCostFor(expectedSalePrice: number): number {
  const { operating: O } = PRICING_ECONOMICS;
  const v = Math.max(0, expectedSalePrice);
  const base = O.fixedFloor * Math.pow(Math.max(1, v / O.floorUpTo), O.baseExponent);
  const rate = O.rateMin + (O.rateMax - O.rateMin) * (v / (v + O.rateHalfValue));
  return Math.round(base + rate * v);
}

export function getSegment(expectedSalePrice: number): PricingSegment {
  for (const seg of PRICING_SEGMENTS) {
    if (expectedSalePrice <= seg.maxExpectedSale) return seg;
  }
  return PRICING_SEGMENTS[PRICING_SEGMENTS.length - 1];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
