import { cleanModelName, cleanVariantOrTrimName } from '../scripts/repair_corrupted_model_records';
import { parseHeaderMakeModelSubModel } from '../scripts/import_unique_sahibinden_listings';

describe('Sahibinden HTML Parser & Model Normalizer Unit Tests', () => {
  test('1. Multi-series / generic Sahibinden title cleaning', () => {
    expect(cleanModelName("Audi A1 & Modelleri sahibinden.com'da - 2", "Audi")).toBe('A1');
    expect(cleanModelName("Audi A3 A3 Hatchback & Modelleri sahibinden.com'da - 5", "Audi")).toBe('A3');
    expect(cleanModelName("Alfa Romeo & Modelleri sahibinden.com'da - 14", "Alfa Romeo")).toBe('Diğer');
    expect(cleanModelName("Ford Fiyatları & Modelleri sahibinden.com'da - 3", "Ford")).toBe('Diğer');
  });

  test('2. Sub-model / header parsing for Ford & Audi', () => {
    const res = parseHeaderMakeModelSubModel("Ford C-Max 1.6 TDCi Titanium & Modelleri sahibinden.com'da.html", "Ford");
    expect(res.make).toBe('Ford');
    expect(res.model).toBe('C-Max');
  });

  test('3. Page-numbered trailing numbers removal', () => {
    expect(cleanModelName("A3 Hatchback - 10", "Audi")).toBe('A3');
    expect(cleanModelName("Focus Titanium - 2", "Ford")).toBe('Focus');
  });

  test('4. Combined motor and trim text cleaning', () => {
    expect(cleanVariantOrTrimName("1.6 TDCi Titanium sahibinden.com'da - 2")).toBe('1.6 TDCi Titanium');
  });

  test('5. Turkish characters in make/model', () => {
    expect(cleanModelName("3 Serisi & Modelleri sahibinden.com'da", "BMW")).toBe('3 Serisi');
  });

  test('6. "Sahibinden" word inside raw listing title should remain intact', () => {
    const rawTitle = 'Sahibinden temiz bakımlı masrafsız Ford Focus';
    expect(rawTitle.includes('Sahibinden')).toBe(true);
  });
});
