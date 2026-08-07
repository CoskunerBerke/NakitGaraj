import { RobustPricingCalculator } from './robust-pricing-calculator';
import { EmsalMatcherService, CleanListingItem } from './emsal-matcher.service';
import { PrismaClient } from '@prisma/client';

describe('NakitGaraj Real Database & Advanced Pricing Engine Integration Test Suite', () => {
  let prisma: PrismaClient;
  let matcher: EmsalMatcherService;

  beforeAll(() => {
    prisma = new PrismaClient();
    matcher = new EmsalMatcherService(prisma as any);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('1. Real Database Integration: BMW 3 Serisi 2015 yields real matched count and weighted percentiles', async () => {
    const match = await matcher.matchComparableListings({
      make: 'BMW',
      model: '3 Serisi',
      variant: 'Standart',
      year: 2015,
      mileageKm: 120000,
    });

    expect(match.matchedCount).toBeGreaterThan(0);
    expect(match.confidenceScore).toBeGreaterThan(70);
    expect(match.snapshotId).toBeDefined();

    const calc = RobustPricingCalculator.computeValuation({
      cleanListings: match.cleanListings,
      userYear: 2015,
      userMileage: 120000,
      matchedLevel: match.level,
      baseConfidenceScore: match.confidenceScore,
    });

    expect(calc.fairMarketValue).toBeGreaterThan(500000);
    expect(calc.cashOffer).toBeLessThan(calc.fairMarketValue);
  });

  test('2. Missing Vehicle Integration: Unrecorded exotic vehicles (Ferrari Roma) yield Level 4 "Yeterli Veri Bulunamadı"', async () => {
    const match = await matcher.matchComparableListings({
      make: 'Ferrari',
      model: 'Roma',
      variant: '3.9 V8',
      year: 2022,
      mileageKm: 10000,
    });

    expect(match.level).toEqual(4);
    expect(match.matchedCount).toEqual(0);
    expect(match.confidenceScore).toEqual(0);
    expect(match.isLimitedComps).toBe(true);
  });

  test('3. Engine & Variant Separation: 1.6 TDI and 35 TFSI receive distinct price valuations', () => {
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

  test('4. Mileage Decay: 70.000 km vehicle receives higher cash offer than 250.000 km vehicle', () => {
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

  test('5. IQR Outlier Cleaning: Fake 1 TL and 111 TL prices are filtered out', () => {
    const rawWithFakes = [1, 111, 5000, 1500000, 1520000, 1540000, 1550000, 1580000, 999999999];
    const cleaned = RobustPricingCalculator.cleanOutliersIQR(rawWithFakes);

    expect(cleaned).not.toContain(1);
    expect(cleaned).not.toContain(111);
    expect(cleaned).not.toContain(5000);
    expect(cleaned).not.toContain(999999999);
  });

  test('6. P35 Protection Guard: Reserve is preserved when P35 is close to P50 (<3%)', () => {
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

    expect(result.fairMarketValue - result.cashOffer).toBeGreaterThanOrEqual(80000);
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

  test('8. Regression Test: BMW 5 Serisi 2016 Executive fetched directly from real DB snapshot ae03fc3c', async () => {
    const snap = await prisma.vehicleMarketSnapshot.findFirst({
      where: {
        make: 'BMW',
        model: '5 Serisi',
        year: 2016,
        variant: 'Executive',
      },
    });

    expect(snap).toBeDefined();
    expect(snap!.id.toLowerCase()).toContain('ae03fc3c');
    expect(snap!.matchedListingCount).toBeGreaterThanOrEqual(400);

    const calc = RobustPricingCalculator.computeValuationFromSnapshot({
      weightedP5: snap!.weightedP5 || Math.round(snap!.weightedP50 * 0.85),
      weightedP35: snap!.weightedP35 || Math.round(snap!.weightedP50 * 0.92),
      weightedP50: snap!.weightedP50,
      weightedP60: snap!.weightedP60 || Math.round(snap!.weightedP50 * 1.02),
      weightedP95: snap!.weightedP95 || Math.round(snap!.weightedP50 * 1.15),
      realMatchedListingCount: snap!.matchedListingCount,
      userYear: 2016,
      userMileage: 100000,
      matchedLevel: 1,
      baseConfidenceScore: snap!.confidenceScore || 98,
    });

    expect(calc.matchedListingCount).toEqual(snap!.matchedListingCount);
    expect(calc.fairMarketValue).toBeGreaterThan(2000000);
    expect(calc.cashOffer).toBeGreaterThan(1880000);
  });
});
