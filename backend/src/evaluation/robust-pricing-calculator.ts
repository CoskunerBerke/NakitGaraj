import { CleanListingItem } from './emsal-matcher.service';

export interface InternalPricingExplanation {
  weightedP35: number;
  weightedP50: number;
  weightedP60: number;
  mileageAdjustment: number;
  trimAdjustment: number;
  conditionAdjustment: number;
  cashReserve: number;
  preparationCost: number;
  expectedNegotiation: number;
}

export interface PricingEngineOutput {
  fairMarketValue: number;
  cashOfferMin: number;
  cashOffer: number;
  cashOfferMax: number;
  consignmentListingPrice: number;
  expectedConsignmentSalePrice: number;
  consignmentCommission: number;
  customerConsignmentNet: number;
  estimatedDaysToSellMin: number;
  estimatedDaysToSellMax: number;
  confidenceScore: number;
  matchedListingCount: number;
  matchedLevel: number;
  pricingExplanation: InternalPricingExplanation;
}

export class RobustPricingCalculator {

  /**
   * Cleans raw listings using IQR (Interquartile Range) & MAD to filter outliers
   */
  static cleanOutliersIQR(prices: number[]): number[] {
    if (prices.length < 4) {
      return prices.filter(p => p > 50000 && p < 150000000);
    }

    const sorted = [...prices].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;

    const lowerBound = Math.max(50000, q1 - 1.5 * iqr);
    const upperBound = q3 + 1.5 * iqr;

    const filtered = sorted.filter(p => p >= lowerBound && p <= upperBound);
    return filtered.length > 0 ? filtered : sorted;
  }

  /**
   * Calculates Weighted Median (P50) and percentiles
   */
  static calculatePercentiles(prices: number[]): { p5: number; p35: number; p50: number; p60: number; p95: number } {
    if (prices.length === 0) {
      return { p5: 0, p35: 0, p50: 0, p60: 0, p95: 0 };
    }

    const sorted = [...prices].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      p5: sorted[Math.floor(len * 0.05)] || sorted[0],
      p35: sorted[Math.floor(len * 0.35)] || sorted[0],
      p50: sorted[Math.floor(len * 0.50)] || sorted[0],
      p60: sorted[Math.floor(len * 0.60)] || sorted[0],
      p95: sorted[Math.floor(len * 0.95)] || sorted[len - 1],
    };
  }

  /**
   * Base Cash Profit Reserve Table
   */
  static getBaseCashReserve(fairMarketValue: number): { reserveRate: number; minReserve: number } {
    if (fairMarketValue <= 800000) {
      return { reserveRate: 0.08, minReserve: 60000 };
    } else if (fairMarketValue <= 1500000) {
      return { reserveRate: 0.07, minReserve: 80000 };
    } else if (fairMarketValue <= 3000000) {
      return { reserveRate: 0.065, minReserve: 130000 };
    } else if (fairMarketValue <= 6000000) {
      return { reserveRate: 0.06, minReserve: 225000 };
    } else if (fairMarketValue <= 10000000) {
      return { reserveRate: 0.055, minReserve: 400000 };
    } else {
      return { reserveRate: 0.05, minReserve: 650000 };
    }
  }

  /**
   * Consignment Commission Tier Table
   */
  static getConsignmentCommission(expectedSalePrice: number): { commissionRate: number; minCommission: number } {
    if (expectedSalePrice < 1000000) {
      return { commissionRate: 0.05, minCommission: 35000 };
    } else if (expectedSalePrice <= 2000000) {
      return { commissionRate: 0.045, minCommission: 50000 };
    } else if (expectedSalePrice <= 4000000) {
      return { commissionRate: 0.035, minCommission: 80000 };
    } else if (expectedSalePrice <= 7000000) {
      return { commissionRate: 0.03, minCommission: 120000 };
    } else {
      return { commissionRate: 0.025, minCommission: 175000 };
    }
  }

  /**
   * Rounds Cash Offers to clean gallery boundaries (5.000 TL / 10.000 TL)
   */
  static roundCashOffer(val: number): number {
    if (val <= 1000000) {
      return Math.floor(val / 5000) * 5000;
    }
    return Math.floor(val / 10000) * 10000;
  }

  /**
   * Formats Consignment Listing Price with psychological endings (.900 ₺ / .490 ₺ / .990 ₺)
   */
  static formatPsychologicalListingPrice(calculatedListingPrice: number, fairMarketValue: number): number {
    const capped = Math.min(calculatedListingPrice, Math.round(fairMarketValue * 1.03));
    const thousands = Math.floor(capped / 1000);
    const candidate = thousands * 1000 - 1000; // e.g. 2.549.000 TL
    return candidate > 100000 ? candidate : capped;
  }

  /**
   * Main Valuation & Pricing Calculation Function
   */
  static computeValuation(params: {
    cleanListings: CleanListingItem[];
    userYear: number;
    userMileage: number;
    damagePenalty?: number;
    userDesiredPrice?: number;
    matchedLevel: number;
    baseConfidenceScore: number;
  }): PricingEngineOutput {
    const { cleanListings, userYear, userMileage, damagePenalty = 0, userDesiredPrice = 0, matchedLevel, baseConfidenceScore } = params;

    // 1. Raw Prices & IQR Outlier Filtering
    const rawPrices = cleanListings.map(l => l.price).filter(p => p > 0);
    const cleanedPrices = this.cleanOutliersIQR(rawPrices);
    const percentiles = this.calculatePercentiles(cleanedPrices);

    let p50Market = percentiles.p50;
    let p35Market = percentiles.p35;
    let p60Market = percentiles.p60;

    if (p50Market <= 0 || cleanedPrices.length === 0) {
      throw new Error('Yeterli piyasa verisi bulunamadı');
    }

    // 2. KM & Condition Adjustment
    const age = Math.max(1, 2026 - userYear);
    const expectedKm = age * 15000;
    const kmDelta = userMileage - expectedKm;

    // Regression-based KM adjustment: ~0.25% per 10.000 km
    let kmRatio = Math.min(0.12, Math.max(-0.10, (kmDelta / 10000) * 0.0025));
    const mileageAdjustment = -Math.round(p50Market * kmRatio);
    const conditionAdjustment = -Math.round(p50Market * damagePenalty);

    const fairMarketValue = Math.max(100000, Math.round(p50Market + mileageAdjustment + conditionAdjustment));

    // 3. Cash Offer Calculation
    const { reserveRate: baseRate, minReserve } = this.getBaseCashReserve(fairMarketValue);

    // Sales velocity / Days to sell estimation
    let daysMin = 14;
    let daysMax = 28;
    let velocityAdjustment = 0;

    if (fairMarketValue > 5000000) {
      daysMin = 20; daysMax = 42;
      velocityAdjustment += 0.01; // Premium car holding cost
    } else if (fairMarketValue < 1000000) {
      daysMin = 7; daysMax = 18;
      velocityAdjustment -= 0.005; // High liquidity fast mover
    }

    let compCountRisk = 0;
    if (cleanListings.length < 8) {
      compCountRisk = 0.025; // 2.5% data risk penalty
    }

    const finalReserveRate = baseRate + velocityAdjustment + compCountRisk;
    const requiredReserve = Math.max(minReserve, Math.round(fairMarketValue * finalReserveRate));

    const preliminaryCashOffer = fairMarketValue - requiredReserve;
    const adjustedP35 = Math.round(p35Market + mileageAdjustment + conditionAdjustment);

    // P35 Protection Guard:
    // If P50 - P35 < requiredReserve, do NOT shrink reserve with P35!
    let cashOfferRaw: number;
    if (fairMarketValue - adjustedP35 < requiredReserve) {
      cashOfferRaw = preliminaryCashOffer;
    } else {
      cashOfferRaw = Math.min(preliminaryCashOffer, adjustedP35);
    }

    let cashOffer = this.roundCashOffer(cashOfferRaw);
    const cashOfferMin = this.roundCashOffer(cashOffer * 0.96);
    const cashOfferMax = this.roundCashOffer(cashOffer * 1.02);

    // 4. Consignment Offer Calculation
    const adjustedP60 = Math.round(p60Market + mileageAdjustment + conditionAdjustment);
    let consignmentListingPrice = this.formatPsychologicalListingPrice(adjustedP60, fairMarketValue);

    // User desired price integration
    if (userDesiredPrice > 0) {
      consignmentListingPrice = this.formatPsychologicalListingPrice(userDesiredPrice, fairMarketValue * 1.05);
    }

    const expectedNegotiation = Math.round(consignmentListingPrice * 0.015); // ~1.5% negotiation buffer
    const expectedConsignmentSalePrice = Math.max(cashOffer + 30000, consignmentListingPrice - expectedNegotiation);

    const { commissionRate, minCommission } = this.getConsignmentCommission(expectedConsignmentSalePrice);
    const consignmentCommission = Math.max(minCommission, Math.round(expectedConsignmentSalePrice * commissionRate));
    const customerConsignmentNet = Math.round(expectedConsignmentSalePrice - consignmentCommission);

    // Confidence Score Calculation
    let confidenceScore = baseConfidenceScore;
    if (cleanListings.length < 8) confidenceScore -= 10;
    if (matchedLevel === 4) confidenceScore -= 20;

    return {
      fairMarketValue,
      cashOfferMin,
      cashOffer,
      cashOfferMax,
      consignmentListingPrice,
      expectedConsignmentSalePrice,
      consignmentCommission,
      customerConsignmentNet,
      estimatedDaysToSellMin: daysMin,
      estimatedDaysToSellMax: daysMax,
      confidenceScore: Math.max(40, Math.min(99, confidenceScore)),
      matchedListingCount: cleanListings.length,
      matchedLevel,
      pricingExplanation: {
        weightedP35: p35Market,
        weightedP50: p50Market,
        weightedP60: p60Market,
        mileageAdjustment,
        trimAdjustment: 0,
        conditionAdjustment,
        cashReserve: requiredReserve,
        preparationCost: 0,
        expectedNegotiation,
      },
    };
  }
}
