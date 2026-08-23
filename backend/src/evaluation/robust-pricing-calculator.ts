import { CleanListingItem } from './emsal-matcher.service';
import {
  PRICING_ECONOMICS,
  PRICING_LIMITS,
  PricingSegment,
  clamp,
  getSegment,
  operatingCostFor,
  targetProfitFor,
} from './pricing-config';
import { finalizeCommercialQuote, roundToStep } from './quote-rounding';

export interface PricingEngineOutput {
  adjustedP35: number;
  fairMarketValue: number;
  recommendedPublicListingPrice: number;
  expectedSalePrice: number;
  customerDesiredNet: number;
  aiRecommendedCustomerNet: number;
  proposedCustomerNet: number;
  agreedCustomerNet: number;
  baseCommission: number;
  performanceMargin: number;
  expectedCompanyGrossMargin: number;
  cashOffer: number;
  cashOfferMin: number;
  cashOfferMax: number;
  consignmentListingPrice: number;
  expectedConsignmentSalePrice: number;
  consignmentCommission: number;
  customerConsignmentNet: number;
  estimatedDaysToSellMin: number;
  estimatedDaysToSellMax: number;
  matchedListingCount: number;
  confidenceScore: number;
  requiresManualApproval?: boolean;
  manualApprovalReason?: string;
  mileageAdjustment?: number;
  kmDelta?: number;
  kmDecayPer10k?: number;
  referenceMedianMileage?: number;
  mileageAdjustmentSource?: string;
  pricingAudit?: any;
}

/** Emsal esleme motorunun her ilan icin urettigi normalizasyon meta verisi */
export interface WeightedListing extends CleanListingItem {
  /** Yil + km normalizasyonu sonrasi, hedef araca indirgenmis fiyat */
  normalizedPrice: number;
  /** Tazelik + esleme kalitesi agirligi (0..1] */
  weight: number;
}

interface PricingCoreInput {
  /** Yil/km normalize edilmis, agirlikli emsal fiyat dagilimi */
  normalized: Array<{ price: number; weight: number }>;
  damagePenalty: number;
  userDesiredPrice: number;
  matchedLevel: number;
  baseConfidenceScore: number;
  realMatchedListingCount: number;
  /** 0..1, emsal tazeligi (1 = hepsi guncel) */
  freshnessScore: number;
  /** 0..1, havuzdaki birebir motor eslesme orani */
  engineExactShare: number;
  /** 0..1, yakiti bilinen emsal orani */
  fuelKnownShare: number;
  /** 0..1, sanzimani bilinen emsal orani */
  transmissionKnownShare: number;
  /** Hedef aracin motoru biliniyor mu */
  targetEngineKnown: boolean;
  /**
   * Hedef kilometrenin, emsal havuzunun gozlenen [p10, p90] araliginin
   * DISINDA kalan mesafesi (km). Aralik icindeyse 0.
   */
  distanceOutsideObservedRange: number;
}

/**
 * Kilometre ekstrapolasyon belirsizligi cezasi.
 *
 * Gozlenen km araligi ICINDE ceza yoktur. Aralik disina cikildikca kademeli
 * (surekli, cliff'siz) artan bir ceza uygulanir: uzak bir kilometreye tasinan
 * tahmin, fiyat yonu dogru sonimlense bile daha belirsizdir.
 *
 * Egri: 0km->0, 25k->4, 75k->10, 150k->18, 300k+->24 (dogrusal ara degerler)
 */
export function mileageExtrapolationPenalty(distanceKm: number): number {
  const d = Math.max(0, distanceKm || 0);
  if (d === 0) return 0;
  const curve: Array<[number, number]> = [
    [0, 0],
    [25_000, 4],
    [75_000, 10],
    [150_000, 18],
    [300_000, 24],
  ];
  for (let i = 1; i < curve.length; i++) {
    const [x0, y0] = curve[i - 1];
    const [x1, y1] = curve[i];
    if (d <= x1) return y0 + ((d - x0) / (x1 - x0)) * (y1 - y0);
  }
  return curve[curve.length - 1][1];
}

/**
 * Guven skoru = "kac ilan var" DEGILDIR.
 * Eslesme kesinligi, oznitelik doluluğu, orneklem buyuklugu, tazelik,
 * dagilim genisligi ve fallback seviyesini BIRLIKTE yansitir.
 */
export function computeConfidence(input: {
  matchedLevel: number;
  listingCount: number;
  engineExactShare: number;
  fuelKnownShare: number;
  transmissionKnownShare: number;
  freshnessScore: number;
  dispersion: number;
  targetEngineKnown: boolean;
  /** Gozlenen km araligi disinda kalan mesafe (km); aralik icinde 0 */
  distanceOutsideObservedRange?: number;
}): number {
  const LEVEL_BASE: Record<number, number> = { 1: 94, 2: 80, 3: 64 };
  let score = LEVEL_BASE[input.matchedLevel] ?? 40;

  // 1) Eslesme kesinligi: havuzun ne kadari birebir ayni motor?
  score -= (1 - clamp(input.engineExactShare, 0, 1)) * 16;

  // 2) Oznitelik dolulugu: yakiti bilinmeyen emsal, dogrulanmamis emsaldir.
  score -= (1 - clamp(input.fuelKnownShare, 0, 1)) * 10;

  // 3) Tazelik
  score -= (1 - clamp(input.freshnessScore, 0, 1)) * 10;

  // 4) Dagilim genisligi
  score -= clamp((input.dispersion - 0.15) / 0.5, 0, 1) * 12;

  // 5) Orneklem buyuklugu
  if (input.listingCount < PRICING_LIMITS.lowCompCountThreshold) score -= 12;
  else if (input.listingCount < 15) score -= 6;
  else if (input.listingCount >= 40) score += 2;

  // 6) Yapisal sinirlar (tavanlar)
  // Sahibinden liste gorunumunde sanziman sutunu yoktur; havuzun cogunda
  // sanziman dogrulanamiyorsa tam guven verilemez.
  if (input.transmissionKnownShare < 0.5) score = Math.min(score, 90);
  // Hedef aracin motoru bilinmiyorsa fiyat model ailesini temsil eder.
  if (!input.targetEngineKnown) score = Math.min(score, 60);

  // 7) Kilometre ekstrapolasyon belirsizligi.
  // Tavanlardan SONRA uygulanir; aksi halde tavan cezayi yutardi.
  // Diger bilesenlerin yerine gecmez, onlara EK belirsizlik olarak calisir.
  score -= mileageExtrapolationPenalty(input.distanceOutsideObservedRange || 0);

  return Math.max(0, Math.min(97, Math.round(score)));
}

export class RobustPricingCalculator {
  /* ---------------------------------------------------------------- */
  /* Istatistik yardimcilari                                           */
  /* ---------------------------------------------------------------- */

  /**
   * IQR Outlier Removal: asiri ucuz/pahali hatali ilanlari eler.
   * Ic ceyrek uzerinden calisir, boylece tek bir hatali ilan (orn. 2019 BMW
   * icin 260.000 TL) medyani bozamaz.
   */
  static cleanOutliersIQR(prices: number[]): number[] {
    const [minP, maxP] = PRICING_LIMITS.priceSanityRange;
    const validPrices = prices.filter((p) => p >= minP && p <= maxP);
    if (validPrices.length < 4) return validPrices;

    const sorted = [...validPrices].sort((a, b) => a - b);
    const q1 = this.quantile(sorted, 0.25);
    const q3 = this.quantile(sorted, 0.75);
    const iqr = q3 - q1;

    const lowerBound = Math.max(minP, q1 - 1.5 * iqr);
    const upperBound = q3 + 1.5 * iqr;

    return sorted.filter((p) => p >= lowerBound && p <= upperBound);
  }

  /** Lineer interpolasyonlu quantile (siralanmis dizi bekler) */
  static quantile(sorted: number[], q: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  /** Agirlikli quantile: tazeligi dusuk ilanlar dagilimi daha az etkiler. */
  static weightedQuantile(items: Array<{ price: number; weight: number }>, q: number): number {
    if (items.length === 0) return 0;
    const sorted = [...items].sort((a, b) => a.price - b.price);
    const total = sorted.reduce((s, i) => s + Math.max(0, i.weight), 0);
    if (total <= 0) return this.quantile(sorted.map((i) => i.price), q);

    const target = total * q;
    let acc = 0;
    for (let i = 0; i < sorted.length; i++) {
      const w = Math.max(0, sorted[i].weight);
      if (acc + w >= target) {
        if (i === 0 || w === 0) return sorted[i].price;
        const prev = sorted[i - 1];
        const t = (target - acc) / w;
        return prev.price + (sorted[i].price - prev.price) * clamp(t, 0, 1);
      }
      acc += w;
    }
    return sorted[sorted.length - 1].price;
  }

  static calculatePercentiles(sortedPrices: number[]) {
    if (sortedPrices.length === 0) {
      return { p5: 0, p25: 0, p35: 0, p50: 0, p60: 0, p75: 0, p95: 0 };
    }
    return {
      p5: this.quantile(sortedPrices, 0.05),
      p25: this.quantile(sortedPrices, 0.25),
      p35: this.quantile(sortedPrices, 0.35),
      p50: this.quantile(sortedPrices, 0.5),
      p60: this.quantile(sortedPrices, 0.6),
      p75: this.quantile(sortedPrices, 0.75),
      p95: this.quantile(sortedPrices, 0.95),
    };
  }

  /** Nakit teklifleri temiz galeri basamaklarina yuvarlar (asla yukari degil) */
  /**
   * Nakit teklif yuvarlamasi: her deger araliginda 5.000 TL adim, en yakin.
   * Onceki surum 1M ustunde 10.000 asagi yuvarliyordu (2.847.000 -> 2.840.000).
   * Nihai rekabet payi ve minimum kar korumasi finalizeCommercialQuote icinde
   * tek yerde uygulanir; burada yalnizca adim granulerligi belirlenir.
   */
  static roundCashOffer(val: number): number {
    return roundToStep(val);
  }

  /** Konsinye ilan fiyatina psikolojik bitis uygular; tabani asla bozmaz. */
  static formatPsychologicalListingPrice(calculatedListingPrice: number, floor: number): number {
    const base = Math.max(calculatedListingPrice, floor);
    const thousands = Math.floor(base / 1000);
    const candidate = thousands * 1000 + 900;
    return candidate >= floor ? candidate : Math.ceil(floor / 1000) * 1000 + 900;
  }

  /* ---------------------------------------------------------------- */
  /* V3 CEKIRDEK                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * V3 fiyatlama cekirdegi.
   *
   *   beklenen gercek satis fiyati
   *     - operasyon / elde tutma maliyeti
   *     - risk maliyeti (veri kalitesi + hasar)
   *     - hedef galeri kari (progressive ladder)
   *   = nakit alis teklifi
   *
   * Konsinye:
   *   ilan fiyati -> pazarlik -> beklenen satis -> komisyon -> musteri neti
   *
   * Garanti edilen invariantlar:
   *   cashOffer            <  expectedSalePrice
   *   customerNet          <= expectedSalePrice
   *   customerNet          >  cashOffer
   *   consignmentListing   >= expectedSalePrice
   */
  private static priceFromDistribution(input: PricingCoreInput): PricingEngineOutput {
    const {
      normalized,
      damagePenalty,
      userDesiredPrice,
      matchedLevel,
      baseConfidenceScore,
      realMatchedListingCount,
      freshnessScore,
    } = input;

    if (normalized.length === 0) {
      throw new Error('Yeterli piyasa verisi bulunamadı');
    }

    // 1) Robust, agirlikli ilan (asking) dagilimi
    const askingP25 = this.weightedQuantile(normalized, 0.25);
    const askingP35 = this.weightedQuantile(normalized, 0.35);
    const askingP50 = this.weightedQuantile(normalized, 0.5);
    const askingP75 = this.weightedQuantile(normalized, 0.75);

    if (askingP50 <= 0) throw new Error('Yeterli piyasa verisi bulunamadı');

    // 2) Hasar amortismani -> gercekci piyasa degeri (musteriye gosterilen)
    const fairMarketValue = Math.round(askingP50 * (1 - damagePenalty));

    // 3) Belirsizlik sinyalleri (yayilim / likidite / tazelik).
    // Bunlar TEK BIR yerde -- risk rezervinde -- fiyatlanir (bkz. adim 5).
    const dispersion = askingP50 > 0 ? (askingP75 - askingP25) / askingP50 : 0;
    const liquidityPenalty =
      realMatchedListingCount >= 25 ? 0 :
      realMatchedListingCount >= PRICING_LIMITS.lowCompCountThreshold ? 0.004 : 0.010;
    const stalePenalty = (1 - clamp(freshnessScore, 0, 1)) * 0.010;

    /**
     * GENEL PAZARLIK KIRIMI YOK.
     *
     * Onceki surumde her araca "ilan fiyati -> satis fiyati" varsayimiyla
     * %3,5-7,5 (medyan %4,62) sabit bir kirim uygulaniyordu. Elimizde bunu
     * dogrulayan KAPANIS FIYATI verisi yok: korpus yalnizca ilan (asking)
     * fiyatlarini icerir. Kanitsiz bir kirim, gercek emsali bol olan araclarda
     * musteriye sistematik olarak dusuk teklif uretiyordu.
     *
     * Bu yuzden temiz arac icin piyasa referansi DOGRUDAN emsal merkezidir.
     * Alan API/denetim sozlesmesinde korunur ve 0 doner.
     * Ileride gercek NakitGaraj alim/satis verisi biriktiginde bu katsayi
     * OLCULMUS bir degerle geri acilabilir.
     */
    const negotiationRate = 0;

    // 4) Piyasa referansi = emsal merkezi (kondisyon duzeltmesi ayri katmandir)
    const expectedSalePrice = fairMarketValue;
    const segment: PricingSegment = getSegment(expectedSalePrice);

    // 5) Maliyet + risk + hedef kar
    // Operasyon maliyeti SUREKLI egriden gelir: segment basamaklari, arac
    // degeri sinirin bir tik ustune ciktiginda musterinin nakdini asagi
    // ziplatiyordu. Sabit taban (gercek islem maliyeti) korunur.
    const operatingCost = operatingCostFor(expectedSalePrice);

    /**
     * BELIRSIZLIK TEK KEZ FIYATLANIR.
     *
     * Onceki surumde ayni sinyal iki kez tahsil ediliyordu:
     *   - yayilim (dispersion): hem pazarlik oranina hem kar carpanina,
     *   - dusuk guven: hem risk maliyetine hem kar carpanina.
     * Artik tek ekonomik rezerv burasidir; destek, yayilim ve tazelik de
     * pazarlik oraninda degil BURADA fiyatlanir. Aralik degismedi
     * (PRICING_LIMITS.riskRateRange), yani rezerv ust siniri ayni.
     */
    const dataConfidence = clamp(baseConfidenceScore / 100, 0, 1);
    const riskRate = clamp(
      0.003 +
        (1 - dataConfidence) * 0.022 +
        damagePenalty * 0.25 +
        (matchedLevel >= 3 ? 0.006 : 0) +
        dispersion * 0.010 +
        liquidityPenalty +
        stalePenalty,
      PRICING_LIMITS.riskRateRange[0],
      PRICING_LIMITS.riskRateRange[1],
    );
    const riskCost = Math.round(expectedSalePrice * riskRate);

    /**
     * Hedef kar = galerinin TICARI karidir; belirsizlik rezervi DEGILDIR.
     * Belirsizlik yukarida riskCost olarak bir kez alindigi icin kar basamagi
     * ayrica buyutulmez. Alan denetim sozlesmesinde korunur ve 1 doner.
     */
    // Kar basamagi yerine SUREKLI, alt-dogrusal kar egrisi: TL kari arac
    // degeriyle artmaya devam eder ama dogrusal buyumez; cok ucuz araclarda
    // da anlamli bir taban birakir.
    const riskProfitUplift = 1;
    const targetProfit = Math.round(targetProfitFor(expectedSalePrice) * riskProfitUplift);

    // 6) Nakit teklif
    const rawCashOffer = expectedSalePrice - operatingCost - riskCost - targetProfit;
    const customerFloor = Math.round(expectedSalePrice * segment.minCashRatioOfExpectedSale);

    let requiresManualApproval = false;
    let manualApprovalReason: string | undefined;

    // Yuvarlama HER ZAMAN asagi yapilir; bu yuzden musteri tabani kontrolu
    // ham teklif uzerinde degil, MUSTERIYE GOSTERILECEK yuvarlanmis teklif
    // uzerinde yapilir. Aksi halde bir yuvarlama basamagi kadar (5.000/10.000 TL)
    // taban sessizce delinebilir.
    let cashOffer = this.roundCashOffer(rawCashOffer);

    if (cashOffer < customerFloor) {
      // Hedef kar ile musteriyi kacirmama tabani ayni anda saglanamiyor.
      // Yanlis/korkutucu fiyat gostermek yerine manuel degerlendirme.
      requiresManualApproval = true;
      // Musteriye gosterilen metin: dahili kar/rezerv rakamlari sizdirilmaz.
      manualApprovalReason =
        'Bu araç için otomatik fiyatlandırma güvenli aralıkta sonuç üretemedi. ' +
        'Size gerçekçi bir teklif sunabilmemiz adına aracınız uzmanımız tarafından değerlendirilecektir.';
      cashOffer = this.roundCashOffer(customerFloor);
    }

    // 7) Konsinye
    const grossCashMargin = expectedSalePrice - cashOffer;
    const advantageMin = Math.max(
      PRICING_LIMITS.consignmentAdvantageMin.abs,
      Math.round(expectedSalePrice * PRICING_LIMITS.consignmentAdvantageMin.rate),
    );

    const commissionTarget = Math.max(
      segment.commission.min,
      Math.round(expectedSalePrice * segment.commission.rate),
    );
    // Komisyon tavani: konsinye musteriye HER ZAMAN nakitten anlamli sekilde
    // daha fazla birakmali.
    const commissionCap = grossCashMargin - advantageMin;

    let consignmentCommission = Math.min(commissionTarget, commissionCap);

    if (commissionCap < segment.commission.min) {
      requiresManualApproval = true;
      manualApprovalReason =
        manualApprovalReason ||
        'Bu fiyat segmentinde konsinye komisyonu, müşteriye nakit teklifin üzerinde net bırakacak seviyede kurgulanamıyor. Manuel değerlendirme gereklidir.';
      consignmentCommission = Math.max(0, commissionCap);
    }

    const expectedConsignmentSalePrice = expectedSalePrice;
    let customerConsignmentNet = expectedConsignmentSalePrice - consignmentCommission;

    const consignmentListingPrice = this.formatPsychologicalListingPrice(
      Math.round(expectedConsignmentSalePrice * (1 + Math.max(negotiationRate, segment.minListingUplift))),
      expectedConsignmentSalePrice,
    );

    const aiRecommendedCustomerNet = customerConsignmentNet;

    // 8) Musterinin talep ettigi net: sadece guvenli tavana kadar kabul edilir.
    const maximumSafeCustomerNet = customerConsignmentNet;
    let agreedCustomerNet = aiRecommendedCustomerNet;
    if (userDesiredPrice > 0) {
      agreedCustomerNet = Math.min(userDesiredPrice, maximumSafeCustomerNet);
    }
    agreedCustomerNet = Math.max(agreedCustomerNet, cashOffer + 1);
    customerConsignmentNet = agreedCustomerNet;

    // 9) Invariant dogrulamasi (savunma amacli; ihlalde fiyat gosterme)
    const invariantsOk =
      cashOffer < expectedSalePrice &&
      customerConsignmentNet <= expectedSalePrice &&
      customerConsignmentNet > cashOffer &&
      consignmentListingPrice >= expectedSalePrice;

    if (!invariantsOk) {
      requiresManualApproval = true;
      manualApprovalReason =
        manualApprovalReason ||
        'Fiyat invariantları sağlanamadı (nakit/konsinye tutarlılığı). Manuel değerlendirme gereklidir.';
    }

    // 10) Guven skoru (bilesik veri kalitesi)
    const confidenceScore = computeConfidence({
      matchedLevel,
      listingCount: realMatchedListingCount,
      engineExactShare: input.engineExactShare,
      fuelKnownShare: input.fuelKnownShare,
      transmissionKnownShare: input.transmissionKnownShare,
      freshnessScore,
      dispersion,
      targetEngineKnown: input.targetEngineKnown,
      distanceOutsideObservedRange: input.distanceOutsideObservedRange,
    });

    // 11) TICARI YUVARLAMA (tek kanonik yer). Hassas degerler denetim alaninda
    // kalir (pricingAudit.*Raw); musteri/bayi/panel temiz 5.000 TL adimlarini
    // gorur ve hicbir yuzey ikinci bir aritmetik yapmaz.
    const quote = finalizeCommercialQuote({
      expectedSalePrice,
      fairMarketValue,
      cashOffer,
      customerConsignmentNet,
      consignmentListingPrice,
      operatingCost,
      riskCost,
      minimumProfit: PRICING_ECONOMICS.targetProfit.minimum,
    });
    const rawQuote = {
      expectedSalePriceRaw: Math.round(expectedSalePrice),
      fairMarketValueRaw: Math.round(fairMarketValue),
      cashOfferRaw: Math.round(cashOffer),
      customerConsignmentNetRaw: Math.round(customerConsignmentNet),
      consignmentListingPriceRaw: Math.round(consignmentListingPrice),
      roundingAdjustments: quote.adjustments,
    };

    const expectedCompanyGrossMargin = quote.expectedSalePrice - quote.customerConsignmentNet;

    const daysScale = realMatchedListingCount >= 25 ? 1 : 1.2;
    const estimatedDaysToSellMin = Math.round(segment.daysToSell[0] * daysScale);
    const estimatedDaysToSellMax = Math.round(segment.daysToSell[1] * daysScale);

    return {
      adjustedP35: Math.round(askingP35 * (1 - damagePenalty)),
      fairMarketValue: quote.fairMarketValue,
      recommendedPublicListingPrice: quote.consignmentListingPrice,
      expectedSalePrice: quote.expectedSalePrice,
      customerDesiredNet: userDesiredPrice > 0 ? userDesiredPrice : quote.customerConsignmentNet,
      aiRecommendedCustomerNet: roundToStep(aiRecommendedCustomerNet),
      proposedCustomerNet: quote.customerConsignmentNet,
      agreedCustomerNet: quote.customerConsignmentNet,
      baseCommission: quote.consignmentCommission,
      performanceMargin: Math.max(0, expectedCompanyGrossMargin - quote.consignmentCommission),
      expectedCompanyGrossMargin,
      cashOffer: quote.cashOffer,
      cashOfferMin: roundToStep(quote.cashOffer * 0.97),
      cashOfferMax: roundToStep(quote.cashOffer * 1.02),
      consignmentListingPrice: quote.consignmentListingPrice,
      expectedConsignmentSalePrice: quote.expectedSalePrice,
      consignmentCommission: quote.consignmentCommission,
      customerConsignmentNet: quote.customerConsignmentNet,
      estimatedDaysToSellMin,
      estimatedDaysToSellMax,
      matchedListingCount: realMatchedListingCount,
      confidenceScore,
      requiresManualApproval,
      manualApprovalReason,
      pricingAudit: {
        segment: segment.name,
        askingP25: Math.round(askingP25),
        askingP35: Math.round(askingP35),
        askingP50: Math.round(askingP50),
        askingP75: Math.round(askingP75),
        dispersion: Number(dispersion.toFixed(4)),
        freshnessScore: Number(freshnessScore.toFixed(3)),
        negotiationRate: Number(negotiationRate.toFixed(4)),
        negotiationAmount: Math.round(fairMarketValue - expectedSalePrice),
        operatingCost,
        riskRate: Number(riskRate.toFixed(4)),
        riskCost,
        targetProfit,
        riskProfitUplift: Number(riskProfitUplift.toFixed(3)),
        grossCashMargin,
        commissionTarget,
        commissionCap,
        customerFloor,
        damagePenalty,
        engineExactShare: input.engineExactShare,
        fuelKnownShare: input.fuelKnownShare,
        transmissionKnownShare: input.transmissionKnownShare,
        targetEngineKnown: input.targetEngineKnown,
        ...rawQuote,
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /* Snapshot (agregat) girisi                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Yalnizca agregat percentile verisi mevcut oldugunda kullanilir.
   * Km duzeltmesi burada agregat medyan km uzerinden uygulanir.
   */
  static computeValuationFromSnapshot(params: {
    weightedP5: number;
    weightedP35: number;
    weightedP50: number;
    weightedP60: number;
    weightedP95: number;
    realMatchedListingCount: number;
    kmDecayPer10k?: number;
    referenceMedianMileage?: number;
    mileageAdjustmentSource?: string;
    userYear: number;
    userMileage: number;
    damagePenalty?: number;
    userDesiredPrice?: number;
    matchedLevel: number;
    baseConfidenceScore: number;
    freshnessScore?: number;
    engineExactShare?: number;
    fuelKnownShare?: number;
    transmissionKnownShare?: number;
    targetEngineKnown?: boolean;
  }): PricingEngineOutput {
    const {
      weightedP35,
      weightedP50,
      weightedP60,
      weightedP95,
      weightedP5,
      realMatchedListingCount,
      kmDecayPer10k = PRICING_LIMITS.defaultKmDecayPer10k,
      referenceMedianMileage,
      mileageAdjustmentSource = 'SNAPSHOT_AGGREGATE',
      userMileage,
      damagePenalty = 0,
      userDesiredPrice = 0,
      matchedLevel,
      baseConfidenceScore,
      freshnessScore = 0.6,
      engineExactShare = 1,
      fuelKnownShare = 1,
      transmissionKnownShare = 1,
      targetEngineKnown = true,
    } = params;

    if (!weightedP50 || weightedP50 <= 0) {
      throw new Error('Yeterli piyasa verisi bulunamadı');
    }

    if (!referenceMedianMileage || referenceMedianMileage <= 0) {
      // Referans km bilinmiyorsa km duzeltmesi UYDURULMAZ; duzeltme yapilmaz
      // ve bu durum guven skoruna yansitilir.
      return this.priceFromDistribution({
        normalized: [
          { price: weightedP5, weight: 0.5 },
          { price: weightedP35, weight: 1 },
          { price: weightedP50, weight: 1.5 },
          { price: weightedP60, weight: 1 },
          { price: weightedP95, weight: 0.5 },
        ],
        damagePenalty,
        userDesiredPrice,
        matchedLevel,
        baseConfidenceScore: baseConfidenceScore - 10,
        realMatchedListingCount,
        freshnessScore,
        engineExactShare,
        fuelKnownShare,
        transmissionKnownShare,
        targetEngineKnown,
        // Agregat snapshot yolunda gozlenen km dagilimi yoktur; ceza uygulanmaz.
        distanceOutsideObservedRange: 0,
      });
    }

    const decay = clamp(
      kmDecayPer10k,
      PRICING_LIMITS.kmDecayRange[0],
      PRICING_LIMITS.kmDecayRange[1],
    );
    const kmDelta = userMileage - referenceMedianMileage;
    const kmRatio = clamp(
      (kmDelta / 10000) * decay,
      -PRICING_LIMITS.maxKmAdjustmentRatio,
      PRICING_LIMITS.maxKmAdjustmentRatio,
    );

    const adjust = (p: number) => Math.max(1, Math.round(p * (1 - kmRatio)));

    const out = this.priceFromDistribution({
      normalized: [
        { price: adjust(weightedP5), weight: 0.5 },
        { price: adjust(weightedP35), weight: 1 },
        { price: adjust(weightedP50), weight: 1.5 },
        { price: adjust(weightedP60), weight: 1 },
        { price: adjust(weightedP95), weight: 0.5 },
      ],
      damagePenalty,
      userDesiredPrice,
      matchedLevel,
      baseConfidenceScore,
      realMatchedListingCount,
      freshnessScore,
      engineExactShare,
      fuelKnownShare,
      transmissionKnownShare,
      targetEngineKnown,
      distanceOutsideObservedRange: 0,
    });

    return {
      ...out,
      mileageAdjustment: -Math.round(weightedP50 * kmRatio),
      kmDelta,
      kmDecayPer10k: decay,
      referenceMedianMileage,
      mileageAdjustmentSource,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Ham emsal ilan girisi (asil yol)                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Gercek Sahibinden emsallerinden degerleme.
   *
   * Emsal esleme motoru ilanlari zaten yil-normalize eder ve tazelik agirligi
   * verir; burada km normalizasyonu ogrenilmis regresyonla yapilir.
   */
  static computeValuation(params: {
    cleanListings: CleanListingItem[];
    userYear: number;
    userMileage: number;
    damagePenalty?: number;
    userDesiredPrice?: number;
    matchedLevel: number;
    baseConfidenceScore: number;
    realMatchedListingCount?: number;
    kmDecayPer10k?: number;
    referenceMedianMileage?: number;
    mileageAdjustmentSource?: string;
    level1CandidateCount?: number;
    level2CandidateCount?: number;
    level3CandidateCount?: number;
    usedEngineDistribution?: Record<string, number>;
    usedTrimDistribution?: Record<string, number>;
    excludedListingCount?: number;
    exclusionReasons?: string[];
    /** Emsal motorunun ilan basina verdigi tazelik/kalite agirligi */
    listingWeights?: number[];
    freshnessScore?: number;
    engineExactShare?: number;
    fuelKnownShare?: number;
    transmissionKnownShare?: number;
    targetEngineKnown?: boolean;
  }): PricingEngineOutput {
    const {
      cleanListings,
      userMileage,
      damagePenalty = 0,
      userDesiredPrice = 0,
      matchedLevel,
      baseConfidenceScore,
      realMatchedListingCount = cleanListings.length,
      listingWeights,
      freshnessScore = 0.6,
      engineExactShare = 1,
      fuelKnownShare = 1,
      transmissionKnownShare = 1,
      targetEngineKnown = true,
    } = params;

    const [minP, maxP] = PRICING_LIMITS.priceSanityRange;

    // 1) Fiyat sagligi + IQR uc deger temizligi
    const withWeights = cleanListings.map((l, i) => ({
      listing: l,
      weight: listingWeights && listingWeights[i] > 0 ? listingWeights[i] : 1,
    }));

    const sane = withWeights.filter(
      (w) => w.listing.price >= minP && w.listing.price <= maxP,
    );
    const iqrKeep = new Set(this.cleanOutliersIQR(sane.map((w) => w.listing.price)));
    const kept = sane.filter((w) => iqrKeep.has(w.listing.price));
    const usable = kept.length >= 3 ? kept : sane;

    if (usable.length === 0) {
      throw new Error('Yeterli piyasa verisi bulunamadı');
    }

    const excludedCount =
      cleanListings.length - usable.length + (params.excludedListingCount || 0);

    /**
     * TEK GERCEK EMSAL: PIYASA REFERANSI O ILANIN FIYATIDIR.
     *
     * Yil normalizasyonu N=1 icin zaten kapatildi (bkz. emsal-matcher
     * `singleComparable`). Ayni gerekce KILOMETRE normalizasyonu icin de
     * gecerlidir: tek ilanli havuzda km/fiyat egimi OGRENILEMEZ
     * (`withKm.length >= 6` sarti saglanmaz), bu yuzden daima varsayilan
     * segment orani -- yani kanit DISI bir sayi -- kullanilirdi. Bu orani
     * musterinin kilometresine tasimak, gozlenmemis bir fiyat uretir.
     *
     * Olculen: tek gercek ilan Abarth 500e 2024 / 6.001 km / 3.500.000 TL
     * iken musteri 75.000 km girdiginde piyasa referansi asagi kayiyordu.
     * Oysa elimizdeki TEK gozlem 3.500.000 TL'dir.
     *
     * Kilometrenin degeri elbette etkiler; ancak bunu SOYLEYECEK veri yoktur.
     * Belirsizlik fiyata uydurma duzeltme olarak degil, guven skoruna
     * ekstrapolasyon cezasi olarak yansir (asagida distanceOutsideObservedRange
     * DEGISMEDEN korunur ve arac manuel kontrole gider).
     *
     * N >= 2 davranisi AYNEN korunur.
     */
    const singleComparable = usable.length === 1;

    // 2) Km bilgisi olan ilanlardan km/fiyat egimini ogren.
    //    Km bilgisi olmayan ilan icin ASLA varsayilan km uydurulmaz.
    const withKm = usable.filter(
      (w) => typeof w.listing.mileageKm === 'number' && w.listing.mileageKm > 0,
    );

    const pricesForBase = usable.map((w) => w.listing.price).sort((a, b) => a - b);
    const basePrice = this.quantile(pricesForBase, 0.5) || 1;

    let learnedRatePer10k = PRICING_LIMITS.defaultKmDecayPer10k;
    let mileageAdjustmentSource = 'DEFAULT_SEGMENT_RATE';

    if (withKm.length >= 6) {
      const meanKm = withKm.reduce((s, w) => s + w.listing.mileageKm, 0) / withKm.length;
      const meanPrice = withKm.reduce((s, w) => s + w.listing.price, 0) / withKm.length;
      let num = 0;
      let den = 0;
      for (const w of withKm) {
        num += (w.listing.mileageKm - meanKm) * (w.listing.price - meanPrice);
        den += (w.listing.mileageKm - meanKm) ** 2;
      }
      if (den > 0) {
        const slope = num / den; // TL / km
        const computedRate = (-slope * 10000) / basePrice;
        if (Number.isFinite(computedRate) && computedRate > 0) {
          learnedRatePer10k = clamp(
            computedRate,
            PRICING_LIMITS.kmDecayRange[0],
            PRICING_LIMITS.kmDecayRange[1],
          );
          mileageAdjustmentSource = 'LEARNED_FROM_LISTINGS';
        }
      }
    } else if (withKm.length > 0) {
      mileageAdjustmentSource = 'LIMITED_KM_SAMPLE';
    } else {
      mileageAdjustmentSource = 'NO_KM_DATA';
    }

    // --- Km egimi guvenilirligi ve ekstrapolasyon sinirlamasi ---
    // Dar km araligina sahip havuzlarda (orn. cikis yili araclari: 6.000-40.000 km)
    // regresyon egimi gurultuludur ve sinir degerine dayanabilir. Bu egimi
    // havuzun disindaki bir kilometreye tasimak, yeni model bir araci eski
    // modelden ucuz gosterebilir. Bu yuzden:
    //   1) egim, km yayilimi dar oldukca varsayilana dogru buzulur,
    //   2) gozlenen [p10, p90] araliginin disinda kalan mesafeye egimin
    //      yalnizca bir kismi uygulanir.
    // Aralik ICINDE hesaplama degismez.
    const kmSorted = withKm.map((w) => w.listing.mileageKm).sort((a, b) => a - b);
    const kmP10 = kmSorted.length ? this.quantile(kmSorted, 0.1) : 0;
    const kmP90 = kmSorted.length ? this.quantile(kmSorted, 0.9) : 0;
    const kmSupportSpread = Math.max(0, kmP90 - kmP10);

    if (mileageAdjustmentSource === 'LEARNED_FROM_LISTINGS') {
      const slopeTrust = clamp(kmSupportSpread / PRICING_LIMITS.kmSlopeFullTrustSpread, 0, 1);
      learnedRatePer10k =
        slopeTrust * learnedRatePer10k +
        (1 - slopeTrust) * PRICING_LIMITS.defaultKmDecayPer10k;
      if (slopeTrust < 1) mileageAdjustmentSource = 'LEARNED_SHRUNK_TO_DEFAULT';
    }

    if (singleComparable) {
      mileageAdjustmentSource = 'SINGLE_COMPARABLE_NO_MILEAGE_ADJUSTMENT';
    }

    // Zaten hesaplanmis kmP10/kmP90 uzerinden turetilir; yeniden hesaplanmaz.
    const distanceOutsideObservedRange =
      kmSorted.length === 0
        ? 0
        : userMileage > kmP90
          ? userMileage - kmP90
          : userMileage < kmP10
            ? kmP10 - userMileage
            : 0;

    const damping = PRICING_LIMITS.kmExtrapolationDamping;
    const effectiveUserMileage =
      kmSorted.length === 0
        ? userMileage
        : userMileage > kmP90
          ? kmP90 + (userMileage - kmP90) * damping
          : userMileage < kmP10
            ? kmP10 - (kmP10 - userMileage) * damping
            : userMileage;

    // 3) Her emsali hedef kilometreye indirge.
    //    Km bilgisi olmayan ilan duzeltilmez, agirligi dusurulur.
    const normalized = usable.map((w) => {
      const l = w.listing;
      // Tek gercek emsal: ilanin fiyati AYNEN piyasa referansidir.
      if (singleComparable) {
        return { price: l.price, weight: w.weight };
      }
      const hasKm = typeof l.mileageKm === 'number' && l.mileageKm > 0;
      if (!hasKm) {
        return { price: l.price, weight: w.weight * 0.5 };
      }
      const deltaKm = l.mileageKm - effectiveUserMileage;
      const ratio = clamp(
        (deltaKm / 10000) * learnedRatePer10k,
        -PRICING_LIMITS.maxKmAdjustmentRatio,
        PRICING_LIMITS.maxKmAdjustmentRatio,
      );
      return { price: Math.max(1, Math.round(l.price * (1 + ratio))), weight: w.weight };
    });

    const out = this.priceFromDistribution({
      normalized,
      damagePenalty,
      userDesiredPrice,
      matchedLevel,
      baseConfidenceScore,
      realMatchedListingCount,
      freshnessScore,
      engineExactShare,
      fuelKnownShare,
      transmissionKnownShare,
      targetEngineKnown,
      distanceOutsideObservedRange,
    });

    const kmValues = withKm.map((w) => w.listing.mileageKm).sort((a, b) => a - b);
    const referenceMedianMileage = kmValues.length
      ? Math.round(this.quantile(kmValues, 0.5))
      : undefined;
    const kmDelta =
      referenceMedianMileage !== undefined ? userMileage - referenceMedianMileage : 0;
    // Uygulanan duzeltme, sonimlenmis hedef km uzerinden raporlanir.
    const effectiveKmDelta =
      referenceMedianMileage !== undefined ? effectiveUserMileage - referenceMedianMileage : 0;
    const mileageAdjustment =
      singleComparable || referenceMedianMileage === undefined
        ? 0
        : -Math.round(
            basePrice *
              clamp(
                (effectiveKmDelta / 10000) * learnedRatePer10k,
                -PRICING_LIMITS.maxKmAdjustmentRatio,
                PRICING_LIMITS.maxKmAdjustmentRatio,
              ),
          );

    return {
      ...out,
      mileageAdjustment,
      kmDelta,
      kmDecayPer10k: learnedRatePer10k,
      referenceMedianMileage,
      mileageAdjustmentSource,
      pricingAudit: {
        ...out.pricingAudit,
        targetMileageKm: userMileage,
        matchedLevel,
        level1CandidateCount: params.level1CandidateCount || 0,
        level2CandidateCount: params.level2CandidateCount || 0,
        level3CandidateCount: params.level3CandidateCount || 0,
        actuallyUsedListingCount: usable.length,
        usedEngineDistribution: params.usedEngineDistribution || {},
        usedTrimDistribution: params.usedTrimDistribution || {},
        learnedMileageRatePer10k: learnedRatePer10k,
        mileageAdjustmentSource,
        kmSupportP10: Math.round(kmP10),
        kmSupportP90: Math.round(kmP90),
        distanceOutsideObservedRange: Math.round(distanceOutsideObservedRange),
        extrapolationConfidencePenalty: Number(
          mileageExtrapolationPenalty(distanceOutsideObservedRange).toFixed(2),
        ),
        effectiveTargetKm: Math.round(effectiveUserMileage),
        kmExtrapolated: userMileage > kmP90 || userMileage < kmP10,
        mileageAdjustmentAmount: mileageAdjustment,
        referenceMedianMileage,
        listingsWithKm: withKm.length,
        excludedListingCount: excludedCount,
        exclusionReasons:
          params.exclusionReasons || ['IQR uç değer veya geçersiz fiyat/hasarlı ilan filtresi'],
      },
    };
  }
}
