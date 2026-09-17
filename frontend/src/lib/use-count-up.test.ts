/**
 * FIYAT SAYACI — GECIS MATEMATIGI.
 *
 * Sayac, secim degisince fiyatin yerinden ziplamasini onler. Zamanlama
 * (requestAnimationFrame) disarida biraktigi icin egrinin kendisi arayuz
 * olmadan sinanabilir: baslangic ve bitis DEGERLERI tam tutmali, ara
 * degerler araligin ICINDE kalmali.
 *
 *   node --test src/lib/use-count-up.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { countUpValue } from './use-count-up.ts';

describe('Sayac egrisi', () => {
  test('basta eski deger, sonda YENI degerin TAM kendisi', () => {
    assert.equal(countUpValue(1_000_000, 2_000_000, 0), 1_000_000);
    assert.equal(countUpValue(1_000_000, 2_000_000, 1), 2_000_000);
  });

  test('bitiste yuvarlama artigi birakmaz', () => {
    // Kullaniciya gosterilen son sayi, motorun urettigi sayinin TA KENDISI
    // olmali; 3.034.999 gibi bir artik kabul edilemez.
    assert.equal(countUpValue(1_675_000, 3_035_000, 1), 3_035_000);
    assert.equal(countUpValue(3_035_000, 1_590_000, 1.4), 1_590_000);
  });

  test('ara degerler iki ucun ARASINDA kalir', () => {
    for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const v = countUpValue(1_000_000, 2_000_000, p);
      assert.ok(v > 1_000_000 && v < 2_000_000, `${p} -> ${v}`);
    }
  });

  test('azalan gecis de ayni sekilde calisir', () => {
    const v = countUpValue(3_035_000, 1_590_000, 0.5);
    assert.ok(v < 3_035_000 && v > 1_590_000, String(v));
  });

  test('sonda yavaslar: yarida yolun yarisindan FAZLASI alinmis olur', () => {
    const half = countUpValue(0, 1000, 0.5);
    assert.ok(half > 500, `${half} > 500`);
  });

  test('ilerleme monotondur', () => {
    let previous = -Infinity;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const v = countUpValue(0, 1000, p);
      assert.ok(v >= previous, `${p}: ${v} >= ${previous}`);
      previous = v;
    }
  });

  test('aralik disi ilerleme kirpilir', () => {
    assert.equal(countUpValue(100, 900, -3), 100);
    assert.equal(countUpValue(100, 900, 7), 900);
  });

  test('deger degismiyorsa sayi sabit kalir', () => {
    for (const p of [0, 0.3, 0.7, 1]) {
      assert.equal(countUpValue(2_500_000, 2_500_000, p), 2_500_000);
    }
  });
});
