/**
 * DEVAM ET KAPISI — REGRESYON.
 *
 * Sabitlenen hata: sihirbaz "Araç seçiminiz tamamlandı" + "578 ilan gözlendi"
 * gosterip model yili secilmisken "Devam Et" KAPALI kaliyordu, cunku buton
 * fazladan `isLeaf === true` istiyordu. `isLeaf` yalnizca dugumun KENDI
 * sayfasi kaydedilmisse true olur; kullanicinin secimi bittigi anlamina
 * gelmez.
 *
 *   node --test src/lib/vehicle-selection.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { canContinueFromVehicleStep, isTerminalAndPriceable } from './vehicle-selection.ts';

/** Ekrandaki gercek dugum: Audi / A3 / A3 Sedan / 35 TFSI (API'den okundu). */
const A3_SEDAN_35_TFSI = {
  hasChildren: false,
  marketListingCount: 578,
  // Kapinin BAKMAMASI gereken alanlar — kasitli olarak "olumsuz" degerler:
  isLeaf: false,
  terminalConfirmed: false,
  derived: true,
};

describe('Audi > A3 > A3 Sedan > 35 TFSI (asil regresyon)', () => {
  test('secim tamamlanmis sayilir', () => {
    assert.equal(isTerminalAndPriceable(A3_SEDAN_35_TFSI), true);
  });

  test('yil secilince Devam Et ACILIR', () => {
    assert.equal(canContinueFromVehicleStep(A3_SEDAN_35_TFSI, 2025), true);
  });

  test('yil secilmeden Devam Et KAPALI kalir', () => {
    assert.equal(canContinueFromVehicleStep(A3_SEDAN_35_TFSI, ''), false);
  });

  /**
   * Kapi `isLeaf`e BAKMAMALI. Bu alan false oldugu halde yukaridaki testler
   * gecmek zorunda; hata tam olarak bu alana bakmaktan dogmustu.
   */
  test('isLeaf=false / terminalConfirmed=false kapiyi KAPATMAZ', () => {
    assert.equal(A3_SEDAN_35_TFSI.isLeaf, false);
    assert.equal(A3_SEDAN_35_TFSI.terminalConfirmed, false);
    assert.equal(canContinueFromVehicleStep(A3_SEDAN_35_TFSI, 2025), true);
  });
});

describe('DEGISKEN DERINLIK — kapi secim SAYISINA bagli degildir', () => {
  /**
   * Her dal ayni seviyede bitmez. Kapi yalnizca "cocugu yok + kaniti var"
   * kuralina bakar; 2. seviyede biten de 5. seviyede biten de gecer.
   */
  const terminalAtDepth = (depth: number) => ({
    depth,
    hasChildren: false,
    marketListingCount: 10 * depth,
    isLeaf: false,
  });

  for (const depth of [2, 3, 4, 5]) {
    test(`${depth} seviyede biten dal Devam Et'i acar`, () => {
      assert.equal(canContinueFromVehicleStep(terminalAtDepth(depth), 2025), true);
    });
  }

  test('paket/donanim adimi ZORUNLU degildir', () => {
    // Motorda biten bir dal (5. bir secim yok) tamamlanmis sayilir.
    assert.equal(canContinueFromVehicleStep(terminalAtDepth(4), 2020), true);
  });
});

describe('FAIL-CLOSED — tamamlanmamis secim gecmez', () => {
  test('cocugu olan dugum tamamlanmis sayilmaz', () => {
    // "Audi > A3"te durmak: A3'un alt kaselari var, devam etmek ortalamayi gosterirdi.
    const a3 = { hasChildren: true, marketListingCount: 3911, isLeaf: false };
    assert.equal(isTerminalAndPriceable(a3), false);
    assert.equal(canContinueFromVehicleStep(a3, 2025), false);
  });

  test('ilan kaniti olmayan terminal fiyatlanamaz', () => {
    const noEvidence = { hasChildren: false, marketListingCount: 0, isLeaf: true };
    assert.equal(isTerminalAndPriceable(noEvidence), false);
    assert.equal(canContinueFromVehicleStep(noEvidence, 2025), false);
  });

  test('secim yokken (LOADING/ERROR) kapi kapali', () => {
    assert.equal(canContinueFromVehicleStep(null, 2025), false);
    assert.equal(canContinueFromVehicleStep(undefined, 2025), false);
  });
});
