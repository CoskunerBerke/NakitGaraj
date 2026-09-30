import { RobustPricingCalculator } from './robust-pricing-calculator';

describe('RobustPricingCalculator (no database)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const snapshot = {
    weightedP5: 850000,
    weightedP35: 920000,
    weightedP50: 1000000,
    weightedP60: 1020000,
    weightedP95: 1150000,
    realMatchedListingCount: 20,
    matchedLevel: 2,
    baseConfidenceScore: 80,
  };

  it('derives the expected mileage from the vehicle age in the current year', () => {
    jest.useFakeTimers({ now: new Date('2030-06-01T12:00:00Z') });

    // 2025 car in 2030 = 5 years * 15.000 km expected, so 75.000 km is on par.
    const result = RobustPricingCalculator.computeValuationFromSnapshot({
      ...snapshot,
      userYear: 2025,
      userMileage: 75000,
    });

    expect(result.referenceMedianMileage).toBe(75000);
    expect(result.kmDelta).toBe(0);
    expect(result.mileageAdjustment).toBe(-0);
    expect(result.fairMarketValue).toBe(1000000);
  });

  it('keeps cash offer < fair value < consignment listing, and net = sale - commission', () => {
    const result = RobustPricingCalculator.computeValuationFromSnapshot({
      ...snapshot,
      userYear: 2020,
      userMileage: 90000,
      referenceMedianMileage: 90000,
    });

    expect(result.cashOffer).toBeLessThan(result.fairMarketValue);
    expect(result.consignmentListingPrice).toBeGreaterThan(result.cashOffer);
    expect(result.customerConsignmentNet).toBe(
      result.expectedConsignmentSalePrice - result.consignmentCommission,
    );
    expect(result.cashOffer % 5000).toBe(0);
  });
});
