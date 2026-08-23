/**
 * quote-rounding.spec.ts
 *
 * Musteriye sunulan ticari tutarlar temiz 5.000 TL adimlarinda olmali;
 * ekonomik siralama yuvarlama SONRASINDA da korunmali.
 */
import {
  QUOTE_STEP,
  ceilToStep,
  commercialQuoteOrdered,
  finalizeCommercialQuote,
  floorToStep,
  roundToStep,
} from './quote-rounding';
import { RobustPricingCalculator } from './robust-pricing-calculator';

const base = {
  operatingCost: 22_000,
  riskCost: 8_000,
  minimumProfit: 20_000,
};

describe('Adim yuvarlama yardimcilari', () => {
  test('5.000 adim: en yakin / asagi / yukari', () => {
    expect(QUOTE_STEP).toBe(5_000);
    expect(roundToStep(809_797)).toBe(810_000);
    expect(roundToStep(783_883)).toBe(785_000);
    expect(floorToStep(783_883)).toBe(780_000);
    expect(ceilToStep(835_900)).toBe(840_000);
    expect(roundToStep(2_847_000)).toBe(2_845_000);
  });
});

describe('finalizeCommercialQuote — gorev ornekleri', () => {
  test('piyasa 809.797 -> 810.000, net 783.883 -> 785.000, ilan 835.900 -> 840.000', () => {
    const q = finalizeCommercialQuote({
      ...base,
      expectedSalePrice: 809_797,
      fairMarketValue: 809_797,
      cashOffer: 745_000,
      customerConsignmentNet: 783_883,
      consignmentListingPrice: 835_900,
    });
    expect(q.fairMarketValue).toBe(810_000);
    expect(q.expectedSalePrice).toBe(810_000);
    expect(q.customerConsignmentNet).toBe(785_000);
    expect(q.consignmentListingPrice).toBe(840_000);
    expect(commercialQuoteOrdered(q)).toBe(true);
  });

  test('nakit 745.000: ekonomi izin veriyorsa 750.000 ustune CIKMAZ, bir adim rekabet payi serbest', () => {
    // 747.600 ham -> en yakin 750.000 (+2.400): minimum kar korunuyor mu?
    const q = finalizeCommercialQuote({
      ...base,
      expectedSalePrice: 809_797,
      fairMarketValue: 809_797,
      cashOffer: 747_600,
      customerConsignmentNet: 783_883,
      consignmentListingPrice: 835_900,
    });
    expect(q.cashOffer).toBe(750_000);
    // Rekabet payi ASLA 5.000'i asmaz (asagi adima gore).
    expect(q.cashOffer - floorToStep(747_600)).toBeLessThanOrEqual(5_000);
  });

  test('rekabet payi minimum kari asacaksa ASAGI yuvarlanir', () => {
    // Tavan: sale - op - risk - minProfit = 809.797 - 22.000 - 8.000 - 20.000 = 759.797
    // Ham nakit 758.000 -> en yakin 760.000 > tavan -> 755.000
    const q = finalizeCommercialQuote({
      ...base,
      expectedSalePrice: 809_797,
      fairMarketValue: 809_797,
      cashOffer: 758_000,
      customerConsignmentNet: 783_883,
      consignmentListingPrice: 835_900,
    });
    expect(q.cashOffer).toBe(755_000);
    expect(q.adjustments.some((a) => a.startsWith('cash'))).toBe(true);
  });

  test('yuzde bazli artis YOK: buyuk degerde de en fazla bir adim', () => {
    const q = finalizeCommercialQuote({
      ...base,
      expectedSalePrice: 5_200_000,
      fairMarketValue: 5_200_000,
      cashOffer: 4_652_400,
      customerConsignmentNet: 5_050_000,
      consignmentListingPrice: 5_399_900,
    });
    expect(q.cashOffer).toBe(4_650_000);
    expect(Math.abs(q.cashOffer - 4_652_400)).toBeLessThanOrEqual(2_500);
  });

  test('ilan fiyati beklenen satisin altina dusmez', () => {
    const q = finalizeCommercialQuote({
      ...base,
      expectedSalePrice: 1_002_400,
      fairMarketValue: 1_002_400,
      cashOffer: 900_000,
      customerConsignmentNet: 970_000,
      consignmentListingPrice: 1_001_900, // hatali sekilde satisin altinda gelse bile
    });
    expect(q.expectedSalePrice).toBe(1_000_000);
    expect(q.consignmentListingPrice).toBeGreaterThanOrEqual(q.expectedSalePrice);
  });

  test('komisyon 0 olan dusuk degerli aracta bile siralama korunur (Daihatsu 1991 vakasi)', () => {
    const q = finalizeCommercialQuote({
      operatingCost: 14_000,
      riskCost: 1_000,
      minimumProfit: 20_000,
      expectedSalePrice: 73_589,
      fairMarketValue: 73_589,
      cashOffer: 60_000,
      customerConsignmentNet: 73_589, // komisyon 0 -> net == satis
      consignmentListingPrice: 75_900,
    });
    expect(commercialQuoteOrdered(q)).toBe(true);
    expect(q.consignmentCommission).toBeGreaterThanOrEqual(QUOTE_STEP);
    expect(q.customerConsignmentNet).toBe(70_000);
  });

  test('her cikti tam 5.000 katidir', () => {
    const q = finalizeCommercialQuote({
      ...base,
      expectedSalePrice: 1_129_672,
      fairMarketValue: 1_129_672,
      cashOffer: 1_050_000,
      customerConsignmentNet: 1_093_522,
      consignmentListingPrice: 1_165_900,
    });
    for (const v of [q.expectedSalePrice, q.fairMarketValue, q.cashOffer, q.customerConsignmentNet, q.consignmentListingPrice]) {
      expect(v % QUOTE_STEP).toBe(0);
    }
    expect(commercialQuoteOrdered(q)).toBe(true);
  });
});

describe('Hesaplayici ciktisi — tek kanonik yuvarlama', () => {
  const mk = (n: number, price: number): any => ({
    id: 'l' + n, make: 'X', model: 'Y', variant: '1.6', trim: 'T', year: 2022, mileageKm: 60_000 + n * 1_000,
    price, normalizedPrice: price, weight: 1, bodyType: '', fuelType: 'Benzin', transmission: 'Otomatik',
    city: '', title: '', isDamaged: false, listedAt: new Date(),
  });

  test('gercek cekirdek ciktisinda tum ticari alanlar 5.000 katidir ve sirali', () => {
    const listings = Array.from({ length: 24 }, (_, i) => mk(i, 1_080_000 + (i % 7) * 9_137));
    const out: any = RobustPricingCalculator.computeValuation({
      cleanListings: listings, userYear: 2022, userMileage: 60_000, damagePenalty: 0, userDesiredPrice: 0,
      matchedLevel: 1, baseConfidenceScore: 90, realMatchedListingCount: listings.length,
      freshnessScore: 1, engineExactShare: 1, fuelKnownShare: 1, transmissionKnownShare: 1, targetEngineKnown: true,
    } as any);
    for (const k of ['expectedSalePrice', 'fairMarketValue', 'cashOffer', 'customerConsignmentNet', 'consignmentListingPrice', 'cashOfferMin', 'cashOfferMax']) {
      expect(out[k] % QUOTE_STEP).toBe(0);
    }
    expect(commercialQuoteOrdered(out)).toBe(true);
    expect(out.consignmentCommission).toBe(out.expectedSalePrice - out.customerConsignmentNet);
    // Hassas degerler denetimde korunur.
    expect(typeof out.pricingAudit.expectedSalePriceRaw).toBe('number');
    expect(typeof out.pricingAudit.cashOfferRaw).toBe('number');
  });
});
