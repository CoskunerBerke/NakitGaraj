/**
 * YAPI V2 — HAFIF KAPI / TAM KAPI KADANSI / TEMPO / KIMLIK / ARTIMLI TAZELEME.
 *
 * Marka kurgusaldir ("Zorlu"). Fikstur sayfalari gercek kayit biciminden
 * turetilmis asgari HTML'dir (structure-page.ts). Hicbir test kaynaga gitmez.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AtomicChecksummedFile } from '../checkpoint-store';
import { categoryPage, loginPage, notFoundPage } from '../__fixtures__/structure-page';
import { CapturePageDirective, PageCapture } from './autopilot-contracts';
import { CorpusIndex } from './corpus-store';
import { RebuildResult, RebuildRunner } from './rebuild-runner';
import {
  StructureCheckpointPayload,
  StructureSession,
  StructureSessionOptions,
} from './structure-session';
import { buildHierarchy, HierarchyTree, ObservedCategory } from '../../vehicle-hierarchy/hierarchy-tree';
import { classifyPage } from '../../vehicle-hierarchy/page-classification';

const BASE_URL = 'https://www.sahibinden.com/';
const RUN_ID = 'structure-v2-test';

const ZORLU = { label: 'Zorlu', slug: 'zorlu' };
const KARTAL = { label: 'Kartal', slug: 'zorlu-kartal' };
const SAHIN = { label: 'Şahin', slug: 'zorlu-sahin' };

const makePage = () =>
  categoryPage({
    chain: [ZORLU],
    nav: [
      { label: 'Otomobil', slug: 'kategori/otomobil' },
      { label: 'Zorlu', slug: 'zorlu', count: 900 },
      { label: 'Kartal', slug: 'zorlu-kartal', count: 500 },
      { label: 'Şahin', slug: 'zorlu-sahin', count: 300 },
      { label: 'Doğan', slug: 'zorlu-dogan', count: 100 },
    ],
    rows: [{ id: '1001', model: 'Kartal 1.6 GL' }],
  });
const kartalPage = () =>
  categoryPage({
    chain: [ZORLU, KARTAL],
    nav: [
      { label: '1.6', slug: 'zorlu-kartal-1.6', count: 400 },
      { label: '2.0 TDI', slug: 'zorlu-kartal-2.0-tdi', count: 100 },
    ],
    rows: [{ id: '1002', model: '1.6 GL' }],
  });
const sahinPage = () =>
  categoryPage({ chain: [ZORLU, SAHIN], nav: [], rows: [{ id: '2001', model: 'Şahin' }] });
/** N terminal cocuklu marka sayfasi: uzun dalgalari ucuz uretmek icin. */
const wide = (n: number) =>
  categoryPage({
    chain: [ZORLU],
    nav: Array.from({ length: n }, (_, i) => ({ label: `M${i + 1}`, slug: `zorlu-m${i + 1}`, count: 10 })),
  });
const terminal = (i: number) =>
  categoryPage({ chain: [ZORLU, { label: `M${i}`, slug: `zorlu-m${i}` }], nav: [], rows: [{ id: `${5000 + i}`, model: `M${i}` }] });

let tmpDir: string;
let corpusDir: string;
let runDir: string;
let clock: number;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-structure-v2-'));
  corpusDir = path.join(tmpDir, 'corpus');
  runDir = path.join(tmpDir, 'run');
  fs.mkdirSync(corpusDir, { recursive: true });
  clock = Date.parse('2026-09-07T02:00:00.000Z');
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function corpusWith(files: Array<{ chain: Array<{ label: string }>; html: string }>): CorpusIndex {
  const observations: ObservedCategory[] = [];
  for (const entry of files) {
    const segments = entry.chain.map((c) => c.label);
    const dir = path.join(corpusDir, segments[0]);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${segments.join(' ')} Fiyatları & Modelleri sahibinden.com'da.html`);
    fs.writeFileSync(file, entry.html, 'utf-8');
    observations.push({ categoryString: segments.join(' '), listingCount: 0, sourceFiles: [file], pathSegments: segments, navChildLabels: [] });
  }
  const tree: HierarchyTree = buildHierarchy(observations, { knownMakes: ['Zorlu'] });
  return new CorpusIndex({ loadTree: () => tree, rootOverride: corpusDir });
}
const emptyCorpus = () => new CorpusIndex({ loadTree: () => null, rootOverride: corpusDir });

function options(overrides: Partial<StructureSessionOptions> = {}, corpus?: CorpusIndex): StructureSessionOptions {
  return {
    runId: RUN_ID,
    source: 'sahibinden',
    baseUrl: BASE_URL,
    checkpointFile: new AtomicChecksummedFile<StructureCheckpointPayload>(path.join(runDir, 'checkpoint.json')),
    corpus: corpus ?? emptyCorpus(),
    runDir,
    maxPages: null,
    rebuildEvery: 0,
    rebuild: null,
    lightCheckEvery: 0,
    paceMs: 5000,
    jitter: 0.4,
    now: () => clock,
    random: () => 0.5,
    ...overrides,
  };
}

function expectCapture(session: StructureSession, key: string): CapturePageDirective {
  const directive = session.nextDirective();
  expect(directive.type).toBe('CAPTURE_PAGE');
  const capture = directive as CapturePageDirective;
  expect(capture.targetKey).toBe(key);
  return capture;
}
function submit(session: StructureSession, directive: CapturePageDirective, html: string) {
  const capture: PageCapture = { runId: RUN_ID, targetKey: directive.targetKey, finalUrl: directive.url, title: 'x', html };
  return session.submitPageCapture(capture);
}
const pending = (s: StructureSession) => s.targetsView().filter((t) => t.status === 'PENDING').map((t) => t.key);

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
    this.resolveNext!({
      ok: gate === 'PASS',
      gate,
      steps: [{ name: 'corpus:validate', exitCode: gate === 'PASS' ? 0 : 1, seconds: 1, logFile: 'x' }],
      startedAt: '2026-09-07T02:00:00.000Z',
      finishedAt: '2026-09-07T02:02:00.000Z',
      detail: gate === 'PASS' ? null : 'RELEASE GATE: FAIL',
    });
  }
}
const tick = () => new Promise((r) => setImmediate(r));

/** Marka + `count` cocuk sayfasi kaydeder (marka 40 cocuk ilan eder). */
function saveWave(session: StructureSession, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const d = session.nextDirective();
    expect(d.type).toBe('CAPTURE_PAGE');
    const key = (d as CapturePageDirective).targetKey;
    submit(session, d as CapturePageDirective, key === '/zorlu' ? wide(40) : terminal(Number(key.replace('/zorlu-m', ''))));
  }
}

// ------------------------------------------------------------- kapi kadansi

describe('STRUCTURE V2: light gate and full gate cadence', () => {
  it('runs the light gate every N accepted pages, passes a valid wave and never publishes on its own', () => {
    const runner = new FakeRunner();
    const session = StructureSession.start(options({ lightCheckEvery: 3, rebuildEvery: 50, rebuild: runner }), ['/zorlu']);
    saveWave(session, 3);
    expect(session.status().sinceLightCheck).toBe(3);
    expectCapture(session, '/zorlu-m3'); // kapi bu cagrida kostu ve gecti
    expect(session.status()).toMatchObject({ lightGates: 1, lastLightGate: 'PASS', sinceLightCheck: 0, fullGates: 0 });
    expect(runner.calls).toBe(0);
    expect(session.currentState).toBe('RUNNING');
  });

  it('stops the run when the light gate finds a wrong parent in the wave (nothing spreads)', () => {
    const opts = options({ lightCheckEvery: 2 });
    const session = StructureSession.start(opts, ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), makePage());
    submit(session, expectCapture(session, '/zorlu-kartal'), kartalPage());
    // Kaydedilmis bir hedefin zincirini checkpoint'te boz (kotu kanit dalgasi taklidi).
    const payload = opts.checkpointFile.load();
    const kartal = payload.targets.find((t) => t.key === '/zorlu-kartal')!;
    kartal.breadcrumb = ['Zorlu', 'Şahin', 'Kartal'];
    kartal.depth = 3;
    opts.checkpointFile.save(payload);

    const resumed = StructureSession.resume(opts);
    expect(resumed.nextDirective().type).toBe('HALT');
    expect(resumed.currentState).toBe('ERROR');
    expect(resumed.status().pauseReason).toContain('LIGHT_GATE_FAIL');
    expect(resumed.status().pauseReason).toContain('WRONG_PARENT');
    expect(resumed.status().lastLightGate).toBe('FAIL');
    expect(resumed.status().attempted).toBe(2); // yeni yakalama verilmedi
  });

  it('stops the run when the light gate finds conflicting exact evidence (two URLs, one exact path)', () => {
    const opts = options({ lightCheckEvery: 2 });
    const session = StructureSession.start(opts, ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), makePage());
    submit(session, expectCapture(session, '/zorlu-kartal'), kartalPage());
    const payload = opts.checkpointFile.load();
    const sahin = payload.targets.find((t) => t.key === '/zorlu-sahin')!;
    Object.assign(sahin, { status: 'COMPLETE', outcome: 'SAVED', breadcrumb: ['Zorlu', 'Kartal'], depth: 2, make: 'Zorlu', ownPath: '/zorlu-sahin', childrenDeclared: 0, terminal: true, savedFile: 'x.html' });
    opts.checkpointFile.save(payload);
    const resumed = StructureSession.resume(opts);
    expect(resumed.nextDirective().type).toBe('HALT');
    expect(resumed.status().pauseReason).toContain('DUPLICATE_EXACT_PATH');
  });

  it('opens the full gate at the configured page threshold, not at every light gate', () => {
    const runner = new FakeRunner();
    const session = StructureSession.start(options({ lightCheckEvery: 2, rebuildEvery: 4, rebuild: runner }), ['/zorlu']);
    saveWave(session, 4);
    expect(session.nextDirective().type).toBe('WAIT');
    expect(session.currentState).toBe('REBUILDING');
    expect(runner.calls).toBe(1);
    expect(session.status().lightGates).toBe(2);
  });

  it('opens the full gate on the time threshold when pages were saved since the last one', async () => {
    const runner = new FakeRunner();
    const session = StructureSession.start(
      options({ rebuildEvery: 500, fullRebuildIntervalMs: 60_000, rebuild: runner }),
      ['/zorlu'],
    );
    saveWave(session, 1);
    clock += 30_000;
    expectCapture(session, '/zorlu-m1'); // sure dolmadi
    expect(runner.calls).toBe(0);
    clock += 31_000;
    expect(session.nextDirective().type).toBe('WAIT');
    expect(runner.calls).toBe(1);
    runner.finish('PASS');
    await tick();
    clock += 120_000; // yeni sayfa yokken sure gecmesi kapi acmaz
    expect(session.nextDirective().type).toBe('CAPTURE_PAGE');
    expect(runner.calls).toBe(1);
  });

  it('always runs the mandatory final full gate even when the final light gate just passed', async () => {
    const runner = new FakeRunner();
    const session = StructureSession.start(options({ lightCheckEvery: 1, rebuildEvery: 50, rebuild: runner }), ['/zorlu-sahin']);
    submit(session, expectCapture(session, '/zorlu-sahin'), sahinPage());
    expect(session.nextDirective().type).toBe('WAIT');
    expect(session.status()).toMatchObject({ lightGates: 1, lastLightGate: 'PASS' });
    expect(runner.calls).toBe(1);
    runner.finish('PASS');
    await tick();
    expect(session.currentState).toBe('COMPLETE');
  });

  it('a failing final light gate blocks completion before the full gate', () => {
    const runner = new FakeRunner();
    const opts = options({ lightCheckEvery: 50, rebuildEvery: 50, rebuild: runner });
    const session = StructureSession.start(opts, ['/zorlu-sahin']);
    submit(session, expectCapture(session, '/zorlu-sahin'), sahinPage());
    const payload = opts.checkpointFile.load();
    payload.targets[0].breadcrumb = null;
    opts.checkpointFile.save(payload);
    const resumed = StructureSession.resume({ ...opts, rebuild: runner });
    expect(resumed.nextDirective().type).toBe('HALT');
    expect(resumed.currentState).toBe('ERROR');
    expect(runner.calls).toBe(0);
  });

  it('benchmark fixture: a coarser full-gate cadence invokes far fewer rebuilds and yields the same structure', async () => {
    async function run(rebuildEvery: number): Promise<{ rebuilds: number; keys: string[]; files: string[] }> {
      const runner = new FakeRunner();
      const dir = fs.mkdtempSync(path.join(tmpDir, `cadence-${rebuildEvery}-`));
      const corpus = new CorpusIndex({ loadTree: () => null, rootOverride: path.join(dir, 'corpus') });
      const session = StructureSession.start(
        options(
          {
            rebuildEvery,
            rebuild: runner,
            lightCheckEvery: 2,
            checkpointFile: new AtomicChecksummedFile<StructureCheckpointPayload>(path.join(dir, 'checkpoint.json')),
            runDir: dir,
          },
          corpus,
        ),
        ['/zorlu'],
      );
      let saved = 0;
      while (saved < 9) {
        const d = session.nextDirective();
        if (d.type === 'WAIT') {
          runner.finish('PASS');
          await tick();
          continue;
        }
        expect(d.type).toBe('CAPTURE_PAGE');
        const key = (d as CapturePageDirective).targetKey;
        submit(session, d as CapturePageDirective, key === '/zorlu' ? wide(8) : terminal(Number(key.replace('/zorlu-m', ''))));
        saved += 1;
      }
      let d = session.nextDirective();
      while (d.type === 'WAIT') {
        runner.finish('PASS');
        await tick();
        d = session.nextDirective();
      }
      expect(session.currentState).toBe('COMPLETE');
      return {
        rebuilds: runner.calls,
        keys: session.targetsView().map((t) => `${t.key}|${t.status}|${(t.breadcrumb ?? []).join('/')}`).sort(),
        files: fs.readdirSync(path.join(dir, 'corpus', 'Zorlu')).sort(),
      };
    }
    const fine = await run(2); // 9 sayfa: 4 ara + 1 son
    const coarse = await run(50); // yalnizca zorunlu son
    expect(fine.rebuilds).toBe(5);
    expect(coarse.rebuilds).toBe(1);
    expect(coarse.keys).toEqual(fine.keys);
    expect(coarse.files).toEqual(fine.files);
  });

  it('crash during a light wave resumes with the wave counter intact and re-issues the in-flight target', () => {
    const opts = options({ lightCheckEvery: 3 });
    const session = StructureSession.start(opts, ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), makePage());
    submit(session, expectCapture(session, '/zorlu-kartal'), kartalPage());
    expectCapture(session, '/zorlu-sahin'); // yarim kaldi (cokme)

    const resumed = StructureSession.resume(opts);
    expect(resumed.status().sinceLightCheck).toBe(2);
    expect(resumed.status().lightGates).toBe(0);
    submit(resumed, expectCapture(resumed, '/zorlu-sahin'), sahinPage());
    expectCapture(resumed, '/zorlu-dogan');
    expect(resumed.status()).toMatchObject({ lightGates: 1, lastLightGate: 'PASS', sinceLightCheck: 0, attempted: 3 });
  });

  it('crash during a full rebuild resumes safely: the interrupted gate is re-run, never skipped', async () => {
    const runner = new FakeRunner();
    const opts = options({ rebuildEvery: 1, rebuild: runner });
    const session = StructureSession.start(opts, ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), makePage());
    expect(session.nextDirective().type).toBe('WAIT');
    expect(session.currentState).toBe('REBUILDING');
    const runner2 = new FakeRunner(); // cokme: ilk runner hic bitmedi
    const resumed = StructureSession.resume({ ...opts, rebuild: runner2 });
    expect(resumed.currentState).toBe('RUNNING');
    expect(resumed.status()).toMatchObject({ sinceRebuild: 1, rebuilds: 0 });
    expect(resumed.nextDirective().type).toBe('WAIT');
    expect(runner2.calls).toBe(1);
    runner2.finish('PASS');
    await tick();
    expect(resumed.status().rebuilds).toBe(1);
    expectCapture(resumed, '/zorlu-kartal');
  });

  it('exposes phase timing and a remaining-time estimate once pages have been saved', () => {
    const session = StructureSession.start(options(), ['/zorlu']);
    expect(session.status().estimatedRemainingMs).toBeNull();
    const d1 = expectCapture(session, '/zorlu');
    clock += 1500;
    submit(session, d1, wide(5));
    const d2 = expectCapture(session, '/zorlu-m1');
    clock += 1500;
    submit(session, d2, terminal(1));
    clock += 3000;
    const d3 = expectCapture(session, '/zorlu-m2');
    clock += 1500;
    submit(session, d3, terminal(2));
    const status = session.status();
    expect(status.timing).toMatchObject({ captures: 3, captureRoundTripMs: 4500 });
    expect(status.timing!.persists).toBeGreaterThan(0);
    expect(status.timing!.avgCycleMs).toBe(3000); // (1500 + 4500) / 2
    expect(status.estimatedRemainingMs).toBe(3 * 3000);
  });
});

// ------------------------------------------------------------ tempo modlari

describe('STRUCTURE V2: pacing modes and backoff', () => {
  it('OVERNIGHT preset keeps the 1000 ms floor and derives delays from its own base/jitter', () => {
    let r = 0;
    const session = StructureSession.start(options({ paceMode: 'OVERNIGHT', paceMs: undefined, jitter: undefined, random: () => r }), ['/zorlu']);
    expect(session.status()).toMatchObject({ paceMode: 'OVERNIGHT', paceMs: 2200, paceMsCurrent: 2200 });
    expect(expectCapture(session, '/zorlu').delayMs).toBe(1540); // 2200 * 0.7
    r = 1;
    submit(session, session.nextDirective() as CapturePageDirective, makePage());
    expect(expectCapture(session, '/zorlu-kartal').delayMs).toBe(2860); // 2200 * 1.3
    const floor = StructureSession.start(
      options({ paceMode: 'OVERNIGHT', paceMs: 200, jitter: 0, checkpointFile: new AtomicChecksummedFile(path.join(tmpDir, 'floor.json')) }),
      ['/zorlu'],
    );
    expect(floor.status().paceMs).toBe(1000);
    expect(expectCapture(floor, '/zorlu').delayMs).toBe(1000);
  });

  it('backs off on source degradation (redirect / not-found); a security wall still stops instead of pacing', () => {
    const session = StructureSession.start(options({ paceMs: 2000, jitter: 0, paceMode: 'OVERNIGHT' }), ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), wide(5));
    submit(session, expectCapture(session, '/zorlu-m1'), terminal(2)); // baska sayfa -> yonlendirme -> x1.5
    expect(session.status().paceMsCurrent).toBe(3000);
    submit(session, expectCapture(session, '/zorlu-m2'), notFoundPage()); // yok -> x1.5
    expect(session.status().paceMsCurrent).toBe(4500);
    expect(expectCapture(session, '/zorlu-m3').delayMs).toBe(4500);
    const r = submit(session, session.nextDirective() as CapturePageDirective, loginPage());
    expect(r.paused).toBe(true);
    expect(session.currentState).toBe('ACCESS_RESTRICTED');
    expect(session.status().paceMsCurrent).toBe(4500); // duvar tempo degil, durdurma
  });

  it('caps the multiplier, recovers it after ten consecutive successes and reacts to slow responses', () => {
    const session = StructureSession.start(options({ paceMs: 2000, jitter: 0, paceMode: 'OVERNIGHT' }), ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), wide(40));
    // 4 yonlendirme (5. ardisik basarisizlik mevcut politikayla kosuyu durdururdu): 1.5^4 > 4 -> tavan x4
    for (let i = 1; i <= 4; i += 1) submit(session, expectCapture(session, `/zorlu-m${i}`), terminal(i + 30));
    expect(session.status().paceMsCurrent).toBe(8000);
    for (let i = 5; i <= 14; i += 1) {
      const d = expectCapture(session, `/zorlu-m${i}`);
      clock += 1000;
      submit(session, d, terminal(i));
    }
    expect(session.status().paceMsCurrent).toBe(6400); // 4 * 0.8
    for (let i = 15; i <= 26; i += 1) {
      const d = expectCapture(session, `/zorlu-m${i}`);
      clock += 1000;
      submit(session, d, terminal(i));
    }
    const before = session.status().paceMsCurrent!;
    const slow = expectCapture(session, '/zorlu-m27'); // 20 olcumluk pencere dolu (1 s); 10 s yavaslamadir
    clock += 10_000;
    submit(session, slow, terminal(27));
    expect(session.status().paceMsCurrent).toBe(Math.round(before * 1.5));
  });
});

// ------------------------------------------------- korpustan karsilanan kimlik

describe('STRUCTURE V2: identity of corpus-satisfied targets', () => {
  it('does not treat a corpus page as present when its own URL differs from the declared child URL', () => {
    // Gercek olcum (Audi TTS): ebeveyn menusu /audi-tts-2.0-tfsi-2.0-tfsi ilan etti, korpusta ayni
    // breadcrumb'li /audi-tts-2.0-tfsi sayfasi vardi ve hedef hic cekilmeden "mevcut" sayildi.
    const corpus = corpusWith([
      { chain: [ZORLU], html: makePage() },
      { chain: [ZORLU, KARTAL], html: kartalPage() },
    ]);
    const parentDeclaringAlias = categoryPage({ chain: [ZORLU], nav: [{ label: 'Kartal', slug: 'zorlu-kartal-kartal', count: 500 }] });
    const original = corpus.present.bind(corpus);
    jest.spyOn(corpus, 'present').mockImplementation((query) => {
      if (query.slug === 'zorlu') return { file: 'make.html', page: classifyPage(parentDeclaringAlias, 'make.html') };
      return original(query);
    });
    const session = StructureSession.start(options({}, corpus), ['/zorlu']);
    const d = expectCapture(session, '/zorlu-kartal-kartal');
    expect(d.expectedPath).toEqual(['Zorlu', 'Kartal']);
    expect(session.status().alreadyPresent).toBe(1); // yalnizca marka
  });

  it('records the own path of corpus-satisfied targets so the light gate can check identity', () => {
    const corpus = corpusWith([{ chain: [ZORLU], html: makePage() }]);
    const session = StructureSession.start(options({}, corpus), ['/zorlu']);
    expectCapture(session, '/zorlu-kartal');
    expect(session.targetsView().find((t) => t.key === '/zorlu')).toMatchObject({ outcome: 'ALREADY_PRESENT', ownPath: '/zorlu' });
    expect(session.status().timing!.corpusScans).toBeGreaterThan(0);
    expect(session.status().attempted).toBe(0);
  });
});

// ------------------------------------------------------------ artimli tazeleme

describe('STRUCTURE V2: incremental refresh (stale nonterminal pages, drift registry)', () => {
  function staleCorpus(): CorpusIndex {
    const corpus = corpusWith([
      { chain: [ZORLU], html: makePage() },
      { chain: [ZORLU, KARTAL], html: kartalPage() },
      { chain: [ZORLU, SAHIN], html: sahinPage() },
    ]);
    const old = new Date(clock - 40 * 86_400_000);
    for (const name of fs.readdirSync(path.join(corpusDir, 'Zorlu'))) fs.utimesSync(path.join(corpusDir, 'Zorlu', name), old, old);
    return corpus;
  }

  it('FULL mode never refetches present pages; INCREMENTAL without stale-days behaves the same', () => {
    const corpus = staleCorpus();
    const full = StructureSession.start(options({}, corpus), ['/zorlu']);
    expectCapture(full, '/zorlu-dogan');
    expect(full.status().alreadyPresent).toBe(3);
    const inc = StructureSession.start(
      options({ structureMode: 'INCREMENTAL', checkpointFile: new AtomicChecksummedFile(path.join(tmpDir, 'inc.json')) }, corpus),
      ['/zorlu'],
    );
    expectCapture(inc, '/zorlu-dogan');
    expect(inc.status()).toMatchObject({ alreadyPresent: 3, structureMode: 'INCREMENTAL' });
  });

  it('refetches stale nonterminal pages only; an unchanged page is REVERIFIED without a corpus copy', () => {
    const corpus = staleCorpus();
    const before = fs.readdirSync(path.join(corpusDir, 'Zorlu')).length;
    const session = StructureSession.start(options({ structureMode: 'INCREMENTAL', staleDays: 30 }, corpus), ['/zorlu']);
    const d = expectCapture(session, '/zorlu'); // bayat + cocuklu -> yeniden cekilir
    expect(d.expectedPath).toEqual(['Zorlu']);
    expect(submit(session, d, makePage()).outcome).toBe('REVERIFIED');
    expect(fs.readdirSync(path.join(corpusDir, 'Zorlu')).length).toBe(before);
    expect(session.status()).toMatchObject({ reverified: 1, driftDetected: 0 });
    submit(session, expectCapture(session, '/zorlu-kartal'), kartalPage()); // bayat + cocuklu
    expectCapture(session, '/zorlu-dogan'); // korpusta yok -> cekilir; Şahin bu sirada diskten karsilandi
    expect(session.targetsView().find((t) => t.key === '/zorlu-sahin')).toMatchObject({ outcome: 'ALREADY_PRESENT' }); // terminal: cekilmez
    expect(pending(session)).toEqual(['/zorlu-kartal-1.6', '/zorlu-kartal-2.0-tdi']);
    expect(session.status()).toMatchObject({ reverified: 2, alreadyPresent: 1, attempted: 2 });
    expect(session.driftRegistry()).toEqual([]);
  });

  it('records CHILDREN_CHANGED drift, keeps the corpus copy, and queues the newly declared child', () => {
    const corpus = staleCorpus();
    const session = StructureSession.start(options({ structureMode: 'INCREMENTAL', staleDays: 30 }, corpus), ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), makePage());
    const changed = categoryPage({
      chain: [ZORLU, KARTAL],
      nav: [
        { label: '1.6', slug: 'zorlu-kartal-1.6', count: 400 },
        { label: '1.8', slug: 'zorlu-kartal-1.8', count: 20 },
      ],
    });
    expect(submit(session, expectCapture(session, '/zorlu-kartal'), changed).outcome).toBe('DRIFT');
    expect(session.status().driftDetected).toBe(1);
    const registry = session.driftRegistry();
    expect(registry).toHaveLength(1);
    expect(registry[0]).toMatchObject({
      key: '/zorlu-kartal',
      kind: 'CHILDREN_CHANGED',
      before: ['zorlu-kartal-1.6', 'zorlu-kartal-2.0-tdi'],
      after: ['zorlu-kartal-1.6', 'zorlu-kartal-1.8'],
    });
    expect(fs.existsSync(registry[0].evidenceFile!)).toBe(true);
    expect(registry[0].evidenceFile).toContain(path.join('evidence', 'drift'));
    expect(pending(session)).toContain('/zorlu-kartal-1.8');
    expect(session.targetsView().find((t) => t.key === '/zorlu-kartal')!.status).toBe('COMPLETE');
    expect(JSON.parse(fs.readFileSync(path.join(runDir, 'drift-registry.json'), 'utf-8')).records).toHaveLength(1);
  });

  it('records BREADCRUMB_CHANGED drift as a failed target and expands nothing under the moved page', () => {
    const corpus = staleCorpus();
    const session = StructureSession.start(options({ structureMode: 'INCREMENTAL', staleDays: 30 }, corpus), ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), makePage());
    const moved = categoryPage({
      chain: [ZORLU, { label: 'Klasik', slug: 'zorlu-klasik' }, KARTAL],
      nav: [{ label: '1.6', slug: 'zorlu-kartal-1.6', count: 400 }],
    });
    expect(submit(session, expectCapture(session, '/zorlu-kartal'), moved).outcome).toBe('DRIFT');
    expect(session.targetsView().find((t) => t.key === '/zorlu-kartal')).toMatchObject({ status: 'FAILED', driftKind: 'BREADCRUMB_CHANGED' });
    expect(pending(session)).not.toContain('/zorlu-kartal-1.6');
    expect(session.driftRegistry()[0]).toMatchObject({ kind: 'BREADCRUMB_CHANGED', observedPath: ['Zorlu', 'Klasik', 'Kartal'] });
  });

  it('keeps redirect and not-found exceptions in the drift registry (auditable, never merged)', () => {
    const session = StructureSession.start(options(), ['/zorlu']);
    submit(session, expectCapture(session, '/zorlu'), makePage());
    submit(session, expectCapture(session, '/zorlu-kartal'), sahinPage()); // baska sayfa -> yonlendirme
    submit(session, expectCapture(session, '/zorlu-sahin'), notFoundPage());
    expect(session.driftRegistry().map((r) => `${r.kind}:${r.key}`)).toEqual(['REDIRECT_MISMATCH:/zorlu-kartal', 'NOT_FOUND:/zorlu-sahin']);
    expect(session.targetsView().find((t) => t.key === '/zorlu-kartal')!.status).toBe('FAILED');
  });
});
