/**
 * YAPI TOPLAYICISI — GUVENLIK, TAMLIK VE YERLESTIRME SOZLESMELERI.
 *
 * Burada imkansiz kilinan seyler:
 *   - yonlendirilmis sayfayi "toplandi" diye korpusa yazmak
 *   - zaten diskte olan kategoriyi yeniden istemek
 *   - giris/2FA/engel sayfasinda devam etmek
 *   - ayristiricinin anlamadigi bicimde toplamaya devam etmek
 *   - kesintiden sonra kopya hedef uretmek
 *   - ust/kardes/sayfalama baglantisini cocuk sanmak
 *   - herhangi bir gercek markaya ya da sabit derinlige dayanmak
 *
 * Marka KURGUSALDIR ("Zorlu"): ayristirici ve toplayici yalnizca sayfanin
 * kendi breadcrumb'ine ve menusune bakar.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AtomicChecksummedFile } from '../checkpoint-store';
import {
  categoryPage,
  loginPage,
  twoFactorPage,
  accessBlockPage,
  unknownPage,
} from '../__fixtures__/structure-page';
import {
  AutopilotProtocolError,
  CapturePageDirective,
  PageCapture,
} from './autopilot-contracts';
import { CorpusIndex } from './corpus-store';
import { RebuildResult, RebuildRunner } from './rebuild-runner';
import {
  MAX_ATTEMPTS,
  MAX_CONSECUTIVE_FAILURES,
  SITE_ROOT,
  StructureCheckpointPayload,
  StructureSession,
  StructureSessionOptions,
  isRetryableLegacyBreadcrumbMismatch,
  isSafeRefinement,
} from './structure-session';
import {
  buildHierarchy,
  HierarchyTree,
  ObservedCategory,
} from '../../vehicle-hierarchy/hierarchy-tree';
import { categoryStringFromSourceFile } from '../../vehicle-hierarchy/category-path';
import { classifyPage } from '../../vehicle-hierarchy/page-classification';

const BASE_URL = 'https://www.sahibinden.com/';
const RUN_ID = 'structure-test';

// ------------------------------------------------------------- kurgusal kaynak

const ZORLU = { label: 'Zorlu', slug: 'zorlu' };
const KARTAL = { label: 'Kartal', slug: 'zorlu-kartal' };
const SAHIN = { label: 'Şahin', slug: 'zorlu-sahin' };
const DOGAN = { label: 'Doğan', slug: 'zorlu-dogan' };
const KARTAL_16 = { label: '1.6', slug: 'zorlu-kartal-1.6' };
const KARTAL_16_GL = { label: 'GL', slug: 'zorlu-kartal-1.6-gl' };
const KARTAL_20 = { label: '2.0 TDI', slug: 'zorlu-kartal-2.0-tdi' };
const DOGAN_16 = { label: '1.6', slug: 'zorlu-dogan-1.6' };
const DOGAN_16_COMFORT = { label: 'Comfort', slug: 'zorlu-dogan-1.6-comfort' };
const DOGAN_16_COMFORT_PLUS = {
  label: 'Plus',
  slug: 'zorlu-dogan-1.6-comfort-plus',
};

/** Marka sayfasi: ustler ve kardes marka da menude durur (gercekte oldugu gibi). */
const makePage = (domSave = false) =>
  categoryPage({
    chain: [ZORLU],
    nav: [
      { label: 'Otomobil', slug: 'kategori/otomobil' },
      { label: 'Zorlu', slug: 'zorlu', count: 900 },
      { label: 'Kartal', slug: 'zorlu-kartal', count: 500 },
      { label: 'Şahin', slug: 'zorlu-sahin', count: 300 },
      { label: 'Doğan', slug: 'zorlu-dogan', count: 100 },
      { label: 'Diğer Marka', slug: 'diger-marka', count: 5 },
      { label: 'Zorlu Ticari', slug: 'zorlu-ticari-kamyonet', count: 3 },
    ],
    rows: [{ id: '1001', model: 'Kartal 1.6 GL' }],
    domSave,
  });

const kartalPage = () =>
  categoryPage({
    chain: [ZORLU, KARTAL],
    nav: [
      { label: 'Zorlu', slug: 'zorlu', count: 900 },
      { label: 'Kartal', slug: 'zorlu-kartal', count: 500 },
      { label: '1.6', slug: 'zorlu-kartal-1.6', count: 400 },
      { label: '2.0 TDI', slug: 'zorlu-kartal-2.0-tdi', count: 100 },
      { label: 'Şahin', slug: 'zorlu-sahin', count: 300 },
    ],
    rows: [{ id: '1002', model: '1.6 GL' }],
  });

const kartal16Page = () =>
  categoryPage({
    chain: [ZORLU, KARTAL, KARTAL_16],
    nav: [{ label: 'GL', slug: 'zorlu-kartal-1.6-gl', count: 400 }],
  });

const kartal16GlPage = () =>
  categoryPage({ chain: [ZORLU, KARTAL, KARTAL_16, KARTAL_16_GL], nav: [] });
const kartal20Page = () =>
  categoryPage({ chain: [ZORLU, KARTAL, KARTAL_20], nav: [] });
/** Terminal at depth 2: no engines at all. */
const sahinPage = () =>
  categoryPage({
    chain: [ZORLU, SAHIN],
    nav: [],
    rows: [{ id: '2001', model: 'Şahin' }],
  });
const doganPage = () =>
  categoryPage({
    chain: [ZORLU, DOGAN],
    nav: [{ label: '1.6', slug: 'zorlu-dogan-1.6', count: 100 }],
  });
const dogan16Page = () =>
  categoryPage({
    chain: [ZORLU, DOGAN, DOGAN_16],
    nav: [{ label: 'Comfort', slug: 'zorlu-dogan-1.6-comfort', count: 100 }],
  });
const dogan16ComfortPage = () =>
  categoryPage({
    chain: [ZORLU, DOGAN, DOGAN_16, DOGAN_16_COMFORT],
    nav: [{ label: 'Plus', slug: 'zorlu-dogan-1.6-comfort-plus', count: 40 }],
  });
const dogan16ComfortPlusPage = () =>
  categoryPage({
    chain: [ZORLU, DOGAN, DOGAN_16, DOGAN_16_COMFORT, DOGAN_16_COMFORT_PLUS],
    nav: [],
  });

const siteRootPage = () =>
  categoryPage({
    chain: [],
    nav: [
      { label: 'Zorlu', slug: 'zorlu', count: 900 },
      { label: 'Diğer Marka', slug: 'diger-marka', count: 5 },
    ],
    rows: [{ id: '1', model: 'Zorlu Kartal' }],
  });

// ------------------------------------------------------------------- harness

let tmpDir: string;
let corpusDir: string;
let runDir: string;
let clock: number;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-structure-'));
  corpusDir = path.join(tmpDir, 'corpus');
  runDir = path.join(tmpDir, 'run');
  fs.mkdirSync(corpusDir, { recursive: true });
  clock = Date.parse('2026-09-04T02:00:00.000Z');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Mevcut korpus: dosyalar diske yazilir, agac gercek kurucuyla kurulur. */
function corpusWith(
  files: Array<{
    chain: Array<{ label: string }>;
    html: string;
    folder?: string;
  }>,
): CorpusIndex {
  const observations: ObservedCategory[] = [];
  for (const entry of files) {
    const segments = entry.chain.map((c) => c.label);
    const folder = entry.folder ?? segments[0];
    const dir = path.join(corpusDir, folder);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(
      dir,
      `${segments.join(' ')} Fiyatları & Modelleri sahibinden.com'da.html`,
    );
    fs.writeFileSync(file, entry.html, 'utf-8');
    observations.push({
      categoryString: segments.join(' '),
      listingCount: 0,
      sourceFiles: [file],
      pathSegments: segments,
      navChildLabels: [],
    });
  }
  const tree: HierarchyTree = buildHierarchy(observations, {
    knownMakes: ['Zorlu'],
  });
  return new CorpusIndex({ loadTree: () => tree, rootOverride: corpusDir });
}

const emptyCorpus = () =>
  new CorpusIndex({ loadTree: () => null, rootOverride: corpusDir });

function options(
  overrides: Partial<StructureSessionOptions> = {},
  corpus?: CorpusIndex,
): StructureSessionOptions {
  return {
    runId: RUN_ID,
    source: 'sahibinden',
    baseUrl: BASE_URL,
    checkpointFile: new AtomicChecksummedFile<StructureCheckpointPayload>(
      path.join(runDir, 'checkpoint.json'),
    ),
    corpus: corpus ?? emptyCorpus(),
    runDir,
    maxPages: null,
    rebuildEvery: 0,
    rebuild: null,
    paceMs: 5000,
    jitter: 0.4,
    now: () => clock,
    random: () => 0.5,
    ...overrides,
  };
}

function expectCapture(
  session: StructureSession,
  key: string,
): CapturePageDirective {
  const directive = session.nextDirective();
  expect(directive.type).toBe('CAPTURE_PAGE');
  const capture = directive as CapturePageDirective;
  expect(capture.targetKey).toBe(key);
  return capture;
}

function submit(
  session: StructureSession,
  directive: CapturePageDirective,
  html: string,
  finalUrl?: string,
) {
  const capture: PageCapture = {
    runId: RUN_ID,
    targetKey: directive.targetKey,
    finalUrl: finalUrl ?? directive.url,
    title: 'x',
    html,
  };
  return session.submitPageCapture(capture);
}

const pending = (s: StructureSession) =>
  s
    .targetsView()
    .filter((t) => t.status === 'PENDING')
    .map((t) => t.key);

// --------------------------------------------------------------------- START

describe('START', () => {
  it('queues the site root by default and writes a checkpoint', () => {
    const opts = options();
    const session = StructureSession.start(opts, [SITE_ROOT]);
    expect(session.currentState).toBe('RUNNING');
    expect(session.targetsView()).toHaveLength(1);
    expect(session.targetsView()[0]).toMatchObject({
      key: SITE_ROOT,
      origin: 'ROOT',
      expectedPath: [],
    });
    expect(opts.checkpointFile.exists()).toBe(true);
    expect(fs.existsSync(path.join(runDir, 'report.json'))).toBe(true);
  });

  it('refuses to start without roots', () => {
    expect(() => StructureSession.start(options(), [])).toThrow(
      AutopilotProtocolError,
    );
  });

  it("takes a root's expected breadcrumb from the corpus when the node is known", () => {
    const corpus = corpusWith([{ chain: [ZORLU, KARTAL], html: kartalPage() }]);
    const session = StructureSession.start(options({}, corpus), [
      '/zorlu-kartal',
    ]);
    expect(session.targetsView()[0]).toMatchObject({
      expectedPath: ['Zorlu', 'Kartal'],
      make: 'Zorlu',
      depth: 2,
    });
  });

  it('starting again with an existing checkpoint RESUMES instead of duplicating targets', () => {
    const opts = options();
    const a = StructureSession.start(opts, ['/zorlu']);
    const d = expectCapture(a, '/zorlu');
    submit(a, d, makePage());
    expect(a.targetsView()).toHaveLength(5); // kok + 4 dogrudan cocuk

    const b = StructureSession.start(options(), ['/zorlu']);
    expect(b.targetsView()).toHaveLength(5);
    expect(b.status().pagesSaved).toBe(1);
  });
});

// ------------------------------------------------------- ozyineli kesif

describe('RECURSIVE DISCOVERY', () => {
  it('reads the make page with the corpus parser and queues only its DIRECT children', () => {
    const session = StructureSession.start(options(), ['/zorlu']);
    const d = expectCapture(session, '/zorlu');
    expect(d.url).toBe('https://www.sahibinden.com/zorlu');

    const result = submit(session, d, makePage());
    expect(result.outcome).toBe('SAVED');
    expect(result.breadcrumb).toEqual(['Zorlu']);
    // Kardes marka, ust kategori, sayfanin kendisi ve "zorlu-ticari" (segment sinirini
    // bozmayan ama alt soy olan) — yalnizca gercek alt soy kalir.
    expect(pending(session)).toEqual([
      '/zorlu-kartal',
      '/zorlu-sahin',
      '/zorlu-dogan',
      '/zorlu-ticari-kamyonet',
    ]);
    const kartal = session
      .targetsView()
      .find((t) => t.key === '/zorlu-kartal')!;
    expect(kartal).toMatchObject({
      expectedPath: ['Zorlu', 'Kartal'],
      make: 'Zorlu',
      depth: 2,
      parentKey: '/zorlu',
      origin: 'NAV',
      navResultCount: 500,
    });
  });

  it('grows the queue dynamically from each newly saved page (variable depth, no fixed levels)', () => {
    const session = StructureSession.start(options(), ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), makePage());
    submit(session, expectCapture(session, '/zorlu-kartal'), kartalPage());
    // Kartal'in motorlari kuyruga eklendi; kuyruk buyudu.
    expect(pending(session)).toEqual([
      '/zorlu-sahin',
      '/zorlu-dogan',
      '/zorlu-ticari-kamyonet',
      '/zorlu-kartal-1.6',
      '/zorlu-kartal-2.0-tdi',
    ]);

    const sahin = submit(
      session,
      expectCapture(session, '/zorlu-sahin'),
      sahinPage(),
    );
    expect(sahin.terminal).toBe(true); // derinlik 2'de biter
    expect(sahin.childrenDeclared).toBe(0);

    submit(session, expectCapture(session, '/zorlu-dogan'), doganPage());
    submit(
      session,
      expectCapture(session, '/zorlu-ticari-kamyonet'),
      categoryPage({
        chain: [
          ZORLU,
          { label: 'Zorlu Ticari', slug: 'zorlu-ticari-kamyonet' },
        ],
        nav: [],
      }),
    );
    submit(
      session,
      expectCapture(session, '/zorlu-kartal-1.6'),
      kartal16Page(),
    );
    submit(
      session,
      expectCapture(session, '/zorlu-kartal-2.0-tdi'),
      kartal20Page(),
    );
    submit(session, expectCapture(session, '/zorlu-dogan-1.6'), dogan16Page());
    submit(
      session,
      expectCapture(session, '/zorlu-kartal-1.6-gl'),
      kartal16GlPage(),
    );
    submit(
      session,
      expectCapture(session, '/zorlu-dogan-1.6-comfort'),
      dogan16ComfortPage(),
    );
    const plus = submit(
      session,
      expectCapture(session, '/zorlu-dogan-1.6-comfort-plus'),
      dogan16ComfortPlusPage(),
    );
    expect(plus.terminal).toBe(true); // derinlik 5'te biter

    const halt = session.nextDirective();
    expect(halt.type).toBe('HALT');
    expect((halt as any).state).toBe('COMPLETE');
    expect(session.isRunComplete()).toBe(true);
    const depths = session.targetsView().map((t) => t.depth);
    expect(Math.max(...(depths as number[]))).toBe(5);
    expect(session.status().newTerminalNodes).toBe(5);
  });

  it('expands the site root into makes without a hardcoded make list', () => {
    const session = StructureSession.start(options(), [SITE_ROOT]);
    const d = expectCapture(session, SITE_ROOT);
    const result = submit(session, d, siteRootPage());
    expect(result.outcome).toBe('SAVED');
    expect(pending(session)).toEqual(['/zorlu', '/diger-marka']);
    expect(session.targetsView().find((t) => t.key === '/zorlu')).toMatchObject(
      { expectedPath: ['Zorlu'], make: 'Zorlu', depth: 1 },
    );
    // Kok sayfa arac kategorisi degildir: korpusa DEGIL kanit dizinine yazilir.
    expect(fs.readdirSync(corpusDir)).toEqual([]);
    expect(result.savedFile).toContain(path.join('evidence', 'site-root'));
  });

  it('never queues the same category twice even when two pages declare it', () => {
    const session = StructureSession.start(options(), ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), makePage());
    // Kartal sayfasi kardesi Şahin'i de listeler; Şahin zaten kuyrukta.
    const result = submit(
      session,
      expectCapture(session, '/zorlu-kartal'),
      kartalPage(),
    );
    expect(result.childrenEnqueued).toBe(2);
    expect(pending(session).filter((k) => k === '/zorlu-sahin')).toHaveLength(
      1,
    );
    expect(
      session.targetsView().filter((t) => t.key === '/zorlu-sahin'),
    ).toHaveLength(1);
  });

  it('reads the Chrome live-DOM save format the same way as the server format', () => {
    const session = StructureSession.start(options(), ['/zorlu']);
    const result = submit(
      session,
      expectCapture(session, '/zorlu'),
      makePage(true),
    );
    expect(result.outcome).toBe('SAVED');
    expect(pending(session)).toEqual([
      '/zorlu-kartal',
      '/zorlu-sahin',
      '/zorlu-dogan',
      '/zorlu-ticari-kamyonet',
    ]);
  });
});

// ------------------------------------------------------------ mevcut korpus

describe('EXISTING CORPUS FIRST', () => {
  it('does not fetch a category whose page is already readable on disk, but still expands its children', () => {
    const corpus = corpusWith([
      { chain: [ZORLU], html: makePage() },
      { chain: [ZORLU, KARTAL], html: kartalPage() },
    ]);
    const session = StructureSession.start(options({}, corpus), ['/zorlu']);
    // Kok mevcut -> istek yok; cocuklari diskten acildi; Kartal da mevcut -> onun cocuklari da.
    const d = expectCapture(session, '/zorlu-sahin');
    expect(d.type).toBe('CAPTURE_PAGE');
    const view = session.targetsView();
    expect(view.find((t) => t.key === '/zorlu')).toMatchObject({
      status: 'COMPLETE',
      outcome: 'ALREADY_PRESENT',
    });
    expect(view.find((t) => t.key === '/zorlu-kartal')).toMatchObject({
      status: 'COMPLETE',
      outcome: 'ALREADY_PRESENT',
    });
    expect(view.find((t) => t.key === '/zorlu')!.evidenceFile).toContain(
      'Zorlu Fiyatları',
    );
    expect(pending(session)).toEqual([
      '/zorlu-dogan',
      '/zorlu-ticari-kamyonet',
      '/zorlu-kartal-1.6',
      '/zorlu-kartal-2.0-tdi',
    ]);
    expect(session.status().alreadyPresent).toBe(2);
    expect(session.status().attempted).toBe(0);
  });

  it('treats a category whose only file is a login wall as MISSING', () => {
    const corpus = corpusWith([{ chain: [ZORLU], html: loginPage() }]);
    const session = StructureSession.start(options({}, corpus), ['/zorlu']);
    expectCapture(session, '/zorlu');
  });

  it('scanCorpus opens the queue against the corpus without issuing a single fetch (dry run)', () => {
    const corpus = corpusWith([
      { chain: [ZORLU], html: makePage() },
      { chain: [ZORLU, SAHIN], html: sahinPage() },
    ]);
    const session = StructureSession.start(options({}, corpus), ['/zorlu']);
    const scan = session.scanCorpus();
    expect(scan).toEqual({ present: 2, missing: 3 });
    expect(pending(session)).toEqual([
      '/zorlu-kartal',
      '/zorlu-dogan',
      '/zorlu-ticari-kamyonet',
    ]);
    expect(session.status().attempted).toBe(0);
  });
});

// ------------------------------------------------------------- korpusa yazma

describe('RAW PAGE SAVE', () => {
  it('writes the page unchanged under the make folder with the corpus naming convention', () => {
    const session = StructureSession.start(options(), ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), makePage());
    const result = submit(
      session,
      expectCapture(session, '/zorlu-kartal'),
      kartalPage(),
    );
    const file = result.savedFile!;
    expect(path.dirname(file)).toBe(path.join(corpusDir, 'Zorlu'));
    expect(path.basename(file)).toBe(
      "Zorlu Kartal Fiyatları & Modelleri sahibinden.com'da.html",
    );
    expect(fs.readFileSync(file, 'utf-8')).toBe(kartalPage());
    // Agac kurucusunun dosya adindan cikardigi kategori dizesi: manuel kayitlarla ayni.
    expect(categoryStringFromSourceFile(file)).toBe('Zorlu Kartal');
  });

  it('sanitizes labels that Windows cannot hold in a file name', () => {
    const session = StructureSession.start(options(), ['/zorlu']);
    const page = categoryPage({
      chain: [ZORLU, { label: 'Kartal / GT: S', slug: 'zorlu-kartal-gt-s' }],
      nav: [],
    });
    submit(
      session,
      expectCapture(session, '/zorlu'),
      categoryPage({
        chain: [ZORLU],
        nav: [{ label: 'Kartal / GT: S', slug: 'zorlu-kartal-gt-s', count: 1 }],
      }),
    );
    const result = submit(
      session,
      expectCapture(session, '/zorlu-kartal-gt-s'),
      page,
    );
    expect(path.basename(result.savedFile!)).toBe(
      "Zorlu Kartal GT S Fiyatları & Modelleri sahibinden.com'da.html",
    );
  });

  it('never overwrites an existing corpus file', () => {
    const existing = path.join(
      corpusDir,
      'Zorlu',
      "Zorlu Fiyatları & Modelleri sahibinden.com'da.html",
    );
    fs.mkdirSync(path.dirname(existing), { recursive: true });
    fs.writeFileSync(existing, loginPage(), 'utf-8'); // ayni ad, ama duvar sayfasi: mevcut sayilmaz
    const session = StructureSession.start(options(), ['/zorlu']);
    const result = submit(
      session,
      expectCapture(session, '/zorlu'),
      makePage(),
    );
    expect(path.basename(result.savedFile!)).toBe(
      "Zorlu Fiyatları & Modelleri sahibinden.com'da - 2.html",
    );
    expect(fs.readFileSync(existing, 'utf-8')).toBe(loginPage());
  });
});

// --------------------------------------------------------- yonlendirme

describe('REDIRECT MISMATCH IS NOT SUCCESS', () => {
  it('rejects a page that declares itself as the parent category and keeps it out of the corpus', () => {
    const session = StructureSession.start(options(), ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), makePage());
    const d = expectCapture(session, '/zorlu-kartal');
    const result = submit(
      session,
      d,
      makePage(),
      'https://www.sahibinden.com/zorlu',
    );
    expect(result.outcome).toBe('REDIRECT_MISMATCH');
    expect(result.savedFile).toBeNull();
    expect(
      session.targetsView().find((t) => t.key === '/zorlu-kartal'),
    ).toMatchObject({ status: 'FAILED', outcome: 'REDIRECT_MISMATCH' });
    expect(fs.readdirSync(path.join(corpusDir, 'Zorlu'))).toHaveLength(1);
    expect(
      fs.readdirSync(path.join(runDir, 'evidence', 'mismatch')),
    ).toHaveLength(1);
    expect(session.currentState).toBe('RUNNING');
    // Kosu surer, ama sonunda TAM sayilmaz.
    expect(session.status().redirectMismatch).toBe(1);
  });

  it('rejects a page at the right URL whose breadcrumb labels differ from the parent menu', () => {
    const session = StructureSession.start(options(), ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), makePage());
    const d = expectCapture(session, '/zorlu-kartal');
    const renamed = categoryPage({
      chain: [ZORLU, { label: 'Kartal Yeni', slug: 'zorlu-kartal' }],
      nav: [],
    });
    expect(submit(session, d, renamed).outcome).toBe('REDIRECT_MISMATCH');
  });

  it('stops the run after too many consecutive failures', () => {
    const session = StructureSession.start(options(), ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), makePage());
    const keys = [
      '/zorlu-kartal',
      '/zorlu-sahin',
      '/zorlu-dogan',
      '/zorlu-ticari-kamyonet',
    ];
    let last: any = null;
    for (
      let i = 0;
      i < Math.min(keys.length, MAX_CONSECUTIVE_FAILURES);
      i += 1
    ) {
      last = submit(session, expectCapture(session, keys[i]), makePage());
    }
    // 4 hedef var, tavan 5: kosu henuz durmaz ama INCOMPLETE ile biter.
    expect(last.paused).toBe(false);
    expect((session.nextDirective() as any).state).toBe('INCOMPLETE');
  });
});

// --------------------------------------------------------- guvenlik/giris

describe('FAIL CLOSED ON SECURITY PAGES', () => {
  it.each([
    ['login', loginPage(), 'LOGIN_REQUIRED'],
    ['two-factor', twoFactorPage(), 'TWO_FACTOR_REQUIRED'],
    ['access block', accessBlockPage(), 'ACCESS_RESTRICTED'],
  ])(
    'pauses on a %s page, keeps the target, and resumes it after manual intervention',
    (_n, html, outcome) => {
      const opts = options();
      const session = StructureSession.start(opts, ['/zorlu']);
      const d = expectCapture(session, '/zorlu');
      const result = submit(session, d, html);
      expect(result.outcome).toBe(outcome);
      expect(result.paused).toBe(true);
      expect(session.currentState).toBe('ACCESS_RESTRICTED');
      expect(session.nextDirective().type).toBe('HALT');
      expect(session.targetsView()[0].status).toBe('PENDING');
      expect(
        fs.readdirSync(path.join(runDir, 'evidence', 'security')),
      ).toHaveLength(1);
      expect(fs.existsSync(corpusDir) ? fs.readdirSync(corpusDir) : []).toEqual(
        [],
      );

      const resumed = StructureSession.resume(options());
      expect(resumed.currentState).toBe('RUNNING');
      expectCapture(resumed, '/zorlu');
    },
  );

  it('pauses when the extension reports a DOM-level access restriction', () => {
    const session = StructureSession.start(options(), ['/zorlu']);
    expectCapture(session, '/zorlu');
    session.reportAccessRestricted({
      runId: RUN_ID,
      nodePath: '/zorlu',
      kind: 'CAPTCHA',
      evidence: 'Press & Hold',
    });
    expect(session.currentState).toBe('ACCESS_RESTRICTED');
    expect(session.status().pauseReason).toContain('CAPTCHA');
    expect(session.targetsView()[0].status).toBe('PENDING');
  });
});

// ------------------------------------------------ bilinmeyen bicim

describe('AUTOMATION NEVER OUTRUNS THE PARSER', () => {
  it('stops on a page the parser cannot read and quarantines it outside the corpus', () => {
    const session = StructureSession.start(options(), ['/zorlu']);
    const d = expectCapture(session, '/zorlu');
    const result = submit(
      session,
      d,
      categoryPage({ chain: [ZORLU], omitNav: true }),
    );
    expect(result.outcome).toBe('UNKNOWN_FORMAT');
    expect(result.pageStatus).toBe('UNKNOWN_DATA_FORMAT');
    expect(session.currentState).toBe('ERROR');
    expect(session.status().pauseReason).toContain('UNKNOWN_FORMAT');
    expect(session.targetsView()[0].status).toBe('BLOCKED');
    expect(
      fs.readdirSync(path.join(runDir, 'evidence', 'quarantine')),
    ).toHaveLength(1);
    expect(fs.existsSync(path.join(corpusDir, 'Zorlu'))).toBe(false);
  });

  it('stops on HTML that matches no known signature', () => {
    const session = StructureSession.start(options(), ['/zorlu']);
    const result = submit(
      session,
      expectCapture(session, '/zorlu'),
      unknownPage(),
    );
    expect(result.outcome).toBe('UNKNOWN_FORMAT');
    expect(result.pageStatus).toBe('UNKNOWN_HTML');
    expect(session.currentState).toBe('ERROR');
  });

  it('retries a blocked target after resume, then gives up at the attempt ceiling', () => {
    let session = StructureSession.start(options(), ['/zorlu']);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const d = expectCapture(session, '/zorlu');
      submit(session, d, unknownPage());
      expect(session.currentState).toBe('ERROR');
      session = StructureSession.resume(options());
    }
    expect(session.targetsView()[0].status).toBe('FAILED');
    expect((session.nextDirective() as any).state).toBe('INCOMPLETE');
  });
});

// ---------------------------------------------------------------- checkpoint

describe('CHECKPOINT AND IDEMPOTENT RESUME', () => {
  it('persists after every success and resumes exactly where it stopped', () => {
    const a = StructureSession.start(options(), ['/zorlu']);
    submit(a, expectCapture(a, '/zorlu'), makePage());
    submit(a, expectCapture(a, '/zorlu-kartal'), kartalPage());
    const inFlight = expectCapture(a, '/zorlu-sahin'); // IN_PROGRESS kalir (cokme)
    expect(inFlight.targetKey).toBe('/zorlu-sahin');

    const b = StructureSession.resume(options());
    expect(b.currentState).toBe('RUNNING');
    expect(b.status().pagesSaved).toBe(2);
    expect(b.targetsView()).toHaveLength(a.targetsView().length);
    // Yarim kalan hedef yeniden verilir; tamamlanmis hedef ASLA tekrar istenmez.
    expectCapture(b, '/zorlu-sahin');
    expect(
      b
        .targetsView()
        .filter((t) => t.status === 'COMPLETE')
        .map((t) => t.key),
    ).toEqual(['/zorlu', '/zorlu-kartal']);
    // Ikinci kez devam etmek de kopya uretmez.
    const c = StructureSession.resume(options());
    expect(c.targetsView()).toHaveLength(b.targetsView().length);
  });

  it('refuses a checkpoint from another run id', () => {
    StructureSession.start(options(), ['/zorlu']);
    expect(() => StructureSession.resume(options({ runId: 'other' }))).toThrow(
      AutopilotProtocolError,
    );
  });

  it('rejects a capture for a target that was not issued', () => {
    const session = StructureSession.start(options(), ['/zorlu']);
    expect(() =>
      session.submitPageCapture({
        runId: RUN_ID,
        targetKey: '/zorlu',
        finalUrl: '',
        title: '',
        html: makePage(),
      }),
    ).toThrow(AutopilotProtocolError);
    expectCapture(session, '/zorlu');
    expect(() =>
      session.submitPageCapture({
        runId: RUN_ID,
        targetKey: '/zorlu-kartal',
        finalUrl: '',
        title: '',
        html: kartalPage(),
      }),
    ).toThrow(AutopilotProtocolError);
  });

  it('writes an evidence log line per capture', () => {
    const session = StructureSession.start(options(), ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), makePage());
    const lines = fs
      .readFileSync(path.join(runDir, 'captures.jsonl'), 'utf-8')
      .trim()
      .split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      key: '/zorlu',
      outcome: 'SAVED',
      breadcrumb: ['Zorlu'],
      childrenDeclared: 4,
    });
  });
});

// ------------------------------------------------------------ budget / pacing

describe('BOUNDED SMOKE AND PACING', () => {
  it('stops issuing captures at --max-pages and reports SMOKE_LIMIT_REACHED', () => {
    const session = StructureSession.start(options({ maxPages: 2 }), [
      '/zorlu',
    ]);
    submit(session, expectCapture(session, '/zorlu'), makePage());
    submit(session, expectCapture(session, '/zorlu-kartal'), kartalPage());
    const halt = session.nextDirective();
    expect(halt.type).toBe('HALT');
    expect((halt as any).state).toBe('SMOKE_LIMIT_REACHED');
    expect(session.status().queued).toBeGreaterThan(0);
    expect(session.isRunComplete()).toBe(false);
  });

  it('hands the extension a jittered delay computed on the bridge', () => {
    let r = 0;
    const session = StructureSession.start(
      options({ paceMs: 5000, jitter: 0.4, random: () => r }),
      ['/zorlu'],
    );
    expect(expectCapture(session, '/zorlu').delayMs).toBe(3000); // r=0 -> -40%
    submit(
      session,
      session.nextDirective() as CapturePageDirective,
      makePage(),
    );
    r = 1;
    expect(expectCapture(session, '/zorlu-kartal').delayMs).toBe(7000); // r=1 -> +40%
  });

  it('halts on the deadline and returns the in-flight target to the queue', () => {
    const session = StructureSession.start(
      options({ deadlineAtMs: clock + 1000 }),
      ['/zorlu'],
    );
    expectCapture(session, '/zorlu');
    clock += 2000;
    const halt = session.nextDirective();
    expect((halt as any).state).toBe('DEADLINE_REACHED');
    expect(session.targetsView()[0].status).toBe('PENDING');
  });
});

// ------------------------------------------------------------------ rebuild

class FakeRunner implements RebuildRunner {
  calls = 0;
  private resolveNext: ((r: RebuildResult) => void) | null = null;
  run(): Promise<RebuildResult> {
    this.calls += 1;
    return new Promise((resolve) => {
      this.resolveNext = resolve;
    });
  }
  finish(gate: 'PASS' | 'FAIL'): void {
    const r: RebuildResult = {
      ok: gate === 'PASS',
      gate,
      steps: [
        {
          name: 'corpus:validate',
          exitCode: gate === 'PASS' ? 0 : 1,
          seconds: 1,
          logFile: 'x',
        },
      ],
      startedAt: 'a',
      finishedAt: 'b',
      detail: gate === 'PASS' ? null : 'RELEASE GATE: FAIL',
    };
    this.resolveNext!(r);
  }
}

const tick = () => new Promise((r) => setImmediate(r));

describe('REBUILD BETWEEN STRUCTURAL WAVES', () => {
  it('pauses collection after N saved pages, rebuilds, reloads the corpus index and continues', async () => {
    const runner = new FakeRunner();
    const corpus = emptyCorpus();
    const reloads = jest.spyOn(corpus, 'reload');
    const session = StructureSession.start(
      options({ rebuildEvery: 2, rebuild: runner }, corpus),
      ['/zorlu'],
    );
    submit(session, expectCapture(session, '/zorlu'), makePage());
    submit(session, expectCapture(session, '/zorlu-kartal'), kartalPage());

    const wait = session.nextDirective();
    expect(wait.type).toBe('WAIT');
    expect(session.currentState).toBe('REBUILDING');
    expect(runner.calls).toBe(1);
    expect(session.nextDirective().type).toBe('WAIT'); // hala mesgul

    runner.finish('PASS');
    await tick();
    expect(session.currentState).toBe('RUNNING');
    expect(reloads).toHaveBeenCalledTimes(1);
    expect(session.status().rebuilds).toBe(1);
    expect(session.status().sinceRebuild).toBe(0);
    expectCapture(session, '/zorlu-sahin');
  });

  it('stops the run when the validation gate fails', async () => {
    const runner = new FakeRunner();
    const session = StructureSession.start(
      options({ rebuildEvery: 1, rebuild: runner }),
      ['/zorlu'],
    );
    submit(session, expectCapture(session, '/zorlu'), makePage());
    expect(session.nextDirective().type).toBe('WAIT');
    runner.finish('FAIL');
    await tick();
    expect(session.currentState).toBe('ERROR');
    expect(session.status().pauseReason).toContain('VALIDATION_FAILED');
    expect(session.status().lastGate).toBe('FAIL');
    expect(session.nextDirective().type).toBe('HALT');
  });

  it('runs a final rebuild before declaring the run complete', async () => {
    const runner = new FakeRunner();
    const session = StructureSession.start(
      options({ rebuildEvery: 50, rebuild: runner }),
      ['/zorlu-sahin'],
    );
    submit(session, expectCapture(session, '/zorlu-sahin'), sahinPage());
    expect(session.nextDirective().type).toBe('WAIT');
    expect(runner.calls).toBe(1);
    runner.finish('PASS');
    await tick();
    expect(session.currentState).toBe('COMPLETE');
    expect((session.nextDirective() as any).state).toBe('COMPLETE');
  });

  it('validates and publishes even when every requested page was already in the corpus', async () => {
    const runner = new FakeRunner();
    const corpus = emptyCorpus();
    jest.spyOn(corpus, 'present').mockReturnValue({
      file: 'already.html',
      page: classifyPage(sahinPage(), 'already.html'),
    });
    const session = StructureSession.start(
      options({ rebuildEvery: 50, rebuild: runner }, corpus),
      ['/zorlu-sahin'],
    );
    expect(session.nextDirective().type).toBe('WAIT');
    expect(runner.calls).toBe(1);
    runner.finish('PASS');
    await tick();
    expect(session.currentState).toBe('COMPLETE');
  });
});

// ------------------------------------------------------- site koku korpusta

describe('SITE ROOT FROM THE CORPUS', () => {
  it('uses a saved showcase page as the make list instead of fetching the root again', () => {
    // Vitrin sayfasi, manuel korpusta oldugu gibi bir marka klasorunde durur.
    const dir = path.join(corpusDir, 'Zorlu');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(
        dir,
        "2.El Arabalar ve Satılık Sıfır Km Otomobil Fiyatları sahibinden.com'da.html",
      ),
      siteRootPage(),
      'utf-8',
    );
    const corpus = new CorpusIndex({
      loadTree: () => null,
      rootOverride: corpusDir,
    });
    const session = StructureSession.start(options({}, corpus), [SITE_ROOT]);
    const scan = session.scanCorpus();
    expect(scan).toEqual({ present: 1, missing: 2 });
    expect(session.targetsView()[0]).toMatchObject({
      key: SITE_ROOT,
      status: 'COMPLETE',
      outcome: 'ALREADY_PRESENT',
      depth: 0,
    });
    expect(pending(session)).toEqual(['/zorlu', '/diger-marka']);
    expect(session.targetsView().find((t) => t.key === '/zorlu')).toMatchObject(
      { expectedPath: ['Zorlu'], make: 'Zorlu', depth: 1 },
    );
    expect(session.status().attempted).toBe(0);
  });

  it('fetches the site root when the corpus holds no showcase page', () => {
    const session = StructureSession.start(options(), [SITE_ROOT]);
    expect(session.scanCorpus()).toEqual({ present: 0, missing: 1 });
    expectCapture(session, SITE_ROOT);
  });
});

describe('SECURITY PAUSES DO NOT CONSUME THE PAGE BUDGET', () => {
  it('re-issues the paused target after resume even when --max-pages was already reached by attempts', () => {
    let session = StructureSession.start(options({ maxPages: 2 }), ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), makePage());
    submit(session, expectCapture(session, '/zorlu-kartal'), loginPage()); // 2. deneme duvar
    expect(session.currentState).toBe('ACCESS_RESTRICTED');
    expect(session.status().attempted).toBe(2);

    session = StructureSession.resume(options({ maxPages: 2 }));
    // Butcede hala 1 sayfa var: duvar sayilmadi.
    const d = expectCapture(session, '/zorlu-kartal');
    expect(submit(session, d, kartalPage()).outcome).toBe('SAVED');
    expect((session.nextDirective() as any).state).toBe('SMOKE_LIMIT_REACHED');
  });
});

// ------------------------------------------------- ic ice menu / inceltme

/**
 * CANLI KOSUDA KANITLANDI: kaynak, tek cocuklu bir ara seviyeyi atlayip
 * torunlari listeliyor ("Cupra / Leon" menusu "1.5 eTSI"yi degil cl5 sinifli
 * "Impulse, Standart, ..."i gosteriyor). Eski kod torunu dogrudan cocuk sanip
 * "Cupra / Leon / Impulse" bekledi, sayfa "Cupra / Leon / 1.5 eTSI / Impulse"
 * deyince REDIRECT_MISMATCH verdi ve 5 ardisik hatayla durdu. Marka adlari
 * burada kurgusaldir; kural marka bilmez.
 */
describe('NESTED NAV: GRANDCHILDREN ARE NOT DIRECT CHILDREN', () => {
  const K16 = { label: '1.6', slug: 'zorlu-kartal-1.6' };
  const GL = { label: 'GL', slug: 'zorlu-kartal-1.6-gl' };
  const LX = { label: 'LX', slug: 'zorlu-kartal-1.6-lx' };
  /** Kartal sayfasi: kaynak "1.6"yi atlamis, GL/LX'i torun seviyesiyle (cl5) listeliyor. */
  const collapsedKartalPage = () =>
    categoryPage({
      chain: [ZORLU, KARTAL],
      nav: [
        { label: 'GL', slug: GL.slug, count: 3, level: 5 },
        { label: 'LX', slug: LX.slug, count: 2, level: 5 },
      ],
    });
  /** ESKI davranisi taklit eden sayfa: GL dogrudan cocuk SEVIYESIYLE (cl4) listelenmis. */
  const lyingKartalPage = () =>
    categoryPage({
      chain: [ZORLU, KARTAL],
      nav: [{ label: 'GL', slug: GL.slug, count: 3, level: 4 }],
    });
  const glPage = () =>
    categoryPage({ chain: [ZORLU, KARTAL, K16, GL], nav: [] });
  const k16Page = () =>
    categoryPage({
      chain: [ZORLU, KARTAL, K16],
      nav: [
        { label: 'GL', slug: GL.slug, count: 3 },
        { label: 'LX', slug: LX.slug, count: 2 },
      ],
    });
  const makeWithKartal = () =>
    categoryPage({
      chain: [ZORLU],
      nav: [{ label: 'Kartal', slug: KARTAL.slug, count: 5 }],
    });

  function startAtKartal(page = collapsedKartalPage()) {
    const session = StructureSession.start(options(), ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), makeWithKartal());
    const result = submit(
      session,
      expectCapture(session, '/zorlu-kartal'),
      page,
    );
    return { session, result };
  }

  it("queues a collapsed menu's grandchildren as descendants under the ancestor, never as direct children", () => {
    const { session, result } = startAtKartal();
    expect(result.outcome).toBe('SAVED');
    expect(result.childrenDeclared).toBe(0);
    expect(result.terminal).toBe(false); // torunlari var: terminal DEGIL
    const gl = session
      .targetsView()
      .find((t) => t.key === '/zorlu-kartal-1.6-gl')!;
    expect(gl).toMatchObject({
      status: 'PENDING',
      origin: 'NAV',
      expectedPath: null,
      expectedPrefix: ['Zorlu', 'Kartal'],
      depth: null,
    });
    expect(
      session.targetsView().find((t) => t.key === '/zorlu-kartal'),
    ).toMatchObject({
      childrenDeclared: 0,
      deeperDeclared: 2,
      terminal: false,
    });
    // "Zorlu / Kartal / GL" diye sahte bir beklenti YOK.
    expect(
      session
        .targetsView()
        .some(
          (t) =>
            t.expectedPath && t.expectedPath.join('/') === 'Zorlu/Kartal/GL',
        ),
    ).toBe(false);
  });

  it('accepts the grandchild page under its ancestor, takes the exact path from its breadcrumb and recovers the skipped level by href', () => {
    const { session } = startAtKartal();
    const d = expectCapture(session, '/zorlu-kartal-1.6-gl');
    const result = submit(session, d, glPage());
    expect(result.outcome).toBe('SAVED');
    expect(result.breadcrumb).toEqual(['Zorlu', 'Kartal', '1.6', 'GL']);
    const gl = session
      .targetsView()
      .find((t) => t.key === '/zorlu-kartal-1.6-gl')!;
    expect(gl).toMatchObject({
      status: 'COMPLETE',
      expectedPath: ['Zorlu', 'Kartal', '1.6', 'GL'],
      expectedPrefix: null,
      parentKey: '/zorlu-kartal-1.6',
    });
    // Atlanan seviye breadcrumb HREF'inden kuyruga girdi — etiketten slug uydurulmadi.
    const k16 = session
      .targetsView()
      .find((t) => t.key === '/zorlu-kartal-1.6')!;
    expect(k16).toMatchObject({
      status: 'PENDING',
      origin: 'BREADCRUMB',
      expectedPath: ['Zorlu', 'Kartal', '1.6'],
      depth: 3,
      parentKey: '/zorlu-kartal',
      navResultCount: null,
    });
    expect(session.status().intermediatesRecovered).toBe(1);
    expect(session.status().refinedPaths).toBe(1);
    // Ara seviye toplaninca dogrudan cocuklari (GL tamam, LX kuyrukta) tekrar uretilmez.
    submit(
      session,
      expectCapture(session, '/zorlu-kartal-1.6-lx'),
      categoryPage({ chain: [ZORLU, KARTAL, K16, LX], nav: [] }),
    );
    const k16Result = submit(
      session,
      expectCapture(session, '/zorlu-kartal-1.6'),
      k16Page(),
    );
    expect(k16Result).toMatchObject({
      outcome: 'SAVED',
      childrenDeclared: 2,
      childrenEnqueued: 0,
      childrenAlreadyKnown: 2,
    });
    expect(
      session.targetsView().filter((t) => t.key === '/zorlu-kartal-1.6-gl'),
    ).toHaveLength(1);
    expect((session.nextDirective() as any).state).toBe('COMPLETE');
  });

  it('4) safe refinement: a legacy exact expectation "Zorlu / Kartal / GL" is refined to the source breadcrumb, not rejected', () => {
    const { session } = startAtKartal(lyingKartalPage());
    const gl = session
      .targetsView()
      .find((t) => t.key === '/zorlu-kartal-1.6-gl')!;
    expect(gl.expectedPath).toEqual(['Zorlu', 'Kartal', 'GL']); // eski tarz beklenti
    const result = submit(
      session,
      expectCapture(session, '/zorlu-kartal-1.6-gl'),
      glPage(),
    );
    expect(result.outcome).toBe('SAVED');
    expect(
      session.targetsView().find((t) => t.key === '/zorlu-kartal-1.6-gl'),
    ).toMatchObject({
      expectedPath: ['Zorlu', 'Kartal', '1.6', 'GL'],
      breadcrumb: ['Zorlu', 'Kartal', '1.6', 'GL'],
      reconciledFrom: 'Zorlu / Kartal / GL',
    });
    expect(
      session.targetsView().find((t) => t.key === '/zorlu-kartal-1.6'),
    ).toMatchObject({
      status: 'PENDING',
      origin: 'BREADCRUMB',
    });
    expect(session.status().redirectMismatch).toBe(0);
  });

  it('5) multiple inserted levels are all recovered, in order, chained by parent', () => {
    const ENGINE = { label: 'Engine', slug: 'zorlu-kartal-engine' };
    const BODY = { label: 'Body', slug: 'zorlu-kartal-engine-body' };
    const TRIM = { label: 'Trim', slug: 'zorlu-kartal-engine-body-trim' };
    const lying = categoryPage({
      chain: [ZORLU, KARTAL],
      nav: [{ label: 'Trim', slug: TRIM.slug, count: 1, level: 4 }],
    });
    const { session } = startAtKartal(lying);
    const result = submit(
      session,
      expectCapture(session, '/' + TRIM.slug),
      categoryPage({ chain: [ZORLU, KARTAL, ENGINE, BODY, TRIM], nav: [] }),
    );
    expect(result.outcome).toBe('SAVED');
    expect(pending(session)).toEqual([
      '/zorlu-kartal-engine',
      '/zorlu-kartal-engine-body',
    ]);
    expect(
      session.targetsView().find((t) => t.key === '/zorlu-kartal-engine'),
    ).toMatchObject({
      expectedPath: ['Zorlu', 'Kartal', 'Engine'],
      parentKey: '/zorlu-kartal',
      depth: 3,
    });
    expect(
      session.targetsView().find((t) => t.key === '/zorlu-kartal-engine-body'),
    ).toMatchObject({
      expectedPath: ['Zorlu', 'Kartal', 'Engine', 'Body'],
      parentKey: '/zorlu-kartal-engine',
      depth: 4,
    });
    expect(
      session.targetsView().find((t) => t.key === '/' + TRIM.slug)!.parentKey,
    ).toBe('/zorlu-kartal-engine-body');
    expect(session.status().intermediatesRecovered).toBe(2);
  });

  it('6) wrong branch is still a redirect: same URL, breadcrumb under another sibling', () => {
    const { session } = startAtKartal(lyingKartalPage());
    const wrongBranch = categoryPage({
      chain: [
        ZORLU,
        { label: 'Şahin', slug: 'zorlu-sahin' },
        { label: '1.6', slug: 'zorlu-sahin-1.6' },
        { label: 'GL', slug: 'zorlu-kartal-1.6-gl' },
      ],
      nav: [],
    });
    const result = submit(
      session,
      expectCapture(session, '/zorlu-kartal-1.6-gl'),
      wrongBranch,
    );
    expect(result.outcome).toBe('REDIRECT_MISMATCH');
    expect(
      session.targetsView().find((t) => t.key === '/zorlu-kartal-1.6-gl')!
        .status,
    ).toBe('FAILED');
    expect(
      session.targetsView().some((t) => t.key === '/zorlu-sahin-1.6'),
    ).toBe(false); // hicbir ara seviye kazanilmadi
  });

  it('7) a renamed final label is still a redirect even when the branch matches', () => {
    const { session } = startAtKartal(lyingKartalPage());
    const renamed = categoryPage({
      chain: [
        ZORLU,
        KARTAL,
        K16,
        { label: 'GLX', slug: 'zorlu-kartal-1.6-gl' },
      ],
      nav: [],
    });
    expect(
      submit(session, expectCapture(session, '/zorlu-kartal-1.6-gl'), renamed)
        .outcome,
    ).toBe('REDIRECT_MISMATCH');
  });

  it('8) a page that declares another own URL is a true redirect, whatever its breadcrumb says', () => {
    const hybrid = { label: '1.6 Hybrid', slug: 'zorlu-kartal-1.6-hybrid' };
    const session = StructureSession.start(options(), ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), makeWithKartal());
    submit(
      session,
      expectCapture(session, '/zorlu-kartal'),
      categoryPage({
        chain: [ZORLU, KARTAL],
        nav: [{ label: hybrid.label, slug: hybrid.slug, count: 7 }],
      }),
    );
    const declaresOther = categoryPage({
      chain: [ZORLU, KARTAL, K16],
      nav: [],
    }); // own = /zorlu-kartal-1.6
    const result = submit(
      session,
      expectCapture(session, '/zorlu-kartal-1.6-hybrid'),
      declaresOther,
      'https://www.sahibinden.com/zorlu-kartal-1.6-extreme',
    );
    expect(result.outcome).toBe('REDIRECT_MISMATCH');
    const target = session
      .targetsView()
      .find((t) => t.key === '/zorlu-kartal-1.6-hybrid')!;
    expect(target.status).toBe('FAILED');
    expect(target.lastError).toMatch(
      /requested \/zorlu-kartal-1.6-hybrid but the page declares itself as \/zorlu-kartal-1.6/,
    );
  });

  it('9) casing-only difference in the branch is accepted and the SOURCE casing is kept', () => {
    const UNO = { label: 'Uno', slug: 'zorlu-uno' };
    const session = StructureSession.start(options(), ['/zorlu']);
    submit(
      session,
      expectCapture(session, '/zorlu'),
      categoryPage({
        chain: [ZORLU],
        nav: [{ label: 'Uno', slug: UNO.slug, count: 5 }],
      }),
    );
    submit(
      session,
      expectCapture(session, '/zorlu-uno'),
      categoryPage({
        chain: [ZORLU, UNO],
        nav: [
          { label: 'Trim', slug: 'zorlu-uno-1.4-trim', count: 1, level: 4 },
        ],
      }),
    );
    const actual = categoryPage({
      chain: [
        ZORLU,
        { label: 'UNO', slug: 'zorlu-uno' },
        { label: '1.4', slug: 'zorlu-uno-1.4' },
        { label: 'Trim', slug: 'zorlu-uno-1.4-trim' },
      ],
      nav: [],
    });
    const result = submit(
      session,
      expectCapture(session, '/zorlu-uno-1.4-trim'),
      actual,
    );
    expect(result.outcome).toBe('SAVED');
    expect(result.breadcrumb).toEqual(['Zorlu', 'UNO', '1.4', 'Trim']);
    expect(path.basename(result.savedFile!)).toBe(
      "Zorlu UNO 1.4 Trim Fiyatları & Modelleri sahibinden.com'da.html",
    );
    // Ara seviye tek bir kez, kaynak casing'iyle.
    expect(
      session.targetsView().filter((t) => t.key === '/zorlu-uno-1.4'),
    ).toHaveLength(1);
    expect(
      session.targetsView().find((t) => t.key === '/zorlu-uno-1.4')!
        .expectedPath,
    ).toEqual(['Zorlu', 'UNO', '1.4']);
  });

  it('10) an intermediate whose breadcrumb href is not a usable category path is skipped, never guessed', () => {
    const { session } = startAtKartal(lyingKartalPage());
    const badHref = categoryPage({
      chain: [ZORLU, KARTAL, { label: '1.6', slug: 'ZORLU-KARTAL-1.6' }, GL],
      nav: [],
    });
    const result = submit(
      session,
      expectCapture(session, '/zorlu-kartal-1.6-gl'),
      badHref,
    );
    expect(result.outcome).toBe('SAVED');
    expect(
      session
        .targetsView()
        .some((t) => t.key.toLowerCase() === '/zorlu-kartal-1.6'),
    ).toBe(false);
    expect(session.status().intermediatesRecovered).toBe(0);
  });

  it('11+12) an intermediate already queued or already complete is neither duplicated nor re-requested', () => {
    // Kartal sayfasi hem dogrudan cocuk "1.6"yi hem de (eski tarz) torun GL'yi listeliyor.
    const both = categoryPage({
      chain: [ZORLU, KARTAL],
      nav: [
        { label: '1.6', slug: K16.slug, count: 5 },
        { label: 'GL', slug: GL.slug, count: 3, level: 4 },
      ],
    });
    const { session } = startAtKartal(both);
    // 1.6 zaten kuyrukta: once toplanir (COMPLETE), sonra GL'nin breadcrumb'i onu bir daha istemez.
    submit(session, expectCapture(session, '/zorlu-kartal-1.6'), k16Page());
    submit(session, expectCapture(session, '/zorlu-kartal-1.6-gl'), glPage());
    expect(
      session.targetsView().filter((t) => t.key === '/zorlu-kartal-1.6'),
    ).toHaveLength(1);
    expect(
      session.targetsView().find((t) => t.key === '/zorlu-kartal-1.6')!.status,
    ).toBe('COMPLETE');
    expect(session.status().intermediatesRecovered).toBe(0);
    expect(session.status().duplicatesSkipped).toBeGreaterThan(0);
  });
});

describe('LEGACY CHECKPOINT MIGRATION', () => {
  const CHERY_LEGACY =
    'REDIRECT_MISMATCH: breadcrumb "Chery / Alia / 1.6 / Acteco Forza" differs from expected "Chery / Alia / Acteco Forza"';
  const DACIA_LEGACY =
    'REDIRECT_MISMATCH: requested /dacia-jogger-1.6-hybrid but the page declares itself as /dacia-jogger-1.6';

  it("classifies the real run's errors: breadcrumb-only diff retryable, own-slug mismatch not", () => {
    const failed = (lastError: string) => ({
      status: 'FAILED' as const,
      outcome: 'REDIRECT_MISMATCH' as const,
      lastError,
    });
    expect(isRetryableLegacyBreadcrumbMismatch(failed(CHERY_LEGACY))).toBe(
      true,
    );
    expect(isRetryableLegacyBreadcrumbMismatch(failed(DACIA_LEGACY))).toBe(
      false,
    );
    expect(
      isRetryableLegacyBreadcrumbMismatch(
        failed(
          'REDIRECT_MISMATCH: breadcrumb "Zorlu / Kartal Yeni" differs from expected "Zorlu / Kartal"',
        ),
      ),
    ).toBe(false);
    expect(
      isRetryableLegacyBreadcrumbMismatch(
        failed(
          'REDIRECT_MISMATCH: breadcrumb "A / C / Engine / Trim" differs from expected "A / B / Trim"',
        ),
      ),
    ).toBe(false);
    expect(
      isRetryableLegacyBreadcrumbMismatch(
        failed(
          'REDIRECT_MISMATCH: breadcrumb "A / B / Engine / NewTrim" differs from expected "A / B / Trim"',
        ),
      ),
    ).toBe(false);
    expect(
      isRetryableLegacyBreadcrumbMismatch({
        status: 'COMPLETE',
        outcome: 'SAVED',
        lastError: null,
      }),
    ).toBe(false);
    expect(
      isSafeRefinement(
        ['A', 'B', 'Trim'],
        ['A', 'B', 'Engine', 'Body', 'Trim'],
      ),
    ).toBe(true);
    expect(
      isSafeRefinement(['Fiat', 'Uno', 'Trim'], ['Fiat', 'UNO', '1.4', 'Trim']),
    ).toBe(true);
    expect(isSafeRefinement(['Zorlu'], ['Baska', 'Zorlu'])).toBe(false);
  });

  /** Eski kosunun checkpoint'ini taklit et: FAILED hedefler ESKI hata metniyle. */
  function legacyCheckpoint(): StructureSessionOptions {
    const opts = options();
    const session = StructureSession.start(opts, ['/zorlu']);
    submit(
      session,
      expectCapture(session, '/zorlu'),
      categoryPage({
        chain: [ZORLU],
        nav: [
          { label: 'Kartal', slug: 'zorlu-kartal', count: 5 },
          { label: 'Şahin', slug: 'zorlu-sahin', count: 5 },
          { label: 'Doğan', slug: 'zorlu-dogan', count: 5 },
        ],
      }),
    );
    const payload = opts.checkpointFile.load();
    const kartal = payload.targets.find((t) => t.key === '/zorlu-kartal')!;
    kartal.status = 'FAILED';
    kartal.outcome = 'REDIRECT_MISMATCH';
    kartal.attempts = 1;
    kartal.lastError =
      'REDIRECT_MISMATCH: breadcrumb "Zorlu / Kartal / 1.6 / GL" differs from expected "Zorlu / Kartal / GL"';
    kartal.expectedPath = ['Zorlu', 'Kartal', 'GL'];
    const sahin = payload.targets.find((t) => t.key === '/zorlu-sahin')!;
    sahin.status = 'FAILED';
    sahin.outcome = 'REDIRECT_MISMATCH';
    sahin.attempts = 1;
    sahin.lastError =
      'REDIRECT_MISMATCH: requested /zorlu-sahin but the page declares itself as /zorlu-sahin-1.6';
    payload.counters.redirectMismatch = 2;
    payload.state = 'ERROR';
    opts.checkpointFile.save(payload);
    return opts;
  }

  it('13) a legacy breadcrumb-only mismatch becomes PENDING again on resume', () => {
    const opts = legacyCheckpoint();
    const resumed = StructureSession.resume(options());
    const kartal = resumed
      .targetsView()
      .find((t) => t.key === '/zorlu-kartal')!;
    expect(kartal.status).toBe('PENDING');
    expect(kartal.attempts).toBe(1);
    expect(kartal.lastError).toMatch(
      /^RETRY\(nested-nav\): REDIRECT_MISMATCH: breadcrumb/,
    );
    expect(kartal.reconciledFrom).toMatch(/^REDIRECT_MISMATCH: breadcrumb/);
    expect(resumed.status().legacyRetried).toBe(1);
    expect(resumed.status().redirectMismatch).toBe(2); // tarihce silinmez
    expect(opts.checkpointFile.exists()).toBe(true);
  });

  it('14) a legacy own-slug (canonical) mismatch stays FAILED on resume', () => {
    legacyCheckpoint();
    const resumed = StructureSession.resume(options());
    expect(
      resumed.targetsView().find((t) => t.key === '/zorlu-sahin'),
    ).toMatchObject({
      status: 'FAILED',
      outcome: 'REDIRECT_MISMATCH',
    });
    expectCapture(resumed, '/zorlu-kartal'); // kuyruk sirasi korunur: Kartal once
  });

  it('15) repeated resume is idempotent: no duplicate target, no counter inflation', () => {
    legacyCheckpoint();
    const first = StructureSession.resume(options());
    const count = first.targetsView().length;
    const second = StructureSession.resume(options());
    const third = StructureSession.resume(options());
    expect(second.targetsView()).toHaveLength(count);
    expect(third.targetsView()).toHaveLength(count);
    expect(third.status().legacyRetried).toBe(1);
    expect(
      third
        .targetsView()
        .filter((t) => t.status === 'FAILED')
        .map((t) => t.key),
    ).toEqual(['/zorlu-sahin']);
    expect(
      third.targetsView().filter((t) => t.key === '/zorlu-kartal'),
    ).toHaveLength(1);
  });

  it('a reopened legacy target that comes back SHALLOWER than expected still fails (rule unchanged)', () => {
    legacyCheckpoint();
    const resumed = StructureSession.resume(options());
    const d = expectCapture(resumed, '/zorlu-kartal');
    const shallow = submit(
      resumed,
      d,
      categoryPage({ chain: [ZORLU, KARTAL], nav: [] }),
    );
    expect(shallow.outcome).toBe('REDIRECT_MISMATCH');
  });
});
