/**
 * OTURUM KESINTISI — KOSU DURUR, ILERLEME KORUNUR.
 *
 * Canli 6205 kosusu `secure.sahibinden.com/giris/iki-asamali-dogrulama`
 * adresine savruldugunda durdu. Burada kilitlenen davranis: 2FA/giris
 * duvari bildirildiginde
 *   - kosu KURESEL olarak durur (sonraki hedef ayni duvara carpar),
 *   - o anki hedef COMPLETE olmaz ve filigrani ILERLEMEZ,
 *   - daha once tamamlanmis hedeflerin filigrani DOKUNULMAZ,
 *   - ayni run-id ile RESUME kaldigi yerden devam eder.
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
import { testTree } from './__fixtures__/tree';

const BASE = 'https://www.sahibinden.com/';
const NOW = new Date('2026-09-11T12:00:00Z');

let dir: string;
let snapshot: MarketTargetSnapshot;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-auth-'));
  snapshot = buildMarketTargetSnapshot(testTree());
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const target = (suffix = '/advanced'): MarketTarget =>
  snapshot.targets.find((item) => item.targetId.endsWith(suffix))!;

function options(runId: string): WeeklySessionOptions {
  const runDir = path.join(dir, runId);
  return {
    runId,
    source: 'sahibinden',
    baseUrl: BASE,
    tree: testTree(),
    snapshot,
    // Iki hedef: birincisi tamamlanir, ikincisinde duvar gorulur.
    selectedTargetIds: [target().targetId, target('/s-line').targetId],
    checkpointFile: new AtomicChecksummedFile<WeeklyCheckpointPayload>(
      path.join(runDir, 'checkpoint.json'),
    ),
    evidence: new WeeklyEvidenceStore(path.join(runDir, 'raw.jsonl')),
    states: new TargetStateStore(path.join(dir, 'states.json')),
    publisher: new AtomicWeeklyMarketPublisher(path.join(dir, 'published')),
    rawPageDir: path.join(runDir, 'raw-pages'),
    anchorSize: 5,
    random: () => 0.5,
    now: () => NOW,
  };
}

function batch(runId: string, exact: MarketTarget): PageBatch {
  const rows: Array<[string, string]> = [
    ['5001', '5 Eylül 2026'],
    ['5002', '4 Eylül 2026'],
  ];
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

const stateOf = (targetId: string) =>
  new TargetStateStore(path.join(dir, 'states.json')).get(targetId);

describe('2FA duvari kosuyu guvenle durdurur', () => {
  it('ilk hedef tamamlanir, 2FA ikincisini HELD birakir ve kosuyu durdurur', () => {
    const runId = 'auth-2fa';
    const session = WeeklyMarketSession.start(options(runId));

    // 1) Ilk hedef normal sekilde tamamlanir.
    session.nextDirective();
    const first = session.submitPageBatch(batch(runId, target()));
    expect(first).toMatchObject({
      targetComplete: true,
      watermarkCommitted: true,
    });
    expect(stateOf(target().targetId)).toMatchObject({ status: 'COMPLETE' });

    // 2) Ikinci hedefe gecilir, sonra kaynak 2FA duvarina savurur.
    const directive = session.nextDirective();
    expect(directive.type).toBe('COLLECT_PAGE');
    session.reportAccessRestricted({
      runId,
      nodePath: target('/s-line').categoryPath,
      kind: 'TWO_FACTOR_REQUIRED',
      evidence: 'secure.sahibinden.com/giris/iki-asamali-dogrulama?type=CHLG',
    });

    // 3) Kosu KURESEL olarak durur.
    const summary = session.summary();
    expect(summary.state).toBe('ACCESS_RESTRICTED');
    expect(session.nextDirective().type).toBe('HALT');

    // 4) Kesilen hedef: COMPLETE DEGIL, filigran HELD, kayit KOSU kapsaminda.
    const detail = summary.failures.find(
      (f) => f.targetId === target('/s-line').targetId,
    )!;
    expect(detail).toMatchObject({
      code: 'TWO_FACTOR_REQUIRED',
      scope: 'RUN',
      status: 'INCOMPLETE',
      watermarkAdvanced: false,
      pagesRead: 0,
    });
    expect(detail.message).toContain('iki-asamali-dogrulama');
    expect(stateOf(target('/s-line').targetId)?.status).not.toBe('COMPLETE');
    expect(
      stateOf(target('/s-line').targetId)?.previousBoundaryDate,
    ).toBeNull();

    // 5) TAMAMLANMIS hedefin filigrani DOKUNULMAZ.
    expect(stateOf(target().targetId)).toMatchObject({
      status: 'COMPLETE',
      previousBoundaryDate: '2026-09-05',
    });
    expect(summary.watermarksAdvanced).toBe(1);
    expect(summary.targetsCompleted).toBe(1);
  });

  it('LOGIN_REQUIRED de ayni sekilde KOSU-fataldir', () => {
    const runId = 'auth-login';
    const session = WeeklyMarketSession.start(options(runId));
    session.nextDirective();
    session.reportAccessRestricted({
      runId,
      nodePath: target().categoryPath,
      kind: 'LOGIN_REQUIRED',
      evidence: 'secure.sahibinden.com/giris',
    });
    const summary = session.summary();
    expect(summary.state).toBe('ACCESS_RESTRICTED');
    expect(summary.failures[0]).toMatchObject({
      code: 'LOGIN_REQUIRED',
      scope: 'RUN',
      watermarkAdvanced: false,
    });
    expect(summary.watermarksAdvanced).toBe(0);
  });

  it('AYNI run-id ile RESUME: tamamlanan yeniden okunmaz, kesilen yeniden kuyruga girer', () => {
    const runId = 'auth-resume';
    const opts = options(runId);
    const session = WeeklyMarketSession.start(opts);
    session.nextDirective();
    session.submitPageBatch(batch(runId, target()));
    session.nextDirective();
    session.reportAccessRestricted({
      runId,
      nodePath: target('/s-line').categoryPath,
      kind: 'TWO_FACTOR_REQUIRED',
      evidence: 'secure.sahibinden.com/giris/iki-asamali-dogrulama',
    });

    // Kullanici Chrome'da dogrulamayi elle tamamlar ve ayni run-id ile devam eder.
    const resumed = WeeklyMarketSession.resume(options(runId));
    const next = resumed.nextDirective();
    expect(next.type).toBe('COLLECT_PAGE');
    // Tamamlanan hedef YENIDEN servis edilmez.
    expect((next as { nodePath: string }).nodePath).toBe(
      target('/s-line').categoryPath,
    );

    const done = resumed.submitPageBatch(batch(runId, target('/s-line')));
    expect(done).toMatchObject({ targetComplete: true });
    const summary = resumed.summary();
    expect(summary.targetsCompleted).toBe(2);
    expect(summary.targetsFailed).toBe(0);
    expect(summary.watermarksHeld).toBe(0);
  });
});
