/**
 * SEYREK YIL FIYATLAMASI — REGRESYON.
 *
 * Sabitlenen hata: demo, "yilin kendi ilani >= 5" istiyordu. Uc gercek
 * ilani olan bir yil (Audi A3 Sedan 1.5 TFSI Sport Line 2018) bos ekran ve
 * "Bu yil icin yeterli emsal yok" yazisi gosteriyordu. Bu esik MOTORDA
 * YOKTUR: `minCompCountForPricing` orada emsal merdiveninin ne zaman
 * genisleyecegini soyler, fiyati reddetmez.
 *
 * Burada sinanan sey: kanit varsa fiyat uretilir, kanitin zayifligi
 * fiyati gizleyerek degil GUVEN ve MANUEL ONAY ile anlatilir.
 *
 *   node --test src/lib/demo-pricing.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hasEnoughEvidence, quote, type QuoteInput } from './demo-pricing.ts';

/** Ayni arac, yalnizca KANIT degisiyor. */
const input = (
  directComparables: number,
  borrowedComparables: number,
  effectiveComparables: number,
): QuoteInput => ({
  kmPoints: [90_000, 150_000, 210_000],
  fmvPoints: [1_750_000, 1_600_000, 1_450_000],
  mileageKm: 150_000,
  directComparables,
  borrowedComparables,
  effectiveComparables,
  poolListingCount: 5,
});

describe('Kanit varsa fiyat uretilir', () => {
  test('3 dogrudan ilan fiyat uretir (D)', () => {
    assert.equal(hasEnoughEvidence(3, 0), true);
    const q = quote(input(3, 0, 3));
    assert.ok(q.fairMarketValue > 0);
    assert.ok(q.cashOffer > 0);
  });

  test('2 dogrudan + komsu yil kaniti fiyat uretir (E)', () => {
    assert.equal(hasEnoughEvidence(2, 3), true);
    const q = quote(input(2, 3, 4.25));
    assert.ok(q.fairMarketValue > 0);
    assert.equal(q.directComparables, 2);
    assert.equal(q.borrowedComparables, 3);
  });

  test('desteksiz TEK ilan fiyati gizlemez, manuel onaya gonderir (F)', () => {
    const q = quote(input(1, 0, 1));
    assert.ok(q.fairMarketValue > 0, 'tek gozlem de bir kanittir');
    assert.equal(q.requiresManualApproval, true);
    assert.match(String(q.manualApprovalReason), /tek ilan/i);
  });

  test('tek ilan KOMSU YIL destegi varsa otomatik manuel onaya gitmez', () => {
    const q = quote(input(1, 4, 4));
    assert.equal(
      q.manualApprovalReason ?? '',
      q.requiresManualApproval ? (q.manualApprovalReason as string) : '',
    );
    assert.doesNotMatch(String(q.manualApprovalReason ?? ''), /tek ilan/i);
  });

  test('hicbir kanit yoksa fiyat URETILMEZ', () => {
    assert.equal(hasEnoughEvidence(0, 0), false);
  });
});

describe('Guven kanitla birlikte duser (I)', () => {
  const confidence = (d: number, b: number, e: number) =>
    quote(input(d, b, e)).confidencePct;

  test('yogun dogrudan kanit > seyrek dogrudan > odunc destekli', () => {
    const dense = confidence(20, 0, 20);
    const sparse = confidence(3, 0, 3);
    const borrowed = confidence(1, 3, 3.25);

    assert.ok(dense > sparse, `${dense} > ${sparse}`);
    assert.ok(sparse >= borrowed, `${sparse} >= ${borrowed}`);
  });

  test('odunc kanit dogrudan gozlemle ESIT sayilmaz', () => {
    // 4 dogrudan ilan, 4 adet komsu yil ilanindan (etkin 3) daha guvenlidir.
    assert.ok(confidence(4, 0, 4) > confidence(0 + 1, 3, 3));
  });
});

describe('Fiyat siralamasi her kanit duzeyinde korunur (J)', () => {
  const cases: Array<[number, number, number]> = [
    [20, 0, 20],
    [5, 0, 5],
    [3, 2, 4.5],
    [2, 3, 4.25],
    [1, 4, 4],
    [1, 0, 1],
  ];

  for (const [d, b, e] of cases) {
    test(`dogrudan=${d} odunc=${b}`, () => {
      const q = quote(input(d, b, e));
      assert.ok(q.cashOffer > 0, 'nakit teklif pozitif');
      assert.ok(
        q.cashOffer < q.customerConsignmentNet,
        'nakit < konsinye net',
      );
      assert.ok(
        q.customerConsignmentNet <= q.expectedSalePrice,
        'konsinye net <= beklenen satis',
      );
      assert.ok(
        q.consignmentListingPrice >= q.expectedSalePrice,
        'ilan fiyati >= beklenen satis',
      );
    });
  }
});
