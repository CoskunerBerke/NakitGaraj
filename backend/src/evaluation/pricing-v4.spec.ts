/**
 * pricing-v4.spec.ts
 *
 * Fiyatlama V4 semantigi:
 *  1) TEMIZ arac icin piyasa referansi = emsal merkezi.
 *     Kanitlanmamis "ilan -> satis" genel pazarlik kirimi UYGULANMAZ.
 *  2) Belirsizlik TEK KEZ fiyatlanir (risk rezervi); hedef kar ayrica
 *     belirsizlik carpaniyla buyutulmez.
 *  3) Musteri tabani, kar tabani, nakit<satis ve konsinye>nakit korumalari aynen durur.
 *  4) Fiyat kuyruklari (dusuk/yuksek ilan) SILINMEZ.
 *
 * Testler saf fonksiyon uzerinde calisir; DB gerekmez.
 */
import { RobustPricingCalculator } from './robust-pricing-calculator';
import { PRICING_LIMITS, getSegment } from './pricing-config';

/** Verilen merkez etrafinda, istenen yayilimda sentetik emsal havuzu. */
function pool(center: number, n: number, spread: number) {
  const out: any[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1..1
    out.push({
      make: 'X', model: 'Y', year: 2020,
      mileageKm: 100_000,
      price: Math.round(center * (1 + t * spread)),
      normalizedPrice: Math.round(center * (1 + t * spread)),
      weight: 1,
      isDamaged: false,
    });
  }
  return out;
}

function value(center: number, n = 40, spread = 0.10, conf = 92, level = 1, damagePenalty = 0) {
  return RobustPricingCalculator.computeValuation({
    cleanListings: pool(center, n, spread) as any,
    userYear: 2020,
    userMileage: 100_000,
    damagePenalty,
    matchedLevel: level,
    baseConfidenceScore: conf,
    realMatchedListingCount: n,
    freshnessScore: 1,
    engineExactShare: 1,
    fuelKnownShare: 1,
    transmissionKnownShare: 1,
    targetEngineKnown: true,
  } as any);
}

describe('Fiyatlama V4', () => {
  describe('A/B. Genel pazarlik kirimi kaldirildi', () => {
    test('temiz aracta beklenen satis = piyasa merkezi', () => {
      const r = value(1_000_000);
      expect(r.expectedSalePrice).toBe(r.fairMarketValue);
      // Eski davranis ~950.000 uretiyordu; artik merkez korunur.
      expect(r.expectedSalePrice / r.fairMarketValue).toBeCloseTo(1, 6);
    });

    test('pricingAudit.negotiationRate = 0 (alan korunur, kirim yok)', () => {
      const r: any = value(1_000_000);
      expect(r.pricingAudit.negotiationRate).toBe(0);
      expect(r.pricingAudit.negotiationAmount).toBe(0);
    });

    test('yayilim ve tazelik artik beklenen satisi dusurmez', () => {
      const dar = value(1_000_000, 40, 0.05);
      const genis = value(1_000_000, 40, 0.30);
      expect(dar.expectedSalePrice).toBe(dar.fairMarketValue);
      expect(genis.expectedSalePrice).toBe(genis.fairMarketValue);
    });
  });

  describe('C/D. Belirsizlik tek kez fiyatlanir', () => {
    test('riskProfitUplift etkisiz (1)', () => {
      const yuksek: any = value(1_000_000, 40, 0.10, 95);
      const dusuk: any = value(1_000_000, 40, 0.30, 60);
      expect(yuksek.pricingAudit.riskProfitUplift).toBe(1);
      expect(dusuk.pricingAudit.riskProfitUplift).toBe(1);
    });

    test('hedef kar yalniz segment basamagindan gelir, belirsizlikten buyumez', () => {
      // Tek sayili havuz: agirlikli medyan tam merkeze denk gelir, boylece iki
      // senaryonun beklenen satisi ayni olur ve yalniz belirsizlik degisir.
      // Her iki senaryoda da hedef kar, segment basamaginin BIREBIR kendisidir:
      // guven/yayilim degisse bile kar carpani devreye girmez.
      for (const r of [value(1_000_000, 41, 0.10, 95), value(1_000_000, 41, 0.30, 60)] as any[]) {
        const seg = getSegment(r.expectedSalePrice);
        const beklenen = Math.round(Math.max(seg.targetProfit.min, seg.targetProfit.rate * r.expectedSalePrice));
        expect(r.pricingAudit.targetProfit).toBe(beklenen);
      }
    });

    test('belirsizlik risk rezervini artirir (tek kanal)', () => {
      const iyi: any = value(1_000_000, 40, 0.06, 95);
      const kotu: any = value(1_000_000, 6, 0.30, 60, 2);
      expect(kotu.pricingAudit.riskRate).toBeGreaterThan(iyi.pricingAudit.riskRate);
      expect(kotu.pricingAudit.riskRate).toBeLessThanOrEqual(PRICING_LIMITS.riskRateRange[1]);
      expect(iyi.pricingAudit.riskRate).toBeGreaterThanOrEqual(PRICING_LIMITS.riskRateRange[0]);
    });

    test('guclu destek + dar yayilim -> rezerv tabana yakin', () => {
      const r: any = value(1_000_000, 120, 0.05, 96);
      expect(r.pricingAudit.riskRate).toBeLessThan(0.008);
    });
  });

  describe('E/F/G/H. Guvenlik korumalari aynen durur', () => {
    test('nakit < beklenen satis', () => {
      for (const c of [300_000, 800_000, 1_500_000, 3_000_000, 8_000_000]) {
        const r = value(c);
        expect(r.cashOffer).toBeLessThan(r.expectedSalePrice);
      }
    });

    test('konsinye net > nakit', () => {
      for (const c of [300_000, 800_000, 1_500_000, 3_000_000, 8_000_000]) {
        const r = value(c);
        expect(r.customerConsignmentNet).toBeGreaterThan(r.cashOffer);
        expect(r.consignmentListingPrice).toBeGreaterThanOrEqual(r.expectedSalePrice);
      }
    });

    test('musteri tabani: altina inen teklif AUTO kalmaz', () => {
      for (const c of [250_000, 400_000, 1_000_000, 5_000_000]) {
        const r: any = value(c);
        const seg = getSegment(r.expectedSalePrice);
        const floor = Math.round(r.expectedSalePrice * seg.minCashRatioOfExpectedSale);
        if (r.cashOffer < floor) expect(r.requiresManualApproval).toBe(true);
      }
    });

    test('kar tabani: komisyon tabani saglanamiyorsa manuel', () => {
      const r: any = value(1_000_000);
      const seg = getSegment(r.expectedSalePrice);
      if (r.pricingAudit.commissionCap < seg.commission.min) {
        expect(r.requiresManualApproval).toBe(true);
      } else {
        expect(r.baseCommission).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('I. Fiyat kuyruklari silinmez', () => {
    test('cok dusuk ve cok yuksek ilanlar havuzda kalir', () => {
      const n = 41;
      const r: any = value(1_000_000, n, 0.40);
      expect(r.matchedListingCount).toBe(n);
      // Merkez, uc degerlerden dolayi kaymaz ama uclar da atilmaz.
      expect(r.pricingAudit.askingP25).toBeLessThan(r.pricingAudit.askingP50);
      expect(r.pricingAudit.askingP75).toBeGreaterThan(r.pricingAudit.askingP50);
    });
  });

  describe('Kondisyon katmani ayri kalir', () => {
    test('damagePenalty piyasa referansini dusurur (pazarlik kirimi degil)', () => {
      const temiz = value(1_000_000, 40, 0.10, 92, 1, 0);
      const hasarli = value(1_000_000, 40, 0.10, 92, 1, 0.05);
      expect(hasarli.fairMarketValue).toBeLessThan(temiz.fairMarketValue);
      expect(hasarli.expectedSalePrice).toBe(hasarli.fairMarketValue);
    });
  });
});
