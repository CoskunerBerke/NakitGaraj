/**
 * KORPUS DEPOSU SOZLESMELERI.
 *
 * Yeni dosya, agac kurucusunun gozunde manuel kayitlardan FARKSIZ olmali;
 * mevcut dosya ASLA ezilmemeli; "mevcut" karari dosya adiyla degil,
 * ayristiricinin sayfayi gercekten okuyabilmesiyle verilmeli.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { categoryPage, loginPage } from '../__fixtures__/structure-page';
import {
  CorpusIndex,
  corpusFileName,
  makeFolderName,
  writeNewCorpusFile,
} from './corpus-store';
import {
  categoryStringFromSourceFile,
  splitMakeAndRest,
} from '../../vehicle-hierarchy/category-path';
import {
  buildHierarchy,
  ObservedCategory,
} from '../../vehicle-hierarchy/hierarchy-tree';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-corpus-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('FILE NAMING MATCHES THE MANUAL CORPUS', () => {
  it('produces the same category string the tree builder reads from manual saves', () => {
    const chain = ['Zorlu', 'Kartal', '1.6 TDI', 'GL Plus'];
    const name = corpusFileName(chain);
    expect(name).toBe(
      "Zorlu Kartal 1.6 TDI GL Plus Fiyatları & Modelleri sahibinden.com'da.html",
    );
    expect(categoryStringFromSourceFile(`C:\\corpus\\Zorlu\\${name}`)).toBe(
      'Zorlu Kartal 1.6 TDI GL Plus',
    );
    expect(splitMakeAndRest('Zorlu Kartal 1.6 TDI GL Plus', ['Zorlu'])).toEqual(
      { make: 'Zorlu', rest: 'Kartal 1.6 TDI GL Plus' },
    );
  });

  it('strips characters Windows refuses but keeps spaces, dots and hyphens', () => {
    expect(
      corpusFileName(['Mercedes-Benz', 'C Serisi', 'C 180 / Coupe: "AMG"?']),
    ).toBe(
      "Mercedes-Benz C Serisi C 180 Coupe AMG Fiyatları & Modelleri sahibinden.com'da.html",
    );
    expect(makeFolderName('DS Automobiles')).toBe('DS Automobiles');
    expect(makeFolderName('Rolls-Royce.')).toBe('Rolls-Royce');
  });

  it('refuses an empty chain', () => {
    expect(() => corpusFileName([])).toThrow();
  });
});

describe('NEVER OVERWRITE', () => {
  it('appends " - N" like Chrome instead of replacing an existing file', () => {
    const dir = path.join(tmpDir, 'Zorlu');
    const first = writeNewCorpusFile(dir, 'a.html', 'one');
    const second = writeNewCorpusFile(dir, 'a.html', 'two');
    const third = writeNewCorpusFile(dir, 'a.html', 'three');
    expect(path.basename(first)).toBe('a.html');
    expect(path.basename(second)).toBe('a - 2.html');
    expect(path.basename(third)).toBe('a - 3.html');
    expect(fs.readFileSync(first, 'utf-8')).toBe('one');
    expect(fs.readdirSync(dir).filter((f) => f.startsWith('.'))).toEqual([]); // gecici dosya kalmaz
  });
});

function indexWith(
  files: Array<{ segments: string[]; folder: string; html: string }>,
): CorpusIndex {
  const byPath = new Map<string, ObservedCategory>();
  for (const f of files) {
    const dir = path.join(tmpDir, f.folder);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(
      dir,
      `${f.segments.join(' ')} ${Date.now()}-${Math.random()}.html`,
    );
    fs.writeFileSync(file, f.html, 'utf-8');
    const key = f.segments.join(' ');
    const existing = byPath.get(key);
    if (existing) existing.sourceFiles.push(file);
    else
      byPath.set(key, {
        categoryString: key,
        listingCount: 0,
        sourceFiles: [file],
        pathSegments: f.segments,
        navChildLabels: [],
      });
  }
  const tree = buildHierarchy([...byPath.values()], {
    knownMakes: ['Zorlu', 'Mercedes-Benz'],
  });
  return new CorpusIndex({ loadTree: () => tree, rootOverride: tmpDir });
}

const zorlu = { label: 'Zorlu', slug: 'zorlu' };
const kartal = { label: 'Kartal', slug: 'zorlu-kartal' };

describe('PRESENCE IS PARSER-VERIFIED', () => {
  it('a node whose only file is a login wall is NOT present', () => {
    const index = indexWith([
      { segments: ['Zorlu'], folder: 'Zorlu', html: loginPage() },
    ]);
    expect(
      index.present({ slug: 'zorlu', expectedPath: ['Zorlu'] }),
    ).toBeNull();
  });

  it('a node with a wall file and a real page is present through the real page', () => {
    const index = indexWith([
      { segments: ['Zorlu'], folder: 'Zorlu', html: loginPage() },
      {
        segments: ['Zorlu'],
        folder: 'Zorlu',
        html: categoryPage({
          chain: [zorlu],
          nav: [{ label: 'Kartal', slug: 'zorlu-kartal', count: 3 }],
        }),
      },
    ]);
    const ev = index.present({ slug: 'zorlu', expectedPath: ['Zorlu'] });
    expect(ev).not.toBeNull();
    expect(ev!.page.status).toBe('CATEGORY_PAGE');
    expect(ev!.page.navChildren!.map((c) => c.label)).toEqual(['Kartal']);
  });

  it('a slug collision with a different path is not "present" when the path is known', () => {
    const index = indexWith([
      {
        segments: ['Zorlu', 'Kartal'],
        folder: 'Zorlu',
        html: categoryPage({ chain: [zorlu, kartal], nav: [] }),
      },
    ]);
    expect(
      index.present({
        slug: 'zorlu-kartal',
        expectedPath: ['Zorlu', 'Kartal +'],
      }),
    ).toBeNull();
    expect(
      index.present({
        slug: 'zorlu-kartal',
        expectedPath: ['Zorlu', 'Kartal'],
      }),
    ).not.toBeNull();
  });

  it('knows the breadcrumb path of a slug from the artifact', () => {
    const index = indexWith([
      {
        segments: ['Zorlu', 'Kartal'],
        folder: 'Zorlu',
        html: categoryPage({ chain: [zorlu, kartal], nav: [] }),
      },
    ]);
    expect(index.knownPath('zorlu-kartal')).toEqual(['Zorlu', 'Kartal']);
    expect(index.knownPath('nope')).toBeNull();
  });
});

describe('MAKE FOLDER FOLLOWS THE EXISTING CORPUS LAYOUT', () => {
  it('reuses the folder the make already lives in even when the label differs', () => {
    const index = indexWith([
      {
        segments: ['Mercedes-Benz', 'C Serisi'],
        folder: 'Mercedes',
        html: categoryPage({
          chain: [
            { label: 'Mercedes-Benz', slug: 'mercedes-benz' },
            { label: 'C Serisi', slug: 'mercedes-benz-c-serisi' },
          ],
          nav: [],
        }),
      },
    ]);
    expect(index.makeFolderFor('Mercedes-Benz')).toBe('Mercedes');
    const saved = index.save(['Mercedes-Benz', 'E Serisi'], '<html></html>');
    expect(path.dirname(saved)).toBe(path.join(tmpDir, 'Mercedes'));
  });

  it('creates a folder from the label for a make the corpus has never seen', () => {
    const index = indexWith([]);
    const saved = index.save(['Yeni Marka', 'Model'], '<html></html>');
    expect(path.dirname(saved)).toBe(path.join(tmpDir, 'Yeni Marka'));
    expect(fs.readFileSync(saved, 'utf-8')).toBe('<html></html>');
  });

  it('a page saved in this run counts as present before the artifact is rebuilt', () => {
    const index = indexWith([]);
    index.save(['Zorlu'], categoryPage({ chain: [zorlu], nav: [] }));
    expect(
      index.present({ slug: 'zorlu', expectedPath: ['Zorlu'] }),
    ).not.toBeNull();
  });
});

describe('SITE ROOT EVIDENCE', () => {
  it('finds the saved showcase page by parsing candidates, not by trusting the file name', () => {
    const dir = path.join(tmpDir, 'Zorlu');
    fs.mkdirSync(dir, { recursive: true });
    // Ayni "vitrin" adiyla bir giris duvari: kanit SAYILMAZ.
    fs.writeFileSync(path.join(dir, "2.El Arabalar ve Satılık Sıfır Km Otomobil Fiyatları sahibinden.com'da - 2.html"), loginPage(), 'utf-8');
    fs.writeFileSync(
      path.join(dir, "2.El Arabalar ve Satılık Sıfır Km Otomobil Fiyatları sahibinden.com'da.html"),
      categoryPage({ chain: [], nav: [{ label: 'Zorlu', slug: 'zorlu', count: 9 }], rows: [{ id: '1', model: 'x' }] }),
      'utf-8',
    );
    const index = new CorpusIndex({ loadTree: () => null, rootOverride: tmpDir });
    const ev = index.present({ slug: 'kategori/otomobil', expectedPath: [] });
    expect(ev).not.toBeNull();
    expect(ev!.page.status).toBe('SHOWCASE_OR_NON_CATEGORY_PAGE');
    expect(ev!.page.navChildren!.map((c) => c.slug)).toEqual(['zorlu']);
  });

  it('reports no site root evidence when only category pages exist', () => {
    const index = indexWith([{ segments: ['Zorlu'], folder: 'Zorlu', html: categoryPage({ chain: [zorlu], nav: [] }) }]);
    expect(index.present({ slug: 'kategori/otomobil', expectedPath: [] })).toBeNull();
  });
});
