/**
 * ILK CANLI DUMAN KOSUSU — KAPSAM KORUMASI SOZLESMELERI.
 *
 * Ilk gercek kosunun amaci iki secici grubunu (sonuc sayisi, alt kategori)
 * dogrulamaktir. Bu testler o kosunun hedefin disina TASAMAYACAGINI ve
 * okunamayan bir sayfayi TAHMIN ETMEYECEGINI sabitler.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AtomicChecksummedFile } from '../checkpoint-store';
import { StagingStore } from '../staging-store';
import { AutopilotProtocolError, ObservedCard, PageBatch } from './autopilot-contracts';
import {
  AutopilotCheckpointPayload,
  AutopilotSession,
  AutopilotSessionOptions,
  MapReferenceLookup,
} from './autopilot-session';
import {
  AutopilotScope,
  isUnderRoot,
  normalizeScopeRoot,
  ScopeGuard,
  slugify,
} from './scope-guard';
import { buildLeafPageUrl } from './source-url';

const BASE_URL = 'https://www.sahibinden.com/';
const RUN_ID = 'smoke-run';

/** Audi/A3 burada YALNIZCA bir yapilandirma degeridir; uygulamada sabit degil. */
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-scope-'));
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

function startScoped(overrides: Partial<AutopilotSessionOptions> = {}): AutopilotSession {
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

function batch(nodePath: string, page: number, count: number, hasNextPage: boolean): PageBatch {
  return {
    runId: RUN_ID,
    nodePath,
    page,
    categoryText: 'Audi A3 Fiyatları & Modelleri',
    pageUrl: buildLeafPageUrl(BASE_URL, nodePath, page),
    cards: Array.from({ length: count }, (_, i) => card(`p${page}-${i + 1}`)),
    hasNextPage,
    parseFailures: 0,
  };
}

/** Kesif raporu kisayolu — varsayilan olarak yapiyi OKUNMUS bildirir. */
function discovery(nodePath: string, count: number | null, children: any[] = [], structure: any = 'READ') {
  return { runId: RUN_ID, nodePath, count, children, childStructure: structure };
}

// --------------------------------------------------------- containment (pure)

describe('SCOPE CONTAINMENT', () => {
  it('respects segment boundaries so a longer sibling path is not swallowed', () => {
    expect(isUnderRoot('/audi-a3', '/audi-a3')).toBe(true);
    expect(isUnderRoot('/audi-a3-sportback', '/audi-a3')).toBe(true);
    expect(isUnderRoot('/audi-a3?a5_min=2015', '/audi-a3')).toBe(true);
    expect(isUnderRoot('/audi-a30', '/audi-a3')).toBe(false);
    expect(isUnderRoot('/audi-a4', '/audi-a3')).toBe(false);
  });

  it('requires the make and series slugs to be present as whole path tokens', () => {
    const guard = new ScopeGuard(SMOKE_SCOPE);
    expect(guard.evaluate('/audi-a3')).toEqual({ allowed: true, reason: null });
    expect(guard.evaluate('/audi-a3-sportback')).toEqual({ allowed: true, reason: null });
    expect(guard.evaluate('/audi-a4')).toEqual({ allowed: false, reason: 'OUTSIDE_ROOT' });
    expect(guard.evaluate('/bmw-3-serisi')).toEqual({ allowed: false, reason: 'OUTSIDE_ROOT' });
  });

  it('normalizes Turkish labels into comparable slugs', () => {
    expect(slugify('3 Serisi')).toBe('3-serisi');
    expect(slugify('Şahin')).toBe('sahin');
    expect(slugify('A3')).toBe('a3');
  });
});

describe('SCOPE ROOT NORMALIZATION', () => {
  it('accepts a source path with or without the leading slash', () => {
    expect(normalizeScopeRoot('/audi-a3', BASE_URL)).toBe('/audi-a3');
    expect(normalizeScopeRoot('audi-a3', BASE_URL)).toBe('/audi-a3');
    expect(normalizeScopeRoot('/audi-a3/', BASE_URL)).toBe('/audi-a3');
  });

  it('accepts the full listing URL and keeps its filter parameters', () => {
    expect(normalizeScopeRoot('https://www.sahibinden.com/audi-a3', BASE_URL)).toBe('/audi-a3');
    expect(normalizeScopeRoot('https://www.sahibinden.com/audi-a3?a5_min=2015', BASE_URL)).toBe(
      '/audi-a3?a5_min=2015',
    );
  });

  it('rejects a URL from another origin', () => {
    expect(() => normalizeScopeRoot('https://evil.example/audi-a3', BASE_URL)).toThrow(
      /not on the source origin/,
    );
  });

  /**
   * Olculen tuzak: Git Bash "--scope-root /audi-a3" argumanini
   * "C:/Program Files/Git/audi-a3" haline getiriyor. Sessizce kabul edilseydi
   * koruma her dugumu reddeder ve kosu sebepsiz bos gorunurdu.
   */
  it('rejects an MSYS-mangled Windows path with an actionable message', () => {
    expect(() => normalizeScopeRoot('C:/Program Files/Git/audi-a3', BASE_URL)).toThrow(
      /looks like a Windows path/,
    );
    expect(() => normalizeScopeRoot('C:\\dev\\audi-a3', BASE_URL)).toThrow(/MSYS_NO_PATHCONV/);
  });
});

// ------------------------------------------------------------- 1) escape to A4

describe('TARGET CANNOT ESCAPE TO ANOTHER SERIES', () => {
  it('refuses to queue an Audi A4 child discovered under Audi A3', () => {
    const session = startScoped();
    session.nextDirective();

    const outcome = session.submitDiscovery(
      discovery('/audi-a3', 4200, [
        { path: '/audi-a3-sportback', label: 'A3 Sportback', count: 900 },
        { path: '/audi-a4', label: 'A4', count: 800 },
      ]),
    );

    // A4 Audi A3'un alt soyu DEGIL: taksonomi filtresi onu cocuk saymaz.
    expect(outcome).toMatchObject({ outcome: 'SPLIT_REQUIRED', enqueued: 1 });
    expect(session.itemsView().map((i) => i.path)).toEqual(['/audi-a3', '/audi-a3-sportback']);
  });

  /**
   * Kapsam koku kosu kokunden DAHA DAR olabilir. O zaman gecerli bir alt soy
   * bile kapsam disinda kalir ve KAPSAM KORUMASI devreye girer.
   */
  it('records a genuine descendant that falls outside a narrower scope root', () => {
    const narrow: AutopilotScope = { ...SMOKE_SCOPE, rootPath: '/audi-a3-sedan' };
    const session = AutopilotSession.start(makeOptions({ scope: narrow }), [
      { path: '/audi-a3-sedan', label: 'A3 Sedan' },
    ]);
    session.nextDirective();

    session.submitDiscovery(
      discovery('/audi-a3-sedan', 3132, [
        { path: '/audi-a3-sedan-16-tdi', label: '1.6 TDI', count: 400 },
        { path: '/audi-a3-sedan.htm', label: 'other', count: 10 },
      ]),
    );

    expect(session.itemsView().map((i) => i.path)).toEqual([
      '/audi-a3-sedan',
      '/audi-a3-sedan-16-tdi',
    ]);
  });

  it('refuses a scoped run whose root is outside the scope', () => {
    expect(() =>
      AutopilotSession.start(makeOptions(), [{ path: '/audi-a4', label: 'Audi A4' }]),
    ).toThrow(/outside the configured scope/);
  });
});

// ------------------------------------------------------------- 2) escape to BMW

describe('TARGET CANNOT ESCAPE TO ANOTHER MAKE', () => {
  it('refuses to queue a BMW node discovered under Audi A3', () => {
    const session = startScoped();
    session.nextDirective();

    session.submitDiscovery(
      discovery('/audi-a3', 4200, [
        { path: '/bmw-3-serisi', label: 'BMW 3 Serisi', count: 900 },
        { path: '/audi-a3-hatchback', label: 'A3 Hatchback', count: 400 },
      ]),
    );

    expect(session.itemsView().map((i) => i.path)).toEqual(['/audi-a3', '/audi-a3-hatchback']);
  });

  it('never issues a navigation directive for an out-of-scope path', () => {
    const session = startScoped();
    session.nextDirective();
    session.submitDiscovery(
      discovery('/audi-a3', 4200, [{ path: '/bmw', label: 'BMW', count: 50 }]),
    );

    // Kapsam disi tek cocuk kuyruga girmedi: gidilecek is kalmadi.
    const next = session.nextDirective();
    expect(next.type).toBe('HALT');
  });
});

// ---------------------------------------------------------- 3) max result pages

describe('MAX RESULT PAGES', () => {
  /**
   * Kapsam siniri bir dugumun BUYUKLUGUNU degistirmez; yalnizca kac sayfasinin
   * toplanacagini kirpar. Ikisini tek degiskene karistirmak, asiri buyuk bir
   * ebeveyni sahte yaprak yapan canli hatanin yarisiydi.
   */
  it('keeps the natural page expectation and truncates only the collection', () => {
    const session = startScoped();
    session.nextDirective();
    // 900 ilan = 18 sayfa DOGAL beklenti; kapsam yalnizca 3 sayfa toplar.
    session.submitDiscovery(discovery('/audi-a3', 900));

    expect(session.itemsView()[0]).toMatchObject({
      kind: 'LEAF',
      nodeState: 'COLLECTABLE_LEAF',
      expectedPages: 18,
    });
    expect(session.nextDirective()).toMatchObject({ type: 'COLLECT_PAGE', page: 1 });
  });

  it('stops after page 3 and never issues page 4', () => {
    const session = startScoped();
    session.nextDirective();
    session.submitDiscovery(discovery('/audi-a3', 900));

    const pages: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const directive: any = session.nextDirective();
      expect(directive.type).toBe('COLLECT_PAGE');
      pages.push(directive.page);
      session.submitPageBatch(batch('/audi-a3', directive.page, 50, true));
    }

    expect(pages).toEqual([1, 2, 3]);
    expect(session.nextDirective().type).toBe('HALT');
    expect(session.itemsView()[0]).toMatchObject({ status: 'COMPLETE', pagesDone: 3 });
  });

  it('rejects a page-4 submission even if the extension tried', () => {
    const session = startScoped();
    session.nextDirective();
    session.submitDiscovery(discovery('/audi-a3', 900));
    for (let page = 1; page <= 3; page += 1) {
      session.nextDirective();
      session.submitPageBatch(batch('/audi-a3', page, 50, true));
    }
    expect(() => session.submitPageBatch(batch('/audi-a3', 4, 50, true))).toThrow(
      AutopilotProtocolError,
    );
  });

  it('records the truncation so the run can never claim completeness', () => {
    const session = startScoped();
    session.nextDirective();
    session.submitDiscovery(discovery('/audi-a3', 900));
    for (let page = 1; page <= 3; page += 1) {
      session.nextDirective();
      session.submitPageBatch(batch('/audi-a3', page, 50, true));
    }

    expect(session.incompleteNodes()).toEqual([
      { path: '/audi-a3', label: 'Audi A3', count: 900, reason: 'SCOPE_PAGE_LIMIT' },
    ]);
    expect(session.isRunComplete()).toBe(false);
    expect(session.status()).toMatchObject({ scopeLimited: true, runComplete: false });
  });

  it('keeps a scoped run partial even when every leaf finished cleanly', () => {
    const session = startScoped();
    session.nextDirective();
    session.submitDiscovery(discovery('/audi-a3', 40));
    session.nextDirective();
    session.submitPageBatch(batch('/audi-a3', 1, 40, false));

    expect(session.itemsView()[0].status).toBe('COMPLETE');
    expect(session.incompleteNodes()).toHaveLength(0);
    // Hedef disi her sey hic gezilmedi: aylik tazeleme olarak TAM DEGIL.
    expect(session.isRunComplete()).toBe(false);
  });
});

// ------------------------------------------------- 4) recursion inside the scope

describe('RECURSION INSIDE THE TARGET', () => {
  it('still splits an oversized node into in-scope children', () => {
    const session = startScoped();
    session.nextDirective();
    session.submitDiscovery(
      discovery('/audi-a3', 4200, [
        { path: '/audi-a3-sportback', label: 'A3 Sportback', count: 2400 },
        { path: '/audi-a3-hatchback', label: 'A3 Hatchback', count: 800 },
      ]),
    );

    const next: any = session.nextDirective();
    expect(next).toMatchObject({ type: 'DISCOVER', nodePath: '/audi-a3-sportback' });

    // Ikinci seviye de kapsam icinde: ozyineleme DEVAM EDER.
    session.submitDiscovery(
      discovery('/audi-a3-sportback', 2400, [
        { path: '/audi-a3-sportback-16-tdi', label: '1.6 TDI', count: 700 },
      ]),
    );
    expect(session.itemsView().map((i) => i.path)).toContain('/audi-a3-sportback-16-tdi');
  });

  it('accepts an in-scope secondary partition carrying source filter params', () => {
    const session = startScoped();
    session.nextDirective();
    session.submitDiscovery({
      ...discovery('/audi-a3', 2400, []),
      secondaryPartitions: [
        { path: '/audi-a3?a5_min=2015', label: '2015+', count: 900 },
        { path: '/audi-a3?a5_max=2014', label: '-2014', count: 800 },
      ],
    });
    expect(session.itemsView().filter((i) => i.kind === 'LEAF')).toHaveLength(2);
  });
});

// ---------------------------------------------- 5/6) unreadable source -> STOP

describe('UNREADABLE SOURCE STOPS THE RUN', () => {
  it('stops when the result count cannot be read', () => {
    const opts = makeOptions();
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'Audi A3' }]);
    session.nextDirective();

    const outcome = session.submitDiscovery(discovery('/audi-a3', null));

    expect(outcome.outcome).toBe('INCOMPLETE');
    expect(session.currentState).toBe('ERROR');
    expect(session.status().lastError).toContain('UNKNOWN_COUNT');
    expect(session.incompleteNodes()[0].reason).toBe('UNKNOWN_COUNT');
    expect(session.nextDirective()).toMatchObject({ type: 'HALT', state: 'ERROR' });
    expect(opts.checkpointFile.load().state).toBe('ERROR');
  });

  it('stops when the child category container could not be found', () => {
    const session = startScoped();
    session.nextDirective();

    const outcome = session.submitDiscovery(discovery('/audi-a3', 900, [], 'UNREADABLE'));

    expect(outcome.outcome).toBe('INCOMPLETE');
    expect(session.currentState).toBe('ERROR');
    expect(session.status().lastError).toContain('UNKNOWN_CATEGORY_STRUCTURE');
    expect(session.itemsView()[0].status).toBe('BLOCKED');
  });

  it('stops on EMPTY too, because a missed selector and a real leaf look alike', () => {
    const session = startScoped();
    session.nextDirective();
    session.submitDiscovery(discovery('/audi-a3', 900, [], 'EMPTY'));

    expect(session.currentState).toBe('ERROR');
    expect(session.incompleteNodes()[0].reason).toBe('UNKNOWN_CATEGORY_STRUCTURE');
  });

  it('guesses nothing: no listing is staged when the run stops on an unreadable page', () => {
    const opts = makeOptions();
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'Audi A3' }]);
    session.nextDirective();
    session.submitDiscovery(discovery('/audi-a3', null));

    expect(opts.staging.readAll()).toHaveLength(0);
  });

  it('leaves an unscoped monthly run untouched by the smoke-only stops', () => {
    const session = AutopilotSession.start(makeOptions({ scope: null }), [
      { path: '/audi-a3', label: 'Audi A3' },
    ]);
    session.nextDirective();
    // Kapsamsiz kosuda okunamayan yapi kosuyu DURDURMAZ; dugum EKSIK isaretlenir.
    session.submitDiscovery(discovery('/audi-a3', 4200, [], 'UNREADABLE'));

    expect(session.currentState).toBe('RUNNING');
    expect(session.incompleteNodes()[0].reason).toBe('NO_TRUTHFUL_PARTITION');
  });
});

// ------------------------------------------------------- 7/8) db + checkpoint

describe('SNAPSHOT AND CHECKPOINT UNDER SCOPE', () => {
  it('opens no write surface: observations go to staging, never to the snapshot', () => {
    const opts = makeOptions();
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'Audi A3' }]);
    session.nextDirective();
    session.submitDiscovery(discovery('/audi-a3', 40));
    session.nextDirective();
    session.submitPageBatch(batch('/audi-a3', 1, 10, false));

    expect(opts.staging.readAll()).toHaveLength(10);
    expect(opts.checkpointFile.load().snapshotPath).toBeNull();
    // Oturumun disariya actigi tek yazma yuzeyi staging'dir.
    expect(typeof (session as any).write).toBe('undefined');
  });

  it('keeps a valid, scope-carrying checkpoint after every page', () => {
    const opts = makeOptions();
    const session = AutopilotSession.start(opts, [{ path: '/audi-a3', label: 'Audi A3' }]);
    session.nextDirective();
    session.submitDiscovery(discovery('/audi-a3', 900));

    for (let page = 1; page <= 3; page += 1) {
      session.nextDirective();
      session.submitPageBatch(batch('/audi-a3', page, 50, true));
      const saved = opts.checkpointFile.load();
      expect(saved.items[0].pagesDone).toBe(page);
      expect(saved.scope).toEqual(SMOKE_SCOPE);
    }
  });

  it('resumes a scoped run with the same scope', () => {
    const first = makeOptions();
    const session = AutopilotSession.start(first, [{ path: '/audi-a3', label: 'Audi A3' }]);
    session.nextDirective();
    session.submitDiscovery(discovery('/audi-a3', 900));
    session.nextDirective();
    session.submitPageBatch(batch('/audi-a3', 1, 50, true));

    const resumed = AutopilotSession.resume(
      makeOptions({
        staging: new StagingStore(path.join(tmpDir, 'staging.jsonl')),
        checkpointFile: new AtomicChecksummedFile<AutopilotCheckpointPayload>(
          path.join(tmpDir, 'checkpoint.json'),
        ),
      }),
    );
    expect(resumed.nextDirective()).toMatchObject({ type: 'COLLECT_PAGE', page: 2 });
    expect(resumed.status().scopeLimited).toBe(true);
  });

  it('refuses to resume a scoped run with the scope removed or widened', () => {
    const first = makeOptions();
    AutopilotSession.start(first, [{ path: '/audi-a3', label: 'Audi A3' }]);

    const reopen = (scope: AutopilotScope | null) =>
      makeOptions({
        scope,
        staging: new StagingStore(path.join(tmpDir, 'staging.jsonl')),
        checkpointFile: new AtomicChecksummedFile<AutopilotCheckpointPayload>(
          path.join(tmpDir, 'checkpoint.json'),
        ),
      });

    expect(() => AutopilotSession.resume(reopen(null))).toThrow(/different scope/);
    expect(() =>
      AutopilotSession.resume(reopen({ ...SMOKE_SCOPE, maxResultPages: 20 })),
    ).toThrow(/different scope/);
    expect(() =>
      AutopilotSession.resume(reopen({ ...SMOKE_SCOPE, rootPath: '/audi' })),
    ).toThrow(/different scope/);
  });
});
