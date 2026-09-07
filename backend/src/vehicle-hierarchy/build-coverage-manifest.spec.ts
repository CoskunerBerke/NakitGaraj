/**
 * KAPSAMA MANIFESTOSU — kaynak URL onceligi kayipsizdir.
 *
 * Gercek korpusta olculdu: "AMG" ve "AMG+" iki ayri kaynak sayfasidir
 * (/…-amg ve /…-amg-plus). Etiketten turetilen slug '+'yi atar; iki dugum
 * ayni URL'e cozulunce piyasa hedef anlik goruntusu 9 cifti
 * AMBIGUOUS_SOURCE_PATH ile reddediyordu. Marka kurgusaldir.
 */
import { categoryPage } from '../market-refresh/__fixtures__/structure-page';
import { buildCoverage } from './build-coverage-manifest';
import { buildHierarchy, ObservedCategory } from './hierarchy-tree';

describe('coverage manifest source URL precedence', () => {
  const ZORLU = { label: 'Zorlu', slug: 'zorlu' };
  const KARTAL = { label: 'Kartal', slug: 'zorlu-kartal' };
  const GL = { label: 'GL', slug: 'zorlu-kartal-gl' };
  const GL_PLUS = { label: 'GL+', slug: 'zorlu-kartal-gl-plus' };

  const files: Record<string, string> = {
    'C:/corpus/Zorlu/Zorlu Kartal.html': categoryPage({
      chain: [ZORLU, KARTAL],
      nav: [
        { label: 'GL', slug: 'zorlu-kartal-gl', count: 40 },
        { label: 'GL+', slug: 'zorlu-kartal-gl-plus', count: 7 },
        { label: 'Lüks', slug: 'zorlu-kartal-luks', count: 3 },
      ],
    }),
    'C:/corpus/Zorlu/Zorlu Kartal GL.html': categoryPage({ chain: [ZORLU, KARTAL, GL], nav: [] }),
    'C:/corpus/Zorlu/Zorlu Kartal GL+.html': categoryPage({ chain: [ZORLU, KARTAL, GL_PLUS], nav: [] }),
  };
  const read = (file: string) => files[file] ?? null;

  function tree() {
    const observations: ObservedCategory[] = [
      { categoryString: 'Zorlu Kartal', listingCount: 0, sourceFiles: ['C:/corpus/Zorlu/Zorlu Kartal.html'], pathSegments: ['Zorlu', 'Kartal'], navChildLabels: ['GL', 'GL+', 'Lüks'] },
      { categoryString: 'Zorlu Kartal GL', listingCount: 0, sourceFiles: ['C:/corpus/Zorlu/Zorlu Kartal GL.html'], pathSegments: ['Zorlu', 'Kartal', 'GL'], navChildLabels: [] },
      { categoryString: 'Zorlu Kartal GL+', listingCount: 0, sourceFiles: ['C:/corpus/Zorlu/Zorlu Kartal GL+.html'], pathSegments: ['Zorlu', 'Kartal', 'GL+'], navChildLabels: [] },
    ];
    return buildHierarchy(observations, { knownMakes: ['Zorlu'] });
  }

  it('gives "GL" and "GL+" their own distinct source URLs from their own pages', () => {
    const report = buildCoverage(tree(), new Map(), new Set(), read);
    const byPath = new Map(report.nodes.map((n) => [n.fullPath, n]));
    expect(byPath.get('Zorlu / Kartal / GL')).toMatchObject({ categoryUrl: '/zorlu-kartal-gl', urlSource: 'OWN_PAGE_HREF', navDeclaredByParent: true, navResultCount: 40 });
    expect(byPath.get('Zorlu / Kartal / GL+')).toMatchObject({ categoryUrl: '/zorlu-kartal-gl-plus', urlSource: 'OWN_PAGE_HREF', navDeclaredByParent: true, navResultCount: 7 });
    expect(byPath.get('Zorlu / Kartal')).toMatchObject({ urlSource: 'OWN_PAGE_HREF', categoryUrl: '/zorlu-kartal' });
    const urls = report.nodes.map((n) => n.categoryUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('uses the parent menu href keyed by the exact label for a missing page, and derivation only as a last resort', () => {
    const report = buildCoverage(tree(), new Map(), new Set(), read);
    const luks = report.nodes.find((n) => n.fullPath === 'Zorlu / Kartal / Lüks')!;
    expect(luks).toMatchObject({ categoryUrl: '/zorlu-kartal-luks', urlSource: 'NAV_HREF', pageSavedOnDisk: false });
    expect(report.missing.find((m) => m.fullPath.join(' / ') === 'Zorlu / Kartal / Lüks')).toMatchObject({ urlSource: 'NAV_HREF', reason: 'NAV_DECLARED_PAGE_MISSING' });
    const zorlu = report.nodes.find((n) => n.fullPath === 'Zorlu')!;
    expect(zorlu).toMatchObject({ urlSource: 'DERIVED_FROM_PATH', categoryUrl: '/zorlu' });
  });
});
