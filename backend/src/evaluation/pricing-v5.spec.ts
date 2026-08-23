/**
 * pricing-v5.spec.ts
 *
 * Fiyatlama V5 ekonomisi: hedef kar ve operasyon maliyeti artik SEGMENT
 * BASAMAKLARIYLA degil SUREKLI egrilerle hesaplanir.
 *
 *  - Ucuz araclarda gercek sabit maliyet ve kar tabani KORUNUR.
 *  - Orta pazar (750K-2,5M) davranisi degismez.
 *  - Pahali araclarda TL kari artmaya devam eder ama dogrusal buyumez.
 *  - Deger ekseninde ekonomik UCURUM yoktur.
 *  - V4 semantigi (pazarlik kirimi 0, risk carpani 1) aynen durur.
 */
import { RobustPricingCalculator } from './robust-pricing-calculator';
import {
  PRICING_ECONOMICS,
  getSegment,
  operatingCostFor,
  targetProfitFor,
} from './pricing-config';

function pool(center: number, n = 41, spread = 0.10) {
  const out: any[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * 2 - 1;
    const p = Math.round(center * (1 + t * spread));
    out.push({ make: 'X', model: 'Y', year: 2020, mileageKm: 100_000, price: p, normalizedPrice: p, weight: 1, isDamaged: false });
  }
  return out;
}
function value(center: number, conf = 92) {
  return RobustPricingCalculator.computeValuation({
    cleanListings: pool(center) as any, userYear: 2020, userMileage: 100_000, damagePenalty: 0,
    matchedLevel: 1, baseConfidenceScore: conf, realMatchedListingCount: 41, freshnessScore: 1,
    engineExactShare: 1, fuelKnownShare: 1, transmissionKnownShare: 1, targetEngineKnown: true,
  } as any) as any;
}

describe('Fiyatlama V5 — sürekli ekonomi', () => {
  describe('A/B/C/D/E. Düşük ve orta segment güvenli', () => {
    test.each([200_000, 250_000, 500_000, 1_000_000, 2_000_000])('%i TL: ekonomi bileşenleri tutarlı', (v) => {
      const r = value(v);
      const a = r.pricingAudit;
      // Ekonomi bilesenleri HASSAS beklenen satistan turer; r.expectedSalePrice
      // ise musteriye sunulan 5.000 TL adimli ticari degerdir (quote-rounding).
      const precise = a.expectedSalePriceRaw ?? r.expectedSalePrice;
      expect(a.operatingCost).toBe(operatingCostFor(precise));
      expect(a.targetProfit).toBe(targetProfitFor(precise));
      expect(a.operatingCost).toBeGreaterThan(0);
      expect(a.targetProfit).toBeGreaterThanOrEqual(PRICING_ECONOMICS.targetProfit.minimum);
      expect(r.cashOffer).toBeLessThan(r.expectedSalePrice);
      expect(r.customerConsignmentNet).toBeGreaterThan(r.cashOffer);
    });

    test('sabit operasyon tabanı ucuz araçta küçültülmedi', () => {
      // 14.000 TL gercek islem maliyetidir; ucuz aracta da tam uygulanir.
      expect(operatingCostFor(200_000)).toBeGreaterThanOrEqual(PRICING_ECONOMICS.operating.fixedFloor);
      expect(operatingCostFor(150_000)).toBeGreaterThanOrEqual(PRICING_ECONOMICS.operating.fixedFloor);
    });

    test('kâr tabanı korunuyor (çok ucuz araçta anlamsız seviyeye düşmüyor)', () => {
      for (const v of [120_000, 200_000, 300_000, 400_000]) {
        expect(targetProfitFor(v)).toBeGreaterThanOrEqual(PRICING_ECONOMICS.targetProfit.minimum);
      }
    });

    test('1M referans noktası birebir korunuyor', () => {
      expect(targetProfitFor(1_000_000)).toBe(PRICING_ECONOMICS.targetProfit.referenceProfit);
    });
  });

  describe('F/G/H/I/J. Yüksek segment sönümlü ama monoton', () => {
    test('kâr TL değere göre monoton artar (taban platosu bilinçli)', () => {
      // Dusuk degerde MECBURI taban (minimum) plato yapar; bu dusus degildir.
      // Egri bolgesinde (taban baglayici degilken) artis KESIN artandir.
      const vals = [200_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 20_000_000, 30_000_000, 50_000_000];
      for (let i = 1; i < vals.length; i++) {
        expect(targetProfitFor(vals[i])).toBeGreaterThanOrEqual(targetProfitFor(vals[i - 1]));
        if (targetProfitFor(vals[i - 1]) > PRICING_ECONOMICS.targetProfit.minimum) {
          expect(targetProfitFor(vals[i])).toBeGreaterThan(targetProfitFor(vals[i - 1]));
        }
      }
    });

    test('efektif kâr oranı yüksek değerde sönümlenir', () => {
      const rate = (v: number) => targetProfitFor(v) / v;
      expect(rate(20_000_000)).toBeLessThan(rate(5_000_000));
      expect(rate(5_000_000)).toBeLessThan(rate(1_000_000));
      // Katlanan degerde kar TL'si KATLANMAZ (alt-dogrusal).
      expect(targetProfitFor(20_000_000)).toBeLessThan(targetProfitFor(10_000_000) * 2);
      expect(targetProfitFor(10_000_000)).toBeLessThan(targetProfitFor(5_000_000) * 2);
    });

    test('operasyon maliyeti de monoton artar', () => {
      const vals = [150_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 30_000_000];
      for (let i = 1; i < vals.length; i++) {
        expect(operatingCostFor(vals[i])).toBeGreaterThan(operatingCostFor(vals[i - 1]));
      }
    });
  });

  describe('K/L. Değer ekseninde uçurum yok', () => {
    test('eski segment sınırlarında (600K, 1.2M, 2M, 4M, 8M) ekonomik sıçrama yok', () => {
      for (const b of [600_000, 1_200_000, 2_000_000, 4_000_000, 8_000_000]) {
        const before = b - 1_000, after = b + 1_000;
        const dProfit = targetProfitFor(after) - targetProfitFor(before);
        const dOp = operatingCostFor(after) - operatingCostFor(before);
        expect(dProfit).toBeGreaterThanOrEqual(0);
        expect(dOp).toBeGreaterThanOrEqual(0);
        expect(dProfit).toBeLessThan(2_000);
        expect(dOp).toBeLessThan(2_000);
      }
    });

    test('100K→50M yoğun taramada ham nakit hiç düşmez', () => {
      let prev = -Infinity, drops = 0;
      for (let v = 100_000; v <= 50_000_000; v += 50_000) {
        const raw = v - operatingCostFor(v) - Math.round(v * 0.005) - targetProfitFor(v);
        if (raw < prev - 1) drops++;
        prev = raw;
      }
      expect(drops).toBe(0);
    });
  });

  describe('M/N/O/P. Güvenlik korumaları', () => {
    test.each([200_000, 400_000, 1_000_000, 3_000_000, 10_000_000])('%i TL: nakit < satış ve konsinye > nakit', (v) => {
      const r = value(v);
      expect(r.cashOffer).toBeLessThan(r.expectedSalePrice);
      expect(r.customerConsignmentNet).toBeGreaterThan(r.cashOffer);
    });

    test('müşteri tabanının altına inen teklif AUTO kalmaz', () => {
      for (const v of [150_000, 200_000, 250_000, 500_000, 2_000_000]) {
        const r = value(v);
        const seg = getSegment(r.expectedSalePrice);
        const floor = Math.round(r.expectedSalePrice * seg.minCashRatioOfExpectedSale);
        if (r.cashOffer < floor) expect(r.requiresManualApproval).toBe(true);
      }
    });

    test('kâr tabanı: komisyon tavanı yetmiyorsa manuel', () => {
      for (const v of [150_000, 300_000, 1_000_000]) {
        const r = value(v);
        const seg = getSegment(r.expectedSalePrice);
        if (r.pricingAudit.commissionCap < seg.commission.min) {
          expect(r.requiresManualApproval).toBe(true);
        }
      }
    });
  });

  describe('Düşük segment: müşteri tabanı kalibrasyonu (ölçülmüş karar)', () => {
    /**
     * Cok ucuz araclarda gereken ekonomi (operasyon + risk + kar) aracin
     * degerinin buyuk bir yuzdesidir: 150K'da ~%24, 200K'da ~%18, 300K'da ~%12,7.
     * Musteri tabani (%85) bunun uzerine cikan teklifleri OTOMATIK vermeyi
     * engeller ve manuel degerlendirmeye yonlendirir. Taban yukseltmek olculdu
     * (0,86-0,90 ve surekli egri): 300-500K bandinda medyan teklifi neredeyse
     * hic degistirmiyor ama manuel oranini %66,9 -> %83,1'e (0,88) ve komisyon
     * catismalarini 55 -> 105'e cikariyor. Bu yuzden taban DEGISTIRILMEDI.
     */
    const requiredEconomics = (v: number) => operatingCostFor(v) + targetProfitFor(v) + Math.round(v * 0.005);

    test('gereken ekonomi düşük değerde yüksek yüzdedir (uydurma değil, ölçüm)', () => {
      expect(requiredEconomics(150_000) / 150_000).toBeGreaterThan(0.20);
      expect(requiredEconomics(300_000) / 300_000).toBeGreaterThan(0.10);
      expect(requiredEconomics(1_000_000) / 1_000_000).toBeLessThan(0.08);
      expect(requiredEconomics(10_000_000) / 10_000_000).toBeLessThan(0.05);
      // Oran deger buyudukce monoton azalir.
      const vals = [150_000, 300_000, 500_000, 1_000_000, 5_000_000, 20_000_000];
      for (let i = 1; i < vals.length; i++) {
        expect(requiredEconomics(vals[i]) / vals[i]).toBeLessThan(requiredEconomics(vals[i - 1]) / vals[i - 1]);
      }
    });

    test('ekonomi tabanı aşıyorsa otomatik fiyat verilmez (müşteri korumasi)', () => {
      for (const v of [150_000, 200_000, 250_000]) {
        const r = value(v);
        const seg = getSegment(r.expectedSalePrice);
        const raw = r.expectedSalePrice - requiredEconomics(r.expectedSalePrice);
        if (raw < r.expectedSalePrice * seg.minCashRatioOfExpectedSale) {
          expect(r.requiresManualApproval).toBe(true);
          // Gosterilen teklif tabana sabitlenir; tek sapma ASAGI yuvarlama
          // adimidir (<=1M icin 5.000 TL) ve ucuz aracta bu adim orana gore
          // buyuk gorunur -- bu yuzden tolerans adim uzerinden hesaplanir.
          const step = 5_000 / r.expectedSalePrice;
          expect(r.cashOffer / r.expectedSalePrice).toBeGreaterThan(
            seg.minCashRatioOfExpectedSale - step - 0.001,
          );
        }
      }
    });

    test('taban bağlamadığında müşteri ham teklifi alır (taban tavan değildir)', () => {
      for (const v of [400_000, 500_000, 750_000]) {
        const r = value(v);
        const seg = getSegment(r.expectedSalePrice);
        expect(r.cashOffer / r.expectedSalePrice).toBeGreaterThan(seg.minCashRatioOfExpectedSale);
        expect(r.requiresManualApproval).toBeFalsy();
      }
    });
  });

  describe('Q/R/S/T. V4 semantiği korunuyor', () => {
    test('genel pazarlık kırımı yok ve risk kâr çarpanı 1', () => {
      const r = value(1_500_000);
      expect(r.pricingAudit.negotiationRate).toBe(0);
      expect(r.pricingAudit.riskProfitUplift).toBe(1);
    });

    test('temiz araçta beklenen satış = piyasa merkezi', () => {
      for (const v of [300_000, 1_000_000, 5_000_000]) {
        const r = value(v);
        expect(r.expectedSalePrice).toBe(r.fairMarketValue);
      }
    });

    test('fiyat kuyrukları silinmiyor', () => {
      const r = value(1_000_000);
      expect(r.matchedListingCount).toBe(41);
      expect(r.pricingAudit.askingP25).toBeLessThan(r.pricingAudit.askingP75);
    });
  });
});
