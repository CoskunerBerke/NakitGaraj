/**
 * condition-part-alias.spec.ts
 *
 * AYNI FIZIKSEL PARCA, IKI ARAYUZ ADI.
 *
 * Degerleme formu bagaj kapagini "Bagaj Kapağı", konsinye formu "Bagaj" adiyla
 * gonderir; ikisi de AYNI paneldir. Normalizasyon olmadan ayni fiziksel kusur
 * iki ayri anahtar sayiliyor ve:
 *   - tek kusura IKI KEZ ceza veriliyordu (olculen: %3,4 yerine %4,6),
 *   - degisen panel SAYIMI sisip 3+ degisen manuel kapisini bir panel erken
 *     tetikleyebiliyordu.
 *
 * Bugun her form adlardan yalnizca BIRINI kullandigi icin durum ulasilamazdir;
 * bu katman savunma amaclidir. CEZA ORANLARINDA DEGISIKLIK YOKTUR.
 */
import { assessCondition, canonicalPartName, PART_ALIASES, PART_CLASS, UI_PART_NAMES } from './condition-assessment';

const V = 1_000_000;
const A = (paint: Record<string, string>) => assessCondition({
  damageStatus: 'YES', paintScheme: JSON.stringify(paint), chassisState: null,
  vehicleStatus: null, tramerAmount: '0 TL',
  vehicleYear: 2021, currentYear: 2026, cleanMarketValue: V,
});
const pct = (r: any) => Number((r.penalty * 100).toFixed(4));

describe('Fiziksel parca es adlari', () => {
  test('Es ad haritasi YALNIZ kanitlanmis cifti icerir', () => {
    expect(PART_ALIASES).toEqual({ 'Bagaj': 'Bagaj Kapağı' });
  });

  test('canonicalPartName es adi indirger, digerlerini AYNEN birakir', () => {
    expect(canonicalPartName('Bagaj')).toBe('Bagaj Kapağı');
    expect(canonicalPartName('Bagaj Kapağı')).toBe('Bagaj Kapağı');
    for (const p of ['Motor Kaputu', 'Tavan', 'Sol Ön Kapı', 'Sağ Arka Çamurluk', 'Ön Tampon']) {
      expect(canonicalPartName(p)).toBe(p);
    }
  });

  test('Iki ad ayni cezayi verir', () => {
    expect(pct(A({ 'Bagaj': 'DEGISEN' }))).toBe(pct(A({ 'Bagaj Kapağı': 'DEGISEN' })));
  });

  test('Ayni parca iki adla gelirse CIFT ceza YOK (en agir durum baskin)', () => {
    const single = A({ 'Bagaj Kapağı': 'DEGISEN' });
    const both = A({ 'Bagaj': 'BOYALI', 'Bagaj Kapağı': 'DEGISEN' });
    expect(pct(both)).toBe(pct(single));
    expect(both.breakdown.ignoredDuplicates.length).toBe(1);
  });

  test('Panel SAYIMI sismez', () => {
    const both = A({ 'Bagaj': 'BOYALI', 'Bagaj Kapağı': 'DEGISEN' });
    expect(both.breakdown.changedPanelCount).toBe(1);
    expect(both.breakdown.paintedPanelCount).toBe(0);
  });

  test('3+ degisen manuel kapisi es adla ERKEN tetiklenmez', () => {
    // Fiziksel olarak 2 panel (kapi + bagaj) -> AUTO kalabilmeli
    const two = A({ 'Sol Ön Kapı': 'DEGISEN', 'Bagaj': 'DEGISEN', 'Bagaj Kapağı': 'DEGISEN' });
    expect(two.breakdown.changedPanelCount).toBe(2);
    expect(two.requiresManualReview).toBe(false);
    // Fiziksel olarak 3 panel -> MANUAL
    const three = A({ 'Sol Ön Kapı': 'DEGISEN', 'Sağ Ön Kapı': 'DEGISEN', 'Bagaj': 'DEGISEN' });
    expect(three.breakdown.changedPanelCount).toBe(3);
    expect(three.requiresManualReview).toBe(true);
  });

  test('Es adin KANONIK karsiligi siniflandirilmis ve ayni sinifta', () => {
    for (const [alias, canonical] of Object.entries(PART_ALIASES)) {
      expect(PART_CLASS[alias]).toBeDefined();
      expect(PART_CLASS[canonical]).toBeDefined();
      expect(PART_CLASS[alias]).toBe(PART_CLASS[canonical]);
    }
  });

  test('Tum UI parca adlari hala siniflandirilmis', () => {
    expect(UI_PART_NAMES.filter((n) => !(n in PART_CLASS))).toEqual([]);
  });
});
