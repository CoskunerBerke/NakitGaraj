/**
 * KAYNAK -> DEMO KAPSAMA — REGRESYON.
 *
 * Sabitlenen hata: demo veri seti secim agacini YAYINLANAN PIYASA DOSYASINDAN
 * turetiyordu. O dosya haftalik taramanin o ana kadar ziyaret ettigi
 * hedeflerden olusur ve tarama alfabetiktir; dosya `opel/corsa/...` hedefinde
 * kesilince marka listesi Opel'de duruyor, Opel dropdown'i Corsa-e'de
 * bitiyordu. Insignia (2.008 ilan), Vectra (2.548), Peugeot, Renault, Toyota,
 * Volkswagen, Volvo — hepsi SESSIZCE kayboluyordu. Katalog artik hiyerarsiden
 * gelir ve taramanin nerede oldugunu yansitmaz.
 *
 * Buradaki iki test farkli sey sinar:
 *   - SENTETIK: kural, veriden bagimsiz olarak dogru mu?
 *   - GERCEK  : yayinlanan veri setinde sessiz dusus SIFIR mi? (J)
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  compareSourceToDemo,
  compareUpstreamToHierarchy,
  coverageFailures,
  upstreamFailures,
  type CoverageDemo,
  type CoverageSourceNode,
} from './demo-coverage';
import { loadArtifact, resolveArtifactPath } from './hierarchy-source';
import { nodeIdFromPath } from './category-path';

const node = (
  id: string,
  name: string,
  parentId: string | null,
  pathSegments: string[],
  totalListingCount = 0,
): CoverageSourceNode => ({
  id,
  name,
  parentId,
  depth: pathSegments.length - 1,
  pathSegments,
  totalListingCount,
});

describe('kapsama kurali', () => {
  const source: CoverageSourceNode[] = [
    node('opel', 'Opel', null, ['Opel'], 2500),
    node('opel/insignia', 'Insignia', 'opel', ['Opel', 'Insignia'], 2008),
    node(
      'opel/insignia/1-6-cdti',
      '1.6 CDTI',
      'opel/insignia',
      ['Opel', 'Insignia', '1.6 CDTI'],
      500,
    ),
    node('opel/corsa', 'Corsa', 'opel', ['Opel', 'Corsa'], 492),
    node(
      'opel/corsa/1-4',
      '1.4',
      'opel/corsa',
      ['Opel', 'Corsa', '1.4'],
      492,
    ),
  ];

  const fullCatalog: CoverageDemo['catalog'] = [
    [
      'opel',
      'Opel',
      2500,
      [
        ['opel/corsa', 'Corsa', 492, [['opel/corsa/1-4', '1.4', 492]]],
        [
          'opel/insignia',
          'Insignia',
          2008,
          [['opel/insignia/1-6-cdti', '1.6 CDTI', 500]],
        ],
      ],
    ],
  ];

  it('fiyati olmayan ama katalogda olan dal DUSUS sayilmaz', () => {
    const report = compareSourceToDemo(source, {
      catalog: fullCatalog,
      // Yalnizca Corsa fiyatlanmis; Insignia'ya tarama henuz gelmemis.
      pools: { 'opel/corsa/1-4': { n: 492, years: { '2015': [] } } },
    });

    expect(report.silentDrops).toEqual([]);
    expect(coverageFailures(report)).toEqual([]);
    expect(report.priceableLeaves).toBe(1);
    expect(report.unpricedLeaves).toEqual(['opel/insignia/1-6-cdti']);
    expect(report.unpricedLeavesWithListings).toEqual([
      'opel/insignia/1-6-cdti',
    ]);
  });

  it('katalogdan dusen dal SESSIZ DUSUS olarak raporlanir', () => {
    const report = compareSourceToDemo(source, {
      // Tarama sirasi Corsa'da kesilmis; Insignia katalogdan da dusmus.
      catalog: [
        [
          'opel',
          'Opel',
          2500,
          [['opel/corsa', 'Corsa', 492, [['opel/corsa/1-4', '1.4', 492]]]],
        ],
      ],
      pools: { 'opel/corsa/1-4': { n: 492, years: { '2015': [] } } },
    });

    expect(report.missingModels).toEqual(['opel/insignia (2008 ilan)']);
    expect(report.missingLeaves).toEqual(['opel/insignia/1-6-cdti (500 ilan)']);
    expect(report.silentDrops).toHaveLength(2);
    expect(coverageFailures(report)).toContain('2 sessiz dusus');
  });

  it('kaynakta olmayan dal katalogda YETIM sayilir', () => {
    const report = compareSourceToDemo(source, {
      catalog: [
        ...fullCatalog,
        ['uydurma', 'Uydurma', 0, [['uydurma/x', 'X', 0]]],
      ],
      pools: {},
    });

    expect(report.orphanCatalogNodes).toEqual(['uydurma', 'uydurma/x']);
    expect(coverageFailures(report)).toContain('2 yetim katalog dugumu');
  });

  it('katalogda karsiligi olmayan fiyat havuzu YETIM sayilir', () => {
    const report = compareSourceToDemo(source, {
      catalog: fullCatalog,
      pools: { 'opel/kadett/1-3': { n: 5, years: { '1990': [] } } },
    });

    expect(report.orphanPools).toEqual(['opel/kadett/1-3']);
    expect(coverageFailures(report)).toContain('1 yetim fiyat havuzu');
  });

  it('ayni etiket yolunu paylasan iki kimlik CAKISMA sayilir', () => {
    const report = compareSourceToDemo(
      [
        node('opel', 'Opel', null, ['Opel']),
        node('opel/corsa', 'Corsa', 'opel', ['Opel', 'Corsa']),
        node('opel/corsa-2', 'Corsa', 'opel', ['Opel', 'Corsa']),
      ],
      {
        catalog: [
          [
            'opel',
            'Opel',
            0,
            [
              ['opel/corsa', 'Corsa', 0],
              ['opel/corsa-2', 'Corsa', 0],
            ],
          ],
        ],
        pools: {},
      },
    );

    expect(report.identityCollisions).toHaveLength(1);
    expect(coverageFailures(report)).toContain('1 kimlik cakismasi');
  });

  /**
   * Kimlik EBEVEYNDEN TURETILEMEZ. "206" ve "206 +" ayni slug'a duser;
   * ikincisi `peugeot/206-2` olur ama cocuklari etiket slug'indan uretildigi
   * icin `peugeot/206/1-4` olarak kalir. Kimligi yol sanip kesen kod bu dali
   * yanlis ebeveyne baglar (olculen: 59 sessiz dusus).
   */
  const source206: CoverageSourceNode[] = [
    node('peugeot', 'Peugeot', null, ['Peugeot']),
    node('peugeot/206', '206 +', 'peugeot', ['Peugeot', '206 +'], 413),
    node('peugeot/206-2', '206', 'peugeot', ['Peugeot', '206'], 1853),
    node(
      'peugeot/206/1-4',
      '1.4',
      'peugeot/206-2',
      ['Peugeot', '206', '1.4'],
      1000,
    ),
    node(
      'peugeot/206/1-4-2',
      '1.4',
      'peugeot/206',
      ['Peugeot', '206 +', '1.4'],
      0,
    ),
  ];

  it('kimligi ebeveyninin oneki olmayan dal dogru dalda kalir', () => {
    const report = compareSourceToDemo(source206, {
      catalog: [
        [
          'peugeot',
          'Peugeot',
          2266,
          [
            ['peugeot/206', '206 +', 413, [['peugeot/206/1-4-2', '1.4', 0]]],
            ['peugeot/206-2', '206', 1853, [['peugeot/206/1-4', '1.4', 1000]]],
          ],
        ],
      ],
      pools: { 'peugeot/206/1-4': { n: 1000, years: { '2005': [] } } },
    });

    // Yeniden ebeveynleme yok: her dugum kaynaktaki dalinda kaldi.
    expect(report.silentDrops).toEqual([]);
    expect(report.labelMismatches).toEqual([]);
    // Yetim torun yok: 1.000 ilanlik "206 1.4" katalogda duruyor.
    expect(report.missingLeaves).toEqual([]);
    expect(report.orphanCatalogNodes).toEqual([]);
    expect(report.orphanPools).toEqual([]);
    // Kimlik cakismasi yok: "206" ile "206 +" ayri etiket yollari.
    expect(report.identityCollisions).toEqual([]);
    expect(report.duplicateIds).toEqual([]);
    expect(report.nonPathShapedIds).toEqual(['peugeot/206/1-4']);
    expect(coverageFailures(report)).toEqual([]);
  });

  /**
   * Kimligi ETIKETTEN yeniden kurmak tam olarak ne kirardi: "Peugeot" + "206"
   * -> `peugeot/206` = "206 +". Yani kullanici "206" secer, fiyat "206 +"
   * havuzundan gelirdi. Bu test o yeniden kurmanin YANLIS oldugunu sabitler.
   */
  it('etiketten kimlik kurmak YANLIS dugume duser', () => {
    const rebuilt = nodeIdFromPath(['Peugeot', '206']);
    expect(rebuilt).toBe('peugeot/206');
    // ...ama `peugeot/206` kaynakta "206 +" dir:
    const plus = source206.find((n) => n.id === 'peugeot/206');
    expect(plus!.name).toBe('206 +');
    // Duz "206" baska bir kimlikte durur; yol birlestirme onu ASLA bulamaz.
    const plain = source206.find((n) => n.name === '206');
    expect(plain!.id).toBe('peugeot/206-2');
    expect(plain!.id).not.toBe(rebuilt);
  });
});

/**
 * ASAMA 0 — KORPUS/DB -> HIYERARSI.
 *
 * Hiyerarsi artefakti YETKILI OLDUGU ICIN degil, TAZE OLDUGU DOGRULANDIGI icin
 * katalogun kaynagidir. "Hiyerarsiye gore sessiz dusus 0" cumlesi, hiyerarsi
 * bayatsa bayat bir olcute gore verilmis olur.
 */
describe('kaynak -> hiyerarsi tazeligi', () => {
  const C = 'C:/korpus/';
  const nodes: CoverageSourceNode[] = [
    node('opel', 'Opel', null, ['Opel'], 500),
    node('opel/corsa', 'Corsa', 'opel', ['Opel', 'Corsa'], 500),
    node('tofas', 'Tofaş', null, ['Tofaş'], 6471),
  ];
  const filesOf = (n: CoverageSourceNode): string[] =>
    ({
      opel: [C + "Opel/Opel Fiyatları & Modelleri sahibinden.com'da.html"],
      'opel/corsa': [
        C + "Opel/Opel Corsa Fiyatları & Modelleri sahibinden.com'da.html",
      ],
      tofas: [C + "Tofas/Tofaş Fiyatları & Modelleri sahibinden.com'da.html"],
    })[n.id] ?? [];
  const allFiles = nodes.flatMap(filesOf);

  it('taze korpusta bulgu yoktur', () => {
    const report = compareUpstreamToHierarchy(nodes, filesOf, {
      corpusFiles: allFiles,
      dbSourceFiles: allFiles,
      dbBrands: ['Opel', 'Tofas'],
      dbListingCount: 6971,
    });
    expect(report.unknownCategoryPages).toEqual([]);
    expect(report.dbSourceFilesMissingFromHierarchy).toEqual([]);
    expect(upstreamFailures(report)).toEqual([]);
  });

  /**
   * Marka eslesmesi SLUG uzerinden yapilmali: hiyerarsi "Tofaş", DB "Tofas"
   * yazar. Ada bakan bir karsilastirma bunu "hiyerarside olmayan marka" diye
   * raporlayip denetimi yanlis yere dusururdu (gercekte yasandi).
   */
  it('Tofaş / Tofas gibi yazim farki eksik marka sayilmaz', () => {
    const report = compareUpstreamToHierarchy(nodes, filesOf, {
      corpusFiles: allFiles,
      dbSourceFiles: allFiles,
      dbBrands: ['Tofas', 'Şahin', 'Citroën'],
      dbListingCount: 1,
    });
    expect(report.dbBrandsMissingFromHierarchy).toEqual(['Şahin', 'Citroën']);
  });

  it('hiyerarsiden SONRA kaydedilen kategori sayfasi bayatlik sayilir', () => {
    const fresh = C + "Opel/Opel Insignia Fiyatları & Modelleri sahibinden.com'da.html";
    const report = compareUpstreamToHierarchy(nodes, filesOf, {
      corpusFiles: [...allFiles, fresh],
      dbSourceFiles: allFiles,
      dbBrands: ['Opel'],
      dbListingCount: 500,
    });
    expect(report.unknownCategoryPages).toEqual([fresh]);
    expect(upstreamFailures(report)[0]).toContain('hierarchy:build');
  });

  it('yan kaynak ve vitrin sayfalari bayatlik sayilmaz', () => {
    const report = compareUpstreamToHierarchy(nodes, filesOf, {
      corpusFiles: [
        ...allFiles,
        C + "Opel/Opel Corsa Fiyatları & Modelleri sahibinden.com'da_files/aframe.html",
        C + "Peugeot/2.El Arabalar ve Satılık Sıfır Km Otomobil Fiyatları sahibinden.com'da.html",
      ],
      dbSourceFiles: allFiles,
      dbBrands: ['Opel'],
      dbListingCount: 500,
    });
    expect(report.unknownCategoryPages).toEqual([]);
    expect(report.ignoredNonCategoryFiles).toBe(2);
    expect(upstreamFailures(report)).toEqual([]);
  });

  it('DB satiri uretmis ama hiyerarsinin tanimadigi sayfa HATADIR', () => {
    const rogue = C + "Opel/Opel Vectra Fiyatları & Modelleri sahibinden.com'da.html";
    const report = compareUpstreamToHierarchy(nodes, filesOf, {
      corpusFiles: [...allFiles, rogue],
      dbSourceFiles: [...allFiles, rogue],
      dbBrands: ['Opel'],
      dbListingCount: 600,
    });
    expect(report.dbSourceFilesMissingFromHierarchy).toEqual([rogue]);
    expect(upstreamFailures(report)).toContain(
      '1 DB sayfasi hiyerarside yok',
    );
  });

  it('korpustan silinen ama hiyerarsinin dayandigi sayfa HATADIR', () => {
    const report = compareUpstreamToHierarchy(nodes, filesOf, {
      corpusFiles: allFiles.slice(1),
      dbSourceFiles: allFiles.slice(1),
      dbBrands: ['Opel'],
      dbListingCount: 500,
    });
    expect(report.hierarchyFilesMissingFromCorpus).toHaveLength(1);
    expect(upstreamFailures(report)).toContain(
      '1 hiyerarsi sayfasi korpusta yok',
    );
  });

  it('korpusta olup DB ye girmemis ilan HATADIR', () => {
    const report = compareUpstreamToHierarchy(nodes, filesOf, {
      corpusFiles: allFiles,
      dbSourceFiles: allFiles,
      dbBrands: ['Opel'],
      dbListingCount: 500,
      corpusListingIdsMissingFromDb: 12,
    });
    expect(upstreamFailures(report)).toContain(
      "12 korpus ilani DB'ye girmemis",
    );
  });
});

/**
 * GERCEK VERI SETI (J). Artefakt uretilen veridir; yoksa test atlanir ve
 * sebebi acikca yazilir — sessizce "gecti" demez.
 */
const demoPath = path.resolve(
  __dirname,
  '../../../frontend/public/demo-market.json',
);
const artifact = fs.existsSync(demoPath)
  ? loadArtifact(resolveArtifactPath())
  : null;
const runOrSkip = artifact ? describe : describe.skip;

if (!artifact) {
  // eslint-disable-next-line no-console
  console.warn(
    '[demo-coverage] demo-market.json veya hiyerarsi artefakti yok; ' +
      '"npx ts-node --transpile-only src/scripts/build_demo_dataset.ts" calistirin.',
  );
}

runOrSkip('yayinlanan demo veri seti', () => {
  const demo = JSON.parse(fs.readFileSync(demoPath, 'utf-8')) as CoverageDemo;
  const report = compareSourceToDemo(
    artifact!.nodes as unknown as CoverageSourceNode[],
    demo,
  );

  it('sessiz dusus SIFIR (J)', () => {
    expect(report.silentDrops).toEqual([]);
  });

  it('her marka, model ve yaprak demoda var', () => {
    expect(report.missingBrands).toEqual([]);
    expect(report.missingModels).toEqual([]);
    expect(report.missingLeaves).toEqual([]);
    expect(report.demoBrands).toBe(report.sourceBrands);
    expect(report.demoModels).toBe(report.sourceModels);
    expect(report.demoLeaves).toBe(report.sourceLeaves);
  });

  it('yetim dugum, yetim havuz, kimlik cakismasi yok', () => {
    expect(coverageFailures(report)).toEqual([]);
  });

  /**
   * Katalog fiyat havuzundan GENIS olmali. Esit olmasi, katalogun yine
   * fiyattan turedigi anlamina gelirdi — duzeltilen hatanin ta kendisi.
   */
  it('katalog fiyat havuzlarindan genistir', () => {
    expect(report.demoLeaves).toBeGreaterThan(report.priceableLeaves);
    expect(report.unpricedLeaves.length).toBeGreaterThan(0);
  });
});
