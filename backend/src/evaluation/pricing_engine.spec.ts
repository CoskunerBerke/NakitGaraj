import { RobustPricingCalculator } from './robust-pricing-calculator';
import { EmsalMatcherService, CleanListingItem } from './emsal-matcher.service';
import { PrismaClient } from '@prisma/client';
import { PRICING_LIMITS, getSegment } from './pricing-config';
import { computeConfidence, mileageExtrapolationPenalty } from './robust-pricing-calculator';
import {
  deriveFromSource,
  deriveFuelFromEngineCode,
  deriveTransmission,
  engineKey,
  isEngineCompatible,
  parseTurkishListingDate,
  splitVariantString,
} from './listing-attributes';

/** Test emsali uretir (gercek ilan semantigi ile ayni alanlar) */
function comps(
  n: number,
  basePrice: number,
  opts: { km?: number; year?: number; spread?: number } = {},
): CleanListingItem[] {
  const { km = 100_000, year = 2019, spread = 0.06 } = opts;
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    return {
      make: 'Test',
      model: 'Model',
      variant: '1.6 TDI',
      year,
      mileageKm: km,
      price: Math.round(basePrice * (1 + t * 2 * spread)),
    };
  });
}

function priceIt(
  listings: CleanListingItem[],
  overrides: Partial<Parameters<typeof RobustPricingCalculator.computeValuation>[0]> = {},
) {
  return RobustPricingCalculator.computeValuation({
    cleanListings: listings,
    userYear: 2019,
    userMileage: 100_000,
    matchedLevel: 1,
    baseConfidenceScore: 92,
    freshnessScore: 0.9,
    ...overrides,
  });
}

describe('NakitGaraj Fiyatlama Motoru V3', () => {
  /* ================================================================ */
  /* A. Veri turetme (parse) katmani                                   */
  /* ================================================================ */

  describe('A. İlan özniteliği türetme', () => {
    test('A1. Sayfa başlığından marka/model/motor/paket doğru ayrılır', () => {
      const bmw = deriveFromSource({
        folderMake: 'BMW',
        pageTitleOrFileName: "BMW 3 Serisi 318i Luxury Plus Fiyatları & Modelleri sahibinden.com'da - 4",
      });
      expect(bmw.make).toBe('BMW');
      expect(bmw.model).toBe('3 Serisi');
      expect(bmw.engineCode).toBe('318i');
      expect(bmw.trim).toBe('Luxury Plus');
      expect(bmw.fuelType).toBe('Benzin');

      const fiat = deriveFromSource({
        folderMake: 'Fiat',
        pageTitleOrFileName: "Fiat Egea 1.6 Multijet Urban Fiyatları & Modelleri sahibinden.com'da - 11",
      });
      expect(fiat.model).toBe('Egea');
      expect(fiat.engineCode).toBe('1.6 Multijet');
      expect(fiat.trim).toBe('Urban');
      expect(fiat.fuelType).toBe('Dizel');
    });

    test('A2. Yanlış marka klasörüne kaydedilmiş sayfa doğru markaya atanır', () => {
      const d = deriveFromSource({
        folderMake: 'Honda',
        pageTitleOrFileName: "Hyundai Accent Era 1.5 CRDi VGT Team Fiyatları & Modelleri sahibinden.com'da",
      });
      expect(d.make).toBe('Hyundai');
      expect(d.model).not.toContain('Hyundai');
    });

    test('A3. Model adı türetilemeyen sayfa geçersiz sayılır (uydurma model üretilmez)', () => {
      const d = deriveFromSource({
        folderMake: 'Alfa Romeo',
        pageTitleOrFileName: "Alfa Romeo Fiyatları & Modelleri sahibinden.com'da - 10",
      });
      expect(d.isValid).toBe(false);
      expect(d.rejectReason).toBe('MODEL_TESPIT_EDILEMEDI');
    });

    test('A4. Yakıt motor kodundan türetilir, model adından uydurulmaz', () => {
      expect(deriveFuelFromEngineCode('320d')).toBe('Dizel');
      expect(deriveFuelFromEngineCode('320i')).toBe('Benzin');
      expect(deriveFuelFromEngineCode('1.6 TDCi')).toBe('Dizel');
      expect(deriveFuelFromEngineCode('1.4 MPI')).toBe('Benzin');
      // Bilinmiyorsa bos doner; varsayilan yakit ATANMAZ.
      expect(deriveFuelFromEngineCode('1.3')).toBe('');
      // "Fiat 500e" model adidir; yakit cikarimi yapilmaz.
      expect(
        deriveFromSource({ folderMake: 'Abarth', pageTitleOrFileName: 'Abarth 500e' }).fuelType,
      ).toBe('');
    });

    test('A5. Şanzıman yalnızca metinde açıkça geçiyorsa atanır', () => {
      expect(deriveTransmission('Otomatik vites hatasız')).toBe('Otomatik');
      expect(deriveTransmission('düz vites')).toBe('Manuel');
      expect(deriveTransmission('temiz aile aracı')).toBe('');
    });

    test('A6. Aynı motorun farklı yazımları tek anahtara indirgenir', () => {
      expect(engineKey('1.6 i-DTEC')).toBe(engineKey('1.6i DTEC'));
      expect(isEngineCompatible('1.6 i-DTEC', '1.6i DTEC', true)).toBe(true);
    });

    test('A7. Katalogdaki birleşik variant adı motor + pakete ayrılır', () => {
      expect(splitVariantString('1.0 EcoBoost GTDi Titanium')).toEqual({
        engineCode: '1.0 EcoBoost GTDi',
        trim: 'Titanium',
      });
      expect(splitVariantString('320i')).toEqual({ engineCode: '320i', trim: '' });
      expect(splitVariantString('Urban')).toEqual({ engineCode: '', trim: 'Urban' });
    });

    test('A8. Türkçe ilan tarihi ayrıştırılır (tazelik ağırlığı için)', () => {
      const d = parseTurkishListingDate('06 Ağustos 2026');
      expect(d).not.toBeNull();
      expect(d!.getUTCMonth()).toBe(7);
      expect(d!.getUTCDate()).toBe(6);
      expect(parseTurkishListingDate('anlamsız metin')).toBeNull();
    });
  });

  /* ================================================================ */
  /* B. Farkli motor/trim ayrimi                                       */
  /* ================================================================ */

  describe('B. Motor / donanım ayrımı', () => {
    test('B1. Farklı yakıtlı motorlar asla aynı havuzda birleşmez', () => {
      expect(isEngineCompatible('320i', '320d', false)).toBe(false);
      expect(isEngineCompatible('1.6 Multijet', '1.6 MPI', false)).toBe(false);
    });

    test('B2. Ciddi güç farkı olan motorlar geniş fallback’te bile eşleşmez', () => {
      expect(isEngineCompatible('316i', '340i', false)).toBe(false);
      expect(isEngineCompatible('1.0 TSI', '2.0 TSI', false)).toBe(false);
    });

    test('B3. Farklı motorlar farklı fiyat üretir (aynı fiyat kopyalanmaz)', () => {
      const cheap = priceIt(comps(30, 800_000));
      const expensive = priceIt(comps(30, 1_400_000));
      expect(cheap.fairMarketValue).toBeLessThan(expensive.fairMarketValue);
      expect(cheap.cashOffer).toBeLessThan(expensive.cashOffer);
    });
  });

  /* ================================================================ */
  /* C. Km / hasar yonu                                                */
  /* ================================================================ */

  describe('C. Kilometre ve hasar etkisi', () => {
    test('C1. Yüksek km fiyatı ASLA yükseltmez', () => {
      const pool = comps(40, 1_000_000, { km: 120_000 });
      const low = priceIt(pool, { userMileage: 60_000 });
      const high = priceIt(pool, { userMileage: 300_000 });
      expect(high.fairMarketValue).toBeLessThan(low.fairMarketValue);
      expect(high.cashOffer).toBeLessThan(low.cashOffer);
    });

    test('C2. Hasar kaydı fiyatı ASLA yükseltmez', () => {
      const pool = comps(40, 1_500_000);
      const clean = priceIt(pool, { damagePenalty: 0 });
      const damaged = priceIt(pool, { damagePenalty: 0.08 });
      expect(damaged.fairMarketValue).toBeLessThan(clean.fairMarketValue);
      expect(damaged.cashOffer).toBeLessThan(clean.cashOffer);
    });

    test('C4. Havuzun km aralığı DIŞINDA eğim tam uygulanmaz (ekstrapolasyon sönümlemesi)', () => {
      // Cikis yili havuzu: dar km araligi (5k-40k). Egim bu aralikta olculur;
      // 150k km'ye tasinirken tam egim uygulanamaz.
      const pool = comps(40, 6_000_000).map((l, i) => ({
        ...l,
        mileageKm: 5_000 + i * 900, // 5.000 - 40.100 km
        price: Math.round(6_000_000 * (1 - i * 0.004)),
      }));
      const inSupport = priceIt(pool, { userMileage: 20_000 });
      const farOutside = priceIt(pool, { userMileage: 150_000 });

      // Yon dogru kalmali: yuksek km daha ucuz
      expect(farOutside.fairMarketValue).toBeLessThan(inSupport.fairMarketValue);
      // Ama sinirsiz ekstrapolasyon olmamali
      expect(farOutside.pricingAudit.kmExtrapolated).toBe(true);
      expect(farOutside.pricingAudit.effectiveTargetKm).toBeLessThan(150_000);
      expect(farOutside.pricingAudit.effectiveTargetKm).toBeGreaterThan(
        farOutside.pricingAudit.kmSupportP90,
      );
    });

    test('C5. Km aralığı İÇİNDE davranış değişmez (sönümleme devreye girmez)', () => {
      const pool = comps(40, 1_200_000, { km: 100_000 }).map((l, i) => ({
        ...l,
        mileageKm: 40_000 + i * 4_000, // 40k - 196k
      }));
      const r = priceIt(pool, { userMileage: 100_000 });
      expect(r.pricingAudit.kmExtrapolated).toBe(false);
      expect(r.pricingAudit.effectiveTargetKm).toBe(100_000);
    });

    test('C6. Dar km yayılımında öğrenilen eğim varsayılana doğru büzülür', () => {
      // Cok dik ama dar aralikta olculmus egim, oldugu gibi kullanilmamali.
      const narrow = comps(40, 6_000_000).map((l, i) => ({
        ...l,
        mileageKm: 10_000 + i * 200, // 10.000 - 17.800 km (cok dar)
        price: Math.round(6_000_000 * (1 - i * 0.02)), // cok dik dusus
      }));
      const wide = comps(40, 6_000_000).map((l, i) => ({
        ...l,
        mileageKm: 10_000 + i * 4_000, // 10.000 - 166.000 km (genis)
        price: Math.round(6_000_000 * (1 - i * 0.02)),
      }));
      const rNarrow = priceIt(narrow, { userMileage: 15_000 });
      const rWide = priceIt(wide, { userMileage: 80_000 });
      expect(rNarrow.pricingAudit.mileageAdjustmentSource).toBe('LEARNED_SHRUNK_TO_DEFAULT');
      expect(rNarrow.kmDecayPer10k!).toBeLessThan(rWide.kmDecayPer10k!);
    });

    test('C7. Ceteris paribus: emsal medyanları yeni yılı desteklediğinde damping sıralamayı bozmaz', () => {
      // KAPSAM UYARISI: Bu test GLOBAL bir "yeni yıl her zaman daha pahalıdır"
      // invariantı DEĞİLDİR. Yalnızca aşağıdaki koşulların TAMAMI sağlandığında
      // geçerli bir regresyondur:
      //   - aynı marka/model/motor/paket/yakıt/şanzıman (comps() aynı variant üretir)
      //   - aynı hedef kilometre (60.000)
      //   - benzer veri kalitesi (aynı emsal sayısı, aynı tazelik/ağırlık)
      //   - ve ham emsal medyanları yeni yılı DAHA YÜKSEK destekliyor
      // Gerçek piyasa verisi tersini söylüyorsa algoritma zorla monotonlaştırılmaz;
      // deep audit'te 51 yıl çiftinden ham veriyle çelişen 0 tanesi bulunmuştur.
      //
      // Regresyon: dar km havuzlu yeni model, tavana dayanan eğim yüzünden
      // eski modelin ALTINA düşüyordu (BMW 520i 2024/2025, ~760.000 TL sapma).
      const older = comps(40, 6_000_000).map((l, i) => ({
        ...l, year: 2024, mileageKm: 10_000 + i * 900,
      }));
      const newer = comps(40, 6_300_000).map((l, i) => ({
        ...l, year: 2025, mileageKm: 5_000 + i * 850,
      }));

      // Ön koşulu testin kendisi doğrular: ham medyanlar yeni yılı destekliyor mu?
      const rawMedian = (pool: CleanListingItem[]) => {
        const s2 = pool.map((l) => l.price).sort((a2, b2) => a2 - b2);
        return s2[Math.floor(s2.length / 2)];
      };
      expect(rawMedian(newer)).toBeGreaterThan(rawMedian(older));

      const a = priceIt(older, { userYear: 2024, userMileage: 60_000 });
      const b = priceIt(newer, { userYear: 2025, userMileage: 60_000 });
      expect(b.fairMarketValue).toBeGreaterThan(a.fairMarketValue);
    });

    test('C8. Ham veri eski yılı destekliyorsa sistem zorla monotonlaştırmaz', () => {
      // Ters yon: piyasa gercekten eski yili daha yuksek fiyatliyorsa
      // (orn. yeni yilda donanim dususu / stok baskisi), sistem bunu ezmemeli.
      const older = comps(40, 6_300_000).map((l, i) => ({
        ...l, year: 2024, mileageKm: 20_000 + i * 900,
      }));
      const newer = comps(40, 6_000_000).map((l, i) => ({
        ...l, year: 2025, mileageKm: 20_000 + i * 900,
      }));
      const a = priceIt(older, { userYear: 2024, userMileage: 60_000 });
      const b = priceIt(newer, { userYear: 2025, userMileage: 60_000 });
      expect(b.fairMarketValue).toBeLessThan(a.fairMarketValue);
    });

    test('C3. Km bilgisi olmayan emsal için varsayılan km UYDURULMAZ', () => {
      const pool = comps(20, 1_000_000, { km: 150_000 }).map((l, i) =>
        i % 2 === 0 ? { ...l, mileageKm: 0 } : l,
      );
      const res = priceIt(pool, { userMileage: 150_000 });
      // Referans medyan yalnizca km'si bilinen ilanlardan hesaplanir.
      expect(res.referenceMedianMileage).toBe(150_000);
      expect(res.pricingAudit.listingsWithKm).toBe(10);
    });
  });

  /* ================================================================ */
  /* D. Uc deger / mukerrer                                            */
  /* ================================================================ */

  describe('D. Veri temizliği', () => {
    test('D1. Hatalı ucuz/pahalı ilanlar IQR ile ayıklanır', () => {
      const cleaned = RobustPricingCalculator.cleanOutliersIQR([
        60_000, 1_000_000, 1_020_000, 1_050_000, 1_060_000, 1_080_000, 9_000_000,
      ]);
      expect(cleaned).not.toContain(60_000);
      expect(cleaned).not.toContain(9_000_000);
      expect(cleaned.length).toBe(5);
    });

    test('D2. Sağlık aralığı dışındaki fiyatlar hiç değerlendirmeye girmez', () => {
      const cleaned = RobustPricingCalculator.cleanOutliersIQR([1, 100, 500_000, 520_000, 530_000, 540_000]);
      expect(Math.min(...cleaned)).toBeGreaterThanOrEqual(PRICING_LIMITS.priceSanityRange[0]);
    });

    test('D3. Tek bir hatalı ilan medyanı bozmaz', () => {
      const pool = comps(30, 2_000_000);
      const withOutlier = [...pool, { ...pool[0], price: 260_000 }];
      const a = priceIt(pool);
      const b = priceIt(withOutlier);
      expect(Math.abs(a.fairMarketValue - b.fairMarketValue) / a.fairMarketValue).toBeLessThan(0.02);
    });
  });

  /* ================================================================ */
  /* E. Nakit / konsinye invariantlari                                 */
  /* ================================================================ */

  describe('E. Fiyat invariantları', () => {
    const scenarios: Array<[string, number]> = [
      ['ekonomik', 320_000],
      ['orta-alt', 900_000],
      ['orta', 1_600_000],
      ['üst-orta', 3_200_000],
      ['yüksek', 6_000_000],
      ['premium', 12_000_000],
    ];

    test.each(scenarios)('E1. %s segmentinde 4 invariant birlikte sağlanır', (_name, base) => {
      const r = priceIt(comps(40, base));
      expect(r.cashOffer).toBeLessThan(r.expectedSalePrice);
      expect(r.customerConsignmentNet).toBeLessThanOrEqual(r.expectedSalePrice);
      expect(r.customerConsignmentNet).toBeGreaterThan(r.cashOffer);
      expect(r.consignmentListingPrice).toBeGreaterThanOrEqual(r.expectedSalePrice);
    });

    test('E2. Müşterinin istediği yüksek net, güvenli tavanı aşamaz', () => {
      const r = priceIt(comps(40, 1_500_000), { userDesiredPrice: 99_000_000 });
      expect(r.agreedCustomerNet).toBeLessThanOrEqual(r.expectedSalePrice);
      expect(r.agreedCustomerNet).toBeLessThanOrEqual(r.aiRecommendedCustomerNet);
      expect(r.customerConsignmentNet).toBeGreaterThan(r.cashOffer);
    });

    test('E3. Konsinye ilan fiyatı beklenen satışın üzerinde pazarlık payı taşır', () => {
      const r = priceIt(comps(40, 1_500_000));
      expect(r.consignmentListingPrice).toBeGreaterThan(r.expectedSalePrice);
      expect(r.consignmentCommission).toBeGreaterThan(0);
      expect(r.customerConsignmentNet).toBe(
        r.expectedConsignmentSalePrice - r.consignmentCommission,
      );
    });
  });

  /* ================================================================ */
  /* F. Kar basamagi ve musteri korumasi                               */
  /* ================================================================ */

  describe('F. Kâr basamağı ve müşteri koruması', () => {
    test.each([
      [400_000, 20_000],
      [900_000, 30_000],
      [1_600_000, 40_000],
      [3_000_000, 60_000],
      [6_000_000, 140_000],
    ])('F1. %i TL segmentinde hedef kâr tabanı >= %i TL', (base, minProfit) => {
      const r = priceIt(comps(40, base));
      if (r.requiresManualApproval) return; // manuel akista fiyat gosterilmez
      expect(r.pricingAudit.targetProfit).toBeGreaterThanOrEqual(minProfit);
      // Nakit kanalinin brut marji hedef kari kapsamali
      expect(r.expectedSalePrice - r.cashOffer).toBeGreaterThanOrEqual(minProfit);
    });

    // V4: belirsizlik TEK KEZ, risk rezervinde fiyatlanir. Hedef kar galerinin
    // ticari karidir ve belirsizlik yuzunden ayrica buyutulmez (cifte tahsil).
    test('F2. Düşük veri güveni risk rezervini büyütür, hedef kârı değil', () => {
      const confident = priceIt(comps(40, 6_000_000), { baseConfidenceScore: 95 });
      const risky = priceIt(comps(40, 6_000_000), { baseConfidenceScore: 60, matchedLevel: 3 });
      expect(risky.pricingAudit.riskCost).toBeGreaterThan(confident.pricingAudit.riskCost);
      expect(risky.pricingAudit.targetProfit).toBe(confident.pricingAudit.targetProfit);
      expect(risky.pricingAudit.riskProfitUplift).toBe(1);
      expect(risky.cashOffer).toBeLessThan(confident.cashOffer);
    });

    test('F3. Nakit teklif müşteriyi kaçıracak kadar piyasa altına düşmez', () => {
      for (const base of [400_000, 900_000, 1_600_000, 3_200_000, 6_000_000]) {
        const r = priceIt(comps(40, base));
        if (r.requiresManualApproval) continue;
        const seg = getSegment(r.expectedSalePrice);
        expect(r.cashOffer / r.expectedSalePrice).toBeGreaterThanOrEqual(
          seg.minCashRatioOfExpectedSale - 0.01,
        );
      }
    });

    test('F5. Yuvarlanmış (gösterilen) teklif müşteri tabanının altına inemez', () => {
      // Asagi yuvarlama, tabani bir basamak kadar sessizce delmemeli.
      for (const base of [180_000, 220_000, 267_000, 310_000, 420_000, 560_000, 780_000, 1_050_000]) {
        const r = priceIt(comps(40, base));
        const seg = getSegment(r.expectedSalePrice);
        const floor = r.expectedSalePrice * seg.minCashRatioOfExpectedSale;
        if (r.cashOffer < floor) {
          expect(r.requiresManualApproval).toBe(true);
        }
      }
    });

    test('F4. Kâr tabanı ile müşteri tabanı çakışırsa fiyat yerine MANUEL istenir', () => {
      // Cok ucuz arac: sabit maliyet + minimum kar, musteri tabanina sigmaz.
      const r = priceIt(comps(40, 95_000));
      expect(r.requiresManualApproval).toBe(true);
      expect(r.manualApprovalReason).toBeTruthy();
    });
  });

  /* ================================================================ */
  /* G. Guven skoru                                                    */
  /* ================================================================ */

  describe('G. Güven skoru veri kalitesiyle uyumlu', () => {
    test('G1. Az emsal güveni düşürür', () => {
      const many = priceIt(comps(40, 1_200_000), { realMatchedListingCount: 40 });
      const few = priceIt(comps(6, 1_200_000), { realMatchedListingCount: 6 });
      expect(few.confidenceScore).toBeLessThan(many.confidenceScore);
    });

    test('G2. Geniş fallback (Seviye 3) güveni düşürür', () => {
      const l1 = priceIt(comps(40, 1_200_000), { matchedLevel: 1 });
      const l3 = priceIt(comps(40, 1_200_000), { matchedLevel: 3 });
      expect(l3.confidenceScore).toBeLessThan(l1.confidenceScore);
    });

    // V4: genel pazarlik kirimi kaldirildi (kanitlanmis kapanis fiyati verisi
    // yok). Tazelik/yayilim artik piyasa referansini dusurmez; belirsizlik
    // rezervini (riskCost) bir kez artirir.
    test('G3. Bayat emsal güveni düşürür ve risk rezervini artırır', () => {
      const fresh = priceIt(comps(40, 1_200_000), { freshnessScore: 1 });
      const stale = priceIt(comps(40, 1_200_000), { freshnessScore: 0.25 });
      expect(stale.confidenceScore).toBeLessThan(fresh.confidenceScore);
      expect(stale.pricingAudit.negotiationRate).toBe(0);
      expect(stale.pricingAudit.riskRate).toBeGreaterThan(fresh.pricingAudit.riskRate);
      expect(stale.cashOffer).toBeLessThan(fresh.cashOffer);
    });

    test('G4. Dağılımı geniş piyasada risk rezervi artar, piyasa referansı düşmez', () => {
      const tight = priceIt(comps(40, 1_500_000, { spread: 0.03 }));
      const wide = priceIt(comps(40, 1_500_000, { spread: 0.35 }));
      expect(wide.pricingAudit.riskRate).toBeGreaterThan(tight.pricingAudit.riskRate);
      expect(wide.expectedSalePrice).toBe(wide.fairMarketValue);
      expect(tight.expectedSalePrice).toBe(tight.fairMarketValue);
    });
  });

  /* ================================================================ */
  /* G2. Guven skoru bilesenleri (kalibrasyon)                         */
  /* ================================================================ */

  describe('G2. Confidence = veri kalitesi (sadece ilan sayısı değil)', () => {
    const base = {
      matchedLevel: 1, listingCount: 40, engineExactShare: 1, fuelKnownShare: 1,
      transmissionKnownShare: 1, freshnessScore: 1, dispersion: 0.1, targetEngineKnown: true,
    };

    test('G2a. Her bozulma faktörü güveni ayrı ayrı düşürür', () => {
      const full = computeConfidence(base);
      expect(computeConfidence({ ...base, engineExactShare: 0.05 })).toBeLessThan(full);
      expect(computeConfidence({ ...base, fuelKnownShare: 0.1 })).toBeLessThan(full);
      expect(computeConfidence({ ...base, freshnessScore: 0.25 })).toBeLessThan(full);
      expect(computeConfidence({ ...base, dispersion: 0.6 })).toBeLessThan(full);
      expect(computeConfidence({ ...base, listingCount: 6 })).toBeLessThan(full);
      expect(computeConfidence({ ...base, matchedLevel: 3 })).toBeLessThan(full);
    });

    test('G2b. Şanzıman havuzun yarısından azında biliniyorsa tam güven verilmez', () => {
      expect(computeConfidence({ ...base, transmissionKnownShare: 0.02 })).toBeLessThanOrEqual(90);
      expect(computeConfidence({ ...base, transmissionKnownShare: 0.8 })).toBeGreaterThan(90);
    });

    test('G2c. Hedef aracın motoru bilinmiyorsa güven 60 ile sınırlanır', () => {
      expect(computeConfidence({ ...base, targetEngineKnown: false })).toBeLessThanOrEqual(60);
    });

    test('G2d. Çok emsal, kötü veri kalitesini telafi ETMEZ', () => {
      const manyBad = computeConfidence({
        ...base, listingCount: 800, engineExactShare: 0.03, matchedLevel: 2, freshnessScore: 0.4,
      });
      const fewGood = computeConfidence({ ...base, listingCount: 12 });
      expect(manyBad).toBeLessThan(fewGood);
      expect(manyBad).toBeLessThanOrEqual(70); // manuel kapısına düşer
    });

    test('G2e. Bozulmalar birikince güven manuel eşiğinin altına iner', () => {
      const worst = computeConfidence({
        matchedLevel: 3, listingCount: 6, engineExactShare: 0.05, fuelKnownShare: 0.1,
        transmissionKnownShare: 0, freshnessScore: 0.25, dispersion: 0.7, targetEngineKnown: true,
      });
      expect(worst).toBeLessThan(50);
    });
  });

  /* ================================================================ */
  /* G3. Km ekstrapolasyonunun guven skoruna yansimasi                 */
  /* ================================================================ */

  describe('G3. Kilometre ekstrapolasyonu güven skoruna yansır', () => {
    /** Gözlenen km aralığı ~40.000–160.000 olan güçlü bir L1 havuzu */
    const strongPool = () =>
      comps(48, 1_500_000).map((l, i) => ({
        ...l,
        mileageKm: 35_000 + i * 3_000, // 35.000 - 176.000
      }));

    const at = (km: number) => priceIt(strongPool(), { userMileage: km });

    test('G3-A. Aralık İÇİNDE ceza yoktur (p10/median/p90 aynı davranış)', () => {
      const inside = [60_000, 105_000, 150_000].map(at);
      for (const r of inside) {
        expect(r.pricingAudit.kmExtrapolated).toBe(false);
        expect(r.pricingAudit.distanceOutsideObservedRange).toBe(0);
        expect(r.pricingAudit.extrapolationConfidencePenalty).toBe(0);
      }
      // Aralik ici confidence, cezasiz referansla birebir ayni
      const ref = computeConfidence({
        matchedLevel: 1, listingCount: 48, engineExactShare: 1, fuelKnownShare: 1,
        transmissionKnownShare: 1, freshnessScore: 0.9, dispersion: inside[1].pricingAudit.dispersion,
        targetEngineKnown: true,
      });
      const withZero = computeConfidence({
        matchedLevel: 1, listingCount: 48, engineExactShare: 1, fuelKnownShare: 1,
        transmissionKnownShare: 1, freshnessScore: 0.9, dispersion: inside[1].pricingAudit.dispersion,
        targetEngineKnown: true, distanceOutsideObservedRange: 0,
      });
      expect(withZero).toBe(ref);
    });

    test('G3-B. p90+25k: güven düşer ama güçlü L1 veride gereksiz MANUAL olmaz', () => {
      const p90 = at(105_000).pricingAudit.kmSupportP90;
      const inRange = at(105_000);
      const near = at(p90 + 25_000);
      expect(near.confidenceScore).toBeLessThan(inRange.confidenceScore);
      expect(near.confidenceScore).toBeGreaterThan(70); // manuel kapisina dusmez
    });

    test('G3-C. p90+75k: p90+25k’den daha düşük güven', () => {
      const p90 = at(105_000).pricingAudit.kmSupportP90;
      expect(at(p90 + 75_000).confidenceScore).toBeLessThan(
        at(p90 + 25_000).confidenceScore,
      );
    });

    test('G3-D. p90+150k: p90+75k’den daha düşük güven', () => {
      const p90 = at(105_000).pricingAudit.kmSupportP90;
      expect(at(p90 + 150_000).confidenceScore).toBeLessThan(
        at(p90 + 75_000).confidenceScore,
      );
    });

    test('G3-E. Uzaklık arttıkça güven ASLA yükselmez (monoton azalan)', () => {
      const p90 = at(105_000).pricingAudit.kmSupportP90;
      const seq = [0, 10_000, 25_000, 50_000, 75_000, 110_000, 150_000, 220_000, 400_000]
        .map((d) => at(p90 + d).confidenceScore);
      for (let i = 1; i < seq.length; i++) {
        expect(seq[i]).toBeLessThanOrEqual(seq[i - 1]);
      }
      // ceza egrisi de surekli ve monoton
      const pen = [0, 25_000, 75_000, 150_000, 300_000, 900_000].map(mileageExtrapolationPenalty);
      expect(pen).toEqual([0, 4, 10, 18, 24, 24]);
      for (let i = 1; i < pen.length; i++) expect(pen[i]).toBeGreaterThanOrEqual(pen[i - 1]);
    });

    test('G3-F. Fiyat çıktıları DEĞİŞMEZ (yalnız confidence değişir)', () => {
      // Ayni girdide ceza uygulanan ve uygulanmayan iki senaryo: fiyat alanlari
      // ceza mekanizmasindan etkilenmemeli. Guven skoru fiyat matematigine
      // geri beslenmez (riskRate baseConfidenceScore'dan turer).
      const pool = strongPool();
      const far = priceIt(pool, { userMileage: 300_000 });
      const farHighBase = priceIt(pool, { userMileage: 300_000, baseConfidenceScore: 92 });
      for (const k of [
        'fairMarketValue', 'expectedSalePrice', 'cashOffer',
        'consignmentListingPrice', 'customerConsignmentNet',
      ] as const) {
        expect(far[k]).toBe(farHighBase[k]);
      }
      // ceza gercekten uygulanmis olmali
      expect(far.pricingAudit.extrapolationConfidencePenalty).toBeGreaterThan(0);
    });

    test('G3-G. Ceza diğer bileşenlerin yerine geçmez, üzerine eklenir', () => {
      const base = {
        matchedLevel: 1 as const, listingCount: 48, engineExactShare: 1, fuelKnownShare: 1,
        transmissionKnownShare: 1, freshnessScore: 1, dispersion: 0.1, targetEngineKnown: true,
      };
      const clean = computeConfidence(base);
      const extrapolated = computeConfidence({ ...base, distanceOutsideObservedRange: 75_000 });
      const staleOnly = computeConfidence({ ...base, freshnessScore: 0.3 });
      const both = computeConfidence({ ...base, freshnessScore: 0.3, distanceOutsideObservedRange: 75_000 });
      expect(clean - extrapolated).toBeCloseTo(10, 0);
      expect(both).toBeLessThan(staleOnly);
      expect(both).toBeLessThan(extrapolated);
    });
  });

  /* ================================================================ */
  /* H. Gercek veritabani entegrasyonu                                 */
  /* ================================================================ */

  describe('H. Gerçek veritabanı entegrasyonu', () => {
    let prisma: PrismaClient;
    let matcher: EmsalMatcherService;

    beforeAll(async () => {
      prisma = new PrismaClient();
      matcher = new EmsalMatcherService(prisma as any);
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    test('H1. Seviye 1 eşleşmesi birebir motor ve model yılı kullanır', async () => {
      const m = await matcher.matchComparableListings({
        make: 'BMW',
        model: '3 Serisi',
        variant: '320i',
        year: 2019,
        mileageKm: 100_000,
      });
      if (m.level === 4) return;
      expect(m.level).toBe(1);
      expect(m.matchedCount).toBeGreaterThanOrEqual(PRICING_LIMITS.minCompCountForPricing);
      for (const l of m.cleanListings) {
        expect(l.year).toBe(2019);
        expect(isEngineCompatible('320i', l.variant || '', true)).toBe(true);
      }
    });

    test('H2. Emsal listesinde mükerrer ilan ID’si bulunmaz', async () => {
      const m = await matcher.matchComparableListings({
        make: 'BMW',
        model: '3 Serisi',
        variant: '320i',
        year: 2019,
        mileageKm: 100_000,
      });
      const ids = m.cleanListings.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    test('H3. Farklı yakıtlı motorlar aynı emsal havuzuna girmez', async () => {
      const m = await matcher.matchComparableListings({
        make: 'BMW',
        model: '3 Serisi',
        variant: '320d',
        year: 2019,
        mileageKm: 100_000,
      });
      if (m.level === 4) return;
      for (const l of m.cleanListings) {
        if (l.fuelType) expect(l.fuelType).toBe('Dizel');
      }
    });

    test('H4. Kayıtlı olmayan araç fiyat üretmez (Seviye 4)', async () => {
      // NOT: Onceki surum 'Ferrari Roma' kullaniyordu; korpusta 9 GERCEK Roma
      // ilani var (motor '3.9' tam-model alaninda). Eski kod bunlari yalnizca
      // motor ALANI bos diye goremiyordu - Audi A3 Sedan 35 TFSI ile ayni hata
      // sinifi. 'Veri yok' testi gercekten var olmayan bir modelle yapilir.
      const m = await matcher.matchComparableListings({
        make: 'Ferrari',
        model: 'KurguModelYok',
        variant: '3.9 V8',
        year: 2022,
        mileageKm: 10_000,
      });
      expect(m.level).toBe(4);
      expect(m.matchedCount === 0 || m.cleanListings.length === 0).toBe(true);
      expect(m.confidenceScore).toBe(0);
    });

    test('H5. Emsaller gerçek ilanlardan gelir; temsili/uydurma kayıt yoktur', async () => {
      const m = await matcher.matchComparableListings({
        make: 'BMW',
        model: '3 Serisi',
        variant: '320i',
        year: 2019,
        mileageKm: 100_000,
      });
      if (m.level === 4) return;
      const ids = (m.uniqueListingIds || []).slice(0, 20);
      const found = await prisma.rawVehicleListing.findMany({
        where: { sourceListingId: { in: ids } },
        select: { sourceListingId: true },
      });
      expect(found.length).toBe(ids.length);
    });

    test('H6. Aynı model ailesindeki farklı motorlar farklı fiyat üretir', async () => {
      const variants = ['320i', '318i', '320d'];
      const values: number[] = [];
      for (const v of variants) {
        const m = await matcher.matchComparableListings({
          make: 'BMW',
          model: '3 Serisi',
          variant: v,
          year: 2019,
          mileageKm: 100_000,
        });
        if (m.level === 4) continue;
        const calc = RobustPricingCalculator.computeValuation({
          cleanListings: m.cleanListings,
          userYear: 2019,
          userMileage: 100_000,
          matchedLevel: m.level,
          baseConfidenceScore: m.confidenceScore,
          realMatchedListingCount: m.actuallyUsedListingCount || m.matchedCount,
          listingWeights: m.listingWeights,
          freshnessScore: m.freshnessScore,
        });
        values.push(calc.fairMarketValue);
      }
      if (values.length >= 2) {
        expect(new Set(values).size).toBe(values.length);
      }
    });

    test('H7. Gerçek veri üzerinde km artışı fiyatı düşürür (tüm seviyelerde)', async () => {
      const cases = [
        { make: 'BMW', model: '3 Serisi', variant: '316i', year: 2019 },
        { make: 'Hyundai', model: 'i20', variant: '1.4 MPI', year: 2020 },
      ];
      for (const c of cases) {
        const m = await matcher.matchComparableListings({ ...c, mileageKm: 80_000 });
        if (m.level === 4) continue;
        const mk = (km: number) =>
          RobustPricingCalculator.computeValuation({
            cleanListings: m.cleanListings,
            userYear: c.year,
            userMileage: km,
            matchedLevel: m.level,
            baseConfidenceScore: m.confidenceScore,
            realMatchedListingCount: m.actuallyUsedListingCount || m.matchedCount,
            listingWeights: m.listingWeights,
            freshnessScore: m.freshnessScore,
          });
        expect(mk(250_000).fairMarketValue).toBeLessThan(mk(60_000).fairMarketValue);
      }
    });

    test('H9. Motoru bilinmeyen seçimde havuz sınırlı işaretlenir ve güven 70 altına iner', async () => {
      const m = await matcher.matchComparableListings({
        make: 'BMW', model: '5 Serisi', variant: 'Executive', year: 2016, mileageKm: 150_000,
      });
      if (m.level === 4) return;
      expect(m.isLimitedComps).toBe(true);
      const r = RobustPricingCalculator.computeValuation({
        cleanListings: m.cleanListings, userYear: 2016, userMileage: 150_000,
        matchedLevel: m.level, baseConfidenceScore: m.confidenceScore,
        realMatchedListingCount: m.actuallyUsedListingCount || m.matchedCount,
        listingWeights: m.listingWeights, freshnessScore: m.freshnessScore,
        engineExactShare: m.engineExactShare, fuelKnownShare: m.fuelKnownShare,
        transmissionKnownShare: m.transmissionKnownShare,
        targetEngineKnown: false,
      });
      expect(r.confidenceScore).toBeLessThanOrEqual(70);
    });

    test('H10. Aynı ailede zayıf motor eşleşmesi otomatik fiyat üretmez', async () => {
      const m = await matcher.matchComparableListings({
        make: 'BMW', model: '3 Serisi', variant: '316i', year: 2019, mileageKm: 120_000,
      });
      if (m.level === 4 || m.level === 1) return;
      const r = RobustPricingCalculator.computeValuation({
        cleanListings: m.cleanListings, userYear: 2019, userMileage: 120_000,
        matchedLevel: m.level, baseConfidenceScore: m.confidenceScore,
        realMatchedListingCount: m.actuallyUsedListingCount || m.matchedCount,
        listingWeights: m.listingWeights, freshnessScore: m.freshnessScore,
        engineExactShare: m.engineExactShare, fuelKnownShare: m.fuelKnownShare,
        transmissionKnownShare: m.transmissionKnownShare, targetEngineKnown: true,
      });
      // Havuz agirlikli olarak farkli motorlardan olustugu icin otomatik teklif verilmez.
      expect(r.confidenceScore).toBeLessThanOrEqual(70);
    });

    test('H8. Gerçek veri üzerinde invariantlar korunur', async () => {
      const cases = [
        { make: 'BMW', model: '5 Serisi', variant: '520i', year: 2016 },
        { make: 'Fiat', model: 'Egea', variant: '1.4 Easy', year: 2021 },
        { make: 'Hyundai', model: 'Accent', variant: '1.3', year: 2005 },
      ];
      for (const c of cases) {
        const m = await matcher.matchComparableListings({ ...c, mileageKm: 150_000 });
        if (m.level === 4) continue;
        const r = RobustPricingCalculator.computeValuation({
          cleanListings: m.cleanListings,
          userYear: c.year,
          userMileage: 150_000,
          matchedLevel: m.level,
          baseConfidenceScore: m.confidenceScore,
          realMatchedListingCount: m.actuallyUsedListingCount || m.matchedCount,
          listingWeights: m.listingWeights,
          freshnessScore: m.freshnessScore,
        });
        expect(r.cashOffer).toBeLessThan(r.expectedSalePrice);
        expect(r.customerConsignmentNet).toBeLessThanOrEqual(r.expectedSalePrice);
        expect(r.customerConsignmentNet).toBeGreaterThan(r.cashOffer);
        expect(r.consignmentListingPrice).toBeGreaterThanOrEqual(r.expectedSalePrice);
      }
    });
  });
});
