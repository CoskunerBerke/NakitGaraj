/**
 * CHROME AUTOPILOT — GUVENLIK VE TAMLIK SOZLESMELERI.
 *
 * Bu testler kosunun SESSIZCE eksik veri uretmesini imkansiz kilar:
 * >1000 dugum toplanamaz, sayfa sirasi atlanamaz, bilinen ilan detayi
 * acilmaz, engel/deadline durumunda checkpoint kaybolmaz.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AtomicChecksummedFile } from '../checkpoint-store';
import { StagingStore } from '../staging-store';
import { ReferenceFingerprint } from '../known-fingerprint';
import { AutopilotProtocolError, ObservedCard, PageBatch } from './autopilot-contracts';
import {
  AutopilotCheckpointPayload,
  AutopilotSession,
  AutopilotSessionOptions,
  MapReferenceLookup,
} from './autopilot-session';
import {
  buildLeafPageUrl,
  MAX_CARDS_PER_PAGE,
  MAX_PAGES_PER_LEAF,
  normalizeNodePath,
} from './source-url';

const BASE_URL = 'https://www.sahibinden.com/';
const RUN_ID = 'test-run';
const SOURCE = 'sahibinden';

let tmpDir: string;
let clock: number;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-autopilot-'));
  clock = Date.parse('2026-08-25T02:00:00.000Z');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeOptions(
  overrides: Partial<AutopilotSessionOptions> = {},
  references: Array<[string, ReferenceFingerprint]> = [],
): AutopilotSessionOptions {
  return {
    runId: RUN_ID,
    source: SOURCE,
    baseUrl: BASE_URL,
    staging: new StagingStore(path.join(tmpDir, 'staging.jsonl')),
    checkpointFile: new AtomicChecksummedFile<AutopilotCheckpointPayload>(
      path.join(tmpDir, 'checkpoint.json'),
    ),
    reference: new MapReferenceLookup(references),
    snapshotPath: null,
    deadlineAtMs: null,
    now: () => clock,
    ...overrides,
  };
}

function card(id: string, extra: Partial<ObservedCard> = {}): ObservedCard {
  return {
    sourceListingId: id,
    href: `/ilan/${id}/detay`,
    title: `Audi A3 1.6 TDI ${id}`,
    priceText: '1.450.000 TL',
    mileageText: '120.000',
    yearText: '2018',
    locationText: 'İstanbul Kadıköy',
    ...extra,
  };
}

function batch(nodePath: string, page: number, cards: ObservedCard[], hasNextPage: boolean): PageBatch {
  return {
    runId: RUN_ID,
    nodePath,
    page,
    categoryText: 'Audi A3 A3 Hatchback Fiyatları & Modelleri',
    pageUrl: buildLeafPageUrl(BASE_URL, nodePath, page),
    cards,
    hasNextPage,
    parseFailures: 0,
  };
}

function cardsFor(prefix: string, count: number): ObservedCard[] {
  return Array.from({ length: count }, (_, i) => card(`${prefix}-${i + 1}`));
}

/** Bir yapragi kesif uzerinden hazir hale getirir. */
function discoverLeaf(session: AutopilotSession, nodePath: string, count: number): void {
  session.nextDirective();
  session.submitDiscovery({ runId: RUN_ID, nodePath, count, children: [] });
}

// ---------------------------------------------------------------------- start

describe('START', () => {
  it('initializes a run with the roots queued and a checkpoint on disk', () => {
    const opts = makeOptions();
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'Audi A3' }]);

    expect(session.currentState).toBe('RUNNING');
    expect(session.itemsView()).toHaveLength(1);
    expect(session.itemsView()[0]).toMatchObject({ kind: 'DISCOVER', status: 'PENDING' });
    expect(opts.checkpointFile.exists()).toBe(true);
    expect(session.status().runId).toBe(RUN_ID);
  });

  it('refuses to start without roots', () => {
    expect(() => AutopilotSession.start(makeOptions(), [])).toThrow(AutopilotProtocolError);
  });

  it('issues a DISCOVER directive for the root before any collection', () => {
    const session = AutopilotSession.start(makeOptions(), [{ path: '/bmw', label: 'BMW' }]);
    const directive = session.nextDirective();
    expect(directive).toMatchObject({ type: 'DISCOVER', nodePath: '/bmw' });
  });
});

// ------------------------------------------------------------- partition rules

describe('RECURSIVE PARTITION', () => {
  it('splits a >1000 node into its visible children and never collects the parent', () => {
    const session = AutopilotSession.start(makeOptions(), [
      { path: '/bmw-3-serisi', label: '3 Serisi' },
    ]);
    session.nextDirective();

    const outcome = session.submitDiscovery({
      runId: RUN_ID,
      nodePath: '/bmw-3-serisi',
      count: 11265,
      children: [
        { path: '/bmw-3-serisi-316i', label: '316i', count: 1694 },
        { path: '/bmw-3-serisi-318i', label: '318i', count: 948 },
        { path: '/bmw-3-serisi-315', label: '315', count: 11 },
      ],
    });

    expect(outcome).toMatchObject({ outcome: 'SPLIT_REQUIRED', enqueued: 3, count: 11265 });

    const items = session.itemsView();
    const parent = items.find((i) => i.path === '/bmw-3-serisi')!;
    expect(parent.status).toBe('COMPLETE');
    expect(parent.kind).toBe('DISCOVER'); // ebeveyn hicbir zaman LEAF olmadi

    // <=1000 cocuklar dogrudan toplanabilir yaprak; >1000 cocuk yine kesif ister.
    expect(items.find((i) => i.path === '/bmw-3-serisi-318i')).toMatchObject({
      kind: 'LEAF',
      expectedPages: 19,
    });
    expect(items.find((i) => i.path === '/bmw-3-serisi-315')).toMatchObject({
      kind: 'LEAF',
      expectedPages: 1,
    });
    expect(items.find((i) => i.path === '/bmw-3-serisi-316i')).toMatchObject({ kind: 'DISCOVER' });
  });

  it('recurses again when a child is still oversized', () => {
    const session = AutopilotSession.start(makeOptions(), [
      { path: '/bmw-3-serisi', label: '3 Serisi' },
    ]);
    session.nextDirective();
    session.submitDiscovery({
      runId: RUN_ID,
      nodePath: '/bmw-3-serisi',
      count: 11265,
      children: [{ path: '/bmw-3-serisi-316i', label: '316i', count: 1694 }],
    });

    const next = session.nextDirective();
    expect(next).toMatchObject({ type: 'DISCOVER', nodePath: '/bmw-3-serisi-316i' });

    session.submitDiscovery({
      runId: RUN_ID,
      nodePath: '/bmw-3-serisi-316i',
      count: 1694,
      children: [
        { path: '/bmw-3-serisi-316i-otomatik', label: 'Otomatik', count: 700 },
        { path: '/bmw-3-serisi-316i-manuel', label: 'Manuel', count: 994 },
      ],
    });

    const leaves = session.itemsView().filter((i) => i.kind === 'LEAF');
    expect(leaves.map((l) => l.path).sort()).toEqual([
      '/bmw-3-serisi-316i-manuel',
      '/bmw-3-serisi-316i-otomatik',
    ]);
  });

  it('marks an oversized node with no truthful partition as UNSPLITTABLE and blocks completion', () => {
    const session = AutopilotSession.start(makeOptions(), [{ path: '/kamyon', label: 'Kamyon' }]);
    session.nextDirective();

    const outcome = session.submitDiscovery({
      runId: RUN_ID,
      nodePath: '/kamyon',
      count: 4200,
      children: [],
      secondaryPartitions: [],
    });

    expect(outcome.outcome).toBe('INCOMPLETE');
    expect(session.incompleteNodes()).toEqual([
      { path: '/kamyon', label: 'Kamyon', count: 4200, reason: 'NO_TRUTHFUL_PARTITION' },
    ]);
    expect(session.isRunComplete()).toBe(false);
    expect(session.status().runComplete).toBe(false);
  });

  it('falls back to truthful secondary partitions when no child categories exist', () => {
    const session = AutopilotSession.start(makeOptions(), [{ path: '/audi-a3', label: 'A3' }]);
    session.nextDirective();

    const outcome = session.submitDiscovery({
      runId: RUN_ID,
      nodePath: '/audi-a3',
      count: 2400,
      children: [],
      secondaryPartitions: [
        { path: '/audi-a3?a5_min=2015', label: '2015+', count: 900 },
        { path: '/audi-a3?a5_max=2014', label: '-2014', count: 1500 },
      ],
    });

    expect(outcome).toMatchObject({ outcome: 'SPLIT_REQUIRED', enqueued: 2 });
    expect(session.isRunComplete()).toBe(false);
  });

  it('never assumes a node is small when the source count could not be read', () => {
    const session = AutopilotSession.start(makeOptions(), [{ path: '/audi-a3', label: 'A3' }]);
    session.nextDirective();

    const outcome = session.submitDiscovery({
      runId: RUN_ID,
      nodePath: '/audi-a3',
      count: null,
      children: [],
    });

    expect(outcome.outcome).toBe('INCOMPLETE');
    expect(session.incompleteNodes()[0].reason).toBe('UNKNOWN_COUNT');
  });

  it('does not enqueue the same node twice', () => {
    const session = AutopilotSession.start(makeOptions(), [{ path: '/bmw', label: 'BMW' }]);
    session.nextDirective();
    session.submitDiscovery({
      runId: RUN_ID,
      nodePath: '/bmw',
      count: 5000,
      children: [
        { path: '/bmw-3-serisi', label: '3 Serisi', count: 900 },
        { path: '/bmw-3-serisi/', label: '3 Serisi (dup)', count: 900 },
      ],
    });
    expect(session.itemsView().filter((i) => i.path === '/bmw-3-serisi')).toHaveLength(1);
  });
});

// ------------------------------------------------------------------ 50 per page

describe('50 RESULTS PER PAGE', () => {
  it('builds leaf page URLs with pagingSize=50 and the matching offset', () => {
    expect(buildLeafPageUrl(BASE_URL, '/audi-a3', 1)).toBe(
      'https://www.sahibinden.com/audi-a3?pagingSize=50&pagingOffset=0',
    );
    expect(buildLeafPageUrl(BASE_URL, '/audi-a3', 3)).toBe(
      'https://www.sahibinden.com/audi-a3?pagingSize=50&pagingOffset=100',
    );
  });

  it('preserves the source filter parameters of a secondary partition', () => {
    const url = new URL(buildLeafPageUrl(BASE_URL, '/audi-a3?a5_min=2015', 2));
    expect(url.searchParams.get('a5_min')).toBe('2015');
    expect(url.searchParams.get('pagingSize')).toBe('50');
    expect(url.searchParams.get('pagingOffset')).toBe('50');
  });

  it('refuses to build a page beyond the source maximum of 20 pages', () => {
    expect(() => buildLeafPageUrl(BASE_URL, '/audi-a3', MAX_PAGES_PER_LEAF + 1)).toThrow(
      /exceeds source maximum/,
    );
  });

  it('refuses off-origin navigation', () => {
    expect(() => buildLeafPageUrl(BASE_URL, 'https://evil.example/audi-a3', 1)).toThrow(
      /off-origin/,
    );
  });

  it('tolerates the handful of showcase rows the source adds, but not an ignored page size', () => {
    const session = AutopilotSession.start(makeOptions(), [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 900);
    session.nextDirective();

    // 50 organik + vitrin satirlari: kabul (kuresel tekillestirme zaten korur).
    expect(
      session.submitPageBatch(batch('/audi-a3', 1, cardsFor('x', MAX_CARDS_PER_PAGE), true)).accepted,
    ).toBe(MAX_CARDS_PER_PAGE);

    // Tavanin uzeri: pagingSize=50 uygulanmamis demektir -> REDDEDILIR.
    session.nextDirective();
    expect(() =>
      session.submitPageBatch(batch('/audi-a3', 2, cardsFor('y', MAX_CARDS_PER_PAGE + 1), true)),
    ).toThrow(AutopilotProtocolError);
  });
});

// ------------------------------------------------------------------ pagination

describe('AUTOMATIC PAGINATION', () => {
  it('walks every expected page and completes the leaf', () => {
    const session = AutopilotSession.start(makeOptions(), [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 120); // 3 sayfa

    const pages: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const directive: any = session.nextDirective();
      expect(directive.type).toBe('COLLECT_PAGE');
      pages.push(directive.page);
      const isLast = directive.page === 3;
      session.submitPageBatch(
        batch('/audi-a3', directive.page, cardsFor(`p${directive.page}`, isLast ? 20 : 50), !isLast),
      );
    }

    expect(pages).toEqual([1, 2, 3]);
    expect(session.itemsView()[0]).toMatchObject({ status: 'COMPLETE', pagesDone: 3 });
    expect(session.status().listingsObserved).toBe(120);
    expect(session.isRunComplete()).toBe(true);
  });

  it('stops early when the source reports no next page', () => {
    const session = AutopilotSession.start(makeOptions(), [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 120);
    session.nextDirective();

    const result = session.submitPageBatch(batch('/audi-a3', 1, cardsFor('p1', 12), false));
    expect(result.leafComplete).toBe(true);
    expect(session.isRunComplete()).toBe(true);
  });

  /**
   * Eskiden burada beklenti sessizce artiriliyordu. Canli kosuda bu davranis,
   * yanlis okunan bir sayimin ustunu ortup 6.559 ilanlik bir EBEVEYNI
   * sayfalatti. Sayim celiskisi artik bir DURDURMA sebebidir.
   */
  it('stops instead of paging past a count the source contradicts', () => {
    const opts = makeOptions();
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 40); // kaynak "1 sayfa" diyor

    session.nextDirective();
    const first = session.submitPageBatch(batch('/audi-a3', 1, cardsFor('p1', 40), true));

    expect(first).toMatchObject({ countMismatch: true, leafComplete: false });
    expect(session.incompleteNodes()[0].reason).toBe('REPORTED_COUNT_MISMATCH');
    expect(session.itemsView()[0].status).toBe('BLOCKED');
    expect(session.isRunComplete()).toBe(false);

    // Ikinci sayfa ASLA istenmez.
    expect(session.nextDirective().type).toBe('HALT');
  });
});

describe('PAGINATION LOOP PREVENTION', () => {
  it('rejects an out-of-order or repeated page submission', () => {
    const session = AutopilotSession.start(makeOptions(), [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 300);
    session.nextDirective();
    session.submitPageBatch(batch('/audi-a3', 1, cardsFor('p1', 50), true));

    expect(() => session.submitPageBatch(batch('/audi-a3', 1, cardsFor('p1b', 50), true))).toThrow(
      /expected 2, received 1/,
    );
    expect(() => session.submitPageBatch(batch('/audi-a3', 4, cardsFor('p4', 50), true))).toThrow(
      /expected 2, received 4/,
    );
  });

  it('stops the leaf when the source keeps returning the same listing ids', () => {
    const session = AutopilotSession.start(makeOptions(), [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 500);

    session.nextDirective();
    session.submitPageBatch(batch('/audi-a3', 1, cardsFor('loop', 50), true));
    session.nextDirective();
    const second = session.submitPageBatch(batch('/audi-a3', 2, cardsFor('loop', 50), true));

    expect(second.paginationLoopStopped).toBe(true);
    expect(second.leafComplete).toBe(true);
  });

  it('marks a leaf incomplete when the source still has pages at the 20-page ceiling', () => {
    const session = AutopilotSession.start(makeOptions(), [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 1000); // 20 sayfa

    for (let page = 1; page <= MAX_PAGES_PER_LEAF; page += 1) {
      session.nextDirective();
      session.submitPageBatch(batch('/audi-a3', page, cardsFor(`p${page}`, 50), true));
    }

    expect(session.itemsView()[0].status).toBe('FAILED');
    expect(session.incompleteNodes()[0].reason).toBe('EXCEEDS_SOURCE_PAGE_LIMIT');
    expect(session.isRunComplete()).toBe(false);
  });
});

// ------------------------------------------------------------- fast path / diff

describe('KNOWN LISTING FAST PATH', () => {
  it('classifies NEW, CHANGED and KNOWN_UNCHANGED without ever opening a detail page', () => {
    const references: Array<[string, ReferenceFingerprint]> = [
      ['same-1', { price: 1450000, mileage: 120000, title: 'Audi A3 1.6 TDI same-1' }],
      ['moved-1', { price: 1300000, mileage: 120000, title: 'Audi A3 1.6 TDI moved-1' }],
    ];
    const session = AutopilotSession.start(makeOptions({}, references), [
      { path: '/audi-a3', label: 'A3' },
    ]);
    discoverLeaf(session, '/audi-a3', 30);
    session.nextDirective();

    const result = session.submitPageBatch(
      batch('/audi-a3', 1, [card('same-1'), card('moved-1'), card('brand-new-1')], false),
    );

    expect(result).toMatchObject({
      newCount: 1,
      changedCount: 1,
      unchangedCount: 1,
      detailFetches: 0,
      accepted: 3,
    });
    expect(session.status()).toMatchObject({ newCount: 1, changedCount: 1, unchangedCount: 1 });
  });

  it('still stages the known-unchanged observation so the diff cannot invent a MISSING listing', () => {
    const opts = makeOptions({}, [
      ['same-1', { price: 1450000, mileage: 120000, title: 'Audi A3 1.6 TDI same-1' }],
    ]);
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 10);
    session.nextDirective();
    session.submitPageBatch(batch('/audi-a3', 1, [card('same-1')], false));

    const staged = opts.staging.readAll();
    expect(staged.map((r) => r.sourceListingId)).toEqual(['same-1']);
    expect(staged[0]).toMatchObject({ price: 1450000, mileage: 120000, year: 2018, currency: 'TRY' });
  });

  it('parses card text on the bridge, not in the extension', () => {
    const opts = makeOptions();
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 10);
    session.nextDirective();
    session.submitPageBatch(
      batch('/audi-a3', 1, [
        card('parse-1', { priceText: '2.395.000 TL', mileageText: '87.500', yearText: '2021' }),
      ], false),
    );

    expect(opts.staging.readAll()[0]).toMatchObject({
      price: 2395000,
      mileage: 87500,
      year: 2021,
      sourceMake: 'Audi',
      sourceModel: 'A3 A3 Hatchback',
      sourceUrl: 'https://www.sahibinden.com/ilan/parse-1/detay',
    });
  });

  it('drops identity-less promo rows instead of observing them', () => {
    const opts = makeOptions();
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 10);
    session.nextDirective();

    const result = session.submitPageBatch(
      batch('/audi-a3', 1, [card('real-1'), card('', { sourceListingId: '   ' })], false),
    );
    expect(result).toMatchObject({ accepted: 1, invalid: 1 });
    expect(opts.staging.readAll()).toHaveLength(1);
  });
});

describe('GLOBAL DEDUP', () => {
  it('keeps one record when the same listing appears under two leaves', () => {
    const opts = makeOptions();
    const session = AutopilotSession.start(opts, [
      { path: '/audi-a3-hatchback', label: 'A3 Hatchback' },
      { path: '/audi-a3-sportback', label: 'A3 Sportback' },
    ]);

    discoverLeaf(session, '/audi-a3-hatchback', 10);
    session.nextDirective();
    session.submitPageBatch(batch('/audi-a3-hatchback', 1, [card('shared-1')], false));

    discoverLeaf(session, '/audi-a3-sportback', 10);
    session.nextDirective();
    const second = session.submitPageBatch(
      batch('/audi-a3-sportback', 1, [card('shared-1'), card('unique-2')], false),
    );

    expect(second).toMatchObject({ accepted: 1, duplicates: 1 });
    expect(opts.staging.readAll().map((r) => r.sourceListingId).sort()).toEqual([
      'shared-1',
      'unique-2',
    ]);
  });
});

// ------------------------------------------------------------------- durability

describe('CHECKPOINT AND RESUME', () => {
  it('writes a checkpoint after every single page', () => {
    const opts = makeOptions();
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 300);

    for (let page = 1; page <= 3; page += 1) {
      session.nextDirective();
      session.submitPageBatch(batch('/audi-a3', page, cardsFor(`p${page}`, 50), true));
      expect(opts.checkpointFile.load().items[0].pagesDone).toBe(page);
    }
  });

  it('resumes at the exact next page after an extension reload', () => {
    const first = makeOptions();
    const session = AutopilotSession.start(first, [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 300);
    session.nextDirective();
    session.submitPageBatch(batch('/audi-a3', 1, cardsFor('p1', 50), true));

    // Uzanti/service worker oldu: yeni surec, ayni disk durumu.
    const reopened = makeOptions({
      staging: new StagingStore(path.join(tmpDir, 'staging.jsonl')),
      checkpointFile: new AtomicChecksummedFile<AutopilotCheckpointPayload>(
        path.join(tmpDir, 'checkpoint.json'),
      ),
    });
    const resumed = AutopilotSession.resume(reopened);

    expect(resumed.currentState).toBe('RUNNING');
    expect(resumed.nextDirective()).toMatchObject({ type: 'COLLECT_PAGE', page: 2 });
    expect(resumed.status().listingsObserved).toBe(50);
  });

  it('rebuilds the global dedup set from staging so a resumed run cannot double-write', () => {
    const first = makeOptions();
    const session = AutopilotSession.start(first, [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 300);
    session.nextDirective();
    session.submitPageBatch(batch('/audi-a3', 1, cardsFor('p1', 50), true));

    const reopened = makeOptions({
      staging: new StagingStore(path.join(tmpDir, 'staging.jsonl')),
      checkpointFile: new AtomicChecksummedFile<AutopilotCheckpointPayload>(
        path.join(tmpDir, 'checkpoint.json'),
      ),
    });
    const resumed = AutopilotSession.resume(reopened);
    resumed.nextDirective();
    const result = resumed.submitPageBatch(batch('/audi-a3', 2, cardsFor('p1', 50), false));

    expect(result).toMatchObject({ accepted: 0, duplicates: 50 });
    expect(reopened.staging.readAll()).toHaveLength(50);
  });

  it('refuses a checkpoint that belongs to another run', () => {
    const first = makeOptions();
    AutopilotSession.start(first, [{ path: '/audi-a3', label: 'A3' }]);
    const other = makeOptions({
      runId: 'different-run',
      checkpointFile: new AtomicChecksummedFile<AutopilotCheckpointPayload>(
        path.join(tmpDir, 'checkpoint.json'),
      ),
    });
    expect(() => AutopilotSession.resume(other)).toThrow(/does not match requested/);
  });
});

describe('PAUSE AND RESUME', () => {
  it('halts on pause and continues from the same page on resume', () => {
    const opts = makeOptions();
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 300);
    session.nextDirective();
    session.submitPageBatch(batch('/audi-a3', 1, cardsFor('p1', 50), true));

    session.pause();
    expect(session.currentState).toBe('PAUSED');
    expect(session.nextDirective()).toMatchObject({ type: 'HALT', state: 'PAUSED' });

    const resumed = AutopilotSession.resume(
      makeOptions({
        staging: new StagingStore(path.join(tmpDir, 'staging.jsonl')),
        checkpointFile: new AtomicChecksummedFile<AutopilotCheckpointPayload>(
          path.join(tmpDir, 'checkpoint.json'),
        ),
      }),
    );
    expect(resumed.nextDirective()).toMatchObject({ type: 'COLLECT_PAGE', page: 2 });
  });
});

// ---------------------------------------------------------------- safety stops

describe('DEADLINE', () => {
  it('checkpoints and halts at the end of the execution window', () => {
    const deadlineAtMs = clock + 60_000;
    const opts = makeOptions({ deadlineAtMs });
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 300);
    session.nextDirective();
    session.submitPageBatch(batch('/audi-a3', 1, cardsFor('p1', 50), true));

    clock = deadlineAtMs + 1;
    expect(session.nextDirective()).toMatchObject({
      type: 'HALT',
      state: 'DEADLINE_REACHED',
    });
    expect(session.currentState).toBe('DEADLINE_REACHED');
    expect(opts.checkpointFile.load().state).toBe('DEADLINE_REACHED');
    expect(opts.checkpointFile.load().items[0].pagesDone).toBe(1);
  });

  it('resumes into the next window without losing collected pages', () => {
    const opts = makeOptions({ deadlineAtMs: clock + 1 });
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 300);
    session.nextDirective();
    session.submitPageBatch(batch('/audi-a3', 1, cardsFor('p1', 50), true));
    clock += 10_000;
    session.nextDirective();

    clock += 10_000;
    const resumed = AutopilotSession.resume(
      makeOptions({
        deadlineAtMs: clock + 3_600_000,
        staging: new StagingStore(path.join(tmpDir, 'staging.jsonl')),
        checkpointFile: new AtomicChecksummedFile<AutopilotCheckpointPayload>(
          path.join(tmpDir, 'checkpoint.json'),
        ),
      }),
    );
    expect(resumed.nextDirective()).toMatchObject({ type: 'COLLECT_PAGE', page: 2 });
  });
});

describe('ACCESS RESTRICTION', () => {
  it('blocks the current job, checkpoints and stops without retrying or bypassing', () => {
    const opts = makeOptions();
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 300);
    session.nextDirective();

    session.reportAccessRestricted({
      runId: RUN_ID,
      nodePath: '/audi-a3',
      kind: 'CAPTCHA',
      evidence: 'Tarayıcınızı kontrol ediyoruz',
    });

    expect(session.currentState).toBe('ACCESS_RESTRICTED');
    expect(session.itemsView()[0].status).toBe('BLOCKED');
    expect(session.status().lastError).toContain('ACCESS_RESTRICTED (CAPTCHA)');
    expect(session.nextDirective()).toMatchObject({ type: 'HALT', state: 'ACCESS_RESTRICTED' });

    const saved = opts.checkpointFile.load();
    expect(saved.state).toBe('ACCESS_RESTRICTED');
    expect(saved.items[0].status).toBe('BLOCKED');
  });

  it('resumes the blocked node after the user fixes the session manually', () => {
    const opts = makeOptions();
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'A3' }]);
    discoverLeaf(session, '/audi-a3', 300);
    session.nextDirective();
    session.submitPageBatch(batch('/audi-a3', 1, cardsFor('p1', 50), true));
    session.nextDirective();
    session.reportAccessRestricted({ runId: RUN_ID, nodePath: '/audi-a3', kind: 'AUTH_REQUIRED' });

    const resumed = AutopilotSession.resume(
      makeOptions({
        staging: new StagingStore(path.join(tmpDir, 'staging.jsonl')),
        checkpointFile: new AtomicChecksummedFile<AutopilotCheckpointPayload>(
          path.join(tmpDir, 'checkpoint.json'),
        ),
      }),
    );
    expect(resumed.currentState).toBe('RUNNING');
    expect(resumed.nextDirective()).toMatchObject({ type: 'COLLECT_PAGE', page: 2 });
  });
});

// ------------------------------------------------------------------- protocol

describe('PROTOCOL GUARDS', () => {
  it('rejects reports carrying an unknown runId or node', () => {
    const session = AutopilotSession.start(makeOptions(), [{ path: '/audi-a3', label: 'A3' }]);
    session.nextDirective();

    expect(() =>
      session.submitDiscovery({ runId: 'other', nodePath: '/audi-a3', count: 10, children: [] }),
    ).toThrow(/Unknown runId/);
    expect(() =>
      session.submitDiscovery({ runId: RUN_ID, nodePath: '/ghost', count: 10, children: [] }),
    ).toThrow(/Unknown node/);
  });

  it('rejects a page batch aimed at a node that has not been resolved to a leaf', () => {
    const session = AutopilotSession.start(makeOptions(), [{ path: '/audi-a3', label: 'A3' }]);
    session.nextDirective();
    expect(() => session.submitPageBatch(batch('/audi-a3', 1, cardsFor('p1', 5), false))).toThrow(
      /is a DISCOVER node/,
    );
  });

  it('normalizes node paths so trailing slashes and paging params cannot fork a job', () => {
    expect(normalizeNodePath(BASE_URL, '/audi-a3/')).toBe('/audi-a3');
    expect(normalizeNodePath(BASE_URL, '/audi-a3?pagingSize=50&pagingOffset=100')).toBe('/audi-a3');
    expect(normalizeNodePath(BASE_URL, '/audi-a3?a5_min=2015')).toBe('/audi-a3?a5_min=2015');
  });
});
