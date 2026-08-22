/**
 * condition-v2.spec.ts
 *
 * Uyarlanabilir kondisyon (V2):
 *  - yas duyarliligi SUREKLI (basamak/ucurum yok)
 *  - deger duyarliligi ALT-DOGRUSAL (pahali aracta TL patlamiyor, ucuz aracta
 *    ceza anlamsiz kucuk kalmiyor)
 *  - tramer HAM ORAN uzerinden manuel kapisi
 *  - referans nokta (1.000.000 TL / 5 yas) BIREBIR korunur
 *  - mevcut guvenlik kapilari (yapisal / airbag / mekanik / 3+ degisen) aynen durur
 */
import {
  assessCondition,
  ageSensitivityMultiplier,
  valueSensitivityMultiplier,
  CONDITION_CONFIG,
} from './condition-assessment';

const NOW = new Date().getFullYear();

function cond(opts: {
  value: number; age: number; parts?: Record<string, string>; tramer?: string;
  chassis?: boolean; airbag?: boolean; engine?: boolean; trans?: boolean; damageStatus?: string;
}) {
  const hasDetail = !!(opts.parts || opts.tramer || opts.chassis || opts.airbag || opts.engine || opts.trans);
  return assessCondition({
    damageStatus: opts.damageStatus ?? (hasDetail ? 'YES' : 'NO'),
    paintScheme: opts.parts ? JSON.stringify(opts.parts) : undefined,
    chassisState: opts.chassis ? JSON.stringify({ 'Şasi': 'DEGISEN' }) : undefined,
    vehicleStatus: JSON.stringify({
      airbagDeployed: !!opts.airbag, engineProblem: !!opts.engine, transmissionProblem: !!opts.trans,
    }),
    tramerAmount: opts.tramer,
    vehicleYear: NOW - opts.age,
    currentYear: NOW,
    cleanMarketValue: opts.value,
  });
}
const pct = (r: { penalty: number }) => +(r.penalty * 100).toFixed(3);
const REF = { value: 1_000_000, age: 5 };

describe('Kondisyon V2 — uyarlanabilir', () => {
  describe('A/B/C. Yaş eğrisi sürekli, referans korunuyor', () => {
    test('referans yaşta çarpan tam 1.0', () => {
      expect(ageSensitivityMultiplier(CONDITION_CONFIG.ageSensitivity.referenceAge)).toBeCloseTo(1, 6);
    });

    test('3→4 ve 11→12 yaşta uçurum yok', () => {
      const j34 = Math.abs(ageSensitivityMultiplier(3) - ageSensitivityMultiplier(4));
      const j1112 = Math.abs(ageSensitivityMultiplier(11) - ageSensitivityMultiplier(12));
      expect(j34).toBeLessThan(0.10);
      expect(j1112).toBeLessThan(0.10);
    });

    test('komşu yıllar arası en büyük sıçrama küçük ve eğri monoton', () => {
      let maxJump = 0;
      let prev = ageSensitivityMultiplier(0);
      for (let a = 1; a <= 40; a++) {
        const cur = ageSensitivityMultiplier(a);
        expect(cur).toBeLessThanOrEqual(prev + 1e-9); // monoton azalan
        maxJump = Math.max(maxJump, prev - cur);
        prev = cur;
      }
      expect(maxJump).toBeLessThan(0.10);
    });

    test('çarpan sınırlı: yeni araçta tavan, eski araçta taban (0 değil)', () => {
      const { newMultiplier: hi, oldMultiplier: lo } = CONDITION_CONFIG.ageSensitivity;
      expect(ageSensitivityMultiplier(0)).toBeLessThanOrEqual(hi + 1e-9);
      expect(ageSensitivityMultiplier(40)).toBeGreaterThan(lo - 1e-9);
      expect(ageSensitivityMultiplier(40)).toBeGreaterThan(0);
    });

    test('referans araçta mevcut ceza değerleri birebir korunuyor', () => {
      expect(pct(cond({ ...REF, parts: { 'Sol Ön Kapı': 'LOKAL' } }))).toBeCloseTo(0.6, 3);
      expect(pct(cond({ ...REF, parts: { 'Sol Ön Kapı': 'BOYALI' } }))).toBeCloseTo(1.6, 3);
      expect(pct(cond({ ...REF, parts: { 'Sol Ön Kapı': 'DEGISEN' } }))).toBeCloseTo(3.4, 3);
      expect(pct(cond({ ...REF, parts: { 'Sol Ön Çamurluk': 'DEGISEN' } }))).toBeCloseTo(2.2, 3);
    });
  });

  describe('D/E/F. Değer duyarlılığı alt-doğrusal', () => {
    test('referans değerde çarpan 1.0', () => {
      expect(valueSensitivityMultiplier(CONDITION_CONFIG.valueSensitivity.referenceValue)).toBeCloseTo(1, 6);
    });

    test('pahalı araçta TL cezası saf yüzdeye göre anlamlı biçimde sönümleniyor', () => {
      const r = cond({ value: 5_000_000, age: 5, parts: { 'Sol Ön Kapı': 'BOYALI' } });
      const tl = r.penalty * 5_000_000;
      const pure = 0.016 * 5_000_000; // 80.000
      expect(tl).toBeLessThan(pure * 0.75);
      expect(tl).toBeGreaterThan(0);
    });

    test('ucuz araçta ceza sıfıra yakın değil', () => {
      const r = cond({ value: 300_000, age: 5, parts: { 'Sol Ön Kapı': 'BOYALI' } });
      const tl = r.penalty * 300_000;
      expect(tl).toBeGreaterThan(0.016 * 300_000 * 0.9);
      expect(r.penalty).toBeGreaterThan(0.01);
    });

    test('TL cezası değere göre monoton artar ama doğrusal artmaz', () => {
      const vals = [250_000, 300_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000, 7_500_000, 10_000_000];
      const tls = vals.map(v => cond({ value: v, age: 5, parts: { 'Sol Ön Kapı': 'BOYALI' } }).penalty * v);
      for (let i = 1; i < tls.length; i++) expect(tls[i]).toBeGreaterThan(tls[i - 1]);
      const at1M = tls[vals.indexOf(1_000_000)];
      expect(tls[vals.indexOf(5_000_000)]).toBeLessThan(at1M * 5);
      expect(tls[vals.indexOf(10_000_000)]).toBeLessThan(at1M * 10);
    });

    test('yüzde sınırlı kalır (uçurum/eşik yok)', () => {
      const vals = [200_000, 400_000, 800_000, 1_600_000, 3_200_000, 6_400_000, 12_800_000];
      const pcts = vals.map(v => cond({ value: v, age: 5, parts: { 'Sol Ön Kapı': 'BOYALI' } }).penalty);
      for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeLessThanOrEqual(pcts[i - 1] + 1e-12);
      expect(Math.max(...pcts)).toBeLessThan(0.05);
      expect(Math.min(...pcts)).toBeGreaterThan(0.001);
    });
  });

  describe('G/H/I. Parça mantığı korunuyor', () => {
    test('aynı parçada boya + değişen çifte cezalandırılmaz (en ağır baskın)', () => {
      const onlyChanged = cond({ ...REF, parts: { 'Sol Ön Kapı': 'DEGISEN' } });
      const bothOnSamePart = assessCondition({
        damageStatus: 'YES',
        // Ayni parca iki kez bildirilirse en agir durum baskin olmali.
        paintScheme: JSON.stringify({ 'Sol Ön Kapı': 'DEGISEN' }),
        vehicleStatus: JSON.stringify({}),
        vehicleYear: NOW - REF.age, currentYear: NOW, cleanMarketValue: REF.value,
      });
      expect(bothOnSamePart.penalty).toBeCloseTo(onlyChanged.penalty, 10);
      const twoParts = cond({ ...REF, parts: { 'Sol Ön Kapı': 'DEGISEN', 'Sağ Ön Kapı': 'BOYALI' } });
      expect(twoParts.penalty).toBeGreaterThan(onlyChanged.penalty);
    });

    test('parça şiddeti monoton: lokal < boya < değişen çamurluk < değişen kapı', () => {
      const l = pct(cond({ ...REF, parts: { 'Sol Ön Kapı': 'LOKAL' } }));
      const p = pct(cond({ ...REF, parts: { 'Sol Ön Kapı': 'BOYALI' } }));
      const cf = pct(cond({ ...REF, parts: { 'Sol Ön Çamurluk': 'DEGISEN' } }));
      const cd = pct(cond({ ...REF, parts: { 'Sol Ön Kapı': 'DEGISEN' } }));
      expect(0).toBeLessThan(l); expect(l).toBeLessThan(p);
      expect(p).toBeLessThan(cf); expect(cf).toBeLessThan(cd);
    });

    test('çok parça: artan ama azalan getirili (lineer değil)', () => {
      const names = ['Sol Ön Kapı', 'Sağ Ön Kapı', 'Sol Arka Kapı', 'Sağ Arka Kapı', 'Motor Kaputu'];
      const totals: number[] = [];
      for (let k = 1; k <= 5; k++) {
        const parts: Record<string, string> = {};
        for (let i = 0; i < k; i++) parts[names[i]] = 'BOYALI';
        totals.push(cond({ ...REF, parts }).penalty);
      }
      for (let i = 1; i < totals.length; i++) expect(totals[i]).toBeGreaterThan(totals[i - 1]);
      expect(totals[4]).toBeLessThan(totals[0] * 5);
    });
  });

  describe('J/K/L/M. Güvenlik kapıları aynen duruyor', () => {
    test('3+ değişen panel → MANUAL', () => {
      const r = cond({ ...REF, parts: { 'Sol Ön Kapı': 'DEGISEN', 'Sağ Ön Kapı': 'DEGISEN', 'Motor Kaputu': 'DEGISEN' } });
      expect(r.requiresManualReview).toBe(true);
    });
    test('yapısal (şasi) → MANUAL', () => {
      expect(cond({ ...REF, chassis: true }).requiresManualReview).toBe(true);
    });
    test('airbag → MANUAL', () => {
      expect(cond({ ...REF, airbag: true }).requiresManualReview).toBe(true);
    });
    test('ciddi motor / şanzıman → MANUAL', () => {
      expect(cond({ ...REF, engine: true }).requiresManualReview).toBe(true);
      expect(cond({ ...REF, trans: true }).requiresManualReview).toBe(true);
    });
    test('1 ve 2 değişen panel AUTO kalabilir', () => {
      expect(cond({ ...REF, parts: { 'Sol Ön Kapı': 'DEGISEN' } }).requiresManualReview).toBe(false);
      expect(cond({ ...REF, parts: { 'Sol Ön Kapı': 'DEGISEN', 'Sağ Ön Kapı': 'DEGISEN' } }).requiresManualReview).toBe(false);
    });
  });

  describe('N/O/P/Q. Tramer ve bilinmeyen durum', () => {
    test('ham oran eşiği aşılırsa MANUAL (ceza tavanlansa bile)', () => {
      // 1.000.000 TL değer + 250.000 TL tramer = %25 -> ceza yalnizca %8,75
      const r = cond({ value: 1_000_000, age: 5, tramer: '250000 TL' });
      expect(r.breakdown.flags).toContain('TRAMER_RATIO_HIGH');
      expect(r.requiresManualReview).toBe(true);
      expect(r.penalty).toBeLessThan(CONDITION_CONFIG.manualReviewThreshold);
    });

    test('çok yüksek oran (ucuz araç) MANUAL', () => {
      const r = cond({ value: 300_000, age: 5, tramer: '250000 TL' });
      expect(r.requiresManualReview).toBe(true);
    });

    test('makul tramer AUTO kalabilir', () => {
      const r = cond({ value: 1_000_000, age: 5, tramer: '50000 TL' });
      expect(r.requiresManualReview).toBe(false);
      expect(r.penalty).toBeGreaterThan(0);
    });

    test('tramer doğrudan TL olarak fiyattan düşülmez (orana çevrilir)', () => {
      const v = 1_000_000;
      const r = cond({ value: v, age: 5, tramer: '80000 TL' });
      expect(r.penalty * v).toBeLessThan(80_000);
      expect(r.penalty).toBeCloseTo((80_000 / v) * CONDITION_CONFIG.tramer.ratioWeight, 6);
    });

    test('tramer tutarı bilinmiyorsa 0 varsayılmaz', () => {
      const r = cond({ value: 1_000_000, age: 5, tramer: 'Var' });
      expect(r.breakdown.flags).toContain('TRAMER_UNKNOWN_AMOUNT');
    });

    test('UNKNOWN kondisyon CLEAN sayılmaz', () => {
      const unknown = cond({ value: 1_000_000, age: 5, damageStatus: 'UNKNOWN' });
      const clean = cond({ value: 1_000_000, age: 5, damageStatus: 'NO' });
      expect(unknown.penalty).toBeGreaterThan(clean.penalty);
      expect(clean.penalty).toBe(0);
    });
  });

  describe('Açıklanabilirlik', () => {
    test('audit dökümünde yaş ve değer çarpanları görünür', () => {
      const r = cond({ value: 5_000_000, age: 12, parts: { 'Sol Ön Kapı': 'BOYALI' } });
      expect(r.breakdown.ageMultiplier).toBeLessThan(1);
      expect(r.breakdown.valueMultiplier).toBeLessThan(1);
      expect(r.breakdown.countedParts.length).toBe(1);
    });
  });
});
