/**
 * MENU KANITI — DOGRUDAN COCUK, TORUN DEGIL.
 *
 * Canli kosuda kanitlandi (36 sayfa): kaynak, tek cocuklu bir ara seviyeyi
 * atlayip torunlari listeliyor. "Cupra / Leon" menusunde "1.5 eTSI" yok,
 * cl5 sinifli "Impulse, Standart, ..." var; href'ler atlanan seviyeyi tasiyor.
 * Slug uzatmasi tek basina dogrudan cocuk kaniti degildir; kaynagin seviye
 * isareti (li.clN, N = derinlik + 1) de gerekir. Marka adlari kurgusaldir.
 */
import { categoryPage } from '../market-refresh/__fixtures__/structure-page';
import {
  extractBreadcrumbChain,
  extractNavChildren,
  extractOwnPath,
  ownSlugOf,
  splitNavChildren,
} from './nav-children';
import { classifyPage } from './page-classification';

const ZORLU = { label: 'Zorlu', slug: 'zorlu' };
const KARTAL = { label: 'Kartal', slug: 'zorlu-kartal' };
const K16 = { label: '1.6', slug: 'zorlu-kartal-1.6' };

/** Sayfanin kendi derinligi = Otomobil'den sonraki halka sayisi. */
const depthOf = (chain: Array<{ label: string }>) => chain.length;

function split(html: string) {
  const page = classifyPage(html, 'x.html');
  const chain = page.breadcrumb ?? [];
  return splitNavChildren(
    page.navChildren ?? [],
    ownSlugOf(page.ownPath, chain),
    chain.length,
  );
}

describe('SEVIYE ISARETI OKUNUR', () => {
  it('reads the li.clN level next to every link, in both save formats', () => {
    for (const domSave of [false, true]) {
      const html = categoryPage({
        chain: [ZORLU, KARTAL],
        nav: [
          { label: 'Zorlu', slug: 'zorlu', count: 9, level: 2 },
          { label: '1.6', slug: 'zorlu-kartal-1.6', count: 4 },
          { label: 'GL', slug: 'zorlu-kartal-1.6-gl', count: 1, level: 5 },
        ],
        domSave,
      });
      const nav = extractNavChildren(html)!;
      expect(nav.map((c) => [c.slug, c.level])).toEqual([
        ['zorlu', 2],
        ['zorlu-kartal-1.6', 4],
        ['zorlu-kartal-1.6-gl', 5],
      ]);
      expect(nav[1].count).toBe(4);
    }
  });

  it('keeps level null when the source writes no class (legacy tolerance)', () => {
    const html =
      '<div id="searchCategoryContainer"><ul><li><a href="/zorlu-kartal-1.6" title="1.6"><h2>1.6</h2></a></li></ul></div>';
    expect(extractNavChildren(html)).toEqual([
      { slug: 'zorlu-kartal-1.6', label: '1.6', count: null, level: null },
    ]);
  });
});

describe('DOGRUDAN COCUK = ALT SOY + DOGRU SEVIYE', () => {
  it('1) normal case: the engine listed at depth+1 is a direct child', () => {
    const html = categoryPage({
      chain: [ZORLU, KARTAL],
      nav: [{ label: '1.6', slug: 'zorlu-kartal-1.6', count: 4 }],
    });
    const s = split(html);
    expect(s.direct.map((c) => c.label)).toEqual(['1.6']);
    expect(s.deeper).toEqual([]);
    expect(s.inconsistent).toEqual([]);
  });

  it('2) collapsed menu: grandchildren listed under the parent are NOT direct children', () => {
    // Kaynak "1.6" seviyesini atladi: Kartal sayfasi dogrudan GL/LX listeliyor.
    const html = categoryPage({
      chain: [ZORLU, KARTAL],
      nav: [
        {
          label: 'GL',
          slug: 'zorlu-kartal-1.6-gl',
          count: 3,
          level: depthOf([ZORLU, KARTAL]) + 3,
        },
        {
          label: 'LX',
          slug: 'zorlu-kartal-1.6-lx',
          count: 2,
          level: depthOf([ZORLU, KARTAL]) + 3,
        },
      ],
    });
    const s = split(html);
    expect(s.direct).toEqual([]);
    expect(s.deeper.map((c) => c.label)).toEqual(['GL', 'LX']);
    // Torun linkleri yine de kaynagin GERCEK href'ini tasir (atlanan seviye icinde).
    expect(s.deeper.map((c) => c.slug)).toEqual([
      'zorlu-kartal-1.6-gl',
      'zorlu-kartal-1.6-lx',
    ]);
  });

  it('3) the intermediate page itself lists the trims as direct children', () => {
    const html = categoryPage({
      chain: [ZORLU, KARTAL, K16],
      nav: [
        { label: 'GL', slug: 'zorlu-kartal-1.6-gl', count: 3 },
        { label: 'LX', slug: 'zorlu-kartal-1.6-lx', count: 2 },
      ],
    });
    const s = split(html);
    expect(s.direct.map((c) => c.label)).toEqual(['GL', 'LX']);
    expect(s.deeper).toEqual([]);
  });

  it('ancestors and siblings never count, whatever their level says', () => {
    const html = categoryPage({
      chain: [ZORLU, KARTAL],
      nav: [
        { label: 'Zorlu', slug: 'zorlu', count: 9, level: 2 },
        { label: 'Kartal', slug: 'zorlu-kartal', count: 5, level: 3 },
        { label: 'Şahin', slug: 'zorlu-sahin', count: 5, level: 3 },
        { label: 'Kartal Ticari', slug: 'zorlu-kartal-ticari-van', count: 1 },
        { label: '1.6', slug: 'zorlu-kartal-1.6', count: 4 },
      ],
    });
    const s = split(html);
    expect(s.direct.map((c) => c.slug)).toEqual([
      'zorlu-kartal-ticari-van',
      'zorlu-kartal-1.6',
    ]);
    expect(s.deeper).toEqual([]);
  });

  it('a link whose slug says descendant but whose level says ancestor is INCONSISTENT, not direct', () => {
    const html = categoryPage({
      chain: [ZORLU, KARTAL],
      nav: [{ label: '1.6', slug: 'zorlu-kartal-1.6', count: 4, level: 2 }],
    });
    const s = split(html);
    expect(s.direct).toEqual([]);
    expect(s.inconsistent.map((c) => c.slug)).toEqual(['zorlu-kartal-1.6']);
  });

  it('an unleveled descendant link stays a direct child and is counted', () => {
    const nav = [
      { slug: 'zorlu-kartal-1.6', label: '1.6', count: 1, level: null },
    ];
    const s = splitNavChildren(nav, 'zorlu-kartal', 2);
    expect(s.direct).toHaveLength(1);
    expect(s.unleveled).toBe(1);
  });

  it('site root: every make link is a direct child at level 2', () => {
    const html = categoryPage({
      chain: [],
      nav: [
        { label: 'Zorlu', slug: 'zorlu', count: 9 },
        { label: 'Diğer', slug: 'diger', count: 1 },
      ],
    });
    const page = classifyPage(html, 'root.html');
    const s = splitNavChildren(page.navChildren!, '', 0);
    expect(s.direct.map((c) => c.slug)).toEqual(['zorlu', 'diger']);
  });
});

describe('SAYFANIN KENDI YOLU VE BREADCRUMB HREFLERI', () => {
  it('reads the page path and every ancestor href from the breadcrumb, query stripped', () => {
    const html = categoryPage({
      chain: [
        ZORLU,
        KARTAL,
        { label: '1.6', slug: 'zorlu-kartal-1.6?sorting=x' },
        { label: 'GL', slug: 'zorlu-kartal-1.6-gl' },
      ],
      nav: [],
    });
    expect(extractOwnPath(html)).toBe('/zorlu-kartal-1.6-gl');
    expect(extractBreadcrumbChain(html)).toEqual([
      { label: 'Zorlu', path: '/zorlu' },
      { label: 'Kartal', path: '/zorlu-kartal' },
      { label: '1.6', path: '/zorlu-kartal-1.6' },
      { label: 'GL', path: '/zorlu-kartal-1.6-gl' },
    ]);
  });

  it('prefers the breadcrumb href over the label-derived slug for the page itself', () => {
    // Etiket "AMG+" -> "amg" turetir; kaynak "amg-plus" yazar. Href kazanir.
    expect(
      ownSlugOf('/zorlu-kartal-amg-plus', ['Zorlu', 'Kartal', 'AMG+']),
    ).toBe('zorlu-kartal-amg-plus');
    expect(ownSlugOf(null, ['Zorlu', 'Kartal', 'AMG+'])).toBe(
      'zorlu-kartal-amg',
    );
    expect(ownSlugOf('/kategori/otomobil', [])).toBe('');
  });

  it('returns null without a breadcrumb', () => {
    expect(extractOwnPath('<html><body>no crumbs</body></html>')).toBeNull();
    expect(
      extractBreadcrumbChain('<html><body>no crumbs</body></html>'),
    ).toBeNull();
  });
});
