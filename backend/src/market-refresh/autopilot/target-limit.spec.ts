/**
 * `--target-limit` DOGRULAMASI.
 *
 * Gecersiz bir degeri sessizce "sinir yok" saymak tehlikelidir: kucuk bir
 * kanarya beklenirken TUM hedef evreni baslatilabilir. Bu yuzden bozuk deger
 * acikca reddedilir.
 */
import { parseTargetLimit } from './autopilot-cli';

describe('--target-limit', () => {
  test('verilmediginde sinir yok', () => {
    expect(parseTargetLimit(null)).toBeNull();
    expect(parseTargetLimit('')).toBeNull();
    expect(parseTargetLimit('   ')).toBeNull();
  });

  test('gecerli pozitif tamsayiyi kabul eder', () => {
    expect(parseTargetLimit('1')).toBe(1);
    expect(parseTargetLimit('25')).toBe(25);
    expect(parseTargetLimit(' 25 ')).toBe(25);
  });

  test('SIFIR, NEGATIF, ondalik ve metin REDDEDILIR', () => {
    for (const bad of ['0', '-1', '2.5', 'abc', 'NaN', '1e3', '25x', '+25']) {
      expect(() => parseTargetLimit(bad)).toThrow();
    }
  });
});
