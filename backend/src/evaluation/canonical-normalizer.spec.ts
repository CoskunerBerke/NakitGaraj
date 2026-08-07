import { CanonicalNormalizer } from './canonical-normalizer';

describe('CanonicalNormalizer Unit Tests', () => {
  test('1. Clean junk words and trailing page hyphens', () => {
    const raw = "DS Automobiles & Modelleri sahibinden.com'da - 4";
    const cleaned = CanonicalNormalizer.cleanString(raw);
    expect(cleaned).toBe("DS Automobiles");
  });

  test('2. DS Automobiles model determination rules', () => {
    // Valid model DS 4
    const valid = CanonicalNormalizer.normalize('DS Automobiles', 'DS 4 Fiyatları & Modelleri sahibinden.com\'da - 2');
    expect(valid.isValid).toBe(true);
    expect(valid.canonicalMake).toBe('DS Automobiles');
    expect(valid.canonicalModel).toBe('DS 4');

    // Invalid model (just landing page, no specific model name)
    const invalid = CanonicalNormalizer.normalize('DS Automobiles', 'DS Automobiles & Modelleri sahibinden.com\'da - 4');
    expect(invalid.isValid).toBe(false);
    expect(invalid.quarantineReason).toBe('GEÇERSİZ_MODEL_TESPİTİ');
  });

  test('3. BYD model determination rules', () => {
    const valid = CanonicalNormalizer.normalize('BYD', 'BYD Atto 3 Fiyatları sahibinden.com\'da - 1');
    expect(valid.isValid).toBe(true);
    expect(valid.canonicalMake).toBe('BYD');
    expect(valid.canonicalModel).toBe('Atto 3');

    const invalid = CanonicalNormalizer.normalize('BYD', 'BYD Modelleri sahibinden.com\'da');
    expect(invalid.isValid).toBe(false);
    expect(invalid.quarantineReason).toBe('GEÇERSİZ_MODEL_TESPİTİ');
  });

  test('4. Cupra model determination rules', () => {
    const valid = CanonicalNormalizer.normalize('Cupra', 'Cupra Formentor 1.5 TSI VZ - 3');
    expect(valid.isValid).toBe(true);
    expect(valid.canonicalMake).toBe('Cupra');
    expect(valid.canonicalModel).toBe('Formentor');

    const invalid = CanonicalNormalizer.normalize('Cupra', 'Cupra Fiyatları & Modelleri');
    expect(invalid.isValid).toBe(false);
    expect(invalid.quarantineReason).toBe('GEÇERSİZ_MODEL_TESPİTİ');
  });

  test('5. Daihatsu model determination rules', () => {
    const valid = CanonicalNormalizer.normalize('Daihatsu', 'Daihatsu Sirion 1.3 - 2');
    expect(valid.isValid).toBe(true);
    expect(valid.canonicalMake).toBe('Daihatsu');
    expect(valid.canonicalModel).toBe('Sirion');

    const invalid = CanonicalNormalizer.normalize('Daihatsu', 'Daihatsu Genel Model');
    expect(invalid.isValid).toBe(false);
    expect(invalid.quarantineReason).toBe('GEÇERSİZ_MODEL_TESPİTİ');
  });
});
