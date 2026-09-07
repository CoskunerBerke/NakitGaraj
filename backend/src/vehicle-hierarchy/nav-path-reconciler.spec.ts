import { categoryStringFromSourceFile } from './category-path';
import { findByPath, buildHierarchy, ObservedCategory } from './hierarchy-tree';
import { auditHierarchy } from './hierarchy-audit';
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

  it('collapses case-only sibling aliases under the source-backed breadcrumb casing', () => {
    /**
     * Gercek korpus regresyonu: listing discovery `Fiat / UNO` uretti,
     * kaydedilmis kategori sayfasi ise `Fiat / Uno` breadcrumb'ini tasidi.
     * Bunlar iki kardes degildir; audit de ayni isimli kardesleri sert hata
     * sayar. Source-backed casing kazanir, source'suz child kaniti korunur.
     */
    const observations: ObservedCategory[] = [
      {
        categoryString: 'Fiat Uno',
        listingCount: 0,
        sourceFiles: ['fiat-uno.html'],
        pathSegments: ['Fiat', 'Uno'],
        navChildLabels: ['60 S'],
      },
      {
        categoryString: 'Fiat UNO',
        listingCount: 0,
        sourceFiles: [],
        pathSegments: ['Fiat', 'UNO'],
      },
      {
        categoryString: 'Fiat UNO 45 S',
        listingCount: 0,
        sourceFiles: [],
        pathSegments: ['Fiat', 'UNO', '45 S'],
      },
    ];

    const reconciled = reconcileDirectNavPaths(observations);
    expect(
      reconciled.find((o) => o.categoryString === 'Fiat UNO')?.pathSegments,
    ).toEqual(['Fiat', 'Uno']);
    expect(
      reconciled.find((o) => o.categoryString === 'Fiat UNO 45 S')?.pathSegments,
    ).toEqual(['Fiat', 'Uno', '45 S']);

    const tree = buildHierarchy(reconciled, { knownMakes: ['Fiat'] });
    const fiat = findByPath(tree, ['Fiat'])!;
    const unoChildren = fiat.childIds
      .map((id) => tree.nodes.get(id)!)
      .filter((node) => node.name.toLocaleLowerCase('tr') === 'uno');

    expect(unoChildren).toHaveLength(1);
    expect(unoChildren[0].name).toBe('Uno');
    expect(findByPath(tree, ['Fiat', 'Uno', '45 S'])).not.toBeNull();
    expect(auditHierarchy(tree).findings.filter((f) => f.kind === 'DUPLICATE_CHILD_NAME')).toEqual([]);
  });

  it('lets the exact parent page casing outrank descendant breadcrumb prefixes', () => {
    /**
     * Gercek Fiat/Uno gate regresyonu. Dosya sirasi child-first olabilir:
     * derin sayfa prefix olarak `UNO` tasirken parent'in kendi sayfasi `Uno`
     * tasiyor. Parent own-page exact breadcrumb kanonik olmali; ilk gorulen
     * descendant prefix casing'i kazanamamali.
     */
    const observations: ObservedCategory[] = [
      {
        categoryString: 'Fiat UNO 60 S',
        listingCount: 5,
        sourceFiles: ['fiat-uno-60-s.html'],
        pathSegments: ['Fiat', 'UNO', '60 S'],
        navChildLabels: [],
      },
      {
        categoryString: 'Fiat Uno',
        listingCount: 0,
        sourceFiles: ['fiat-uno.html'],
        pathSegments: ['Fiat', 'Uno'],
        navChildLabels: ['60 S'],
      },
      {
        categoryString: 'Fiat UNO 45 S',
        listingCount: 0,
        sourceFiles: [],
        pathSegments: ['Fiat', 'UNO', '45 S'],
      },
    ];

    const reconciled = reconcileDirectNavPaths(observations);
    expect(
      reconciled.find((o) => o.categoryString === 'Fiat UNO 60 S')?.pathSegments,
    ).toEqual(['Fiat', 'Uno', '60 S']);
    expect(
      reconciled.find((o) => o.categoryString === 'Fiat UNO 45 S')?.pathSegments,
    ).toEqual(['Fiat', 'Uno', '45 S']);

    const tree = buildHierarchy(reconciled, { knownMakes: ['Fiat'] });
    expect(findByPath(tree, ['Fiat', 'Uno'])).not.toBeNull();
    expect(findByPath(tree, ['Fiat', 'Uno', '60 S'])).not.toBeNull();
    expect(findByPath(tree, ['Fiat', 'UNO'])).toBeNull();
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

/**
 * ESDEGERLIK KILIDI — dizinli uygulama, eski dogrusal-tarama uygulamasiyla
 * AYNI ciktiyi (ayni sira, ayni birlestirme, ayni terfi, ayni celiski)
 * vermelidir. Eski algoritma burada sozcugu sozcugune sakli tutulur: uretim
 * kodu hizlanirken kural degisirse bu test onu yakalar.
 */
describe('indexed reconciliation is equivalent to the linear-scan reference', () => {
  function foldedPathKey(segments: string[]): string {
    return segments.map((s) => String(s).trim().toLocaleLowerCase('tr')).join('\u0000');
  }
  function samePathFolded(a: string[], b: string[]): boolean {
    return a.length === b.length && foldedPathKey(a) === foldedPathKey(b);
  }
  function sameIdentity(a: ObservedCategory, b: ObservedCategory): boolean {
    if (a.categoryString !== b.categoryString) return false;
    const aExact = Boolean(a.pathSegments && a.pathSegments.length > 0);
    const bExact = Boolean(b.pathSegments && b.pathSegments.length > 0);
    if (aExact !== bExact) return false;
    if (!aExact && !bExact) return true;
    return samePathFolded(a.pathSegments!, b.pathSegments!);
  }
  function sameLabelSet(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const l = [...a].sort();
    const r = [...b].sort();
    return l.every((x, i) => x === r[i]);
  }
  function referenceReconcile(observations: ObservedCategory[]): ObservedCategory[] {
    const reconciled: ObservedCategory[] = [];
    for (const raw of observations) {
      const current: ObservedCategory = {
        ...raw,
        sourceFiles: [...(raw.sourceFiles || [])],
        pathSegments: raw.pathSegments ? [...raw.pathSegments] : raw.pathSegments,
        navChildLabels: Array.isArray(raw.navChildLabels) ? [...raw.navChildLabels] : raw.navChildLabels,
      };
      if (current.pathSegments && current.pathSegments.length > 0 && current.sourceFiles.length > 0) {
        const incomingFiles = new Set(current.sourceFiles);
        for (const candidate of reconciled) {
          if (!candidate.pathSegments || candidate.pathSegments.length === 0) continue;
          if (samePathFolded(candidate.pathSegments, current.pathSegments)) continue;
          const shared = candidate.sourceFiles.find((f) => incomingFiles.has(f));
          if (!shared) continue;
          throw new HierarchyEvidenceConflict(`PATH_CONFLICT for source "${shared}"`);
        }
      }
      const existing = reconciled.find((c) => sameIdentity(c, current));
      if (existing) {
        const tn = existing.navChildLabels;
        const inn = current.navChildLabels;
        if (Array.isArray(tn) && Array.isArray(inn) && !sameLabelSet(tn, inn)) {
          throw new HierarchyEvidenceConflict('NAV_CONFLICT');
        }
        if (!Array.isArray(tn) && Array.isArray(inn)) existing.navChildLabels = [...inn];
        else if (tn === undefined && inn === null) existing.navChildLabels = null;
        if (
          current.sourceFiles.length > 0 &&
          current.pathSegments?.length &&
          existing.pathSegments?.length &&
          samePathFolded(existing.pathSegments, current.pathSegments)
        ) {
          existing.pathSegments = [...current.pathSegments];
        }
        existing.listingCount = Math.max(existing.listingCount, current.listingCount);
        existing.sourceFiles = [...new Set([...existing.sourceFiles, ...current.sourceFiles])];
      } else reconciled.push(current);
    }
    const parents = [...reconciled];
    for (const parent of parents) {
      if (!parent.pathSegments || !Array.isArray(parent.navChildLabels)) continue;
      for (const rawLabel of parent.navChildLabels) {
        const label = String(rawLabel || '').trim();
        if (!label) continue;
        const categoryString = `${parent.categoryString} ${label}`.replace(/\s+/g, ' ').trim();
        const exactPath = [...parent.pathSegments, label];
        const exact = reconciled.find(
          (o) => o.categoryString === categoryString && o.pathSegments && samePathFolded(o.pathSegments, exactPath),
        );
        if (exact) continue;
        const flat = reconciled.find(
          (o) => o.categoryString === categoryString && (!o.pathSegments || o.pathSegments.length === 0),
        );
        if (flat) {
          flat.pathSegments = exactPath;
          continue;
        }
        reconciled.push({ categoryString, listingCount: 0, sourceFiles: [], pathSegments: exactPath });
      }
    }
    // case canonicalization (identical copy of production helper semantics)
    const ownExact = new Map<string, string[]>();
    const descendantPrefixes = new Map<string, string[]>();
    for (const o of reconciled) {
      if (!o.pathSegments?.length || o.sourceFiles.length === 0) continue;
      const ownKey = foldedPathKey(o.pathSegments);
      if (!ownExact.has(ownKey)) ownExact.set(ownKey, [...o.pathSegments]);
      for (let length = 1; length < o.pathSegments.length; length += 1) {
        const prefix = o.pathSegments.slice(0, length);
        const key = foldedPathKey(prefix);
        if (!descendantPrefixes.has(key)) descendantPrefixes.set(key, prefix);
      }
    }
    for (const o of reconciled) {
      if (!o.pathSegments?.length) continue;
      const original = [...o.pathSegments];
      const normalized: string[] = [];
      for (let length = 1; length <= original.length; length += 1) {
        const key = foldedPathKey(original.slice(0, length));
        const canonical = ownExact.get(key) ?? descendantPrefixes.get(key);
        normalized.push(canonical ? canonical[length - 1] : original[length - 1]);
      }
      o.pathSegments = normalized;
    }
    return reconciled;
  }

  /** Deterministic PRNG so failures reproduce. */
  function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  function randomCorpus(seed: number, size: number): ObservedCategory[] {
    const rand = rng(seed);
    const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];
    const makes = ['Zorlu', 'Yalin', 'Deniz'];
    const models = ['Kartal', 'Şahin', 'Doğan', 'Uno', 'UNO'];
    const engines = ['1.6', '1.6 TDI', '2.0', '1.4 TFSI'];
    const trims = ['GL', 'Plus', 'Comfort', 'S Line'];
    const out: ObservedCategory[] = [];
    for (let i = 0; i < size; i += 1) {
      const depth = 1 + Math.floor(rand() * 4);
      const segments = [pick(makes), pick(models), pick(engines), pick(trims)].slice(0, depth);
      const exact = rand() < 0.7;
      const withFiles = rand() < 0.6;
      // Files mostly belong to their own path; rare cross-path sharing exercises PATH_CONFLICT.
      const fileKey = rand() < 0.97 ? segments.join('-').toLocaleLowerCase('tr') : `shared-${Math.floor(rand() * 5)}`;
      const files = withFiles ? [`${fileKey}-${Math.floor(rand() * 3)}.html`] : [];
      // Nav evidence is a deterministic function of the path so merges usually
      // agree; rare noise exercises NAV_CONFLICT.
      const hash = [...segments.join('')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
      const stableLabel = [...engines, ...trims][hash % (engines.length + trims.length)];
      const choice = rand() < 0.98 ? hash % 4 : Math.floor(rand() * 4);
      const navChildLabels =
        choice === 0 ? undefined : choice === 1 ? null : choice === 2 ? [] : [stableLabel];
      out.push({
        categoryString: segments.join(' '),
        listingCount: Math.floor(rand() * 50),
        sourceFiles: files,
        pathSegments: exact ? segments : undefined,
        navChildLabels,
      });
    }
    return out;
  }

  it('produces identical output or the identical conflict class across randomized corpora', () => {
    let compared = 0;
    let conflicts = 0;
    for (let seed = 1; seed <= 150; seed += 1) {
      const input = randomCorpus(seed, 40 + (seed % 60));
      let expected: ObservedCategory[] | null = null;
      let expectedError: Error | null = null;
      try {
        expected = referenceReconcile(input);
      } catch (error) {
        expectedError = error as Error;
      }
      let actual: ObservedCategory[] | null = null;
      let actualError: Error | null = null;
      try {
        actual = reconcileDirectNavPaths(input);
      } catch (error) {
        actualError = error as Error;
      }
      if (expectedError || actualError) {
        conflicts += 1;
        expect(actualError?.name).toBe(expectedError?.name);
        expect(String(actualError?.message).split(' for ')[0]).toBe(
          String(expectedError?.message).split(' for ')[0],
        );
        continue;
      }
      compared += 1;
      expect(actual).toEqual(expected);
    }
    expect(compared).toBeGreaterThan(50);
    expect(conflicts).toBeGreaterThan(0);
  });

  it('stays linear: a corpus-sized input reconciles in well under a second', () => {
    const input = randomCorpus(7, 9000);
    const started = Date.now();
    try {
      reconcileDirectNavPaths(input);
    } catch (error) {
      if (!(error instanceof HierarchyEvidenceConflict)) throw error;
    }
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
