import { categoryStringFromSourceFile } from './category-path';
import { findByPath, buildHierarchy, ObservedCategory } from './hierarchy-tree';
import {
  HierarchyEvidenceConflict,
  reconcileDirectNavPaths,
} from './nav-path-reconciler';

describe('direct-nav path reconciliation', () => {
  it('preserves hyphenated model names while removing spaced copy suffixes', () => {
    expect(
      categoryStringFromSourceFile(
        String.raw`C:\corpus\Saab\Saab 9-5 Fiyatları & Modelleri sahibinden.com'da.html`,
      ),
    ).toBe('Saab 9-5');

    expect(
      categoryStringFromSourceFile(
        String.raw`C:\corpus\Saab\Saab 9-5 Fiyatları & Modelleri sahibinden.com'da - 3.html`,
      ),
    ).toBe('Saab 9-5');

    expect(
      categoryStringFromSourceFile(
        String.raw`C:\corpus\Saab\Saab 9-3 Fiyatları & Modelleri sahibinden.com'da.html`,
      ),
    ).toBe('Saab 9-3');
  });

  it('promotes a flat child observation to the exact parent direct-nav path', () => {
    const observations: ObservedCategory[] = [
      {
        categoryString: 'Seat Ibiza',
        listingCount: 0,
        sourceFiles: ['seat-ibiza.html'],
        pathSegments: ['Seat', 'Ibiza'],
        navChildLabels: ['1.6', '1.6 TDI'],
      },
      {
        categoryString: 'Seat Ibiza 1.6 TDI',
        listingCount: 22,
        sourceFiles: ['seat-ibiza-1.6-tdi.html'],
        navChildLabels: null,
      },
    ];

    const reconciled = reconcileDirectNavPaths(observations);
    const child = reconciled.find(
      (o) =>
        o.categoryString === 'Seat Ibiza 1.6 TDI' &&
        o.pathSegments?.join('/') === 'Seat/Ibiza/1.6 TDI',
    );
    expect(child?.pathSegments).toEqual(['Seat', 'Ibiza', '1.6 TDI']);
    expect(child?.listingCount).toBe(22);
    expect(child?.sourceFiles).toEqual(['seat-ibiza-1.6-tdi.html']);

    const tree = buildHierarchy(reconciled, { knownMakes: ['Seat'] });
    expect(findByPath(tree, ['Seat', 'Ibiza', '1.6 TDI'])).not.toBeNull();
    // Regression: the flat fallback must not create a shortcut node.
    expect(findByPath(tree, ['Seat', 'Ibiza 1.6 TDI'])).toBeNull();
  });

  it('restores a missing intermediate engine level before trim rows', () => {
    const observations: ObservedCategory[] = [
      {
        categoryString: 'Saab 9-5',
        listingCount: 0,
        sourceFiles: ['saab-9-5.html'],
        pathSegments: ['Saab', '9-5'],
        navChildLabels: ['1.6 T'],
      },
      {
        categoryString: 'Saab 9-5 1.6 T Linear',
        listingCount: 1,
        sourceFiles: ['linear.html'],
        pathSegments: ['Saab', '9-5', '1.6 T', 'Linear'],
        navChildLabels: [],
      },
    ];

    const reconciled = reconcileDirectNavPaths(observations);
    const tree = buildHierarchy(reconciled, { knownMakes: ['Saab'] });

    const engine = findByPath(tree, ['Saab', '9-5', '1.6 T']);
    const trim = findByPath(tree, ['Saab', '9-5', '1.6 T', 'Linear']);
    expect(engine).not.toBeNull();
    expect(trim).not.toBeNull();
    expect(trim?.parentId).toBe(engine?.id);
    expect(findByPath(tree, ['Saab', '9-5', '1.6 T Linear'])).toBeNull();
  });

  it('keeps the same flat categoryString when it names two different exact paths', () => {
    /**
     * Gercek korpus regresyonu: dosya adi Joy ile bitse de sayfanin kendi
     * breadcrumb'i motor seviyesinde bitebilir. Listing discovery ise ayni duz
     * dizeyle gercek Joy cocugunu bulur. categoryString kimlik olmadigi icin iki
     * exact kanit birlikte yasamalidir.
     */
    const observations: ObservedCategory[] = [
      {
        categoryString: 'Renault Symbol 1.0 TCe Joy',
        listingCount: 12,
        sourceFiles: ['engine-page-saved-as-joy.html'],
        pathSegments: ['Renault', 'Symbol', '1.0 TCe'],
        navChildLabels: null,
      },
      {
        categoryString: 'Renault Symbol 1.0 TCe Joy',
        listingCount: 0,
        sourceFiles: [],
        pathSegments: ['Renault', 'Symbol', '1.0 TCe', 'Joy'],
      },
    ];

    const reconciled = reconcileDirectNavPaths(observations);
    expect(
      reconciled.filter((o) => o.categoryString === 'Renault Symbol 1.0 TCe Joy'),
    ).toHaveLength(2);

    const tree = buildHierarchy(reconciled, { knownMakes: ['Renault'] });
    const engine = findByPath(tree, ['Renault', 'Symbol', '1.0 TCe']);
    const joy = findByPath(tree, ['Renault', 'Symbol', '1.0 TCe', 'Joy']);
    expect(engine).not.toBeNull();
    expect(joy).not.toBeNull();
    expect(joy?.parentId).toBe(engine?.id);
  });

  it('fails closed when the same source file claims two exact breadcrumb paths', () => {
    const observations: ObservedCategory[] = [
      {
        categoryString: 'Seat Ibiza 1.6 TDI',
        listingCount: 22,
        sourceFiles: ['same-source.html'],
        pathSegments: ['Seat', 'Ibiza', '1.6 TDI'],
        navChildLabels: [],
      },
      {
        categoryString: 'Seat Ibiza 1.6 TDI',
        listingCount: 22,
        sourceFiles: ['same-source.html'],
        pathSegments: ['Seat', 'Leon', '1.6 TDI'],
        navChildLabels: [],
      },
    ];

    expect(() => reconcileDirectNavPaths(observations)).toThrow(HierarchyEvidenceConflict);
    expect(() => reconcileDirectNavPaths(observations)).toThrow(/PATH_CONFLICT/);
  });
});
