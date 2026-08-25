/**
 * CANLI TAKSONOMI REGRESYONU — GERCEK AUDI A3 YAPISINDAN TURETILMIS.
 *
 * ILK CANLI KOSUDA KANITLANAN HATA (checkpoint'ten):
 *   /audi-a3  count: 3  kind: LEAF  pagesDone: 3  -> 151 satir staging'e yazildi
 *
 * Kaynak sayfasi gercekte 6.559 ilan bildiriyordu. Sayim metindeki ilk rakam
 * dizisinden okunuyordu ve baslikta "A3" icindeki 3 yakalaniyordu. 6.559
 * ilanlik EBEVEYN 3 ilanlik bir yaprak sanildi ve sayfalandi.
 *
 * Buradaki fixture'lar gercek yapidan TURETILMIS ASGARI metinlerdir; kopyalanmis
 * buyuk HTML yoktur.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AtomicChecksummedFile } from '../checkpoint-store';
import { StagingStore } from '../staging-store';
import { ObservedCard, PageBatch } from './autopilot-contracts';
import { extractChildCount, extractReportedCount, parseTurkishInteger } from './count-text';
import {
  AutopilotCheckpointPayload,
  AutopilotSession,
  AutopilotSessionOptions,
  MapReferenceLookup,
} from './autopilot-session';
import { AutopilotScope } from './scope-guard';
import { filterImmediateChildren } from './taxonomy';
import { buildLeafPageUrl, normalizeNodePath } from './source-url';

const BASE_URL = 'https://www.sahibinden.com/';
const RUN_ID = 'live-a3';

/** Gercek liste basligi (asgari bicim). */
const A3_HEADING = '"Audi A3 Fiyatları & Modelleri" aramanızda 6.559 ilan bulundu.';

/** Gercek sol taksonomi: Audi A3'un dogrudan cocuklari. */
const A3_TAXONOMY = [
  { path: '/audi-a3-a3-cabrio', label: 'A3 Cabrio (101)' },
  { path: '/audi-a3-a3-hatchback', label: 'A3 Hatchback (366)' },
  { path: '/audi-a3-a3-sedan', label: 'A3 Sedan (3.132)' },
  { path: '/audi-a3-a3-sportback', label: 'A3 Sportback (2.960)' },
];

const SMOKE_SCOPE: AutopilotScope = {
  rootPath: '/audi-a3',
  make: 'Audi',
  series: 'A3',
  maxResultPages: 3,
  requireChildStructure: true,
  stopOnUnknown: true,
};

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-live-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeOptions(overrides: Partial<AutopilotSessionOptions> = {}): AutopilotSessionOptions {
  return {
    runId: RUN_ID,
    source: 'sahibinden',
    baseUrl: BASE_URL,
    staging: new StagingStore(path.join(tmpDir, 'staging.jsonl')),
    checkpointFile: new AtomicChecksummedFile<AutopilotCheckpointPayload>(
      path.join(tmpDir, 'checkpoint.json'),
    ),
    reference: new MapReferenceLookup(),
    scope: SMOKE_SCOPE,
    snapshotPath: null,
    deadlineAtMs: null,
    ...overrides,
  };
}

function startAtA3(overrides: Partial<AutopilotSessionOptions> = {}): AutopilotSession {
  return AutopilotSession.start(makeOptions(overrides), [{ path: '/audi-a3', label: 'Audi A3' }]);
}

function card(id: string): ObservedCard {
  return {
    sourceListingId: id,
    href: `/ilan/${id}/detay`,
    title: `Audi A3 1.6 TDI ${id}`,
    priceText: '1.450.000 TL',
    mileageText: '120.000',
    yearText: '2018',
    locationText: 'İstanbul',
  };
}

function pageBatch(nodePath: string, page: number, cards: number, hasNextPage: boolean): PageBatch {
  return {
    runId: RUN_ID,
    nodePath,
    page,
    categoryText: 'Audi A3 Fiyatları & Modelleri',
    pageUrl: buildLeafPageUrl(BASE_URL, nodePath, page),
    cards: Array.from({ length: cards }, (_, i) => card(`${nodePath}-p${page}-${i + 1}`)),
    hasNextPage,
    parseFailures: 0,
  };
}

/** Kok A3 dugumunu gercek yapiyla kesfeder. */
function discoverA3(session: AutopilotSession) {
  session.nextDirective();
  return session.submitDiscovery({
    runId: RUN_ID,
    nodePath: '/audi-a3',
    countText: A3_HEADING,
    children: A3_TAXONOMY,
    childStructure: 'READ',
  });
}

interface DriveHandlers {
  /** Bir kesif dugumu icin kaynagin ne bildirdigi. */
  discovery: (nodePath: string) => { countText: string; children: any[]; childStructure?: any };
  /** Bir yaprak sayfasi icin kaynagin ne gosterdigi. */
  page?: (nodePath: string, page: number) => { cards: number; hasNextPage: boolean };
}

/** Kuyrugu HALT'a kadar surer ve gorulen her yonergeyi kaydeder. */
function drive(session: AutopilotSession, handlers: DriveHandlers, maxSteps = 40) {
  const seen: Array<{ type: string; nodePath?: string; page?: number }> = [];

  for (let step = 0; step < maxSteps; step += 1) {
    const directive: any = session.nextDirective();
    seen.push({ type: directive.type, nodePath: directive.nodePath, page: directive.page });

    if (directive.type === 'HALT') break;

    if (directive.type === 'DISCOVER') {
      const reported = handlers.discovery(directive.nodePath);
      session.submitDiscovery({
        runId: RUN_ID,
        nodePath: directive.nodePath,
        countText: reported.countText,
        children: reported.children,
        childStructure: reported.childStructure ?? 'READ',
      });
      continue;
    }

    const shown = handlers.page
      ? handlers.page(directive.nodePath, directive.page)
      : { cards: 50, hasNextPage: false };
    session.submitPageBatch(
      pageBatch(directive.nodePath, directive.page, shown.cards, shown.hasNextPage),
    );
  }
  return seen;
}

// ------------------------------------------------------------------ A) sayim

describe('A) RESULT COUNT PARSING', () => {
  it('reads 6559 from the real Audi A3 heading, not the 3 in "A3"', () => {
    expect(extractReportedCount(A3_HEADING)).toBe(6559);
  });

  it('treats the dot as a thousands separator, never a decimal point', () => {
    expect(parseTurkishInteger('6.559')).toBe(6559);
    expect(parseTurkishInteger('3.132')).toBe(3132);
    expect(parseTurkishInteger('2.960')).toBe(2960);
    expect(parseTurkishInteger('101')).toBe(101);
  });

  it('anchors on the word "ilan" so surrounding numbers are not mistaken for the count', () => {
    expect(extractReportedCount('1 - 50 arası, toplam 6.559 ilan')).toBe(6559);
    expect(extractReportedCount('BMW 3 Serisi 316i')).toBeNull();
    expect(extractReportedCount('Audi A3')).toBeNull();
  });

  it('refuses an ambiguous number instead of guessing', () => {
    expect(parseTurkishInteger('6.5')).toBeNull();
    expect(parseTurkishInteger('1.23')).toBeNull();
    expect(parseTurkishInteger('')).toBeNull();
  });

  it('reads child counts from the real taxonomy labels', () => {
    expect(extractChildCount('A3 Cabrio (101)')).toBe(101);
    expect(extractChildCount('A3 Sedan (3.132)')).toBe(3132);
    expect(extractChildCount('A3 Sportback 2.960')).toBe(2960);
  });

  it('never mistakes a numeric model code for a count', () => {
    expect(extractChildCount('315')).toBeNull();
    expect(extractChildCount('316i')).toBeNull();
    expect(extractChildCount('318')).toBeNull();
  });
});

// ------------------------------------------------------- B) A3 root must split

describe('B) AUDI A3 ROOT IS SPLIT_REQUIRED', () => {
  it('classifies the 6.559-listing root as SPLIT_REQUIRED and enqueues 4 children', () => {
    const session = startAtA3();
    const outcome = discoverA3(session);

    expect(outcome).toMatchObject({
      outcome: 'SPLIT_REQUIRED',
      nodeState: 'SPLIT_REQUIRED',
      count: 6559,
      enqueued: 4,
    });

    const root = session.itemsView().find((i) => i.path === '/audi-a3')!;
    expect(root.nodeState).toBe('SPLIT_REQUIRED');
    expect(root.kind).toBe('DISCOVER'); // hicbir zaman LEAF olmadi
    expect(root.pagesDone).toBe(0);
  });

  it('extracts and paginates nothing from the oversized parent', () => {
    const opts = makeOptions();
    const session = startAtA3(opts);
    discoverA3(session);

    // Ebeveyn icin ASLA bir sayfa yonergesi uretilmez.
    const directives: any[] = [];
    for (let i = 0; i < 6; i += 1) directives.push(session.nextDirective());
    const parentPageDirectives = directives.filter(
      (d) => d.type === 'COLLECT_PAGE' && d.nodePath === '/audi-a3',
    );

    expect(parentPageDirectives).toHaveLength(0);
    expect(opts.staging.readAll()).toHaveLength(0);
    expect(session.status().listingsObserved).toBe(0);
  });

  it('refuses a page batch aimed at the oversized parent even if the extension sends one', () => {
    const opts = makeOptions();
    const session = startAtA3(opts);
    discoverA3(session);

    expect(() => session.submitPageBatch(pageBatch('/audi-a3', 1, 50, true))).toThrow(
      /is a DISCOVER node/,
    );
    expect(opts.staging.readAll()).toHaveLength(0);
  });

  /** G) Asiri buyuk ebeveynin DOM'unda kartlar olsa bile hicbiri yazilmaz. */
  it('stages nothing from a discovery step, whatever the parent DOM contained', () => {
    const opts = makeOptions();
    const session = startAtA3(opts);
    discoverA3(session);
    expect(opts.staging.readAll()).toHaveLength(0);
    expect(opts.checkpointFile.load().counters.observed).toBe(0);
  });
});

// ---------------------------------------------------- C-F) per-child classes

describe('C-F) CHILD CLASSIFICATION', () => {
  const expected = [
    { path: '/audi-a3-a3-cabrio', count: 101, state: 'COLLECTABLE_LEAF', pages: 3 },
    { path: '/audi-a3-a3-hatchback', count: 366, state: 'COLLECTABLE_LEAF', pages: 8 },
    { path: '/audi-a3-a3-sedan', count: 3132, state: 'PENDING_DISCOVERY', pages: null },
    { path: '/audi-a3-a3-sportback', count: 2960, state: 'PENDING_DISCOVERY', pages: null },
  ];

  it.each(expected)('classifies $path ($count)', ({ path: nodePath, count, state, pages }) => {
    const session = startAtA3();
    discoverA3(session);

    const child = session.itemsView().find((i) => i.path === nodePath)!;
    expect(child).toMatchObject({
      count,
      nodeState: state,
      expectedPages: pages,
      parentPath: '/audi-a3',
      depth: 1,
    });
  });

  it('sends the oversized children back through discovery, never to collection', () => {
    const session = startAtA3();
    discoverA3(session);

    const seen: Array<{ type: string; nodePath?: string }> = [];
    for (let i = 0; i < 4; i += 1) {
      const directive: any = session.nextDirective();
      seen.push({ type: directive.type, nodePath: directive.nodePath });
      if (directive.type === 'COLLECT_PAGE') {
        session.submitPageBatch(pageBatch(directive.nodePath, directive.page, 50, false));
      } else if (directive.type === 'DISCOVER') {
        // 3.132 / 2.960 yine asiri buyuk: daha derine bolunurler.
        session.submitDiscovery({
          runId: RUN_ID,
          nodePath: directive.nodePath,
          countText: 'aramanızda 3.132 ilan bulundu.',
          children: [{ path: `${directive.nodePath}-16-tdi`, label: '1.6 TDI (400)' }],
          childStructure: 'READ',
        });
      }
    }

    expect(seen.filter((d) => d.nodePath === '/audi-a3-a3-sedan')[0].type).toBe('DISCOVER');
    expect(seen.filter((d) => d.nodePath === '/audi-a3-a3-sportback')[0].type).toBe('DISCOVER');
  });

  /**
   * A3 Sedan (3.132) ve A3 Sportback (2.960) yine asiri buyuk: ayni algoritma
   * bir seviye daha uygulanir ve yalnizca <=1000 olan TORUNLAR toplanir.
   */
  it('applies the same rule one level deeper and collects only the small grandchildren', () => {
    const opts = makeOptions({ scope: null });
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'Audi A3' }]);

    const deeper: Record<string, { countText: string; children: any[] }> = {
      '/audi-a3': { countText: A3_HEADING, children: A3_TAXONOMY },
      '/audi-a3-a3-sedan': {
        countText: 'aramanızda 3.132 ilan bulundu.',
        children: [
          { path: '/audi-a3-a3-sedan-16-tdi', label: '1.6 TDI (900)' },
          { path: '/audi-a3-a3-sedan-35-tfsi', label: '35 TFSI (800)' },
        ],
      },
      '/audi-a3-a3-sportback': {
        countText: 'aramanızda 2.960 ilan bulundu.',
        children: [{ path: '/audi-a3-a3-sportback-16-tdi', label: '1.6 TDI (700)' }],
      },
    };

    drive(session, {
      discovery: (nodePath) => deeper[nodePath],
      page: () => ({ cards: 10, hasNextPage: false }),
    });

    const byPath = new Map(session.itemsView().map((i) => [i.path, i]));

    // Iki seviye de SPLIT_REQUIRED; hicbiri sayfalanmadi.
    expect(byPath.get('/audi-a3')).toMatchObject({ nodeState: 'SPLIT_REQUIRED', pagesDone: 0 });
    expect(byPath.get('/audi-a3-a3-sedan')).toMatchObject({
      nodeState: 'SPLIT_REQUIRED',
      count: 3132,
      pagesDone: 0,
      depth: 1,
    });

    // Torunlar <=1000: toplanabilir yaprak.
    expect(byPath.get('/audi-a3-a3-sedan-16-tdi')).toMatchObject({
      nodeState: 'COLLECTABLE_LEAF',
      count: 900,
      parentPath: '/audi-a3-a3-sedan',
      depth: 2,
    });
    expect(byPath.get('/audi-a3-a3-sportback-16-tdi')).toMatchObject({
      nodeState: 'COLLECTABLE_LEAF',
      count: 700,
      depth: 2,
    });

    // Toplanan her sey yalnizca yapraklardan geldi.
    const collectedFrom = new Set(opts.staging.readAll().map((r) => r.jobId));
    expect([...collectedFrom].sort()).toEqual([
      '/audi-a3-a3-cabrio',
      '/audi-a3-a3-hatchback',
      '/audi-a3-a3-sedan-16-tdi',
      '/audi-a3-a3-sedan-35-tfsi',
      '/audi-a3-a3-sportback-16-tdi',
    ]);
  });
});

// ------------------------------------------------- H) smoke cap is leaf-only

/** Gercek yaprak buyuklukleri — sahte sayfa uretimi bunlara uyar. */
const LEAF_COUNTS: Record<string, number> = {
  '/audi-a3-a3-cabrio': 101,
  '/audi-a3-a3-hatchback': 366,
};

describe('H) SMOKE PAGE LIMIT APPLIES TO TERMINAL LEAVES ONLY', () => {
  it('never lets the 3-page limit turn an oversized parent into a pseudo-leaf', () => {
    const session = startAtA3();
    discoverA3(session);

    const root = session.itemsView().find((i) => i.path === '/audi-a3')!;
    expect(root.nodeState).toBe('SPLIT_REQUIRED');
    expect(root.expectedPages).toBeNull(); // ebeveynin sayfa beklentisi YOKTUR
  });

  it('truncates a genuine leaf at 3 pages and records it as a scope limit', () => {
    const session = startAtA3();

    drive(session, {
      discovery: (nodePath) =>
        nodePath === '/audi-a3'
          ? { countText: A3_HEADING, children: A3_TAXONOMY }
          : // 3.132 / 2.960: derinlestirilmez, EKSIK isaretlenir (bu test onlarla ilgili degil)
            { countText: 'aramanızda 3.132 ilan bulundu.', children: [], childStructure: 'EMPTY' },
      /**
       * Kaynagi DURUSTCE taklit et: bir yaprak bildirdigi sayimdan fazla kart
       * gosteremez. (Ilk denemede her sayfaya 50 kart verilmisti ve 101 ilanli
       * Cabrio icin sayim-celiski korumasi hakli olarak devreye girdi.)
       */
      page: (nodePath, page) => {
        const total = LEAF_COUNTS[nodePath] ?? 0;
        const before = (page - 1) * 50;
        const cards = Math.max(0, Math.min(50, total - before));
        return { cards, hasNextPage: before + cards < total };
      },
    });

    // A3 Hatchback: 366 ilan = 8 DOGAL sayfa; kapsam yalnizca 3'unu topladi.
    const leaf = session.itemsView().find((i) => i.path === '/audi-a3-a3-hatchback')!;
    expect(leaf.expectedPages).toBe(8);
    expect(leaf.pagesDone).toBe(3);
    expect(session.incompleteNodes()).toContainEqual(
      expect.objectContaining({ path: '/audi-a3-a3-hatchback', reason: 'SCOPE_PAGE_LIMIT' }),
    );

    // A3 Cabrio: 101 ilan = 3 sayfa; kapsam tavaniyla AYNI, kirpilmadi.
    const cabrio = session.itemsView().find((i) => i.path === '/audi-a3-a3-cabrio')!;
    expect(cabrio.expectedPages).toBe(3);
    expect(cabrio.pagesDone).toBe(3);
  });
});

// ---------------------------------------- I) status precedence when draining

describe('I) RUN STATUS CANNOT CLAIM COMPLETE', () => {
  it('reports SMOKE_LIMIT_REACHED, not COMPLETE, when only the scope truncated', () => {
    const opts = makeOptions();
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'Audi A3' }]);
    session.nextDirective();
    session.submitDiscovery({
      runId: RUN_ID,
      nodePath: '/audi-a3',
      countText: 'aramanızda 900 ilan bulundu.',
      children: [],
      childStructure: 'READ',
    });

    for (let page = 1; page <= 3; page += 1) {
      session.nextDirective();
      session.submitPageBatch(pageBatch('/audi-a3', page, 50, true));
    }

    const halt: any = session.nextDirective();
    expect(halt.type).toBe('HALT');
    expect(halt.state).toBe('SMOKE_LIMIT_REACHED');
    expect(session.currentState).not.toBe('COMPLETE');
    expect(session.status().runComplete).toBe(false);
  });

  it('reports INCOMPLETE when a node could not be partitioned', () => {
    const session = AutopilotSession.start(makeOptions({ scope: null }), [
      { path: '/audi-a3', label: 'Audi A3' },
    ]);
    session.nextDirective();
    session.submitDiscovery({
      runId: RUN_ID,
      nodePath: '/audi-a3',
      countText: A3_HEADING,
      children: [],
      childStructure: 'EMPTY',
    });

    const halt: any = session.nextDirective();
    expect(halt.state).toBe('INCOMPLETE');
    expect(halt.reason).toContain('NO_TRUTHFUL_PARTITION');
    expect(session.status().runComplete).toBe(false);
  });

  it('still reports COMPLETE for an unscoped run that genuinely finished', () => {
    const session = AutopilotSession.start(makeOptions({ scope: null }), [
      { path: '/audi-a3', label: 'Audi A3' },
    ]);
    session.nextDirective();
    session.submitDiscovery({
      runId: RUN_ID,
      nodePath: '/audi-a3',
      countText: 'aramanızda 40 ilan bulundu.',
      children: [],
      childStructure: 'READ',
    });
    session.nextDirective();
    session.submitPageBatch(pageBatch('/audi-a3', 1, 40, false));

    const halt: any = session.nextDirective();
    expect(halt.state).toBe('COMPLETE');
    expect(session.status().runComplete).toBe(true);
  });
});

// -------------------------------------------------- J/K) unreadable -> STOP

describe('J-K) UNREADABLE SOURCE STOPS', () => {
  it('stops when the heading carries no readable count', () => {
    const opts = makeOptions();
    const session = startAtA3(opts);
    session.nextDirective();
    session.submitDiscovery({
      runId: RUN_ID,
      nodePath: '/audi-a3',
      countText: 'Audi A3 Fiyatları & Modelleri',
      children: A3_TAXONOMY,
      childStructure: 'READ',
    });

    expect(session.currentState).toBe('ERROR');
    expect(session.status().lastError).toContain('UNKNOWN_COUNT');
    expect(opts.staging.readAll()).toHaveLength(0);
  });

  it('stops when an oversized node has no readable taxonomy', () => {
    const session = startAtA3();
    session.nextDirective();
    session.submitDiscovery({
      runId: RUN_ID,
      nodePath: '/audi-a3',
      countText: A3_HEADING,
      children: [],
      childStructure: 'UNREADABLE',
    });

    expect(session.currentState).toBe('ERROR');
    expect(session.status().lastError).toContain('UNKNOWN_CATEGORY_STRUCTURE');
  });

  it('stops a leaf whose page count contradicts the reported count, staging nothing', () => {
    const opts = makeOptions();
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'Audi A3' }]);
    session.nextDirective();
    /**
     * Canli hatanin tam replayi: sayim 3 okunuyor ama sayfa 50 kart getiriyor.
     * Yeni davranis: hicbir sey yazma, dur.
     */
    session.submitDiscovery({
      runId: RUN_ID,
      nodePath: '/audi-a3',
      countText: 'aramanızda 3 ilan bulundu.',
      children: [],
      childStructure: 'READ',
    });
    session.nextDirective();
    const result = session.submitPageBatch(pageBatch('/audi-a3', 1, 50, true));

    expect(result).toMatchObject({ countMismatch: true, accepted: 0, leafComplete: false });
    expect(opts.staging.readAll()).toHaveLength(0);
    expect(session.status().lastError).toContain('REPORTED_COUNT_MISMATCH');
    expect(session.currentState).toBe('ERROR');
  });
});

// -------------------------------------------------------------- L) taxonomy

describe('L) TAXONOMY FILTER KEEPS THE RUN INSIDE AUDI A3', () => {
  const normalize = (p: string) => normalizeNodePath(BASE_URL, p);

  it('accepts only strict descendants of the current node', () => {
    const children = filterImmediateChildren(
      '/audi-a3',
      [
        ...A3_TAXONOMY,
        { path: '/audi-a4', label: 'A4 (5.000)' },
        { path: '/bmw-3-serisi', label: '3 Serisi (11.265)' },
        { path: '/audi', label: 'Audi (60.000)' },
        { path: '/audi-a3?pagingOffset=50', label: 'Sonraki (50)' },
        { path: 'https://reklam.example/x', label: 'Sponsor (9)' },
      ],
      1,
      normalize,
    );

    expect(children.map((c) => c.path)).toEqual([
      '/audi-a3-a3-cabrio',
      '/audi-a3-a3-hatchback',
      '/audi-a3-a3-sedan',
      '/audi-a3-a3-sportback',
    ]);
  });

  it('carries name, path, count, parentPath and depth for every child', () => {
    const children = filterImmediateChildren('/audi-a3', A3_TAXONOMY, 1, normalize);
    expect(children[2]).toEqual({
      path: '/audi-a3-a3-sedan',
      label: 'A3 Sedan',
      count: 3132,
      parentPath: '/audi-a3',
      depth: 1,
    });
  });

  it('drops a candidate with no readable count rather than guessing one', () => {
    const children = filterImmediateChildren(
      '/audi-a3',
      [{ path: '/audi-a3-a3-cabrio', label: 'A3 Cabrio' }],
      1,
      normalize,
    );
    expect(children).toHaveLength(0);
  });
});
