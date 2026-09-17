/**
 * SEYREK YIL VE MOTOR KARARI — REGRESYON.
 *
 * Iki hata sabitlendi.
 *
 * 1) Demo "yilin kendi ilani >= 5" istiyordu. Uc gercek ilani olan bir yil
 *    (Audi A3 Sedan 1.5 TFSI Sport Line 2018) bos ekran ve "yeterli emsal yok"
 *    yazisi gosteriyordu. Bu esik MOTORDA YOKTUR.
 *
 * 2) Veri seti motorun SAYISINI saklayip KARARINI atiyordu. Guven skoru
 *    tarayicida ilan adedinden yeniden uretiliyor, motorun "bu araci otomatik
 *    fiyatlayamam" dedigi satirlar demoda kesin fiyat olarak gorunuyordu.
 *
 *   node --test src/lib/demo-pricing.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hasEnoughEvidence, quote, type QuoteInput } from './demo-pricing.ts';

/** Ayni arac; yalnizca kanit ve motorun karari degisiyor. */
const input = (over: Partial<QuoteInput> = {}): QuoteInput => ({
  kmPoints: [90_000, 150_000, 210_000],
  fmvPoints: [1_750_000, 1_600_000, 1_450_000],
  mileageKm: 150_000,
  directComparables: 3,
  borrowedComparables: 0,
  effectiveComparables: 3,
  engineConfidencePct: 80,
  dispersion: 0.1,
  engineManualCode: 0,
  ...over,
});

describe('Kanit varsa fiyat uretilir', () => {
  test('3 dogrudan ilan fiyat uretir (D)', () => {
    assert.equal(hasEnoughEvidence(3, 0), true);
    const q = quote(input());
    assert.ok(q.fairMarketValue > 0);
    assert.ok(q.cashOffer > 0);
    assert.equal(q.requiresManualApproval, false);
  });

  test('2 dogrudan + komsu yil kaniti fiyat uretir (E)', () => {
    assert.equal(hasEnoughEvidence(2, 3), true);
    const q = quote(
      input({ directComparables: 2, borrowedComparables: 3, effectiveComparables: 4.25 }),
    );
    assert.ok(q.fairMarketValue > 0);
    assert.equal(q.directComparables, 2);
    assert.equal(q.borrowedComparables, 3);
  });

  test('desteksiz TEK ilan fiyati gizlemez, manuel onaya gonderir (F)', () => {
    const q = quote(
      input({ directComparables: 1, borrowedComparables: 0, effectiveComparables: 1 }),
    );
    assert.ok(q.fairMarketValue > 0, 'tek gozlem de bir kanittir');
    assert.equal(q.requiresManualApproval, true);
    assert.match(String(q.manualApprovalReason), /tek ilan/i);
  });

  test('tek ilan KOMSU YIL destegi varsa otomatik manuel onaya gitmez', () => {
    const q = quote(
      input({ directComparables: 1, borrowedComparables: 4, effectiveComparables: 4 }),
    );
    assert.doesNotMatch(String(q.manualApprovalReason ?? ''), /tek ilan/i);
  });

  test('hicbir kanit yoksa fiyat URETILMEZ', () => {
    assert.equal(hasEnoughEvidence(0, 0), false);
  });
});

describe('Motorun karari demoyu baglar', () => {
  test('motor manuel dediyse demo da der', () => {
    const q = quote(input({ engineManualCode: 1 }));
    assert.equal(q.requiresManualApproval, true);
    assert.match(String(q.manualApprovalReason), /güvenli aralıkta/i);
  });

  test('gerekce kodu dogru metne cozulur', () => {
    assert.match(
      String(quote(input({ engineManualCode: 2 })).manualApprovalReason),
      /konsinye komisyonu/i,
    );
    assert.match(
      String(quote(input({ engineManualCode: 3 })).manualApprovalReason),
      /invariant/i,
    );
  });

  test('motor karar vermediyse demo kendi kontrollerini yapar', () => {
    const q = quote(input({ engineManualCode: 0 }));
    assert.equal(q.requiresManualApproval, false);
  });
});

describe('Guven motorun skorudur, uydurulmaz', () => {
  test('gosterilen guven, veri setindeki motor skorudur', () => {
    for (const pct of [62, 73, 84, 92]) {
      assert.equal(quote(input({ engineConfidencePct: pct })).confidencePct, pct);
    }
  });

  test('ayni kanit sayisinda bile motor skoru belirleyicidir', () => {
    const low = quote(input({ engineConfidencePct: 65 }));
    const high = quote(input({ engineConfidencePct: 90 }));
    assert.ok(high.confidencePct > low.confidencePct);
    // Dusuk guven daha yuksek risk rezervi demektir: nakit teklif duser.
    assert.ok(high.cashOffer > low.cashOffer, `${high.cashOffer} > ${low.cashOffer}`);
  });
});

describe('Yayilim risk rezervine girer', () => {
  test('emsaller dagildikca nakit teklif duser', () => {
    const tight = quote(input({ dispersion: 0.05 }));
    const wide = quote(input({ dispersion: 1.2 }));
    assert.equal(tight.fairMarketValue, wide.fairMarketValue, 'FMV degismez');
    assert.ok(tight.cashOffer > wide.cashOffer, `${tight.cashOffer} > ${wide.cashOffer}`);
  });
});

describe('Fiyat siralamasi her kanit duzeyinde korunur (J)', () => {
  const cases: Array<[number, number, number, number, number]> = [
    // dogrudan, odunc, etkin, motor guveni, yayilim
    [20, 0, 20, 92, 0.05],
    [5, 0, 5, 84, 0.2],
    [3, 2, 4.5, 78, 0.35],
    [2, 3, 4.25, 73, 0.7],
    [1, 4, 4, 66, 1.3],
    [1, 0, 1, 62, 0],
  ];

  for (const [d, b, e, conf, disp] of cases) {
    test(`dogrudan=${d} odunc=${b} guven=${conf} yayilim=${disp}`, () => {
      const q = quote(
        input({
          directComparables: d,
          borrowedComparables: b,
          effectiveComparables: e,
          engineConfidencePct: conf,
          dispersion: disp,
        }),
      );
      assert.ok(q.cashOffer > 0, 'nakit teklif pozitif');
      assert.ok(q.cashOffer < q.customerConsignmentNet, 'nakit < konsinye net');
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
