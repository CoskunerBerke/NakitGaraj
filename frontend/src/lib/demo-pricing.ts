/**
 * DEMO FIYATLAMA — backend motorunun MUSTERIYE DONUK katmaninin bire bir kopyasi.
 *
 * Demo, Vercel'de backend OLMADAN calisir. Emsal dagilimi tarayiciya tasinmaz;
 * onun yerine her (havuz, yil) icin GERCEK motorun urettigi FMV onceden
 * hesaplanip veri setine yazilir (`build_demo_dataset.ts`). Burada yalnizca
 * FMV'den sonraki adimlar yeniden uygulanir:
 *
 *   kilometre duzeltmesi -> maliyet + risk + kar -> nakit teklif
 *                        -> komisyon tavani      -> konsinye net / ilan fiyati
 *
 * Sayilar backend ile AYNI olmali; bu yuzden katsayilar
 * `backend/src/evaluation/pricing-config.ts` ve `robust-pricing-calculator.ts`
 * dosyalarindan degistirilmeden alinmistir. Birini degistirirseniz digerini de
 * degistirin.
 */

/** Musteriye giden tum tutarlar 5.000 TL adimlarina yuvarlanir. */
export const QUOTE_STEP = 5_000;
const roundToStep = (value: number): number =>
  Math.round(value / QUOTE_STEP) * QUOTE_STEP;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** pricing-config.ts > PRICING_LIMITS (ilgili alanlar) */
const LIMITS = {
  riskRateRange: [0.003, 0.035] as const,
  consignmentAdvantageMin: { abs: 15_000, rate: 0.01 },
  lowCompCountThreshold: 8,
  minCompCountForPricing: 5,
  kmDecayRange: [0.006, 0.03] as const,
  maxKmAdjustmentRatio: 0.35,
};

/** pricing-config.ts > PRICING_ECONOMICS */
const ECONOMICS = {
  referenceValue: 1_000_000,
  targetProfit: { referenceProfit: 28_000, exponent: 0.76, minimum: 20_000 },
  commissionScale: 0.8,
  operating: {
    fixedFloor: 14_000,
    floorUpTo: 600_000,
    baseExponent: 0.42,
    rateMin: 0.008,
    rateMax: 0.012,
    rateHalfValue: 10_000_000,
  },
};

interface Segment {
  name: string;
  maxExpectedSale: number;
  commission: { min: number; rate: number };
  minCashRatioOfExpectedSale: number;
  daysToSell: [number, number];
  minListingUplift: number;
}

/** pricing-config.ts > PRICING_SEGMENTS (musteriye donen alanlar) */
const SEGMENTS: Segment[] = [
  { name: 'ekonomik', maxExpectedSale: 600_000, commission: { min: 15_000, rate: 0.035 }, minCashRatioOfExpectedSale: 0.85, daysToSell: [10, 24], minListingUplift: 0.03 },
  { name: 'orta-alt', maxExpectedSale: 1_200_000, commission: { min: 22_000, rate: 0.032 }, minCashRatioOfExpectedSale: 0.87, daysToSell: [12, 28], minListingUplift: 0.032 },
  { name: 'orta', maxExpectedSale: 2_000_000, commission: { min: 30_000, rate: 0.03 }, minCashRatioOfExpectedSale: 0.885, daysToSell: [14, 32], minListingUplift: 0.034 },
  { name: 'ust-orta', maxExpectedSale: 4_000_000, commission: { min: 45_000, rate: 0.028 }, minCashRatioOfExpectedSale: 0.895, daysToSell: [18, 40], minListingUplift: 0.036 },
  { name: 'yuksek', maxExpectedSale: 8_000_000, commission: { min: 90_000, rate: 0.026 }, minCashRatioOfExpectedSale: 0.9, daysToSell: [25, 55], minListingUplift: 0.04 },
  { name: 'premium', maxExpectedSale: Number.POSITIVE_INFINITY, commission: { min: 180_000, rate: 0.025 }, minCashRatioOfExpectedSale: 0.9, daysToSell: [35, 75], minListingUplift: 0.045 },
];

const segmentFor = (expectedSalePrice: number): Segment =>
  SEGMENTS.find((s) => expectedSalePrice <= s.maxExpectedSale) ??
  SEGMENTS[SEGMENTS.length - 1];

/** Hedef kar: surekli, monoton artan, alt-dogrusal. */
const targetProfitFor = (expectedSalePrice: number): number => {
  const { referenceValue, targetProfit: T } = ECONOMICS;
  const v = Math.max(0, expectedSalePrice);
  const curve = T.referenceProfit * Math.pow(v / referenceValue, T.exponent);
  return Math.round(Math.max(T.minimum, curve));
};

/** Operasyon + elde tutma maliyeti: sabit taban korunur. */
const operatingCostFor = (expectedSalePrice: number): number => {
  const O = ECONOMICS.operating;
  const v = Math.max(0, expectedSalePrice);
  const base = O.fixedFloor * Math.pow(Math.max(1, v / O.floorUpTo), O.baseExponent);
  const rate = O.rateMin + (O.rateMax - O.rateMin) * (v / (v + O.rateHalfValue));
  return Math.round(base + rate * v);
};

/** Konsinye ilan fiyatina psikolojik bitis; taban asla bozulmaz. */
const psychologicalListingPrice = (calculated: number, floor: number): number => {
  const base = Math.max(calculated, floor);
  const candidate = Math.floor(base / 1000) * 1000 + 900;
  return candidate >= floor ? candidate : Math.ceil(floor / 1000) * 1000 + 900;
};

export interface DemoQuote {
  /** Temiz piyasa referansi (emsal merkezi), km'ye gore duzeltilmis. */
  fairMarketValue: number;
  /**
   * Konsinyede gercekci satis beklentisi. Komisyon ve musteri neti BUNUN
   * uzerinden kurulur (net = beklenen satis - komisyon), ilan fiyatindan
   * DEGIL; kart bu yuzden ikisini ayri gosterir.
   */
  expectedSalePrice: number;
  cashOffer: number;
  consignmentListingPrice: number;
  consignmentCommission: number;
  customerConsignmentNet: number;
  /** Konsinyenin nakde gore musteriye birakttigi fazla. */
  consignmentAdvantage: number;
  estimatedDaysToSellMin: number;
  estimatedDaysToSellMax: number;
  matchedListingCount: number;
  confidencePct: number;
  segment: string;
  /** Kilometre duzeltmesinin FMV'ye etkisi (TL, isaretli). */
  mileageAdjustment: number;
  referenceMedianMileage: number;
  requiresManualApproval: boolean;
  manualApprovalReason?: string;
}

export interface QuoteInput {
  /** Motorun ORNEKLENDIGI uc kilometre noktasi (artan). */
  kmPoints: [number, number, number];
  /** Bu uc noktada motorun urettigi FMV degerleri. */
  fmvPoints: [number, number, number];
  /** Kullanicinin girdigi kilometre. */
  mileageKm: number;
  /** O yila ait ilan sayisi. */
  yearListingCount: number;
  /** Havuzun toplam ilan sayisi. */
  poolListingCount: number;
}

/**
 * MOTORUN KILOMETRE EGRISINDEN OKUMA.
 *
 * Veri seti, motoru uc kilometre noktasinda calistirip sonuclari saklar.
 * Aradaki degerler log-uzayda dogrusal interpole edilir; disarisi ise en yakin
 * segmentin egimiyle SONUMLENEREK uzatilir ve toplam duzeltme motorun kendi
 * tavaniyla (%35) sinirlanir.
 *
 * NEDEN: ilk surumde tek bir FMV saklanip km duzeltmesi sonradan carpiliyordu;
 * olculen sapma medyanin %50 uzaginda p90 %16,3 idi. Motor duzeltmeyi yuzdelik
 * boru hattinin icinde uygular, bu yuzden sonradan carpmak ayni sonucu vermez.
 */
function fmvAtMileage(
  kmPoints: [number, number, number],
  fmvPoints: [number, number, number],
  mileageKm: number,
): number {
  const [k1, k2, k3] = kmPoints;
  const [f1, f2, f3] = fmvPoints;
  const logAt = (a: number, b: number, fa: number, fb: number, x: number): number => {
    if (b === a) return Math.log(fa);
    const t = (x - a) / (b - a);
    return Math.log(fa) * (1 - t) + Math.log(fb) * t;
  };

  let logValue: number;
  if (mileageKm <= k1) {
    // Alt uc: birinci segmentin egimi, sonumlu.
    const slope = k2 === k1 ? 0 : (Math.log(f2) - Math.log(f1)) / (k2 - k1);
    logValue = Math.log(f1) + slope * (mileageKm - k1) * OUTSIDE_DAMPING;
  } else if (mileageKm <= k2) {
    logValue = logAt(k1, k2, f1, f2, mileageKm);
  } else if (mileageKm <= k3) {
    logValue = logAt(k2, k3, f2, f3, mileageKm);
  } else {
    const slope = k3 === k2 ? 0 : (Math.log(f3) - Math.log(f2)) / (k3 - k2);
    logValue = Math.log(f3) + slope * (mileageKm - k3) * OUTSIDE_DAMPING;
  }

  const value = Math.exp(logValue);
  // Motorun km duzeltme tavani: merkez degerin +-%35'inden fazla sapamaz.
  const lo = f2 * (1 - LIMITS.maxKmAdjustmentRatio);
  const hi = f2 * (1 + LIMITS.maxKmAdjustmentRatio);
  return Math.max(1, Math.round(clamp(value, lo, hi)));
}

/** Gozlenen km araliginin disinda egim oldugu gibi tasinmaz. */
const OUTSIDE_DAMPING = 0.6;

/**
 * Guven skoru: demoda yalnizca emsal DESTEGINDEN turetilir. Backend ayrica
 * motor/yakit/vites kaniti da tartar; demo veri setinde o alanlar yoktur, bu
 * yuzden burada DAHA MUHAFAZAKAR bir tahmin uretilir (yukari degil).
 */
function confidenceFrom(yearCount: number, poolCount: number): number {
  const yearSupport = clamp(yearCount / 25, 0, 1);
  const poolSupport = clamp(poolCount / 200, 0, 1);
  return clamp(0.55 + 0.3 * yearSupport + 0.15 * poolSupport, 0, 0.97);
}

export function quote(input: QuoteInput): DemoQuote {
  const { kmPoints, fmvPoints, mileageKm, yearListingCount, poolListingCount } =
    input;

  // 1) Kilometre: motorun ornekledigi egriden okunur
  const referenceMedianMileage = kmPoints[1];
  const baseFmv = fmvPoints[1];
  const fairMarketValue = fmvAtMileage(kmPoints, fmvPoints, mileageKm);
  const mileageAdjustment = fairMarketValue - baseFmv;

  // 2) Piyasa referansi = emsal merkezi (genel pazarlik kirimi YOK)
  const expectedSalePrice = fairMarketValue;
  const segment = segmentFor(expectedSalePrice);

  // 3) Maliyet + risk + hedef kar
  const operatingCost = operatingCostFor(expectedSalePrice);
  const dataConfidence = confidenceFrom(yearListingCount, poolListingCount);
  const liquidityPenalty =
    yearListingCount >= 25 ? 0 : yearListingCount >= LIMITS.lowCompCountThreshold ? 0.004 : 0.01;
  const highConfidenceRebate = Math.max(0, dataConfidence - 0.72) * 0.02;
  const riskRate = clamp(
    0.003 + (1 - dataConfidence) * 0.022 + liquidityPenalty - highConfidenceRebate,
    LIMITS.riskRateRange[0],
    LIMITS.riskRateRange[1],
  );
  const riskCost = Math.round(expectedSalePrice * riskRate);
  const targetProfit = targetProfitFor(expectedSalePrice);

  // 4) Nakit teklif — musteri tabani delinirse fiyat gosterilmez, manuel istenir
  let requiresManualApproval = false;
  let manualApprovalReason: string | undefined;

  const rawCashOffer = expectedSalePrice - operatingCost - riskCost - targetProfit;
  const customerFloor = Math.round(expectedSalePrice * segment.minCashRatioOfExpectedSale);
  let cashOffer = roundToStep(rawCashOffer);
  if (cashOffer < customerFloor) {
    requiresManualApproval = true;
    manualApprovalReason =
      'Bu araçta hesaplanan nakit teklif, müşteri koruma tabanının altında kalıyor. Manuel değerlendirme gerekiyor.';
    cashOffer = roundToStep(customerFloor);
  }

  // 5) Konsinye — musteriye HER ZAMAN nakitten anlamli sekilde fazla birakir
  const grossCashMargin = expectedSalePrice - cashOffer;
  const advantageMin = Math.max(
    LIMITS.consignmentAdvantageMin.abs,
    Math.round(expectedSalePrice * LIMITS.consignmentAdvantageMin.rate),
  );
  const commissionTarget = Math.max(
    segment.commission.min,
    Math.round(expectedSalePrice * segment.commission.rate * ECONOMICS.commissionScale),
  );
  const commissionCap = grossCashMargin - advantageMin;
  let consignmentCommission = Math.min(commissionTarget, commissionCap);
  if (commissionCap < segment.commission.min) {
    requiresManualApproval = true;
    manualApprovalReason =
      manualApprovalReason ||
      'Bu fiyat segmentinde konsinye komisyonu, müşteriye nakit teklifin üzerinde net bırakacak seviyede kurgulanamıyor. Manuel değerlendirme gereklidir.';
    consignmentCommission = Math.max(0, commissionCap);
  }

  const customerConsignmentNet = expectedSalePrice - consignmentCommission;
  const consignmentListingPrice = psychologicalListingPrice(
    Math.round(expectedSalePrice * (1 + segment.minListingUplift)),
    expectedSalePrice,
  );

  // 6) Invariant: nakit < konsinye net <= beklenen satis <= ilan fiyati
  if (
    !(
      cashOffer < expectedSalePrice &&
      customerConsignmentNet <= expectedSalePrice &&
      customerConsignmentNet > cashOffer &&
      consignmentListingPrice >= expectedSalePrice
    )
  ) {
    requiresManualApproval = true;
    manualApprovalReason =
      manualApprovalReason ||
      'Fiyat tutarlılık kontrolü sağlanamadı. Manuel değerlendirme gerekiyor.';
  }

  return {
    fairMarketValue,
    expectedSalePrice,
    cashOffer,
    consignmentListingPrice,
    consignmentCommission,
    customerConsignmentNet,
    consignmentAdvantage: customerConsignmentNet - cashOffer,
    estimatedDaysToSellMin: segment.daysToSell[0],
    estimatedDaysToSellMax: segment.daysToSell[1],
    matchedListingCount: poolListingCount,
    confidencePct: Math.round(dataConfidence * 100),
    segment: segment.name,
    mileageAdjustment,
    referenceMedianMileage,
    requiresManualApproval,
    manualApprovalReason,
  };
}

/** Veri setinde yeterli emsal yoksa fiyat URETILMEZ. */
export const hasEnoughEvidence = (yearListingCount: number): boolean =>
  yearListingCount >= LIMITS.minCompCountForPricing;

export const formatTL = (value: number): string =>
  new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(
    Math.round(value),
  );
