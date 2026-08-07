import { CleanListingItem } from './emsal-matcher.service';

export interface PricingEngineOutput {
  fairMarketValue: number;
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
}

export class RobustPricingCalculator {
  /**
   * IQR Outlier Removal: Filters extreme price outliers
   */
  static cleanOutliersIQR(prices: number[]): number[] {
    const validPrices = prices.filter(p => p >= 50000 && p <= 150000000);
    if (validPrices.length < 4) return validPrices;

    const sorted = [...validPrices].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;

    const lowerBound = Math.max(50000, q1 - 1.5 * iqr);
    const upperBound = q3 + 1.5 * iqr;

    return sorted.filter(p => p >= lowerBound && p <= upperBound);
  }

  /**
   * Percentile Calculator (p5, p35, p50, p60, p95)
   */
  static calculatePercentiles(sortedPrices: number[]) {
    const len = sortedPrices.length;
    if (len === 0) {
      return { p5: 0, p35: 0, p50: 0, p60: 0, p95: 0 };
    }

    return {
      p5: sortedPrices[Math.floor(len * 0.05)] || sortedPrices[0],
      p35: sortedPrices[Math.floor(len * 0.35)] || sortedPrices[0],
      p50: sortedPrices[Math.floor(len * 0.50)] || sortedPrices[0],
      p60: sortedPrices[Math.floor(len * 0.60)] || sortedPrices[0],
      p95: sortedPrices[Math.floor(len * 0.95)] || sortedPrices[len - 1],
    };
  }

  /**
   * Dynamic Cash Reserve Rate by Vehicle Price Segment
   */
  static getBaseCashReserve(price: number): { reserveRate: number; minReserve: number } {
    if (price <= 1000000) {
      return { reserveRate: 0.08, minReserve: 65000 };
    } else if (price <= 2500000) {
      return { reserveRate: 0.065, minReserve: 85000 };
    } else if (price <= 5000000) {
      return { reserveRate: 0.055, minReserve: 130000 };
    } else {
      return { reserveRate: 0.045, minReserve: 220000 };
    }
  }

  /**
   * Consignment Commission Tier Calculator
   */
  static getConsignmentCommission(expectedSalePrice: number): { commissionRate: number; minCommission: number } {
    if (expectedSalePrice <= 1500000) {
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
   * Formats Consignment Listing Price with psychological endings
   */
  static formatPsychologicalListingPrice(calculatedListingPrice: number, fairMarketValue: number): number {
    const capped = Math.min(calculatedListingPrice, Math.round(fairMarketValue * 1.03));
    const thousands = Math.floor(capped / 1000);
    const candidate = thousands * 1000 - 1000;
    return candidate > 100000 ? candidate : capped;
  }

  /**
   * Direct Valuation Method from Snapshot Aggregate Data
   */
  static computeValuationFromSnapshot(params: {
    weightedP5: number;
    weightedP35: number;
    weightedP50: number;
    weightedP60: number;
    weightedP95: number;
    realMatchedListingCount: number;
    kmDecayPer10k?: number;
    userYear: number;
    userMileage: number;
    damagePenalty?: number;
    userDesiredPrice?: number;
    matchedLevel: number;
    baseConfidenceScore: number;
  }): PricingEngineOutput {
    const {
      weightedP5,
      weightedP35,
      weightedP50,
      weightedP60,
      weightedP95,
      realMatchedListingCount,
      kmDecayPer10k = 0.0025,
      userYear,
      userMileage,
      damagePenalty = 0,
      userDesiredPrice = 0,
      matchedLevel,
      baseConfidenceScore,
    } = params;

    const p50Market = weightedP50;
    const p35Market = weightedP35;
    const p60Market = weightedP60;

    if (p50Market <= 0) {
      throw new Error('Yeterli piyasa verisi bulunamadı');
    }

    // 1. KM & Condition Adjustment
    const age = Math.max(1, 2026 - userYear);
    const expectedKm = age * 15000;
    const kmDelta = userMileage - expectedKm;

    let kmRatio = Math.min(0.12, Math.max(-0.10, (kmDelta / 10000) * kmDecayPer10k));
    const mileageAdjustment = -Math.round(p50Market * kmRatio);
    const conditionAdjustment = -Math.round(p50Market * damagePenalty);

    const fairMarketValue = Math.max(100000, Math.round(p50Market + mileageAdjustment + conditionAdjustment));

    // 2. Cash Offer Calculation
    const { reserveRate: baseRate, minReserve } = this.getBaseCashReserve(fairMarketValue);

    let daysMin = 14;
    let daysMax = 28;
    let velocityAdjustment = 0;

    if (fairMarketValue > 5000000) {
      daysMin = 20; daysMax = 42;
      velocityAdjustment += 0.01;
    } else if (fairMarketValue < 1000000) {
      daysMin = 7; daysMax = 18;
      velocityAdjustment -= 0.005;
    }

    // FIX: Evaluate comp count risk on REAL matched listing count!
    let compCountRisk = 0;
    if (realMatchedListingCount < 8) {
      compCountRisk = 0.025; // 2.5% data risk penalty only when real comps < 8
    }

    const finalReserveRate = baseRate + velocityAdjustment + compCountRisk;
    const requiredReserve = Math.max(minReserve, Math.round(fairMarketValue * finalReserveRate));

    const preliminaryCashOffer = fairMarketValue - requiredReserve;
    const adjustedP35 = Math.round(p35Market + mileageAdjustment + conditionAdjustment);

    let cashOfferRaw: number;
    if (fairMarketValue - adjustedP35 < requiredReserve) {
      cashOfferRaw = preliminaryCashOffer;
    } else {
      cashOfferRaw = Math.min(preliminaryCashOffer, adjustedP35);
    }

    let cashOffer = this.roundCashOffer(cashOfferRaw);
    const cashOfferMin = this.roundCashOffer(cashOffer * 0.96);
    const cashOfferMax = this.roundCashOffer(cashOffer * 1.02);

    // 3. Consignment Offer Calculation
    const adjustedP60 = Math.round(p60Market + mileageAdjustment + conditionAdjustment);
    let consignmentListingPrice = this.formatPsychologicalListingPrice(adjustedP60, fairMarketValue);

    if (userDesiredPrice > 0) {
      consignmentListingPrice = this.formatPsychologicalListingPrice(userDesiredPrice, fairMarketValue * 1.05);
    }

    const expectedNegotiation = Math.round(consignmentListingPrice * 0.015);
    const expectedConsignmentSalePrice = Math.max(cashOffer + 30000, consignmentListingPrice - expectedNegotiation);

    const { commissionRate, minCommission } = this.getConsignmentCommission(expectedConsignmentSalePrice);
    const consignmentCommission = Math.max(minCommission, Math.round(expectedConsignmentSalePrice * commissionRate));
    const customerConsignmentNet = Math.round(expectedConsignmentSalePrice - consignmentCommission);

    let confidenceScore = baseConfidenceScore;
    if (realMatchedListingCount < 8) confidenceScore -= 10;
    if (matchedLevel === 4) confidenceScore -= 20;

    return {
      fairMarketValue,
      cashOffer,
      cashOfferMin,
      cashOfferMax,
      consignmentListingPrice,
      expectedConsignmentSalePrice,
      consignmentCommission,
      customerConsignmentNet,
      estimatedDaysToSellMin: daysMin,
      estimatedDaysToSellMax: daysMax,
      matchedListingCount: realMatchedListingCount,
      confidenceScore: Math.max(0, Math.min(99, confidenceScore)),
    };
  }

  /**
   * Main Valuation & Pricing Calculation Function (Overloaded for raw clean listings)
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
  }): PricingEngineOutput {
    const {
      cleanListings,
      userYear,
      userMileage,
      damagePenalty = 0,
      userDesiredPrice = 0,
      matchedLevel,
      baseConfidenceScore,
      realMatchedListingCount = cleanListings.length,
    } = params;

    const rawPrices = cleanListings.map(l => l.price).filter(p => p > 0);
    const cleanedPrices = this.cleanOutliersIQR(rawPrices);
    const percentiles = this.calculatePercentiles(cleanedPrices);

    return this.computeValuationFromSnapshot({
      weightedP5: percentiles.p5,
      weightedP35: percentiles.p35,
      weightedP50: percentiles.p50,
      weightedP60: percentiles.p60,
      weightedP95: percentiles.p95,
      realMatchedListingCount,
      userYear,
      userMileage,
      damagePenalty,
      userDesiredPrice,
      matchedLevel,
      baseConfidenceScore,
    });
  }
}
