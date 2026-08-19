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

    test('Eksik gerçek veri hata üretmez, null döner', () => {
      const e = computeErrors(sys, {
        dealerMarketValue: null, dealerCashOffer: null,
        realisticListingPrice: null, actualSalePrice: null,
      });
      expect(Object.values(e).every((v) => v === null)).toBe(true);
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
