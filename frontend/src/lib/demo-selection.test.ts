/**
 * DEMO ARAC SECIMI — REGRESYON.
 *
 * Sabitlenen hata: demo veri seti kategori yolunu ilk DORT segmente kirpiyordu.
 * Bes seviyeli markalarda (Audi) bu, kasayi "Motor", motoru "Paket" diye
 * gosteriyor ve paket seviyesini tamamen dusuruyordu. Ustelik ayni dort etiketi
 * paylasan farkli paketler tek gorunur yola indirgendigi icin sayfa ETIKETE
 * gore ILK eslesen havuzu aliyor, kullaniciya yalnizca o havuzun yillari
 * gorunuyordu (Audi A3 Sedan 1.5 TFSI -> sadece 2026; Sport Line'in 2018'i hic
 * acilmiyordu).
 *
 *   node --test src/lib/demo-selection.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyChoice,
  branchKeyIndex,
  buildChain,
  headingFor,
  optionsAt,
  poolEntries,
  resolvePool,
  yearEvidenceOf,
  yearsOf,
  type DemoData,
  type YearRow,
} from './demo-selection.ts';

/**
 * [km1, km2, km3, fmv1, fmv2, fmv3, dogrudan, odunc, etkin,
 *  yayilim, motor guveni, manuel gerekce kodu]
 */
const row = (
  direct: number,
  borrowed = 0,
  effective = direct + borrowed * 0.75,
): YearRow => [
  50_000,
  80_000,
  120_000,
  900_000,
  850_000,
  800_000,
  direct,
  borrowed,
  effective,
  0.1,
  80,
  0,
];

/**
 * Gercek veri setinin kucuk bir kopyasi. Tarama surdugu icin canli veri
 * buyuyup degisir; davranis burada SABIT bir ornek uzerinde sinanir.
 */
const FIXTURE: DemoData = {
  generatedAt: '2026-09-17T00:00:00.000Z',
  hierarchyVersion: 'test',
  poolCount: 5,
  listingCount: 40,
  yearRowCount: 6,
  levels: {
    'audi/a3': ['body', 'engine', 'package'],
    'alfa-romeo/146': ['engine', 'package'],
  },
  pools: {
    'audi/a3/a3-sedan/1-5-tfsi/advanced': {
      path: ['Audi', 'A3', 'A3 Sedan', '1.5 TFSI', 'Advanced'],
      n: 10,
      km: 0.015,
      years: { '2026': row(10) },
    },
    'audi/a3/a3-sedan/1-5-tfsi/sport-line': {
      path: ['Audi', 'A3', 'A3 Sedan', '1.5 TFSI', 'Sport Line'],
      n: 5,
      km: 0.015,
      years: { '2017': row(2, 3), '2018': row(3, 2) },
    },
    'audi/a3/a3-sedan/1-6-tdi/sport-line': {
      path: ['Audi', 'A3', 'A3 Sedan', '1.6 TDI', 'Sport Line'],
      n: 12,
      km: 0.015,
      years: { '2015': row(12) },
    },
    'audi/a3/a3-sportback/1-6-tdi/sport-line': {
      path: ['Audi', 'A3', 'A3 Sportback', '1.6 TDI', 'Sport Line'],
      n: 9,
      km: 0.015,
      years: { '2016': row(9) },
    },
    'audi/a3/a3-cabrio/1-8-tfsi': {
      path: ['Audi', 'A3', 'A3 Cabrio', '1.8 TFSI'],
      n: 8,
      km: 0.015,
      years: { '2009': row(8) },
    },
    'audi/a3/a3-sedan/1-5-tfsi/design-line': {
      path: ['Audi', 'A3', 'A3 Sedan', '1.5 TFSI', 'Design Line'],
      n: 1,
      km: 0.015,
      years: { '2018': row(1) },
    },
    'alfa-romeo/146/1-4/ts': {
      path: ['Alfa Romeo', '146', '1.4', 'TS'],
      n: 5,
      km: 0.015,
      years: { '1998': row(5) },
    },
  },
};

const ENTRIES = poolEntries(FIXTURE);
const BRANCHES = branchKeyIndex(ENTRIES);
const AUDI_SEDAN_15 = ['Audi', 'A3', 'A3 Sedan', '1.5 TFSI'];

describe('Audi > A3 > A3 Sedan > 1.5 TFSI (asil regresyon)', () => {
  test('Kasa seviyesi kasa etiketlerini tasir', () => {
    assert.deepEqual(optionsAt(ENTRIES, 2, ['Audi', 'A3']), [
      'A3 Cabrio',
      'A3 Sedan',
      'A3 Sportback',
    ]);
  });

  test('Motor seviyesinde KASA etiketi gorunmez', () => {
    const engines = optionsAt(ENTRIES, 3, ['Audi', 'A3', 'A3 Sedan']);
    assert.deepEqual(engines, ['1.5 TFSI', '1.6 TDI']);
    assert.equal(engines.includes('A3 Sedan'), false);
  });

  test('Paket seviyesi geri geldi ve MOTOR etiketi tasimaz', () => {
    const packages = optionsAt(ENTRIES, 4, AUDI_SEDAN_15);
    assert.deepEqual(packages, ['Advanced', 'Design Line', 'Sport Line']);
    assert.equal(packages.includes('1.5 TFSI'), false);
  });

  test('her paket KENDI fiyat havuzudur', () => {
    const advanced = resolvePool(ENTRIES, [...AUDI_SEDAN_15, 'Advanced']);
    const sportLine = resolvePool(ENTRIES, [...AUDI_SEDAN_15, 'Sport Line']);

    assert.equal(advanced?.key, 'audi/a3/a3-sedan/1-5-tfsi/advanced');
    assert.equal(sportLine?.key, 'audi/a3/a3-sedan/1-5-tfsi/sport-line');
    assert.notEqual(advanced?.pool.n, sportLine?.pool.n);
  });

  test('yillar secilen pakete aittir — tek bir yila kilitlenmez', () => {
    assert.deepEqual(yearsOf(resolvePool(ENTRIES, [...AUDI_SEDAN_15, 'Advanced'])), [2026]);
    assert.deepEqual(yearsOf(resolvePool(ENTRIES, [...AUDI_SEDAN_15, 'Sport Line'])), [
      2018, 2017,
    ]);
  });

  test('paket secilmeden havuz cozulmez (yanlis havuza dusulmez)', () => {
    assert.equal(resolvePool(ENTRIES, AUDI_SEDAN_15), null);
  });
});

describe('Zincir derinligi veriden gelir', () => {
  test('paket seviyesi olmayan dal motorda biter', () => {
    const selection = ['Audi', 'A3', 'A3 Cabrio', '1.8 TFSI'];
    assert.equal(optionsAt(ENTRIES, 4, selection).length, 0);
    assert.equal(resolvePool(ENTRIES, selection)?.key, 'audi/a3/a3-cabrio/1-8-tfsi');
    assert.equal(buildChain(ENTRIES, selection).length, 4);
  });

  test('kasa seviyesi olmayan markada zincir kisadir', () => {
    assert.deepEqual(optionsAt(ENTRIES, 2, ['Alfa Romeo', '146']), ['1.4']);
    assert.deepEqual(optionsAt(ENTRIES, 3, ['Alfa Romeo', '146', '1.4']), ['TS']);
    assert.equal(
      resolvePool(ENTRIES, ['Alfa Romeo', '146', '1.4', 'TS'])?.key,
      'alfa-romeo/146/1-4/ts',
    );
  });

  test('secim yarim kaldiginda yalnizca bir sonraki seviye acilir', () => {
    const chain = buildChain(ENTRIES, ['Audi', 'A3']);
    assert.equal(chain.length, 3);
    assert.equal(chain[2].value, '');
  });
});

describe('Basliklar veri setinin sinifllandirmasindan okunur', () => {
  const heading = (selection: string[], depth: number) =>
    headingFor(FIXTURE, BRANCHES, selection, depth);

  test('Audi: kasa / motor / paket', () => {
    assert.equal(heading(AUDI_SEDAN_15, 2), 'Kasa / Gövde');
    assert.equal(heading(AUDI_SEDAN_15, 3), 'Motor');
    assert.equal(heading(AUDI_SEDAN_15, 4), 'Paket / Donanım');
  });

  test('Alfa Romeo: kasa seviyesi YOKTUR, 3. seviye motordur', () => {
    const selection = ['Alfa Romeo', '146', '1.4', 'TS'];
    assert.equal(heading(selection, 2), 'Motor');
    assert.equal(heading(selection, 3), 'Paket / Donanım');
  });
});

describe('Ust secim degisince alt secim gereksiz yere dusmez', () => {
  test('hala gecerli olan alt secim korunur', () => {
    const before = ['Audi', 'A3', 'A3 Sedan', '1.6 TDI', 'Sport Line'];
    const after = applyChoice(ENTRIES, before, 2, 'A3 Sportback');
    assert.deepEqual(after, ['Audi', 'A3', 'A3 Sportback', '1.6 TDI', 'Sport Line']);
  });

  test('gecersiz kalan alt secim ve altindakiler dusurulur', () => {
    const before = ['Audi', 'A3', 'A3 Sedan', '1.5 TFSI', 'Advanced'];
    const after = applyChoice(ENTRIES, before, 2, 'A3 Cabrio');
    assert.deepEqual(after, ['Audi', 'A3', 'A3 Cabrio']);
  });

  test('bos secim o seviyeden itibaren temizler', () => {
    const before = ['Audi', 'A3', 'A3 Sedan', '1.5 TFSI', 'Advanced'];
    assert.deepEqual(applyChoice(ENTRIES, before, 3, ''), ['Audi', 'A3', 'A3 Sedan']);
  });
});


/**
 * VARLIK ile FIYATLANABILIRLIK AYRI SEYLERDIR.
 *
 * Sabitlenen hata: veri seti, yilin kendi ilani 3 un altindaysa o yili HIC
 * yazmiyordu; havuz 5 ilanin altindaysa paket bile gorunmuyordu. Gercekte
 * var olan model yillari (Sport Line 2017, 2 ilan) ekranda yoktu. Dropdown
 * VARLIKTAN turer; kanitin yeterliligi fiyat katmaninin isidir.
 */
describe('Yil listesi kanit esigine gore FILTRELENMEZ', () => {
  test('1 ilanli yil gorunur (A)', () => {
    const selection = ['Audi', 'A3', 'A3 Sedan', '1.5 TFSI', 'Design Line'];
    const pool = resolvePool(ENTRIES, selection);
    assert.deepEqual(yearsOf(pool), [2018]);
    assert.equal(yearEvidenceOf(pool!.pool.years["2018"]).directComparables, 1);
  });

  test('2 ilanli yil gorunur (B)', () => {
    const pool = resolvePool(ENTRIES, [...AUDI_SEDAN_15, 'Sport Line']);
    assert.ok(yearsOf(pool).includes(2017));
    assert.equal(yearEvidenceOf(pool!.pool.years["2017"]).directComparables, 2);
  });

  test('3 ilanli yil gorunur (C)', () => {
    const pool = resolvePool(ENTRIES, [...AUDI_SEDAN_15, 'Sport Line']);
    assert.ok(yearsOf(pool).includes(2018));
    assert.equal(yearEvidenceOf(pool!.pool.years["2018"]).directComparables, 3);
  });

  test('tek ilanli paket yine de secilebilir', () => {
    const packages = optionsAt(ENTRIES, 4, AUDI_SEDAN_15);
    assert.ok(packages.includes('Design Line'));
  });
});
/**
 * Canli veri seti buyudugu icin burada MARKA/MODEL adi degil, SOZLESME
 * sinanir: yol kirpilmamis mi, etiketler kaynaktan mi geliyor, her dalin
 * seviye tipi var mi.
 */
describe('Yayinlanan veri seti sozlesmesi', () => {
  const file = path.resolve(import.meta.dirname, '../../public/demo-market.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as DemoData;
  const entries = poolEntries(data);

  test('her havuzun etiket yolu, kimliginin segment sayisi kadardir', () => {
    const broken = entries.filter(
      ({ key, pool }) => pool.path.length !== key.split('/').length,
    );
    assert.deepEqual(broken.map((e) => e.key), []);
  });

  test('etiketler slug guzellestirmesi degil, kaynagin kendi yazimidir', () => {
    // "1-5-tfsi" slug'ini baslik harfe cevirmek "1 5 Tfsi" uretirdi.
    const mangled = new Set<string>();
    for (const { pool } of entries) {
      for (const segment of pool.path) {
        if (/^\d\s\d(\s|$)/.test(segment)) mangled.add(segment);
        if (/\b(Tfsi|Tdi|Tsi|Cdi|Dci|Fsi)\b/.test(segment)) mangled.add(segment);
      }
    }
    assert.deepEqual([...mangled], []);
  });

  test('iki seviyeden derin her dalin seviye tipleri vardir', () => {
    const missing = new Set<string>();
    for (const { key, pool } of entries) {
      if (pool.path.length < 3) continue;
      const branch = key.split('/').slice(0, 2).join('/');
      const kinds = data.levels[branch];
      if (!kinds || kinds.length < pool.path.length - 2) missing.add(branch);
    }
    assert.deepEqual([...missing], []);
  });

  /**
   * Odunc kanit PAKET SINIRINI GECMEZ: her yil satirinin kullandigi emsal
   * sayisi, o havuzun KENDI ilan sayisini asamaz. Advanced ile Sport Line
   * birbirinin kanitini kullanamaz.
   */
  test('odunc alinan kanit havuzun disina cikmaz (G)', () => {
    const leaks: string[] = [];
    for (const { key, pool } of entries) {
      for (const [year, row] of Object.entries(pool.years)) {
        const e = yearEvidenceOf(row);
        if (e.directComparables + e.borrowedComparables > pool.n) {
          leaks.push(`${key} ${year}`);
        }
        if (e.effectiveComparables > e.directComparables + e.borrowedComparables) {
          leaks.push(`${key} ${year} (etkin > toplam)`);
        }
      }
    }
    assert.deepEqual(leaks, []);
  });

  test('ayni ilk dort etiketi paylasan havuzlar ayri cozulur', () => {
    const byPrefix = new Map<string, string[]>();
    for (const { key, pool } of entries) {
      if (pool.path.length < 5) continue;
      const prefix = pool.path.slice(0, 4).join(' / ');
      byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), key]);
    }
    const shared = [...byPrefix.values()].filter((keys) => keys.length > 1);
    // Boyle bir ornek bulunmali; hata tam olarak burada gizleniyordu.
    assert.ok(shared.length > 0, 'ayni oneki paylasan paket bulunamadi');

    for (const keys of shared) {
      for (const key of keys) {
        const resolved = resolvePool(entries, data.pools[key].path);
        assert.equal(resolved?.key, key);
      }
    }
  });
});
