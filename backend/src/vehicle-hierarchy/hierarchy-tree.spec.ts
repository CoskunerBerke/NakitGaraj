/**
 * KATEGORI AGACI SOZLESMELERI.
 *
 * Bu testler tek bir seyi imkansiz kilar: kaynaktan gelen bir ARA SEVIYENIN
 * kullanici secim akisindan dusmesi. Derinlik hicbir yerde sabit degildir ve
 * hicbir markaya ozel dal yoktur.
 */
import {
  buildHierarchy,
  enumerateLeafPaths,
  findByPath,
  ObservedCategory,
} from './hierarchy-tree';
import { categoryStringFromSourceFile, splitMakeAndRest } from './category-path';

const MAKES = [
  'Audi',
  'BMW',
  'Mercedes-Benz',
  'Volkswagen',
  'Alfa Romeo',
  'Land Rover',
  'DS Automobiles',
  'Renault',
];

function obs(categoryString: string, listingCount = 10): ObservedCategory {
  return { categoryString, listingCount, sourceFiles: [`${categoryString}.html`] };
}

function build(strings: string[], counts?: Record<string, number>) {
  return buildHierarchy(
    strings.map((s) => obs(s, counts?.[s] ?? 10)),
    { knownMakes: MAKES },
  );
}

// --------------------------------------------------------- ZORUNLU REGRESYON

describe('AUDI A3 ZORUNLU ZINCIRI', () => {
  /** Gercek korpustan: bu dosyalarin hepsi kayitli. */
  const AUDI = [
    'Audi',
    'Audi A3',
    'Audi A3 A3 Hatchback',
    'Audi A3 A3 Sportback',
    'Audi A3 A3 Sportback 35 TFSI',
    'Audi A3 A3 Sportback 35 TFSI Advanced',
    'Audi A3 A3 Sportback 35 TFSI Dynamic',
    'Audi A3 A3 Sportback 1.6 TDI Attraction',
  ];

  it('Advanced yaprağina TAM zincirle ulasir, hicbir seviye atlamadan', () => {
    const tree = build(AUDI);
    const leaf = findByPath(tree, ['Audi', 'A3', 'A3 Sportback', '35 TFSI', 'Advanced']);

    expect(leaf).not.toBeNull();
    expect(leaf!.fullPath).toBe('Audi / A3 / A3 Sportback / 35 TFSI / Advanced');
    expect(leaf!.depth).toBe(4);
    expect(leaf!.isLeaf).toBe(true);
    expect(leaf!.name).toBe('Advanced');
  });

  it('her adimda YALNIZCA secilen dugumun dogrudan cocuklarini verir', () => {
    const tree = build(AUDI);
    const childNames = (segments: string[]) => {
      const node = findByPath(tree, segments)!;
      return node.childIds.map((id) => tree.nodes.get(id)!.name).sort();
    };

    expect(childNames(['Audi'])).toEqual(['A3']);
    expect(childNames(['Audi', 'A3'])).toEqual(['A3 Hatchback', 'A3 Sportback']);
    expect(childNames(['Audi', 'A3', 'A3 Sportback', '35 TFSI'])).toEqual([
      'Advanced',
      'Dynamic',
    ]);
    expect(childNames(['Audi', 'A3', 'A3 Sportback', '35 TFSI', 'Advanced'])).toEqual([]);

    /**
     * "35 TFSI" kendi sayfasi kayitli oldugu icin seviye olarak durur.
     * "1.6 TDI" ise bu fixture'da TEK bir torunla geliyor ve kendi sayfasi yok;
     * seviye UYDURULMAZ. Iki kardes gorulunce turetilmesi asagida ayrica test
     * ediliyor. Tek gozlemden sinir icat etmek, duzeltmeye calistigimiz
     * hatanin ta kendisi olurdu.
     */
    expect(childNames(['Audi', 'A3', 'A3 Sportback'])).toEqual(['1.6 TDI Attraction', '35 TFSI']);
  });

  it('kisayol zincirleri URETMEZ', () => {
    const tree = build(AUDI);
    // Bunlarin hicbiri gecerli bir yol DEGILDIR.
    expect(findByPath(tree, ['Audi', 'A3', '35 TFSI'])).toBeNull();
    expect(findByPath(tree, ['Audi', 'A3', 'Advanced'])).toBeNull();
    expect(findByPath(tree, ['Audi', 'A3 Sportback', 'Advanced'])).toBeNull();
    expect(findByPath(tree, ['Audi', 'A3', 'A3 Sportback', 'Advanced'])).toBeNull();
  });

  it('ara seviye sayfasi kaydedilmemis olsa bile onu kardeslerden TURETIR', () => {
    // "Audi A3 A3 Sportback 1.6 TDI" sayfasi yok; iki kardesi var.
    const tree = build([
      'Audi',
      'Audi A3',
      'Audi A3 A3 Sportback',
      'Audi A3 A3 Sportback 1.6 TDI Attraction',
      'Audi A3 A3 Sportback 1.6 TDI Ambition',
    ]);
    const engine = findByPath(tree, ['Audi', 'A3', 'A3 Sportback', '1.6 TDI']);
    expect(engine).not.toBeNull();
    expect(engine!.derived).toBe(true);
    expect(engine!.isLeaf).toBe(false);
    expect(engine!.childIds).toHaveLength(2);
    expect(findByPath(tree, ['Audi', 'A3', 'A3 Sportback', '1.6 TDI', 'Ambition'])).not.toBeNull();
  });
});

// --------------------------------------------------------------- YAPRAK TANIMI

describe('YAPRAK TANIMI ILAN SAYISI DEGIL, COCUK VARLIGIDIR', () => {
  it('800 ilanli bir dugum cocugu varsa YAPRAK DEGILDIR', () => {
    const tree = build(
      [
        'Audi',
        'Audi A3',
        'Audi A3 A3 Sportback',
        'Audi A3 A3 Sportback 35 TFSI',
        'Audi A3 A3 Sportback 35 TFSI Advanced',
        'Audi A3 A3 Sportback 35 TFSI S line',
      ],
      { 'Audi A3 A3 Sportback 35 TFSI': 800 },
    );

    const engine = findByPath(tree, ['Audi', 'A3', 'A3 Sportback', '35 TFSI'])!;
    expect(engine.ownListingCount).toBe(800);
    expect(engine.hasChildren).toBe(true);
    expect(engine.isLeaf).toBe(false);
  });

  it('cok az ilanli bir dugum cocugu yoksa YAPRAKTIR', () => {
    const tree = build(['Audi', 'Audi A3', 'Audi A3 A3 Cabrio'], {
      'Audi A3 A3 Cabrio': 3,
    });
    const leaf = findByPath(tree, ['Audi', 'A3', 'A3 Cabrio'])!;
    expect(leaf.isLeaf).toBe(true);
    expect(leaf.ownListingCount).toBe(3);
  });
});

// ------------------------------------------------------------ DEGISKEN DERINLIK

describe('DEGISKEN DERINLIK', () => {
  const cases: Array<{ levels: number; path: string[] }> = [
    { levels: 2, path: ['Renault', 'Clio'] },
    { levels: 3, path: ['BMW', '3 Serisi', '320i'] },
    { levels: 4, path: ['BMW', '3 Serisi', '320i', 'M Sport'] },
    { levels: 5, path: ['Audi', 'A3', 'A3 Sportback', '35 TFSI', 'Advanced'] },
    { levels: 6, path: ['Volkswagen', 'Passat', 'Variant', '1.5 TSI', 'Elegance', 'DSG'] },
    {
      levels: 7,
      path: ['Mercedes-Benz', 'C Serisi', 'C 200', 'Coupe', 'AMG', 'Premium', 'Plus'],
    },
  ];

  it.each(cases)('$levels seviyeli agacta yaprağa ulasir', ({ levels, path }) => {
    // Kokten yaprağa her ara seviye gozlenmis kabul edilir.
    const strings = path.map((_, i) => path.slice(0, i + 1).join(' '));
    const tree = build(strings);

    const leaf = findByPath(tree, path);
    expect(leaf).not.toBeNull();
    expect(leaf!.depth).toBe(levels - 1);
    expect(leaf!.isLeaf).toBe(true);

    // Her ara seviye ERISILEBILIR ve cocugunu gosteriyor.
    for (let i = 0; i < path.length - 1; i += 1) {
      const node = findByPath(tree, path.slice(0, i + 1))!;
      expect(node.hasChildren).toBe(true);
      expect(node.childIds).toContain(findByPath(tree, path.slice(0, i + 2))!.id);
    }
  });
});

// ------------------------------------------------------------- MARKAYA OZEL YOK

describe('COZUM GENERIC: MARKAYA OZEL DAL YOK', () => {
  it('ayni mekanizma her markada calisir', () => {
    const tree = build([
      'BMW',
      'BMW 3 Serisi',
      'BMW 3 Serisi 320i',
      'BMW 3 Serisi 320i M Sport',
      'Mercedes-Benz',
      'Mercedes-Benz C Serisi',
      'Mercedes-Benz C Serisi C 200',
      'Volkswagen',
      'Volkswagen Golf',
      'Volkswagen Golf 1.6 TDI',
    ]);

    expect(findByPath(tree, ['BMW', '3 Serisi', '320i', 'M Sport'])!.isLeaf).toBe(true);
    expect(findByPath(tree, ['Mercedes-Benz', 'C Serisi', 'C 200'])!.isLeaf).toBe(true);
    expect(findByPath(tree, ['Volkswagen', 'Golf', '1.6 TDI'])!.isLeaf).toBe(true);
  });

  it('cok sozcuklu marka adlarini ikiye bolmez', () => {
    expect(splitMakeAndRest('Alfa Romeo Giulietta 1.6 JTD', MAKES)).toEqual({
      make: 'Alfa Romeo',
      rest: 'Giulietta 1.6 JTD',
    });
    expect(splitMakeAndRest('Land Rover Range Rover Evoque', MAKES)).toEqual({
      make: 'Land Rover',
      rest: 'Range Rover Evoque',
    });

    const tree = build(['Alfa Romeo', 'Alfa Romeo Giulietta', 'Alfa Romeo Giulietta 1.6 JTD']);
    expect(tree.rootIds.map((id) => tree.nodes.get(id)!.name)).toEqual(['Alfa Romeo']);
    expect(findByPath(tree, ['Alfa Romeo', 'Giulietta', '1.6 JTD'])!.isLeaf).toBe(true);
  });

  it('marka olarak cozulemeyen dizeyi agaca ALMAZ, uydurma kok uretmez', () => {
    const tree = build(['Audi A3', 'Bilinmeyen Marka XYZ 1.4']);
    expect(tree.unresolved).toEqual(['Bilinmeyen Marka XYZ 1.4']);
    expect(tree.rootIds).toHaveLength(1);
  });
});

// ------------------------------------------------------------- KIMLIK TAM YOL

describe('KIMLIK TAM YOLDUR, SON ISIM DEGIL', () => {
  it('ayni paket adi farkli araclarda AYRI dugumdur', () => {
    const tree = build([
      'Audi',
      'Audi A3',
      'Audi A3 A3 Sportback',
      'Audi A3 A3 Sportback 35 TFSI',
      'Audi A3 A3 Sportback 35 TFSI Advanced',
      'Audi A4',
      'Audi A4 A4 Sedan',
      'Audi A4 A4 Sedan 40 TDI',
      'Audi A4 A4 Sedan 40 TDI Advanced',
    ]);

    const a3 = findByPath(tree, ['Audi', 'A3', 'A3 Sportback', '35 TFSI', 'Advanced'])!;
    const a4 = findByPath(tree, ['Audi', 'A4', 'A4 Sedan', '40 TDI', 'Advanced'])!;

    expect(a3.name).toBe('Advanced');
    expect(a4.name).toBe('Advanced');
    expect(a3.id).not.toBe(a4.id);
    expect(a3.fullPath).toBe('Audi / A3 / A3 Sportback / 35 TFSI / Advanced');
    expect(a4.fullPath).toBe('Audi / A4 / A4 Sedan / 40 TDI / Advanced');
  });
});

// -------------------------------------------------------------- DOSYA ADI PARSE

describe('KAYNAK DOSYA ADINDAN KATEGORI', () => {
  it('gercek dosya adindan kategori dizesini cikarir', () => {
    expect(
      categoryStringFromSourceFile(
        "C:\\x\\Audi\\Audi A3 A3 Sportback 35 TFSI Advanced Fiyatları & Modelleri sahibinden.com'da - 3.html",
      ),
    ).toBe('Audi A3 A3 Sportback 35 TFSI Advanced');
  });

  it('kopya numarasini ve uzantiyi temizler', () => {
    expect(
      categoryStringFromSourceFile("Audi TT Fiyatları & Modelleri sahibinden.com'da - 2.html"),
    ).toBe('Audi TT');
  });

  it('kategori tasimayan vitrin sayfasini eler', () => {
    expect(
      categoryStringFromSourceFile("2.El Arabalar ve Satılık Sıfır Km Otomobil Fiyatları.html"),
    ).toBe('');
  });
});

// ------------------------------------------------------- TUM AGAC ERISILEBILIR

describe('TUM YAPRAKLAR KOKTEN ERISILEBILIR', () => {
  it('her yaprak yolu kokten adim adim yurunebilir', () => {
    const tree = build([
      'Audi',
      'Audi A3',
      'Audi A3 A3 Sportback',
      'Audi A3 A3 Sportback 35 TFSI',
      'Audi A3 A3 Sportback 35 TFSI Advanced',
      'BMW',
      'BMW 3 Serisi',
      'BMW 3 Serisi 320i',
    ]);

    const paths = enumerateLeafPaths(tree);
    expect(paths.length).toBeGreaterThan(0);

    for (const segments of paths) {
      let cursor = findByPath(tree, [segments[0]]);
      expect(cursor).not.toBeNull();
      for (let i = 1; i < segments.length; i += 1) {
        const childId = cursor!.childIds.find(
          (id) => tree.nodes.get(id)!.name === segments[i],
        );
        expect(childId).toBeDefined();
        cursor = tree.nodes.get(childId!)!;
      }
      expect(cursor!.isLeaf).toBe(true);
    }
  });

  it('ara dugumlerin hicbiri cocuksuz kalmaz', () => {
    const tree = build([
      'Audi',
      'Audi A3',
      'Audi A3 A3 Sportback',
      'Audi A3 A3 Sportback 35 TFSI Advanced',
    ]);
    for (const node of tree.nodes.values()) {
      if (!node.isLeaf) expect(node.childIds.length).toBeGreaterThan(0);
      if (node.isLeaf) expect(node.childIds).toHaveLength(0);
    }
  });
});
