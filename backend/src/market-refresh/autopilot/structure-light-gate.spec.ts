/**
 * HAFIF YAPI KAPISI — bellek ici denetim, gercek markadan bagimsiz.
 * Bulgular hedef tablosundan uretilir; hicbir dosya okunmaz.
 */
import { runLightStructureGate } from './structure-light-gate';
import { SITE_ROOT, StructureTarget } from './structure-session';

function target(overrides: Partial<StructureTarget> & { key: string }): StructureTarget {
  const slug = overrides.key.replace(/^\//, '');
  return {
    slug,
    label: overrides.label ?? slug,
    expectedPath: null,
    make: null,
    depth: null,
    parentKey: null,
    origin: 'NAV',
    status: 'COMPLETE',
    outcome: 'SAVED',
    attempts: 1,
    savedFile: `C:/corpus/${slug}.html`,
    evidenceFile: null,
    breadcrumb: null,
    childrenDeclared: 0,
    deeperDeclared: 0,
    terminal: true,
    navResultCount: null,
    lastError: null,
    updatedAt: '2026-09-07T00:00:00.000Z',
    ...overrides,
  };
}

const now = () => Date.parse('2026-09-07T00:00:00.000Z');

function validWave(): StructureTarget[] {
  return [
    target({ key: SITE_ROOT, breadcrumb: [], depth: 0, savedFile: null, outcome: 'SAVED' }),
    target({
      key: '/zorlu',
      parentKey: SITE_ROOT,
      breadcrumb: ['Zorlu'],
      make: 'Zorlu',
      depth: 1,
      ownPath: '/zorlu',
      childrenDeclared: 2,
      terminal: false,
    }),
    target({
      key: '/zorlu-kartal',
      parentKey: '/zorlu',
      breadcrumb: ['Zorlu', 'Kartal'],
      make: 'Zorlu',
      depth: 2,
      ownPath: '/zorlu-kartal',
      childrenDeclared: 1,
      terminal: false,
    }),
    // Kaynak menusu ara seviyeyi atladi: torun, atanin altinda daha derin bir zincirle.
    target({
      key: '/zorlu-kartal-1.6-gl',
      parentKey: '/zorlu-kartal',
      breadcrumb: ['Zorlu', 'Kartal', '1.6', 'GL'],
      make: 'Zorlu',
      depth: 4,
      ownPath: '/zorlu-kartal-1.6-gl',
    }),
    // Korpustan karsilanan hedef: kaydedilmis dosya yok, kanit dosyasi var.
    target({
      key: '/zorlu-sahin',
      parentKey: '/zorlu',
      outcome: 'ALREADY_PRESENT',
      savedFile: null,
      evidenceFile: 'C:/corpus/Zorlu/Zorlu Şahin.html',
      breadcrumb: ['Zorlu', 'Şahin'],
      make: 'Zorlu',
      depth: 2,
      ownPath: '/zorlu-sahin',
      childrenDeclared: 0,
      terminal: true,
    }),
    // Kuyrukta bekleyen ve basarisiz olan hedefler denetlenmez (kaydedilmedi).
    target({ key: '/zorlu-dogan', parentKey: '/zorlu', status: 'PENDING', outcome: null, savedFile: null }),
    target({
      key: '/zorlu-dogan-1.6',
      parentKey: '/zorlu-dogan',
      status: 'FAILED',
      outcome: 'REDIRECT_MISMATCH',
      savedFile: null,
    }),
  ];
}

describe('light structure gate', () => {
  it('passes a valid wave including collapsed-menu descendants and corpus-satisfied targets', () => {
    const report = runLightStructureGate({ targets: validWave(), siteRootKey: SITE_ROOT, waveSize: 4, now });
    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
    expect(report.targetsChecked).toBe(5);
    expect(report.waveSize).toBe(4);
  });

  it('catches a wrong parent: a saved chain that does not extend its parent chain', () => {
    const targets = validWave();
    const kartal = targets.find((t) => t.key === '/zorlu-kartal')!;
    kartal.breadcrumb = ['Zorlu', 'Şahin', 'Kartal'];
    kartal.depth = 3;
    const report = runLightStructureGate({ targets, siteRootKey: SITE_ROOT, waveSize: 1, now });
    expect(report.ok).toBe(false);
    expect(report.findings.map((f) => f.kind)).toContain('WRONG_PARENT');
    expect(report.findings.find((f) => f.kind === 'WRONG_PARENT')?.key).toBe('/zorlu-kartal-1.6-gl');
  });

  it('catches conflicting exact evidence: two source URLs owning the same exact path', () => {
    const targets = validWave();
    targets.push(
      target({
        key: '/zorlu-kartal-kartal',
        parentKey: '/zorlu',
        breadcrumb: ['Zorlu', 'Kartal'],
        make: 'Zorlu',
        depth: 2,
        ownPath: '/zorlu-kartal-kartal',
        childrenDeclared: 1,
        terminal: false,
      }),
    );
    const report = runLightStructureGate({ targets, siteRootKey: SITE_ROOT, waveSize: 1, now });
    expect(report.ok).toBe(false);
    const finding = report.findings.find((f) => f.kind === 'DUPLICATE_EXACT_PATH');
    expect(finding?.key).toBe('/zorlu-kartal-kartal');
    expect(finding?.detail).toContain('/zorlu-kartal');
  });

  it('catches a page that declares another own URL than the requested key', () => {
    const targets = validWave();
    const present = targets.find((t) => t.key === '/zorlu-sahin')!;
    present.ownPath = '/zorlu-sahin-eski';
    const report = runLightStructureGate({ targets, siteRootKey: SITE_ROOT, waveSize: 1, now });
    expect(report.ok).toBe(false);
    expect(report.findings.map((f) => f.kind)).toEqual(['OWN_PATH_MISMATCH']);
  });

  it('catches a slug that does not descend from its parent and a terminal page declaring children', () => {
    const targets = validWave();
    const gl = targets.find((t) => t.key === '/zorlu-kartal-1.6-gl')!;
    gl.slug = 'zorlu-sahin-1.6-gl';
    const sahin = targets.find((t) => t.key === '/zorlu-sahin')!;
    sahin.outcome = 'SAVED';
    sahin.savedFile = 'C:/corpus/sahin.html';
    sahin.terminal = true;
    sahin.childrenDeclared = 2;
    const report = runLightStructureGate({ targets, siteRootKey: SITE_ROOT, waveSize: 2, now });
    expect(report.findings.map((f) => f.kind).sort()).toEqual(['NAV_INCONSISTENT', 'NOT_DESCENDANT_SLUG']);
  });

  it('reports blocked targets, missing breadcrumbs, depth/make mismatches and shared saved files', () => {
    const targets = validWave();
    targets.push(target({ key: '/zorlu-blok', status: 'BLOCKED', outcome: 'UNKNOWN_FORMAT', savedFile: null }));
    targets.push(target({ key: '/zorlu-bos', parentKey: '/zorlu', breadcrumb: null, savedFile: 'C:/corpus/x.html' }));
    const kartal = targets.find((t) => t.key === '/zorlu-kartal')!;
    kartal.depth = 5;
    kartal.make = 'Yalin';
    const gl = targets.find((t) => t.key === '/zorlu-kartal-1.6-gl')!;
    gl.savedFile = kartal.savedFile;
    const report = runLightStructureGate({ targets, siteRootKey: SITE_ROOT, waveSize: 3, now });
    const kinds = report.findings.map((f) => f.kind);
    expect(kinds).toContain('BLOCKED_TARGET');
    expect(kinds).toContain('BAD_BREADCRUMB');
    expect(kinds).toContain('CONFLICTING_SOURCE');
    expect(report.findings.filter((f) => f.kind === 'BAD_BREADCRUMB').length).toBe(3);
  });

  it('ignores legacy targets without an own path and tolerates casing differences against the parent chain', () => {
    const targets = validWave();
    for (const t of targets) delete t.ownPath;
    const gl = targets.find((t) => t.key === '/zorlu-kartal-1.6-gl')!;
    gl.breadcrumb = ['Zorlu', 'KARTAL', '1.6', 'GL'];
    const report = runLightStructureGate({ targets, siteRootKey: SITE_ROOT, waveSize: 0, now });
    expect(report.ok).toBe(true);
  });
});
