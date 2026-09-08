/**
 * UZUN KOSU GUVENLIGI — TEMPO, GERI CEKILME, BOT DUVARI, BASLANGIC MALIYETI.
 *
 * OLCULEN OLAY (2026-09-08, `market-baseline-6205-2026-09-08`):
 *   - START ile ilk hedef arasinda 548.8 sn blok (hedef basina tam dosya
 *     yeniden yazimi; 6205 x ~88 ms). Kopru bu sure boyunca /status'a da
 *     yanit veremedi.
 *   - 2200 ms sabit tempo ile ~1 sa 45 dk sonra 185 hedefte Cloudflare
 *     duvari. Kayit "CAPTCHA / TARGET / retryable" dusmustu: kosu dursa bile
 *     KALICI kayit engeli hedefe ozgu gosteriyordu.
 *
 * Burada kilitlenenler: yavas + jitter'li tempo, uyum saglayan geri cekilme,
 * bot duvarinin KOSU-fatal olusu, otomatik yeniden deneme YOKLUGU, tek
 * es zamanlilik, ucuz baslangic ve hafif /status.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PageBatch } from '../autopilot/autopilot-contracts';
import { buildIncrementalPageUrl } from '../autopilot/source-url';
import { AtomicChecksummedFile } from '../checkpoint-store';
import { categoryPage } from '../__fixtures__/structure-page';
import { AtomicWeeklyMarketPublisher } from './artifact-publisher';
import { WeeklyEvidenceStore } from './evidence-store';
import { classifyFailure } from './failure-scope';
import {
  buildMarketTargetSnapshot,
  MarketTarget,
  MarketTargetSnapshot,
} from './hierarchy-gate';
import { TargetStateStore } from './target-state-store';
import {
  DEFAULT_WEEKLY_JITTER,
  DEFAULT_WEEKLY_PACE_MS,
  WEEKLY_BACKOFF,
  WEEKLY_PACE_PRESETS,
  WeeklyCheckpointPayload,
  WeeklyMarketSession,
  WeeklySessionOptions,
} from './weekly-session';
import { testTree } from './__fixtures__/tree';

const BASE = 'https://www.sahibinden.com/';
const NOW = new Date('2026-09-11T12:00:00Z');

let dir: string;
let snapshot: MarketTargetSnapshot;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-pace-'));
  snapshot = buildMarketTargetSnapshot(testTree());
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const target = (suffix = '/advanced'): MarketTarget =>
  snapshot.targets.find((item) => item.targetId.endsWith(suffix))!;

function options(
  runId: string,
  over: Partial<WeeklySessionOptions> = {},
): WeeklySessionOptions {
  const runDir = path.join(dir, runId);
  return {
    runId,
    source: 'sahibinden',
    baseUrl: BASE,
    tree: testTree(),
    snapshot,
    selectedTargetIds: [target().targetId, target('/s-line').targetId],
    checkpointFile: new AtomicChecksummedFile<WeeklyCheckpointPayload>(
      path.join(runDir, 'checkpoint.json'),
    ),
    evidence: new WeeklyEvidenceStore(path.join(runDir, 'raw.jsonl')),
    states: new TargetStateStore(path.join(dir, 'states.json')),
    publisher: new AtomicWeeklyMarketPublisher(path.join(dir, 'published')),
    rawPageDir: path.join(runDir, 'raw-pages'),
    anchorSize: 5,
    now: () => NOW,
    ...over,
  };
}

function batch(
  runId: string,
  exact: MarketTarget,
  rows: Array<[string, string]> = [
    ['7001', '5 Eylül 2026'],
    ['7002', '4 Eylül 2026'],
  ],
): PageBatch {
  return {
    runId,
    nodePath: exact.categoryPath,
    page: 1,
    categoryText: exact.fullPath,
    pageUrl: buildIncrementalPageUrl(BASE, exact.categoryPath, 1),
    hasNextPage: false,
    parseFailures: 0,
    rawHtml: categoryPage({
      chain: exact.pathSegments.map((label, index) => ({
        label,
        slug: exact.pathSegments
          .slice(0, index + 1)
          .join('-')
          .toLocaleLowerCase('tr'),
      })),
      rows: rows.map(([id, date]) => ({ id, date, model: '' })),
      nextPage: false,
    }),
    cards: rows.map(([id, date]) => ({
      sourceListingId: id,
      href: `/ilan/${id}`,
      title: id,
      priceText: '1.000.000 TL',
      mileageText: '10.000 km',
      yearText: '2022',
      locationText: 'İstanbul',
      modelCells: [],
      listingDateText: date,
    })),
  };
}

const delayOf = (d: unknown): number =>
  (d as { delayMs?: number }).delayMs ?? 0;

describe('tempo: yavas ve duzensiz', () => {
  it('taban tempo 5-7 sn bandindadir (2200 ms DEGIL)', () => {
    expect(DEFAULT_WEEKLY_PACE_MS).toBeGreaterThanOrEqual(5000);
    expect(DEFAULT_WEEKLY_PACE_MS).toBeLessThanOrEqual(7000);
    for (const preset of Object.values(WEEKLY_PACE_PRESETS)) {
      expect(preset.paceMs).toBeGreaterThanOrEqual(5000);
      expect(preset.paceMs).toBeLessThanOrEqual(7000);
      expect(preset.jitter).toBeGreaterThan(0);
    }
    // OVERNIGHT gozetimsiz kosudur: SAFE'ten HIZLI olamaz.
    expect(WEEKLY_PACE_PRESETS.OVERNIGHT.paceMs).toBeGreaterThanOrEqual(
      WEEKLY_PACE_PRESETS.SAFE.paceMs,
    );
  });

  it('jitter sabit periyodu kirar: ardisik beklemeler DEGISIR', () => {
    let seed = 0;
    const session = WeeklyMarketSession.start(
      options('jitter', {
        random: () => (seed = (seed * 9301 + 49297) % 233280) / 233280,
      }),
    );
    const delays = new Set<number>();
    for (let i = 0; i < 12; i += 1)
      delays.add(delayOf(session.nextDirective()));
    // Sabit tempo tek bir deger uretirdi.
    expect(delays.size).toBeGreaterThan(6);
    const lo = DEFAULT_WEEKLY_PACE_MS * (1 - DEFAULT_WEEKLY_JITTER) - 1;
    const hi = DEFAULT_WEEKLY_PACE_MS * (1 + DEFAULT_WEEKLY_JITTER) + 1;
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(Math.max(1000, lo));
      expect(d).toBeLessThanOrEqual(hi);
    }
  });

  it('es zamanlilik 1 kalir: ayni anda TEK yonerge servis edilir', () => {
    const session = WeeklyMarketSession.start(options('serial'));
    const first = session.nextDirective() as { nodePath: string };
    const second = session.nextDirective() as { nodePath: string };
    // Ikinci cagri YENI bir hedef acmaz; ayni IN_PROGRESS hedefi surdurur.
    expect(second.nodePath).toBe(first.nodePath);
    const inProgress = session
      .status({ detail: true })
      .targets!.filter((t) => t.status === 'IN_PROGRESS');
    expect(inProgress).toHaveLength(1);
  });
});

describe('uyum saglayan geri cekilme', () => {
  it('hedef dusunce tempo YAVASLAR, tavani asmaz', () => {
    const session = WeeklyMarketSession.start(
      options('backoff', { random: () => 0.5 }),
    );
    const before = delayOf(session.nextDirective());

    // Organik siralama ihlali: hedefe ozel dusus.
    session.submitPageBatch(
      batch('backoff', target(), [
        ['8001', '27 Ağustos 2026'],
        ['8002', '3 Eylül 2026'],
      ]),
    );
    const after = delayOf(session.nextDirective());
    expect(after).toBeGreaterThan(before);
    expect(after / before).toBeCloseTo(WEEKLY_BACKOFF.factor, 1);

    // Tavan: carpan sonsuza buyumez.
    const cap = DEFAULT_WEEKLY_PACE_MS * WEEKLY_BACKOFF.maxMultiplier;
    for (let i = 0; i < 20; i += 1) {
      const s = session as unknown as { slowDown(): void };
      s.slowDown();
    }
    expect(delayOf(session.nextDirective())).toBeLessThanOrEqual(cap + 1);
  });

  it('temiz hedeflerden sonra tempo KADEMELI toparlanir, tabanin altina inmez', () => {
    const session = WeeklyMarketSession.start(
      options('recover', { random: () => 0.5 }),
    );
    const s = session as unknown as {
      slowDown(): void;
      speedUpAfterCleanRun(): void;
    };
    s.slowDown();
    s.slowDown();
    const slowed = delayOf(session.nextDirective());
    expect(slowed).toBeGreaterThan(DEFAULT_WEEKLY_PACE_MS);

    for (let i = 0; i < WEEKLY_BACKOFF.recoverAfter; i += 1) {
      s.speedUpAfterCleanRun();
    }
    const recovered = delayOf(session.nextDirective());
    expect(recovered).toBeLessThan(slowed);

    // Taban ASLA asilmaz: hizlanma yok, yalnizca yavaslamanin geri alinmasi.
    for (let i = 0; i < 200; i += 1) s.speedUpAfterCleanRun();
    expect(delayOf(session.nextDirective())).toBeGreaterThanOrEqual(
      DEFAULT_WEEKLY_PACE_MS,
    );
  });

  it('geri cekilme carpani /status uzerinden GORUNUR', () => {
    const session = WeeklyMarketSession.start(
      options('visible', { random: () => 0.5 }),
    );
    expect(session.status()).toMatchObject({
      paceMultiplier: 1,
      effectivePaceMs: DEFAULT_WEEKLY_PACE_MS,
    });
    (session as unknown as { slowDown(): void }).slowDown();
    const status = session.status() as {
      paceMultiplier: number;
      effectivePaceMs: number;
    };
    expect(status.paceMultiplier).toBeGreaterThan(1);
    expect(status.effectivePaceMs).toBeGreaterThan(DEFAULT_WEEKLY_PACE_MS);
  });
});

describe('bot duvari: KOSU-fatal, otomatik yeniden deneme YOK', () => {
  it('CAPTCHA / HTTP_403 / HTTP_429 KOSU kapsamindadir', () => {
    for (const code of ['CAPTCHA', 'HTTP_403', 'HTTP_429']) {
      expect(classifyFailure(`${code} detail`)).toMatchObject({
        code,
        scope: 'RUN',
      });
    }
    // Oturum duvarlari da oyle kalir.
    for (const code of ['LOGIN_REQUIRED', 'TWO_FACTOR_REQUIRED']) {
      expect(classifyFailure(`${code} detail`)).toMatchObject({ scope: 'RUN' });
    }
    // Icerik hatalari HEDEFE ozel kalir.
    expect(classifyFailure('VALIDATION_FAIL x')).toMatchObject({
      scope: 'TARGET',
    });
  });

  it('CAPTCHA kosuyu durdurur, filigran HELD kalir, tamamlanan korunur', () => {
    const runId = 'captcha';
    const session = WeeklyMarketSession.start(options(runId));

    session.nextDirective();
    expect(session.submitPageBatch(batch(runId, target()))).toMatchObject({
      targetComplete: true,
      watermarkCommitted: true,
    });

    session.nextDirective();
    session.reportAccessRestricted({
      runId,
      nodePath: target('/s-line').categoryPath,
      kind: 'CAPTCHA',
      evidence: 'Cloudflare challenge script present with no listing rows',
    });

    const summary = session.summary();
    expect(summary.state).toBe('ACCESS_RESTRICTED');
    // Otomatik yeniden deneme YOK: sonraki yonerge HALT.
    expect(session.nextDirective().type).toBe('HALT');

    const detail = summary.failures.find(
      (f) => f.targetId === target('/s-line').targetId,
    )!;
    expect(detail).toMatchObject({
      code: 'CAPTCHA',
      scope: 'RUN',
      watermarkAdvanced: false,
    });

    const states = new TargetStateStore(path.join(dir, 'states.json'));
    expect(
      states.get(target('/s-line').targetId)?.previousBoundaryDate,
    ).toBeNull();
    // Tamamlanan hedefin filigrani DOKUNULMAZ.
    expect(states.get(target().targetId)).toMatchObject({
      status: 'COMPLETE',
      previousBoundaryDate: '2026-09-05',
    });
    expect(summary.watermarksAdvanced).toBe(1);
  });

  it('engel elle cozulduktan sonra AYNI run-id ile RESUME hedefi geri alir', () => {
    const runId = 'captcha-resume';
    const session = WeeklyMarketSession.start(options(runId));
    session.nextDirective();
    session.submitPageBatch(batch(runId, target()));
    session.nextDirective();
    session.reportAccessRestricted({
      runId,
      nodePath: target('/s-line').categoryPath,
      kind: 'CAPTCHA',
      evidence: 'cloudflare',
    });

    const resumed = WeeklyMarketSession.resume(options(runId));
    const next = resumed.nextDirective() as { type: string; nodePath: string };
    expect(next.type).toBe('COLLECT_PAGE');
    // TAMAMLANAN hedef yeniden OKUNMAZ.
    expect(next.nodePath).toBe(target('/s-line').categoryPath);
    expect(resumed.summary().targetsCompleted).toBe(1);
  });
});

describe('baslangic maliyeti ve /status yuku', () => {
  const bigSnapshot = (count: number): MarketTarget[] =>
    Array.from({ length: count }, (_, i) => ({
      ...target(),
      targetId: `synthetic/target/${i}`,
      fullPath: `Synthetic / Target / ${i}`,
      pathSegments: ['Synthetic', 'Target', String(i)],
      categoryPath: `/synthetic-target-${i}`,
    }));

  it('reconcileMany, ardisik reconcile ile DURUM-ESDEGERIDIR', () => {
    const targets = bigSnapshot(40);
    const a = new TargetStateStore(path.join(dir, 'a.json'), () => NOW);
    const b = new TargetStateStore(path.join(dir, 'b.json'), () => NOW);
    for (const t of targets) a.reconcile(t);
    b.reconcileMany(targets);
    expect(JSON.stringify(b.read().targets)).toBe(
      JSON.stringify(a.read().targets),
    );
  });

  it('reconcileMany 6205 hedef icin TEK okuma + TEK yazma yapar', () => {
    const targets = bigSnapshot(6205);
    const store = new TargetStateStore(path.join(dir, 'many.json'), () => NOW);
    const file = (store as unknown as { file: { save(a: unknown): void } })
      .file;
    const originalSave = file.save.bind(file);
    let saves = 0;
    file.save = (artifact: unknown) => {
      saves += 1;
      originalSave(artifact);
    };

    const started = Date.now();
    const result = store.reconcileMany(targets);
    const elapsed = Date.now() - started;

    expect(result.size).toBe(6205);
    expect(saves).toBe(1);
    // Eski yol 6205 yazma yapiyordu ve canli kosuda ~549 sn suruyordu.
    expect(elapsed).toBeLessThan(20_000);
  });

  it('yoklama yuku KUCUK kalir: 6205 hedef dizisi gonderilmez', () => {
    const many = bigSnapshot(300);
    const wide = {
      ...snapshot,
      targets: [...snapshot.targets, ...many],
      integrity: {
        ...snapshot.integrity,
        marketTargets: snapshot.targets.length + many.length,
      },
    };
    const session = WeeklyMarketSession.start(
      options('payload', {
        snapshot: wide,
        selectedTargetIds: many.map((t) => t.targetId),
      }),
    );
    session.nextDirective();

    const light = session.status();
    const detail = session.status({ detail: true });
    const lightBytes = JSON.stringify(light).length;
    const detailBytes = JSON.stringify(detail).length;

    // Ozet, hedef sayisindan BAGIMSIZ olarak kucuk kalir.
    expect((light as { targets?: unknown }).targets).toBeUndefined();
    expect(lightBytes).toBeLessThan(4000);
    expect(detailBytes).toBeGreaterThan(lightBytes * 5);
    // Ilgi ceken hedefler yine gorunur.
    expect((light as { activeTargets: unknown[] }).activeTargets).toHaveLength(
      1,
    );
    // Sayaclar ozet icinde durur.
    expect(light).toMatchObject({ targetsTotal: 300, state: 'RUNNING' });
  });
});
