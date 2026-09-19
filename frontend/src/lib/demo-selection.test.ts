/**
 * DEMO ARAC SECIMI — REGRESYON.
 *
 * SABITLENEN HATA (bu tur): dropdown'lar FIYAT HAVUZLARINDAN kuruluyordu.
 * Havuzlar haftalik taramanin o ana kadar ziyaret ettigi hedeflerden gelir ve
 * tarama alfabetiktir; yayin dosyasi `opel/corsa/...` hedefinde kesilince Opel
 * dropdown'i Corsa-e'de bitiyor, marka listesi Opel'de duruyordu. Insignia
 * (2.008 ilan), Vectra (2.548), Peugeot, Renault, Toyota, Volkswagen, Volvo —
 * hepsi SESSIZCE kayboluyordu. Artik secim KATALOGDAN surulur; fiyat havuzu
 * yalnizca sayinin gosterilip gosterilmeyecegini belirler.
 *
 * ONCEKI TUR: veri seti kategori yolunu ilk DORT segmente kirpiyordu; bes
 * seviyeli markalarda paket seviyesi tamamen dusuyor, ayni dort etiketi
 * paylasan paketler tek havuza iniyordu. O regresyonlar da burada durur.
 *
 *   node --test src/lib/demo-selection.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyChoice,
  availabilityOf,
  buildCatalog,
  buildChain,
  headingFor,
  labelPathOf,
  optionsAt,
  resolvePool,
  yearEvidenceOf,
  yearsOf,
  type CatalogWire,
  type DemoData,
  type YearRow,
} from './demo-selection.ts';
import { hasEnoughEvidence, quote } from './demo-pricing.ts';

/**
 * [km1, km2, km3, fmv1, fmv2, fmv3, dogrudan, odunc, etkin,
 *  yayilim, motor guveni, manuel gerekce kodu]
 */
const row = (
  direct: number,
  borrowed = 0,
  manualCode = 0,
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
  manualCode,
];

const leaf = (id: string, label: string, listings: number): CatalogWire => [
  id,
  label,
  listings,
];
const branch = (
  id: string,
  label: string,
  listings: number,
  kids: CatalogWire[],
): CatalogWire => [id, label, listings, kids];

/**
 * Gercek veri setinin kucuk bir kopyasi. Tarama surdugu icin canli veri
 * buyuyup degisir; davranis burada SABIT bir ornek uzerinde sinanir.
 *
 * Kasitli olarak FIYATSIZ dallar icerir (Opel Insignia, Opel Manta): katalog
 * ile fiyatin ayri oldugunu ancak boyle sinayabiliriz.
 */
const CATALOG: CatalogWire[] = [
  branch('alfa-romeo', 'Alfa Romeo', 5, [
    branch('alfa-romeo/146', '146', 5, [
      branch('alfa-romeo/146/1-4', '1.4', 5, [
        leaf('alfa-romeo/146/1-4/ts', 'TS', 5),
      ]),
    ]),
  ]),
  branch('audi', 'Audi', 45, [
    branch('audi/a3', 'A3', 45, [
      branch('audi/a3/a3-cabrio', 'A3 Cabrio', 8, [
        leaf('audi/a3/a3-cabrio/1-8-tfsi', '1.8 TFSI', 8),
      ]),
      branch('audi/a3/a3-sedan', 'A3 Sedan', 28, [
        branch('audi/a3/a3-sedan/1-5-tfsi', '1.5 TFSI', 16, [
          leaf('audi/a3/a3-sedan/1-5-tfsi/advanced', 'Advanced', 10),
          leaf('audi/a3/a3-sedan/1-5-tfsi/design-line', 'Design Line', 1),
          leaf('audi/a3/a3-sedan/1-5-tfsi/sport-line', 'Sport Line', 5),
        ]),
        branch('audi/a3/a3-sedan/1-6-tdi', '1.6 TDI', 12, [
          leaf('audi/a3/a3-sedan/1-6-tdi/sport-line', 'Sport Line', 12),
        ]),
      ]),
      branch('audi/a3/a3-sportback', 'A3 Sportback', 9, [
        branch('audi/a3/a3-sportback/1-6-tdi', '1.6 TDI', 9, [
          leaf('audi/a3/a3-sportback/1-6-tdi/sport-line', 'Sport Line', 9),
        ]),
      ]),
    ]),
  ]),
  branch('opel', 'Opel', 2533, [
    branch('opel/corsa', 'Corsa', 512, [
      leaf('opel/corsa/1-4', '1.4', 492),
      /**
       * Haftalik tarama buraya HENUZ gelmedi; fiyat korpus/DB kanitindan
       * gelir. Gercek vakanin ta kendisi: 20 ilan, tek model yili.
       */
      branch('opel/corsa/1-5-td', '1.5 TD', 20, [
        leaf('opel/corsa/1-5-td/eco', 'ECO', 20),
      ]),
    ]),
    // Tarama buraya HENUZ GELMEDI: 2.008 ilanlik model, fiyat havuzu yok.
    branch('opel/insignia', 'Insignia', 2008, [
      leaf('opel/insignia/1-6-cdti', '1.6 CDTI', 1200),
      leaf('opel/insignia/2-0-cdti', '2.0 CDTI', 808),
    ]),
    // Kaynakta var, ilani HIC yok. Yine de secilebilir olmali.
    branch('opel/manta', 'Manta', 0, [leaf('opel/manta/1-9', '1.9', 0)]),
    // Tek ilanli havuz: fiyatlanir ama uzman kontrolu ister.
    branch('opel/tigra', 'Tigra', 13, [leaf('opel/tigra/1-4', '1.4', 13)]),
  ]),
  /**
   * "206" ve "206 +" ayri modeldir ve ikisi de `peugeot/206` slug'ina duser;
   * ikincisi `peugeot/206-2` olur ama cocuklari etiket slug'indan uretildigi
   * icin `peugeot/206/1-4` olarak kalir — cocugun kimligi ebeveyninin
   * kimligiyle BASLAMAZ. Kimligi yol sanan kod burada bozulur.
   */
  branch('peugeot', 'Peugeot', 2266, [
    branch('peugeot/206', '206 +', 413, [
      leaf('peugeot/206/1-4-2', '1.4', 413),
    ]),
    branch('peugeot/206-2', '206', 1853, [
      leaf('peugeot/206/1-4', '1.4', 1000),
    ]),
  ]),
];

const FIXTURE: DemoData = {
  generatedAt: '2026-09-18T00:00:00.000Z',
  hierarchyVersion: 'test',
  catalogNodeCount: 34,
  catalogLeafCount: 13,
  poolCount: 9,
  listingCount: 3000,
  yearRowCount: 11,
  levels: {
    'audi/a3': ['body', 'engine', 'package'],
    'alfa-romeo/146': ['engine', 'package'],
  },
  catalog: CATALOG,
  pools: {
    'audi/a3/a3-sedan/1-5-tfsi/advanced': {
      n: 10,
      km: 0.015,
      years: { '2026': row(10) },
    },
    'audi/a3/a3-sedan/1-5-tfsi/sport-line': {
      n: 5,
      km: 0.015,
      years: { '2017': row(2, 3), '2018': row(3, 2) },
    },
    'audi/a3/a3-sedan/1-5-tfsi/design-line': {
      n: 1,
      km: 0.015,
      years: { '2018': row(1) },
    },
    'audi/a3/a3-sedan/1-6-tdi/sport-line': {
      n: 12,
      km: 0.015,
      years: { '2015': row(12) },
    },
    'audi/a3/a3-sportback/1-6-tdi/sport-line': {
      n: 9,
      km: 0.015,
      years: { '2016': row(9) },
    },
    'audi/a3/a3-cabrio/1-8-tfsi': {
      n: 8,
      km: 0.015,
      years: { '2009': row(8) },
    },
    'alfa-romeo/146/1-4/ts': { n: 5, km: 0.015, years: { '1998': row(5) } },
    'opel/corsa/1-4': { n: 492, km: 0.015, years: { '2015': row(40) } },
    'opel/corsa/1-5-td/eco': { n: 20, km: 0.0137, years: { '2000': row(20) } },
    // Motor "uzman baksin" dedi; satir yine de veri setinde ve secilebilir.
    'opel/tigra/1-4': { n: 13, km: 0.015, years: { '2003': row(1, 2, 1) } },
    'peugeot/206/1-4': { n: 1000, km: 0.015, years: { '2005': row(60) } },
  },
};

const CAT = buildCatalog(FIXTURE);
const A3 = 'audi/a3';
const SEDAN_15 = ['audi', A3, 'audi/a3/a3-sedan', 'audi/a3/a3-sedan/1-5-tfsi'];
const labelsAt = (selection: string[], depth: number) =>
  optionsAt(CAT, selection, depth).map((o) => o.label);

describe('Audi > A3 > A3 Sedan > 1.5 TFSI (onceki regresyon)', () => {
  test('Kasa seviyesi kasa etiketlerini tasir', () => {
    assert.deepEqual(labelsAt(['audi', A3], 2), [
      'A3 Cabrio',
      'A3 Sedan',
      'A3 Sportback',
    ]);
  });

  test('Motor seviyesinde KASA etiketi gorunmez', () => {
    const engines = labelsAt(['audi', A3, 'audi/a3/a3-sedan'], 3);
    assert.deepEqual(engines, ['1.5 TFSI', '1.6 TDI']);
    assert.equal(engines.includes('A3 Sedan'), false);
  });

  test('Paket seviyesi gorunur ve MOTOR etiketi tasimaz', () => {
    const packages = labelsAt(SEDAN_15, 4);
    assert.deepEqual(packages, ['Advanced', 'Design Line', 'Sport Line']);
    assert.equal(packages.includes('1.5 TFSI'), false);
  });

  test('her paket KENDI fiyat havuzudur (F)', () => {
    const advanced = resolvePool(FIXTURE, [
      ...SEDAN_15,
      'audi/a3/a3-sedan/1-5-tfsi/advanced',
    ]);
    const sportLine = resolvePool(FIXTURE, [
      ...SEDAN_15,
      'audi/a3/a3-sedan/1-5-tfsi/sport-line',
    ]);
    assert.equal(advanced?.n, 10);
    assert.equal(sportLine?.n, 5);
  });

  test('yillar secilen pakete aittir — tek bir yila kilitlenmez', () => {
    assert.deepEqual(
      yearsOf(
        resolvePool(FIXTURE, [
          ...SEDAN_15,
          'audi/a3/a3-sedan/1-5-tfsi/advanced',
        ]),
      ),
      [2026],
    );
    assert.deepEqual(
      yearsOf(
        resolvePool(FIXTURE, [
          ...SEDAN_15,
          'audi/a3/a3-sedan/1-5-tfsi/sport-line',
        ]),
      ),
      [2018, 2017],
    );
  });

  test('paket secilmeden secim TAMAMLANMAMIS sayilir', () => {
    assert.equal(resolvePool(FIXTURE, SEDAN_15), null);
    assert.equal(availabilityOf(CAT, FIXTURE, SEDAN_15), 'INCOMPLETE');
  });
});

describe('Zincir derinligi KATALOGDAN gelir (G)', () => {
  test('paket seviyesi olmayan dal motorda biter', () => {
    const selection = [
      'audi',
      A3,
      'audi/a3/a3-cabrio',
      'audi/a3/a3-cabrio/1-8-tfsi',
    ];
    assert.equal(optionsAt(CAT, selection, 4).length, 0);
    assert.equal(resolvePool(FIXTURE, selection)?.n, 8);
    assert.equal(buildChain(CAT, selection).length, 4);
  });

  test('kasa seviyesi olmayan markada zincir kisadir', () => {
    assert.deepEqual(labelsAt(['alfa-romeo', 'alfa-romeo/146'], 2), ['1.4']);
    const selection = [
      'alfa-romeo',
      'alfa-romeo/146',
      'alfa-romeo/146/1-4',
      'alfa-romeo/146/1-4/ts',
    ];
    assert.equal(resolvePool(FIXTURE, selection)?.n, 5);
  });

  test('iki seviyeli dal yaprak sayilir', () => {
    const selection = ['opel', 'opel/corsa', 'opel/corsa/1-4'];
    assert.equal(buildChain(CAT, selection).length, 3);
    assert.equal(availabilityOf(CAT, FIXTURE, selection), 'PRICEABLE');
  });

  test('secim yarim kaldiginda yalnizca bir sonraki seviye acilir', () => {
    const chain = buildChain(CAT, ['audi', A3]);
    assert.equal(chain.length, 3);
    assert.equal(chain[2].value, '');
  });
});

describe('Basliklar veri setinin sinifllandirmasindan okunur', () => {
  const heading = (selection: string[], depth: number) =>
    headingFor(FIXTURE, selection, depth);

  test('Audi: kasa / motor / paket', () => {
    assert.equal(heading(SEDAN_15, 2), 'Kasa / Gövde');
    assert.equal(heading(SEDAN_15, 3), 'Motor');
    assert.equal(heading(SEDAN_15, 4), 'Paket / Donanım');
  });

  test('Alfa Romeo: kasa seviyesi YOKTUR, 3. seviye motordur', () => {
    const selection = ['alfa-romeo', 'alfa-romeo/146', 'alfa-romeo/146/1-4'];
    assert.equal(heading(selection, 2), 'Motor');
    assert.equal(heading(selection, 3), 'Paket / Donanım');
  });

  test('siniflandirmasi olmayan dal notr kalir, cokmez', () => {
    assert.equal(heading(['opel', 'opel/corsa'], 2), 'Seri / Tip');
  });
});

describe('Ust secim degisince alt secim gereksiz yere dusmez', () => {
  test('hala gecerli olan alt secim ETIKETE gore korunur', () => {
    const before = [
      'audi',
      A3,
      'audi/a3/a3-sedan',
      'audi/a3/a3-sedan/1-6-tdi',
      'audi/a3/a3-sedan/1-6-tdi/sport-line',
    ];
    assert.deepEqual(
      applyChoice(CAT, before, 2, 'audi/a3/a3-sportback'),
      [
        'audi',
        A3,
        'audi/a3/a3-sportback',
        'audi/a3/a3-sportback/1-6-tdi',
        'audi/a3/a3-sportback/1-6-tdi/sport-line',
      ],
    );
  });

  test('gecersiz kalan alt secim ve altindakiler dusurulur', () => {
    const before = [
      'audi',
      A3,
      'audi/a3/a3-sedan',
      'audi/a3/a3-sedan/1-5-tfsi',
      'audi/a3/a3-sedan/1-5-tfsi/advanced',
    ];
    assert.deepEqual(applyChoice(CAT, before, 2, 'audi/a3/a3-cabrio'), [
      'audi',
      A3,
      'audi/a3/a3-cabrio',
    ]);
  });

  test('bos secim o seviyeden itibaren temizler', () => {
    const before = [...SEDAN_15, 'audi/a3/a3-sedan/1-5-tfsi/advanced'];
    assert.deepEqual(applyChoice(CAT, before, 3, ''), [
      'audi',
      A3,
      'audi/a3/a3-sedan',
    ]);
  });
});

/**
 * KATALOG ile FIYAT AYRI SEYLERDIR — bu turun asil regresyonu.
 *
 * Bir arac, fiyat havuzu yok diye dropdown'dan DUSMEZ. Dusmesi icin kaynakta
 * hic var olmamasi gerekir.
 */
describe('Fiyat havuzu olmayan arac SECILEBILIR kalir', () => {
  const INSIGNIA = ['opel', 'opel/insignia', 'opel/insignia/1-6-cdti'];

  test('cok ilanli model fiyat havuzu yok diye kaybolmaz (A)', () => {
    const models = labelsAt(['opel'], 1);
    assert.ok(models.includes('Insignia'), 'Insignia dropdown\'da yok');
    assert.equal(FIXTURE.pools['opel/insignia/1-6-cdti'], undefined);
    assert.equal(availabilityOf(CAT, FIXTURE, INSIGNIA), 'NO_PRICE_DATA');
    assert.equal(CAT.byId.get('opel/insignia')!.listings, 2008);
  });

  test('guncel teklifi olmayan arac yine de secilebilir (D)', () => {
    assert.equal(resolvePool(FIXTURE, INSIGNIA), null);
    assert.equal(buildChain(CAT, INSIGNIA).length, 3);
    assert.deepEqual(labelPathOf(CAT, INSIGNIA), [
      'Opel',
      'Insignia',
      '1.6 CDTI',
    ]);
  });

  test('kaynakta hic ilani olmayan model de secilebilir', () => {
    const manta = ['opel', 'opel/manta', 'opel/manta/1-9'];
    assert.ok(labelsAt(['opel'], 1).includes('Manta'));
    assert.equal(CAT.byId.get('opel/manta')!.listings, 0);
    assert.equal(availabilityOf(CAT, FIXTURE, manta), 'NO_PRICE_DATA');
  });

  test('havuz kanit varsa ORTAYA CIKAR (E)', () => {
    const corsa = ['opel', 'opel/corsa', 'opel/corsa/1-4'];
    assert.equal(availabilityOf(CAT, FIXTURE, corsa), 'PRICEABLE');
    assert.equal(resolvePool(FIXTURE, corsa)?.n, 492);
    assert.deepEqual(yearsOf(resolvePool(FIXTURE, corsa)), [2015]);
  });
});

/**
 * VARLIK ile FIYATLANABILIRLIK AYRI SEYLERDIR.
 *
 * Onceki tur: veri seti, yilin kendi ilani 3 un altindaysa o yili HIC
 * yazmiyordu; havuz 5 ilanin altindaysa paket bile gorunmuyordu.
 */
describe('Yil listesi kanit esigine gore FILTRELENMEZ', () => {
  test('tek ilanli havuz secilebilir ve yili gorunur (B)', () => {
    const selection = [...SEDAN_15, 'audi/a3/a3-sedan/1-5-tfsi/design-line'];
    const pool = resolvePool(FIXTURE, selection);
    assert.equal(pool?.n, 1);
    assert.deepEqual(yearsOf(pool), [2018]);
    assert.equal(yearEvidenceOf(pool!.years['2018']).directComparables, 1);
    assert.equal(availabilityOf(CAT, FIXTURE, selection), 'PRICEABLE');
  });

  test('2 ilanli yil gorunur', () => {
    const pool = resolvePool(FIXTURE, [
      ...SEDAN_15,
      'audi/a3/a3-sedan/1-5-tfsi/sport-line',
    ]);
    assert.ok(yearsOf(pool).includes(2017));
    assert.equal(yearEvidenceOf(pool!.years['2017']).directComparables, 2);
  });

  test('manuel degerlendirme isteyen arac secilebilir kalir (C)', () => {
    const tigra = ['opel', 'opel/tigra', 'opel/tigra/1-4'];
    const pool = resolvePool(FIXTURE, tigra);
    assert.equal(availabilityOf(CAT, FIXTURE, tigra), 'PRICEABLE');
    assert.notEqual(yearEvidenceOf(pool!.years['2003']).engineManualCode, 0);
  });
});

/**
 * SEYREK KANIT — "az ilan" ile "ilan yok" AYNI SEY DEGILDIR.
 *
 * Sabitlenen hata: demo fiyati yalnizca haftalik yayindan uretiyordu, o yayin
 * da alfabetik taramanin geldigi yere kadardi. `opel/corsa/1-5-td/eco`
 * korpusta 20 gecerli ilani oldugu halde yil alani KAPALI, mesaj "yeterli
 * guncel emsal bulunamadi" idi. Degismez kural: tam yaprakta >=1
 * kullanilabilir gozlem varsa en az bir fiyatlanabilir yil gorunur.
 */
describe('Seyrek kanit yine de fiyat uretir', () => {
  const ECO = ['opel', 'opel/corsa', 'opel/corsa/1-5-td', 'opel/corsa/1-5-td/eco'];
  const DESIGN_LINE = [...SEDAN_15, 'audi/a3/a3-sedan/1-5-tfsi/design-line'];
  const SPORT_LINE = [...SEDAN_15, 'audi/a3/a3-sedan/1-5-tfsi/sport-line'];

  const quoteFor = (selection: string[], year: string) => {
    const pool = resolvePool(FIXTURE, selection)!;
    const e = yearEvidenceOf(pool.years[year]);
    assert.equal(
      hasEnoughEvidence(e.directComparables, e.borrowedComparables),
      true,
      'kanit kapisi bu satiri elemis',
    );
    return {
      evidence: e,
      result: quote({
        kmPoints: e.kmPoints,
        fmvPoints: e.fmvPoints,
        mileageKm: e.kmPoints[1],
        directComparables: e.directComparables,
        borrowedComparables: e.borrowedComparables,
        effectiveComparables: e.effectiveComparables,
        engineConfidencePct: e.engineConfidencePct,
        dispersion: e.dispersion,
        engineManualCode: e.engineManualCode,
      }),
    };
  };

  test('TEK dogrudan ilan fiyat uretir ve uzman kontrolu ister (A)', () => {
    assert.equal(availabilityOf(CAT, FIXTURE, DESIGN_LINE), 'PRICEABLE');
    assert.deepEqual(yearsOf(resolvePool(FIXTURE, DESIGN_LINE)), [2018]);

    const { evidence, result } = quoteFor(DESIGN_LINE, '2018');
    assert.equal(evidence.directComparables, 1);
    assert.equal(evidence.borrowedComparables, 0);
    assert.ok(result.fairMarketValue > 0, 'FMV uretilmedi');
    assert.ok(result.cashOffer > 0);
    assert.ok(result.customerConsignmentNet > 0);
    // Tek gozlem KESIN gibi sunulamaz.
    assert.equal(result.requiresManualApproval, true);
    assert.match(result.manualApprovalReason ?? '', /tek ilan/i);
  });

  test('IKI dogrudan ilan fiyat uretir, kanit sayisi dogru (B)', () => {
    const { evidence, result } = quoteFor(SPORT_LINE, '2017');
    assert.equal(evidence.directComparables, 2);
    assert.ok(result.fairMarketValue > 0);
    assert.equal(result.matchedListingCount, 5); // 2 dogrudan + 3 odunc
  });

  /**
   * Odunc kanit AYNI yolun komsu yillarindan gelir. Kardes pakete gecmez:
   * Sport Line'in odunc sayisi kendi havuzunun ilan adedini asamaz.
   */
  test('komsu yil oduncu ayni yol icinde kalir, kardese sizmaz (C)', () => {
    const pool = resolvePool(FIXTURE, SPORT_LINE)!;
    for (const [year, yearRow] of Object.entries(pool.years)) {
      const e = yearEvidenceOf(yearRow);
      assert.ok(
        e.directComparables + e.borrowedComparables <= pool.n,
        `${year}: odunc kanit havuzun disina tasmis`,
      );
    }
    // Advanced'in 2026 havuzu Sport Line'in yillarina hicbir sey eklemedi.
    const advanced = resolvePool(FIXTURE, [
      ...SEDAN_15,
      'audi/a3/a3-sedan/1-5-tfsi/advanced',
    ])!;
    assert.deepEqual(yearsOf(advanced), [2026]);
    assert.equal(yearEvidenceOf(advanced.years['2026']).borrowedComparables, 0);
  });

  test('kaniti sifir olan yaprak fiyatsiz durumda kalir (D)', () => {
    const insignia = ['opel', 'opel/insignia', 'opel/insignia/1-6-cdti'];
    assert.equal(availabilityOf(CAT, FIXTURE, insignia), 'NO_PRICE_DATA');
    assert.equal(resolvePool(FIXTURE, insignia), null);
    assert.deepEqual(yearsOf(resolvePool(FIXTURE, insignia)), []);
  });

  /**
   * ASIL VAKA. Haftalik yayin bu yapraga hic ulasmadi; fiyat korpus/DB
   * kanitindan gelir. Yil alani ACIK olmali.
   */
  test('yayin ulasmamis yaprak fiyatlanir — Opel Corsa 1.5 TD ECO', () => {
    assert.equal(availabilityOf(CAT, FIXTURE, ECO), 'PRICEABLE');
    assert.deepEqual(yearsOf(resolvePool(FIXTURE, ECO)), [2000]);
    assert.deepEqual(labelPathOf(CAT, ECO), ['Opel', 'Corsa', '1.5 TD', 'ECO']);

    const { evidence, result } = quoteFor(ECO, '2000');
    assert.equal(evidence.directComparables, 20);
    assert.ok(result.fairMarketValue > 0);
    assert.ok(result.cashOffer > 0);
  });
});

/**
 * KIMLIK, YOL DEGILDIR. Kimligi '/' ile kesip birlestiren kod "206" ile
 * "206 +" dallarini birbirine karistirir; olculen zarar 59 sessiz dusustu.
 */
describe('Ilk etiket cakismasi dallari karistirmaz (H)', () => {
  test('ayni etiketli iki model AYRI dugumdur', () => {
    const models = optionsAt(CAT, ['peugeot'], 1);
    assert.deepEqual(
      models.map((m) => [m.id, m.label]),
      [
        ['peugeot/206-2', '206'],
        ['peugeot/206', '206 +'],
      ],
    );
  });

  test('kimligi ebeveyninin oneki olmayan dal dogru havuza cozulur', () => {
    const plain = ['peugeot', 'peugeot/206-2', 'peugeot/206/1-4'];
    const plus = ['peugeot', 'peugeot/206', 'peugeot/206/1-4-2'];

    assert.deepEqual(labelPathOf(CAT, plain), ['Peugeot', '206', '1.4']);
    assert.deepEqual(labelPathOf(CAT, plus), ['Peugeot', '206 +', '1.4']);
    assert.equal(resolvePool(FIXTURE, plain)?.n, 1000);
    assert.equal(availabilityOf(CAT, FIXTURE, plain), 'PRICEABLE');
    assert.equal(availabilityOf(CAT, FIXTURE, plus), 'NO_PRICE_DATA');
  });

  test('kimlik yol gibi birlestirilse YANLIS dugume duserdi', () => {
    // 'peugeot' + '/' + '206' -> 'peugeot/206' = "206 +", oysa secilen "206".
    assert.equal(CAT.byId.get('peugeot/206')!.label, '206 +');
    assert.equal(CAT.byId.get('peugeot/206-2')!.label, '206');
  });
});

/**
 * Canli veri seti buyudugu icin burada MARKA/MODEL adi degil, SOZLESME
 * sinanir. Tek istisna Opel: hatanin gorundugu yer orasiydi (I).
 */
describe('Yayinlanan veri seti sozlesmesi', () => {
  const file = path.resolve(import.meta.dirname, '../../public/demo-market.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as DemoData;
  const catalog = buildCatalog(data);

  const leaves = [...catalog.byId.values()].filter(
    (n) => n.children.length === 0,
  );

  test('katalog fiyat havuzlarindan GENISTIR (J)', () => {
    assert.ok(
      leaves.length > Object.keys(data.pools).length,
      'katalog havuz sayisina esit — yine fiyattan tureniyor olabilir',
    );
    assert.equal(leaves.length, data.catalogLeafCount);
    assert.equal(catalog.byId.size, data.catalogNodeCount);
  });

  test('her fiyat havuzunun katalogda bir YAPRAGI vardir', () => {
    const orphan = Object.keys(data.pools).filter((key) => {
      const node = catalog.byId.get(key);
      return !node || node.children.length > 0;
    });
    assert.deepEqual(orphan, []);
  });

  test('etiketler slug guzellestirmesi degil, kaynagin kendi yazimidir', () => {
    // "1-5-tfsi" slug'ini baslik harfe cevirmek "1 5 Tfsi" uretirdi.
    const mangled = new Set<string>();
    for (const node of catalog.byId.values()) {
      if (/^\d\s\d(\s|$)/.test(node.label)) mangled.add(node.label);
      if (/\b(Tfsi|Tdi|Tsi|Cdi|Dci|Fsi)\b/.test(node.label)) {
        mangled.add(node.label);
      }
    }
    assert.deepEqual([...mangled], []);
  });

  test('iki seviyeden derin her dalin seviye tipleri vardir', () => {
    const missing = new Set<string>();
    const walk = (node: typeof catalog.roots[number], chain: string[]) => {
      const next = [...chain, node.id];
      if (node.children.length === 0) {
        if (next.length < 3) return;
        const kinds = data.levels[next[1]];
        if (!kinds || kinds.length < next.length - 2) missing.add(next[1]);
        return;
      }
      for (const child of node.children) walk(child, next);
    };
    for (const root of catalog.roots) walk(root, []);
    assert.deepEqual([...missing], []);
  });

  test('etiket yollari BENZERSIZDIR — iki arac ayni gorunmez', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    const walk = (node: typeof catalog.roots[number], labels: string[]) => {
      const next = [...labels, node.label];
      const key = next.join(String.fromCharCode(0));
      const prior = seen.get(key);
      if (prior) clashes.push(`${prior} == ${node.id}`);
      else seen.set(key, node.id);
      for (const child of node.children) walk(child, next);
    };
    for (const root of catalog.roots) walk(root, []);
    assert.deepEqual(clashes, []);
  });

  /**
   * Odunc kanit PAKET SINIRINI GECMEZ: her yil satirinin kullandigi emsal
   * sayisi, o havuzun KENDI ilan sayisini asamaz.
   */
  test('odunc alinan kanit havuzun disina cikmaz', () => {
    const leaks: string[] = [];
    for (const [key, pool] of Object.entries(data.pools)) {
      for (const [year, yearRow] of Object.entries(pool.years)) {
        const e = yearEvidenceOf(yearRow);
        if (e.directComparables + e.borrowedComparables > pool.n) {
          leaks.push(`${key} ${year}`);
        }
        if (
          e.effectiveComparables >
          e.directComparables + e.borrowedComparables
        ) {
          leaks.push(`${key} ${year} (etkin > toplam)`);
        }
      }
    }
    assert.deepEqual(leaks, []);
  });

  /**
   * OPEL KABUL TESTI (I). Liste koda GOMULU DEGILDIR; kaynakta gorulen Opel
   * modellerinin tamaminin katalogda oldugu, hicbirinin fiyat havuzu yok diye
   * dusmedigi sinanir. Referans adlar yalnizca "gercekten oradalar mi"
   * sorusunu somutlastirir.
   */
  test('Opel dropdown\'i kaynaktaki tum modelleri gosterir (I)', () => {
    const opel = catalog.byId.get('opel');
    assert.ok(opel, 'Opel markasi katalogda yok');
    const labels = opel!.children.map((m) => m.label);

    for (const expected of [
      'Adam',
      'Agila',
      'Ascona',
      'Astra',
      'Astra-e',
      'Calibra',
      'Cascada',
      'Corsa',
      'Corsa-e',
      'GT (Roadster)',
      'Insignia',
      'Kadett',
      'Manta',
      'Meriva',
      'Omega',
      'Rekord',
      'Signum',
      'Tigra',
      'Vectra',
      'Zafira',
    ]) {
      assert.ok(labels.includes(expected), `Opel ${expected} dropdown'da yok`);
    }

    // Fiyat havuzu olmayan modeller de listede olmali — asil hata buydu.
    const unpriced = opel!.children.filter((model) => {
      const stack = [model];
      while (stack.length > 0) {
        const node = stack.pop()!;
        if (node.children.length === 0 && data.pools[node.id]) return false;
        stack.push(...node.children);
      }
      return true;
    });
    assert.ok(
      unpriced.length > 0,
      'fiyatsiz Opel modeli yok — test bir sey kanitlamiyor',
    );
  });
});
