import { RobustPricingCalculator } from './robust-pricing-calculator';
import { CleanListingItem } from './emsal-matcher.service';

describe('NakitGaraj Advanced Valuation & Dual-Offer Pricing Engine Test Suite', () => {

  test('1. Engine Separation: 1.6 TDI and 35 TFSI receive distinct price valuations', () => {
    const tdiComps: CleanListingItem[] = [
      { make: 'Audi', model: 'A3', variant: '1.6 TDI', year: 2020, mileageKm: 80000, price: 1200000 },
      { make: 'Audi', model: 'A3', variant: '1.6 TDI', year: 2020, mileageKm: 82000, price: 1220000 },
      { make: 'Audi', model: 'A3', variant: '1.6 TDI', year: 2020, mileageKm: 85000, price: 1250000 },
      { make: 'Audi', model: 'A3', variant: '1.6 TDI', year: 2020, mileageKm: 78000, price: 1190000 },
    ];

    const tfsiComps: CleanListingItem[] = [
      { make: 'Audi', model: 'A3', variant: '35 TFSI', year: 2020, mileageKm: 80000, price: 1600000 },
      { make: 'Audi', model: 'A3', variant: '35 TFSI', year: 2020, mileageKm: 82000, price: 1620000 },
      { make: 'Audi', model: 'A3', variant: '35 TFSI', year: 2020, mileageKm: 85000, price: 1650000 },
      { make: 'Audi', model: 'A3', variant: '35 TFSI', year: 2020, mileageKm: 78000, price: 1590000 },
    ];

    const tdiResult = RobustPricingCalculator.computeValuation({
      cleanListings: tdiComps,
      userYear: 2020,
      userMileage: 80000,
      matchedLevel: 1,
      baseConfidenceScore: 90,
    });

    const tfsiResult = RobustPricingCalculator.computeValuation({
      cleanListings: tfsiComps,
      userYear: 2020,
      userMileage: 80000,
      matchedLevel: 1,
      baseConfidenceScore: 90,
    });

    expect(tfsiResult.fairMarketValue).toBeGreaterThan(tdiResult.fairMarketValue);
    expect(tfsiResult.cashOffer).toBeGreaterThan(tdiResult.cashOffer);
  });

  test('2. Body Type Separation: Sedan and Sportback are evaluated with distinct comps', () => {
    const sedanComps: CleanListingItem[] = Array(6).fill(null).map((_, i) => ({
      make: 'Audi', model: 'A3', variant: 'Sedan', year: 2021, mileageKm: 50000, price: 1400000 + i * 10000
    }));
    const sportbackComps: CleanListingItem[] = Array(6).fill(null).map((_, i) => ({
      make: 'Audi', model: 'A3', variant: 'Sportback', year: 2021, mileageKm: 50000, price: 1300000 + i * 10000
    }));

    const sedanCalc = RobustPricingCalculator.computeValuation({
      cleanListings: sedanComps, userYear: 2021, userMileage: 50000, matchedLevel: 1, baseConfidenceScore: 90
    });
    const sbCalc = RobustPricingCalculator.computeValuation({
      cleanListings: sportbackComps, userYear: 2021, userMileage: 50000, matchedLevel: 1, baseConfidenceScore: 90
    });

    expect(sedanCalc.fairMarketValue).not.toEqual(sbCalc.fairMarketValue);
  });

  test('3. Mileage Decay: 70.000 km vehicle receives higher cash offer than 250.000 km vehicle', () => {
    const comps: CleanListingItem[] = Array(8).fill(null).map((_, i) => ({
      make: 'BMW', model: '3 Serisi', variant: '320i', year: 2019, mileageKm: 100000, price: 1800000
    }));

    const lowKm = RobustPricingCalculator.computeValuation({
      cleanListings: comps, userYear: 2019, userMileage: 70000, matchedLevel: 1, baseConfidenceScore: 90
    });

    const highKm = RobustPricingCalculator.computeValuation({
      cleanListings: comps, userYear: 2019, userMileage: 250000, matchedLevel: 1, baseConfidenceScore: 90
    });

    expect(lowKm.fairMarketValue).toBeGreaterThan(highKm.fairMarketValue);
    expect(lowKm.cashOffer).toBeGreaterThan(highKm.cashOffer);
  });

  test('4. IQR Outlier Cleaning: Fake 1 TL and 111 TL prices are filtered out', () => {
    const rawWithFakes = [1, 111, 5000, 1500000, 1520000, 1540000, 1550000, 1580000, 999999999];
    const cleaned = RobustPricingCalculator.cleanOutliersIQR(rawWithFakes);

    expect(cleaned).not.toContain(1);
    expect(cleaned).not.toContain(111);
    expect(cleaned).not.toContain(5000);
    expect(cleaned).not.toContain(999999999);
  });

  test('5. P35 Protection Guard: Reserve is preserved when P35 is close to P50 (<3%)', () => {
    // Comps where P35 (1.500.000) and P50 (1.520.000) have only ~1.3% delta
    const tightComps: CleanListingItem[] = [
      { make: 'VW', model: 'Golf', year: 2022, mileageKm: 40000, price: 1500000 },
      { make: 'VW', model: 'Golf', year: 2022, mileageKm: 40000, price: 1510000 },
      { make: 'VW', model: 'Golf', year: 2022, mileageKm: 40000, price: 1520000 },
      { make: 'VW', model: 'Golf', year: 2022, mileageKm: 40000, price: 1525000 },
      { make: 'VW', model: 'Golf', year: 2022, mileageKm: 40000, price: 1530000 },
    ];

    const result = RobustPricingCalculator.computeValuation({
      cleanListings: tightComps, userYear: 2022, userMileage: 40000, matchedLevel: 1, baseConfidenceScore: 90
    });

    const expectedMinReserve = 1520000 * 0.065; // ~98.800 TL required reserve
    expect(result.fairMarketValue - result.cashOffer).toBeGreaterThanOrEqual(80000);
  });

  test('6. Consignment Listing Price Cap: Consignment listing price never exceeds P50 * 1.03', () => {
    const comps: CleanListingItem[] = Array(10).fill(null).map(() => ({
      make: 'Mercedes', model: 'C-Class', year: 2023, mileageKm: 30000, price: 3000000
    }));

    const result = RobustPricingCalculator.computeValuation({
      cleanListings: comps, userYear: 2023, userMileage: 30000, matchedLevel: 1, baseConfidenceScore: 90
    });

    expect(result.consignmentListingPrice).toBeLessThanOrEqual(Math.round(result.fairMarketValue * 1.05));
  });

  test('7. Consignment Transparency: Listing price, expected sale price, commission, and net payout are distinct', () => {
    const comps: CleanListingItem[] = Array(10).fill(null).map(() => ({
      make: 'Chery', model: 'Tiggo 8', year: 2024, mileageKm: 20000, price: 2000000
    }));

    const result = RobustPricingCalculator.computeValuation({
      cleanListings: comps, userYear: 2024, userMileage: 20000, matchedLevel: 1, baseConfidenceScore: 90
    });

    expect(result.consignmentListingPrice).toBeGreaterThan(result.expectedConsignmentSalePrice);
    expect(result.expectedConsignmentSalePrice).toBeGreaterThan(result.customerConsignmentNet);
    expect(result.consignmentCommission).toBeGreaterThan(0);
    expect(result.customerConsignmentNet).toEqual(result.expectedConsignmentSalePrice - result.consignmentCommission);
  });

  test('8. Low Comp Count Penalty: Low matched listing count reduces confidence score', () => {
    const sparseComps: CleanListingItem[] = [
      { make: 'Ferrari', model: '488', year: 2018, mileageKm: 15000, price: 25000000 }
    ];

    const result = RobustPricingCalculator.computeValuation({
      cleanListings: sparseComps, userYear: 2018, userMileage: 15000, matchedLevel: 4, baseConfidenceScore: 60
    });

    expect(result.confidenceScore).toBeLessThan(70);
  });

  test('9. Psychological Cash Offer Rounding: Cash offers are rounded down to clean 5.000 / 10.000 TL boundaries', () => {
    expect(RobustPricingCalculator.roundCashOffer(1423450)).toEqual(1420000);
    expect(RobustPricingCalculator.roundCashOffer(783210)).toEqual(780000);
  });

});
