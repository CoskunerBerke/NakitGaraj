/**
 * GENIS KOSU DAYANIKLILIGI.
 *
 * Bir hedefin hatasi butun kosuyu bitiriyordu: `failItem` KOSU durumunu
 * 'INCOMPLETE' yapiyor, `nextDirective` ise 'RUNNING' degilse HALT donuyordu.
 * Bu testler tam olarak bunu imkansiz kilar — ve bunu yaparken basarisiz bir
 * hedefin COMPLETE gorunmesine ya da filigraninin ilerlemesine de izin vermez.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PageBatch } from '../autopilot/autopilot-contracts';
import { buildIncrementalPageUrl } from '../autopilot/source-url';
import { AtomicChecksummedFile } from '../checkpoint-store';
import {
  categoryPage,
  loginPage,
  notFoundPage,
  unknownPage,
} from '../__fixtures__/structure-page';
import { AtomicWeeklyMarketPublisher } from './artifact-publisher';
import { WeeklyEvidenceStore } from './evidence-store';
import {
  buildMarketTargetSnapshot,
  MarketTarget,
  MarketTargetSnapshot,
} from './hierarchy-gate';
import { TargetStateStore } from './target-state-store';
import {
  WeeklyCheckpointPayload,
  WeeklyMarketSession,
  WeeklySessionOptions,
} from './weekly-session';
import { classifyFailure } from './failure-scope';
import { testTree } from './__fixtures__/tree';

const BASE = 'https://www.sahibinden.com/';
const NOW = new Date('2026-09-11T12:00:00Z');

let dir: string;
let snapshot: MarketTargetSnapshot;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-broad-'));
  snapshot = buildMarketTargetSnapshot(testTree());
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const allTargetIds = (): string[] => snapshot.targets.map((t) => t.targetId);
const targetOf = (id: string): MarketTarget =>
  snapshot.targets.find((t) => t.targetId === id)!;

function options(runId: string, ids: string[]): WeeklySessionOptions {
  const runDir = path.join(dir, runId);
  return {
    runId,
    source: 'sahibinden',
    baseUrl: BASE,
    tree: testTree(),
    snapshot,
    selectedTargetIds: ids,
    checkpointFile: new AtomicChecksummedFile<WeeklyCheckpointPayload>(
      path.join(runDir, 'checkpoint.json'),
    ),
    evidence: new WeeklyEvidenceStore(path.join(runDir, 'raw.jsonl')),
    states: new TargetStateStore(path.join(dir, 'states.json')),
    publisher: new AtomicWeeklyMarketPublisher(path.join(dir, 'published')),
    rawPageDir: path.join(runDir, 'raw-pages'),
    boundaryPolicy: { minAnchorMatches: 3 },
    anchorSize: 5,
    random: () => 0.5,
    now: () => NOW,
  };
}
const states = () => new TargetStateStore(path.join(dir, 'states.json'));

/** Tek sayfalik, liste sonu (guvenli sinir) saglikli sayfa. */
function goodBatch(
  runId: string,
  exact: MarketTarget,
  page: number,
): PageBatch {
  /**
   * Ilan kimlikleri SAYISAL olmali: sertlestirilmis ham-HTML ayristirici
   * `data-id` icin yalnizca rakam kabul eder ve uyusmazlik PARSE_ERROR uretir.
   * Hedef basina ayri araliklar, hedefler arasi tekillestirmeyi de gorunur kilar.
   */
  const seed =
    1000 +
    snapshot.targets.findIndex((t) => t.targetId === exact.targetId) * 10;
  const rows = [
    { id: String(seed + 1), date: '11 Eylül 2026', model: '' },
    { id: String(seed + 2), date: '10 Eylül 2026', model: '' },
  ];
  const rawHtml = categoryPage({
    chain: exact.pathSegments.map((label, index) => ({
      label,
      slug: exact.pathSegments
        .slice(0, index + 1)
        .join('-')
        .toLocaleLowerCase('tr'),
    })),
    rows,
    nextPage: false,
  });
  return rawBatch(runId, exact, page, rawHtml, rows);
}

/** Bozuk/engelli sayfa: kart yok, ham HTML enjekte edilir. */
function brokenBatch(
  runId: string,
  exact: MarketTarget,
  page: number,
  rawHtml: string,
): PageBatch {
  return rawBatch(runId, exact, page, rawHtml, []);
}

function rawBatch(
  runId: string,
  exact: MarketTarget,
  page: number,
  rawHtml: string,
  rows: Array<{ id: string; date: string; model: string }>,
): PageBatch {
  return {
    runId,
    nodePath: exact.categoryPath,
    page,
    categoryText: exact.fullPath,
    pageUrl: buildIncrementalPageUrl(BASE, exact.categoryPath, page),
    hasNextPage: false,
    parseFailures: 0,
    rawHtml,
    cards: rows.map((row) => ({
      sourceListingId: row.id,
      href: `/ilan/${row.id}`,
      title: row.id,
      priceText: '1.000.000 TL',
      mileageText: '10.000 km',
      yearText: '2022',
      locationText: 'Istanbul',
      modelCells: [],
      listingDateText: row.date,
    })),
  };
}

/**
 * Kosuyu yurutur: her yonergede o hedefe uygun sayfayi gonderir.
 * `broken` haritasindaki hedefler icin bozuk sayfa verilir.
 */
function drive(
  session: WeeklyMarketSession,
  runId: string,
  broken: Map<string, string> = new Map(),
  maxSteps = 40,
): { visited: string[]; halted: string | null } {
  const visited: string[] = [];
  for (let step = 0; step < maxSteps; step += 1) {
    const directive = session.nextDirective();
    if (directive.type === 'HALT') return { visited, halted: directive.reason };
    const nodePath = (directive as { nodePath: string }).nodePath;
    const exact = snapshot.targets.find((t) => t.categoryPath === nodePath)!;
    visited.push(exact.targetId);
    const page = (directive as { page: number }).page;
    const html = broken.get(exact.targetId);
    session.submitPageBatch(
      html
        ? brokenBatch(runId, exact, page, html)
        : goodBatch(runId, exact, page),
    );
  }
  throw new Error('drive did not halt');
}

describe('BIR HEDEFIN HATASI KOSUYU BITIRMEZ', () => {
  test('ortadaki hedef basarisiz olsa da sonrakiler calisir; filigrani ILERLEMEZ', () => {
    const ids = allTargetIds();
    expect(ids.length).toBeGreaterThanOrEqual(4);
    const failing = ids[1];
    const session = WeeklyMarketSession.start(options('iso', ids));

    const { visited } = drive(
      session,
      'iso',
      new Map([[failing, notFoundPage()]]),
    );

    // Basarisiz hedef dahil HER hedef sirayla denendi.
    expect(visited).toEqual(ids);

    const sum = session.summary();
    expect(sum.targetsSelected).toBe(ids.length);
    expect(sum.targetsCompleted).toBe(ids.length - 1);
    expect(sum.targetsFailed).toBe(1);
    expect(sum.failedTargetIds).toEqual([failing]);
    expect(sum.state).toBe('INCOMPLETE');

    // Basarisiz hedefin filigrani TUTULDU.
    expect(sum.watermarksHeld).toBe(1);
    expect(states().get(failing)).toMatchObject({ status: 'INCOMPLETE' });
    expect(states().get(failing)?.previousBoundaryDate ?? null).toBeNull();

    for (const id of ids.filter((x) => x !== failing)) {
      expect(states().get(id)).toMatchObject({ status: 'COMPLETE' });
    }
  });

  test('basarisiz hedef ASLA COMPLETE gorunmez', () => {
    const ids = allTargetIds();
    const session = WeeklyMarketSession.start(options('truth', ids));
    drive(session, 'truth', new Map([[ids[0], notFoundPage()]]));
    const failed = session.status().targets.find((t) => t.targetId === ids[0]);
    expect(failed?.status).toBe('INCOMPLETE');
    expect(session.summary().targetsCompleted).toBe(ids.length - 1);
  });

  test('KURESEL engel (giris duvari) kosuyu durdurur', () => {
    const ids = allTargetIds();
    const session = WeeklyMarketSession.start(options('global', ids));
    expect(session.nextDirective().type).toBe('COLLECT_PAGE');
    expect(() =>
      session.submitPageBatch(
        brokenBatch('global', targetOf(ids[0]), 1, loginPage()),
      ),
    ).toThrow();
    expect(session.nextDirective().type).toBe('HALT');
    expect(session.summary().targetsCompleted).toBe(0);
  });

  test('kapsam siniflandirmasi: engeller kuresel, icerik hatalari hedefe ozel', () => {
    expect(classifyFailure('LOGIN_REQUIRED x').scope).toBe('RUN');
    expect(classifyFailure('TWO_FACTOR_REQUIRED x').scope).toBe('RUN');
    expect(classifyFailure('ACCESS_RESTRICTED x').scope).toBe('RUN');
    expect(classifyFailure('REDIRECT_MISMATCH x').scope).toBe('TARGET');
    expect(classifyFailure('PARSE_ERROR x').scope).toBe('TARGET');
    expect(classifyFailure('TARGET_NOT_FOUND x').retryable).toBe(false);
    expect(classifyFailure('REDIRECT_MISMATCH x').retryable).toBe(false);
    expect(classifyFailure('PARSE_ERROR x').retryable).toBe(true);
  });
});

describe('KESINTI SONRASI DEVAM', () => {
  test('tamamlanan hedefler YENIDEN OKUNMAZ, gecici hatali olan yeniden denenir', () => {
    const ids = allTargetIds();
    const runId = 'resume';

    const first = WeeklyMarketSession.start(options(runId, ids));
    const d1 = first.nextDirective() as { page: number };
    first.submitPageBatch(goodBatch(runId, targetOf(ids[0]), d1.page));
    const d2 = first.nextDirective() as { page: number };
    first.submitPageBatch(
      brokenBatch(runId, targetOf(ids[1]), d2.page, unknownPage()),
    );
    expect(first.summary().targetsCompleted).toBe(1);
    expect(first.summary().targetsFailed).toBe(1);

    const second = WeeklyMarketSession.resume(options(runId, ids));
    const { visited } = drive(second, runId);

    // Tamamlanmis hedef bir daha SERVIS EDILMEDI.
    expect(visited).not.toContain(ids[0]);
    // Gecici hatali hedef yeniden denendi.
    expect(visited).toContain(ids[1]);
    for (const id of ids.slice(2)) expect(visited).toContain(id);

    const sum = second.summary();
    expect(sum.targetsCompleted).toBe(ids.length);
    expect(sum.targetsFailed).toBe(0);
    expect(sum.state).toBe('COMPLETE');
    for (const id of ids) {
      expect(states().get(id)).toMatchObject({ status: 'COMPLETE' });
    }
  });

  test('yeniden denemesi ANLAMSIZ hata (bulunamadi) otomatik tekrar edilmez', () => {
    const ids = allTargetIds();
    const runId = 'noretry';
    const first = WeeklyMarketSession.start(options(runId, ids));
    const d1 = first.nextDirective() as { page: number };
    first.submitPageBatch(
      brokenBatch(runId, targetOf(ids[0]), d1.page, notFoundPage()),
    );

    const second = WeeklyMarketSession.resume(options(runId, ids));
    const { visited } = drive(second, runId);
    expect(visited).not.toContain(ids[0]);
    expect(second.summary().failedTargetIds).toEqual([ids[0]]);
  });
});

describe('DETERMINISTIK HEDEF SIRASI', () => {
  test('ayni agac ayni sirayi verir ve sira kanoniktir', () => {
    const a = buildMarketTargetSnapshot(testTree()).targets.map(
      (t) => t.targetId,
    );
    const b = buildMarketTargetSnapshot(testTree()).targets.map(
      (t) => t.targetId,
    );
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(a);
  });

  test('sinirlama ilk N hedefi DETERMINISTIK secer', () => {
    const first = buildMarketTargetSnapshot(testTree())
      .targets.map((t) => t.targetId)
      .slice(0, 2);
    const second = buildMarketTargetSnapshot(testTree())
      .targets.map((t) => t.targetId)
      .slice(0, 2);
    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
  });
});
