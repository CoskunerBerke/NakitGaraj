/**
 * ILAN COZUMLEYICI SOZLESMELERI.
 *
 * Bu testler tek bir seyi imkansiz kilar: bir ilanin, ustundeki (karisik)
 * kategorinin havuzuna dusmesi ya da yanlis kardese yazilmasi. Hicbir marka
 * adi production mantiginda gecmez; asagidakiler yalnizca fixture'dir.
 */
import { buildHierarchy, HierarchyTree, ObservedCategory } from './hierarchy-tree';
import { resolveListing, isExactEvidence } from './listing-resolver';

/** Kesin yollarla kucuk bir agac kurar (breadcrumb'dan gelmis gibi). */
function treeOf(paths: string[][], terminal: string[][] = paths): HierarchyTree {
  const terminalKeys = new Set(terminal.map((p) => p.join(' ')));
  const observations: ObservedCategory[] = paths.map((p) => ({
    categoryString: p.join(' '),
    listingCount: 1,
    sourceFiles: [`${p.join('-')}.html`],
    pathSegments: p,
    navChildLabels: terminalKeys.has(p.join(' ')) ? [] : null,
  }));
  return buildHierarchy(observations, { knownMakes: [] });
}

function at(tree: HierarchyTree, segments: string[]) {
  const node = [...tree.nodes.values()].find(
    (n) => n.pathSegments.join(' ') === segments.join(' '),
  );
  if (!node) throw new Error(`fixture yolu yok: ${segments.join(' / ')}`);
  return node;
}

describe('AYNI ONEKI PAYLASAN KARDESLER', () => {
  /**
   * KRITIK: "1.6", "1.6 FSI", "1.6 TDI" KARDESTIR. Onek benzerligi yuzunden
   * "1.6 TDI" metnini "1.6" havuzuna yazmak farkli motorlari karistirir.
   */
  const tree = treeOf([
    ['Marka', 'Seri'],
    ['Marka', 'Seri', '1.6'],
    ['Marka', 'Seri', '1.6 FSI'],
    ['Marka', 'Seri', '1.6 TDI'],
    ['Marka', 'Seri', '1.6 TDI', 'Attraction'],
  ]);

  it('en uzun gecerli kardesi secer, kisa onege dusmez', () => {
    const r = resolveListing(tree, at(tree, ['Marka', 'Seri']), '1.6 TDI');
    expect(r.nodeId).toBe(at(tree, ['Marka', 'Seri', '1.6 TDI']).id);
    expect(r.evidence).toBe('ROW_MODEL_EXACT');
  });

  it('daha da derine iner: 1.6 TDI Attraction', () => {
    const r = resolveListing(tree, at(tree, ['Marka', 'Seri']), '1.6 TDI Attraction');
    expect(r.nodeId).toBe(at(tree, ['Marka', 'Seri', '1.6 TDI', 'Attraction']).id);
    expect(r.evidence).toBe('ROW_MODEL_EXACT');
  });

  it('sade "1.6" yine kendi dugumunde kalir', () => {
    const r = resolveListing(tree, at(tree, ['Marka', 'Seri']), '1.6');
    expect(r.nodeId).toBe(at(tree, ['Marka', 'Seri', '1.6']).id);
  });

  it('FSI, TDI havuzuna KARISMAZ', () => {
    const fsi = resolveListing(tree, at(tree, ['Marka', 'Seri']), '1.6 FSI');
    expect(fsi.nodeId).toBe(at(tree, ['Marka', 'Seri', '1.6 FSI']).id);
    expect(fsi.nodeId).not.toBe(at(tree, ['Marka', 'Seri', '1.6 TDI']).id);
    expect(fsi.nodeId).not.toBe(at(tree, ['Marka', 'Seri', '1.6']).id);
  });
});

describe('COK SOZCUKLU ETIKETLER TEK PARCADIR', () => {
  const tree = treeOf([
    ['Marka', 'Cruze'],
    ['Marka', 'Cruze', '1.6'],
    ['Marka', 'Cruze', '1.6', 'LS'],
    ['Marka', 'Cruze', '1.6', 'LS Plus'],
  ]);

  it('"LS Plus" ikiye BOLUNMEZ', () => {
    const r = resolveListing(tree, at(tree, ['Marka', 'Cruze']), '1.6 LS Plus');
    expect(r.nodeId).toBe(at(tree, ['Marka', 'Cruze', '1.6', 'LS Plus']).id);
    expect(r.evidence).toBe('ROW_MODEL_EXACT');
    expect(r.remainder).toBe('');
  });

  it('"LS" kendi dugumunde kalir, Plus havuzuna sizmaz', () => {
    const r = resolveListing(tree, at(tree, ['Marka', 'Cruze']), '1.6 LS');
    expect(r.nodeId).toBe(at(tree, ['Marka', 'Cruze', '1.6', 'LS']).id);
  });
});

describe('SAYFA KENDI ADINI TEKRAR EDEBILIR', () => {
  const tree = treeOf([
    ['Audi', 'A3'],
    ['Audi', 'A3', 'A3 Sportback'],
    ['Audi', 'A3', 'A3 Sportback', '1.4 TFSI'],
  ]);

  it('hucre ustteki seviyeyi tekrar ettiginde dogru iner', () => {
    const r = resolveListing(tree, at(tree, ['Audi', 'A3', 'A3 Sportback']), 'A3 Sportback 1.4 TFSI');
    expect(r.nodeId).toBe(at(tree, ['Audi', 'A3', 'A3 Sportback', '1.4 TFSI']).id);
    expect(r.evidence).toBe('ROW_MODEL_EXACT');
  });

  /**
   * REGRESYON: kendi adini ONCE atmak, cocuk etiketi o adla BASLIYORSA
   * eslesmeyi imkansiz kiliyordu. "A3" dugumunde "A3 Sedan 35 TFSI" metni
   * "Sedan 35 TFSI"ye dusuyor ve "A3 Sedan" cocugu bulunamiyordu (600 gercek
   * ilan cozulemedi). Cocuklar HER ZAMAN once denenir.
   */
  it('cocuk etiketi dugumun adiyla basliyorsa yine de eslesir', () => {
    const t = treeOf([
      ['Audi', 'A3'],
      ['Audi', 'A3', 'A3 Sedan'],
      ['Audi', 'A3', 'A3 Sedan', '35 TFSI'],
      ['Audi', 'A3', 'A3 Sportback'],
    ]);
    const r = resolveListing(t, at(t, ['Audi', 'A3']), 'A3 Sedan 35 TFSI');
    expect(r.nodeId).toBe(at(t, ['Audi', 'A3', 'A3 Sedan', '35 TFSI']).id);
    expect(r.evidence).toBe('ROW_MODEL_EXACT');
    expect(r.remainder).toBe('');
  });

  it('marka sayfasindan cok seviyeli metni cozer', () => {
    const deep = treeOf([
      ['Audi'],
      ['Audi', 'A6'],
      ['Audi', 'A6', 'A6 Sedan'],
      ['Audi', 'A6', 'A6 Sedan', '45 TFSI'],
    ]);
    const r = resolveListing(deep, at(deep, ['Audi']), 'A6 A6 Sedan 45 TFSI');
    expect(r.nodeId).toBe(at(deep, ['Audi', 'A6', 'A6 Sedan', '45 TFSI']).id);
    expect(r.evidence).toBe('ROW_MODEL_EXACT');
  });
});

describe('SAHTE HASSASIYET YAPILMAZ', () => {
  const tree = treeOf([
    ['Marka', 'Seri'],
    ['Marka', 'Seri', '35 TFSI'],
    ['Marka', 'Seri', '35 TFSI', 'Advanced'],
  ]);

  it('agacta olmayan donanim UYDURULMAZ; PARTIAL kalir', () => {
    const r = resolveListing(tree, at(tree, ['Marka', 'Seri']), '35 TFSI S Line');
    expect(r.nodeId).toBe(at(tree, ['Marka', 'Seri', '35 TFSI']).id);
    expect(r.evidence).toBe('PARTIAL');
    expect(r.remainder).toBe('S Line');
    expect(isExactEvidence(r.evidence)).toBe(false);
  });

  it('PARTIAL fiyatlamaya GIRMEZ', () => {
    expect(isExactEvidence('PARTIAL')).toBe(false);
    expect(isExactEvidence('AMBIGUOUS')).toBe(false);
    expect(isExactEvidence('UNRESOLVED')).toBe(false);
    expect(isExactEvidence('ROW_MODEL_EXACT')).toBe(true);
    expect(isExactEvidence('PAGE_EXACT')).toBe(true);
  });

  it('bos model metni sayfanin kendi kimligini birakir', () => {
    const r = resolveListing(tree, at(tree, ['Marka', 'Seri', '35 TFSI']), '');
    expect(r.nodeId).toBe(at(tree, ['Marka', 'Seri', '35 TFSI']).id);
    expect(r.evidence).toBe('PAGE_EXACT');
  });

  it('taninmayan metin UNRESOLVED olur, yakin dugume ZORLANMAZ', () => {
    const r = resolveListing(tree, at(tree, ['Marka', 'Seri']), 'Bilinmeyen Motor');
    expect(r.evidence).toBe('UNRESOLVED');
    expect(isExactEvidence(r.evidence)).toBe(false);
  });
});

describe('SUBSTRING TESADUFU ILE ILERLENMEZ', () => {
  const tree = treeOf([
    ['Marka', 'Seri'],
    ['Marka', 'Seri', 'GT'],
    ['Marka', 'Seri', 'GTI'],
  ]);

  it('"GTI" metni "GT" dugumune dusmez', () => {
    const r = resolveListing(tree, at(tree, ['Marka', 'Seri']), 'GTI');
    expect(r.nodeId).toBe(at(tree, ['Marka', 'Seri', 'GTI']).id);
  });

  it('sozcuk siniri olmadan onek kabul edilmez', () => {
    // "GTX" hicbir cocukla sozcuk sinirinda eslesmez.
    const r = resolveListing(tree, at(tree, ['Marka', 'Seri']), 'GTX');
    expect(r.evidence).toBe('UNRESOLVED');
  });
});
