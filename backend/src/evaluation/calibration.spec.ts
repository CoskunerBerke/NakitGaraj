import * as fs from 'fs';
import * as path from 'path';
import {
  CSV_COLUMNS,
  MIN_CASES_FOR_CALIBRATION,
  computeErrors,
  hasRealData,
  parseCsv,
  parseMoney,
  splitCsvLine,
  segmentOf,
  confidenceBandOf,
  biasVerdict,
  median,
  mae,
} from '../scripts/calibration_report';

describe('Kalibrasyon ölçüm sistemi', () => {
  describe('Girdi ayrıştırma', () => {
    test('Türkçe ve düz yazılmış tutarları okur, boşları null bırakır', () => {
      expect(parseMoney('1.250.000')).toBe(1250000);
      expect(parseMoney('1,250,000')).toBe(1250000);
      expect(parseMoney('1250000 TL')).toBe(1250000);
      expect(parseMoney('')).toBeNull();
      expect(parseMoney('-')).toBeNull();
      expect(parseMoney(undefined)).toBeNull();
    });

    test('Tırnaklı CSV alanlarını bozmadan ayırır', () => {
      expect(splitCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    });

    test('Yorum satırlarını ve eksik kayıtları atlar', () => {
      const csv = [
        '# yorum',
        CSV_COLUMNS.join(','),
        '# ORN-1,BMW,3 Serisi,320i,M Sport,2019,85000,0,1,1,1,1,1,x',
        'C1,BMW,3 Serisi,320i,M Sport,2019,85.000,0,2.750.000,2.500.000,2.850.000,,,galeri',
        ',,,,,,,,,,,,,',
      ].join('\n');
      const cases = parseCsv(csv);
      expect(cases).toHaveLength(1);
      expect(cases[0].make).toBe('BMW');
      expect(cases[0].km).toBe(85000);
      expect(cases[0].dealerMarketValue).toBe(2750000);
      expect(cases[0].actualSalePrice).toBeNull();
    });

    test('Gerçek saha verisi olmayan satır ölçüme dahil edilmez', () => {
      const csv = [
        CSV_COLUMNS.join(','),
        'C1,BMW,3 Serisi,320i,,2019,85000,0,,,,,,',
      ].join('\n');
      expect(hasRealData(parseCsv(csv)[0])).toBe(false);
    });
  });

  describe('Sapma hesabı', () => {
    const sys = { fairMarketValue: 2_800_000, expectedSalePrice: 2_700_000, cashOffer: 2_500_000 };

    test('Pozitif sapma = sistem daha yüksek', () => {
      const e = computeErrors(sys, {
        dealerMarketValue: 2_600_000,
        dealerCashOffer: 2_400_000,
        realisticListingPrice: null,
        actualSalePrice: 2_650_000,
      });
      expect(e.marketValueErrorTl).toBe(200_000);
      expect(e.marketValueErrorPct).toBeCloseTo(7.69, 1);
      expect(e.cashErrorTl).toBe(100_000);
      expect(e.salePriceErrorTl).toBe(50_000);
    });

    test('Gerçekleşen satış yoksa gerçekçi ilan fiyatı referans alınır', () => {
      const e = computeErrors(sys, {
        dealerMarketValue: null,
        dealerCashOffer: null,
        realisticListingPrice: 2_900_000,
        actualSalePrice: null,
      });
      expect(e.salePriceErrorTl).toBe(-200_000);
      expect(e.marketValueErrorTl).toBeNull();
      expect(e.cashErrorTl).toBeNull();
    });

    test('Galeri marj farkı = sistem marjı − galericinin gerçekleşen marjı', () => {
      const e = computeErrors(sys, {
        dealerMarketValue: null,
        dealerCashOffer: 2_400_000,
        realisticListingPrice: null,
        actualSalePrice: 2_650_000,
      });
      // sistem marji 200.000 ; galeri marji 250.000
      expect(e.dealerMarginDiff).toBe(-50_000);
    });

    test('Müşteri teklif farkı, nakit sapmasıyla aynı büyüklüktür', () => {
      const e = computeErrors(sys, {
        dealerMarketValue: null,
        dealerCashOffer: 2_400_000,
        realisticListingPrice: null,
        actualSalePrice: null,
      });
      expect(e.customerOfferDiff).toBe(e.cashErrorTl);
      expect(e.customerOfferDiff).toBe(100_000);
    });

    test('Eksik gerçek veri hata UYDURMAZ; sapma alanları null kalır', () => {
      const e = computeErrors(sys, {
        dealerMarketValue: null, dealerCashOffer: null,
        realisticListingPrice: null, actualSalePrice: null,
      });
      // Gercek saha verisine BAGLI her alan null olmali.
      const dealerDependent = [
        e.marketValueErrorTl, e.marketValueErrorPct,
        e.cashErrorTl, e.cashErrorPct,
        e.listingErrorTl, e.listingErrorPct,
        e.salePriceErrorTl, e.salePriceErrorPct,
        e.dealerMarginDiff, e.customerOfferDiff,
        e.realizedDealerSpread, e.dealerCashRatio,
      ];
      expect(dealerDependent.every((v) => v === null)).toBe(true);
      // Yalnizca sistem tarafindan turetilen alanlar hesaplanabilir kalir.
      expect(e.systemExpectedDealerSpread).toBe(200_000);
      expect(e.systemCashRatio).toBeCloseTo(2_500_000 / 2_700_000, 4);
      expect(e.dealerMarginRisk).toBe(false);
    });
  });

  describe('Genişletilmiş sapma metrikleri', () => {
    const sys = {
      fairMarketValue: 2_800_000,
      expectedSalePrice: 2_700_000,
      cashOffer: 2_500_000,
      consignmentListingPrice: 2_790_000,
    };

    test('İlan fiyatı sapması gerçekçi ilan fiyatına göre ölçülür', () => {
      const e = computeErrors(sys, {
        dealerMarketValue: null, dealerCashOffer: null,
        realisticListingPrice: 2_850_000, actualSalePrice: null,
      });
      expect(e.listingErrorTl).toBe(-60_000);
      expect(e.listingErrorPct).toBeCloseTo(-2.11, 1);
    });

    test('Sistem ve galeri nakit oranları ayrı ayrı hesaplanır', () => {
      const e = computeErrors(sys, {
        dealerMarketValue: 2_600_000, dealerCashOffer: 2_400_000,
        realisticListingPrice: null, actualSalePrice: null,
      });
      expect(e.systemCashRatio).toBeCloseTo(2_500_000 / 2_700_000, 4);
      expect(e.dealerCashRatio).toBeCloseTo(2_400_000 / 2_600_000, 4);
    });

    test('Sistem beklenen marjı ve gerçekleşen marj ayrı raporlanır', () => {
      const e = computeErrors(sys, {
        dealerMarketValue: null, dealerCashOffer: 2_400_000,
        realisticListingPrice: null, actualSalePrice: 2_650_000,
      });
      expect(e.systemExpectedDealerSpread).toBe(200_000);
      expect(e.realizedDealerSpread).toBe(250_000);
    });

    test('Gerçekleşen satış yoksa realizedDealerSpread null kalır', () => {
      const e = computeErrors(sys, {
        dealerMarketValue: null, dealerCashOffer: 2_400_000,
        realisticListingPrice: 2_850_000, actualSalePrice: null,
      });
      expect(e.realizedDealerSpread).toBeNull();
    });

    test('CUSTOMER_LOSS_RISK: sistem teklifi galericiden %5+ düşükse işaretlenir', () => {
      const e = computeErrors(
        { ...sys, cashOffer: 2_400_000, expectedSalePrice: 2_600_000 },
        { dealerMarketValue: null, dealerCashOffer: 2_600_000, realisticListingPrice: null, actualSalePrice: null },
      );
      expect(e.customerLossRisk).toBe(true);
    });

    test('CUSTOMER_LOSS_RISK: cash/sale oranı %88 altındaysa da işaretlenir', () => {
      const e = computeErrors(
        { ...sys, cashOffer: 2_300_000, expectedSalePrice: 2_700_000 },
        { dealerMarketValue: null, dealerCashOffer: 2_300_000, realisticListingPrice: null, actualSalePrice: null },
      );
      expect(e.systemCashRatio).toBeLessThan(0.88);
      expect(e.customerLossRisk).toBe(true);
    });

    test('Normal aralıkta hiçbir risk bayrağı yanmaz', () => {
      const e = computeErrors(sys, {
        dealerMarketValue: 2_750_000, dealerCashOffer: 2_480_000,
        realisticListingPrice: 2_800_000, actualSalePrice: 2_720_000,
      });
      expect(e.customerLossRisk).toBe(false);
      expect(e.dealerMarginRisk).toBe(false);
    });

    test('DEALER_MARGIN_RISK: sistem belirgin yüksek alıp marj hedefin altına düşerse', () => {
      const e = computeErrors(
        { fairMarketValue: 2_800_000, expectedSalePrice: 2_700_000, cashOffer: 2_650_000, consignmentListingPrice: 2_790_000 },
        { dealerMarketValue: null, dealerCashOffer: 2_400_000, realisticListingPrice: null, actualSalePrice: 2_680_000 },
      );
      expect(e.dealerMarginRisk).toBe(true);
    });
  });

  describe('Segment / güven bandı / bias sınıflandırması', () => {
    test('Segment sınırları beklenen bantlara düşer', () => {
      expect(segmentOf(450_000)).toBe('<600k');
      expect(segmentOf(900_000)).toBe('600k-1.2M');
      expect(segmentOf(1_600_000)).toBe('1.2M-2M');
      expect(segmentOf(3_000_000)).toBe('2M-4M');
      expect(segmentOf(6_000_000)).toBe('4M-8M');
      expect(segmentOf(12_000_000)).toBe('8M+');
    });

    test('Güven bantları doğru ayrılır', () => {
      expect(confidenceBandOf(93)).toBe('90+');
      expect(confidenceBandOf(90)).toBe('90+');
      expect(confidenceBandOf(84)).toBe('80-89');
      expect(confidenceBandOf(72)).toBe('71-79');
      expect(confidenceBandOf(70)).toBe('<=70');
      expect(confidenceBandOf(35)).toBe('<=70');
    });

    test('3 vakadan az veride ASLA bias iddia edilmez', () => {
      expect(biasVerdict(-12, 2)).toBe('INSUFFICIENT DATA');
      expect(biasVerdict(null, 10)).toBe('INSUFFICIENT DATA');
    });

    test('Bias yönü yalnız anlamlı sapmada verilir', () => {
      expect(biasVerdict(-8, 5)).toBe('SYSTEM TOO LOW');
      expect(biasVerdict(7, 5)).toBe('SYSTEM TOO HIGH');
      expect(biasVerdict(1.2, 5)).toBe('NO CLEAR BIAS');
    });

    test('median / mae yardımcıları boş veride null döner', () => {
      expect(median([])).toBeNull();
      expect(mae([])).toBeNull();
      expect(median([1, 3, 2])).toBe(2);
      expect(mae([-2, 4])).toBe(3);
    });
  });

  describe('Üretim motoruna müdahale etmeme garantisi', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'scripts', 'calibration_report.ts'),
      'utf8',
    );

    test('Kalibrasyon scripti veritabanına yazmaz', () => {
      expect(src).not.toMatch(/prisma\.\w+\.(create|update|upsert|delete|createMany|updateMany|deleteMany)/);
      expect(src).not.toMatch(/\$executeRaw/);
    });

    test('Kalibrasyon scripti fiyat konfigürasyonunu değiştirmez', () => {
      // pricing-config yalnizca okunabilir; bu script onu import bile etmez.
      expect(src).not.toMatch(/from '\.\.\/evaluation\/pricing-config'/);
      expect(src).not.toMatch(/PRICING_SEGMENTS\s*[\[.]?\s*=/);
      expect(src).not.toMatch(/writeFileSync\([^)]*pricing-config/);
    });

    test('Yalnızca rapor ve şablon dosyasına yazar', () => {
      const writes = src.match(/writeFileSync\((\w+)/g) || [];
      expect(writes.length).toBeGreaterThan(0);
      for (const w of writes) {
        expect(['writeFileSync(REPORT_PATH', 'writeFileSync(CSV_PATH']).toContain(w);
      }
    });

    test('Kalibrasyon eşiği 20 araçtır', () => {
      expect(MIN_CASES_FOR_CALIBRATION).toBe(20);
    });
  });
});
