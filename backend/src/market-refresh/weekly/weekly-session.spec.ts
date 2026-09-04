import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PageBatch } from '../autopilot/autopilot-contracts';
import { buildIncrementalPageUrl } from '../autopilot/source-url';
import { AtomicChecksummedFile } from '../checkpoint-store';
import { AtomicWeeklyMarketPublisher } from './artifact-publisher';
import { WeeklyEvidenceStore } from './evidence-store';
import {
  buildMarketTargetSnapshot,
  MarketTargetSnapshot,
} from './hierarchy-gate';
import { TargetStateStore } from './target-state-store';
import { WeeklyCheckpointPayload, WeeklyMarketSession } from './weekly-session';
import { testTree } from './__fixtures__/tree';
import { categoryPage } from '../__fixtures__/structure-page';

const BASE = 'https://www.sahibinden.com/';

describe('weekly exact target session', () => {
  let dir: string;
  let snapshot: MarketTargetSnapshot;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-weekly-session-'));
    snapshot = buildMarketTargetSnapshot(testTree());
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function target() {
    return snapshot.targets.find((item) =>
      item.targetId.endsWith('/advanced'),
    )!;
  }

  function batch(
    runId: string,
    page: number,
    rows: Array<[string, string]>,
    hasNextPage: boolean,
  ): PageBatch {
    const exact = target();
    const rawHtml = categoryPage({
      chain: exact.pathSegments.map((label, index) => ({
        label,
        slug: exact.pathSegments
          .slice(0, index + 1)
          .join('-')
          .toLocaleLowerCase('tr'),
      })),
      rows: rows.map(([id, date]) => ({ id, date, model: '' })),
      nextPage: hasNextPage,
    });
    return {
      runId,
      nodePath: exact.categoryPath,
      page,
      categoryText: exact.fullPath,
      pageUrl: buildIncrementalPageUrl(BASE, exact.categoryPath, page),
      hasNextPage,
      parseFailures: 0,
      rawHtml,
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

  function session(runId: string, known = new Set<string>()) {
    const runDir = path.join(dir, runId);
    return WeeklyMarketSession.start({
      runId,
      source: 'sahibinden',
      baseUrl: BASE,
      tree: testTree(),
      snapshot,
      selectedTargetIds: [target().targetId],
      checkpointFile: new AtomicChecksummedFile<WeeklyCheckpointPayload>(
        path.join(runDir, 'checkpoint.json'),
      ),
      evidence: new WeeklyEvidenceStore(path.join(runDir, 'raw.jsonl')),
      states: new TargetStateStore(path.join(dir, 'states.json')),
      publisher: new AtomicWeeklyMarketPublisher(path.join(dir, 'published')),
      rawPageDir: path.join(runDir, 'raw-pages'),
      knownListingIds: known,
      now: () => new Date('2026-09-11T12:00:00Z'),
    });
  }

  function resume(runId: string) {
    const runDir = path.join(dir, runId);
    return WeeklyMarketSession.resume({
      runId,
      source: 'sahibinden',
      baseUrl: BASE,
      tree: testTree(),
      snapshot,
      selectedTargetIds: [target().targetId],
      checkpointFile: new AtomicChecksummedFile<WeeklyCheckpointPayload>(
        path.join(runDir, 'checkpoint.json'),
      ),
      evidence: new WeeklyEvidenceStore(path.join(runDir, 'raw.jsonl')),
      rawPageDir: path.join(runDir, 'raw-pages'),
      states: new TargetStateStore(path.join(dir, 'states.json')),
      publisher: new AtomicWeeklyMarketPublisher(path.join(dir, 'published')),
      now: () => new Date('2026-09-11T12:00:00Z'),
    });
  }

  test('first run commits, second run minimally refetches with zero new and zero writes duplicated', () => {
    const first = session('run-1');
    expect(first.nextDirective()).toMatchObject({
      page: 1,
      targetId: target().targetId,
    });
    expect(
      first.submitPageBatch(
        batch(
          'run-1',
          1,
          [
            ['101', '11 Eylül 2026'],
            ['102', '10 Eylül 2026'],
            ['100', '4 Eylül 2026'],
          ],
          false,
        ),
      ),
    ).toMatchObject({
      newCount: 3,
      targetComplete: true,
      watermarkCommitted: true,
    });
    const stateAfterFirst = new TargetStateStore(
      path.join(dir, 'states.json'),
    ).get(target().targetId)!;
    expect(stateAfterFirst).toMatchObject({
      status: 'COMPLETE',
      previousBoundaryDate: '2026-09-11',
      pagesVisitedLastRun: 1,
    });

    const second = session('run-2');
    second.nextDirective();
    const result = second.submitPageBatch(
      batch(
        'run-2',
        1,
        [
          ['101', '11 Eylül 2026'],
          ['102', '10 Eylül 2026'],
          ['100', '4 Eylül 2026'],
        ],
        false,
      ),
    );
    expect(result).toMatchObject({
      newCount: 0,
      duplicates: 0,
      targetComplete: true,
    });
    expect(second.status()).toMatchObject({
      state: 'COMPLETE',
      newCount: 0,
      duplicateCount: 0,
    });
  });

  test('late listing on the same boundary date is collected through overlap', () => {
    const states = new TargetStateStore(path.join(dir, 'states.json'));
    states.reconcile(target());
    states.commit(target().targetId, {
      boundaryDate: '2026-09-04',
      boundaryIds: ['100'],
      pagesVisited: 1,
      newListings: 1,
      completedAt: '2026-09-04T12:00:00Z',
    });
    const refresh = session('late-boundary', new Set(['100']));
    refresh.nextDirective();
    const result = refresh.submitPageBatch(
      batch(
        'late-boundary',
        1,
        [
          ['104', '4 Eylül 2026'],
          ['100', '4 Eylül 2026'],
          ['103', '3 Eylül 2026'],
          ['102', '2 Eylül 2026'],
        ],
        true,
      ),
    );
    expect(result).toMatchObject({
      newCount: 3,
      boundaryReached: true,
      watermarkCommitted: true,
    });
    expect(states.get(target().targetId)).toMatchObject({
      previousBoundaryDate: '2026-09-04',
      seenListingIdsAtBoundary: ['100', '104'],
    });
  });

  test('page 2 parse failure and access restriction do not advance watermark', () => {
    const states = new TargetStateStore(path.join(dir, 'states.json'));
    states.reconcile(target());
    states.commit(target().targetId, {
      boundaryDate: '2026-09-04',
      boundaryIds: ['100'],
      pagesVisited: 1,
      newListings: 1,
      completedAt: '2026-09-04T12:00:00Z',
    });
    const refresh = session('failure');
    refresh.nextDirective();
    refresh.submitPageBatch(
      batch(
        'failure',
        1,
        [
          ['101', '11 Eylül 2026'],
          ['102', '10 Eylül 2026'],
        ],
        true,
      ),
    );
    refresh.nextDirective();
    const page2 = batch('failure', 2, [['103', 'bilinmeyen']], true);
    expect(() => refresh.submitPageBatch(page2)).toThrow('UNKNOWN_DATA_FORMAT');
    expect(states.get(target().targetId)).toMatchObject({
      status: 'INCOMPLETE',
      previousBoundaryDate: '2026-09-04',
      lastSuccessfulRefreshAt: '2026-09-04T12:00:00Z',
    });

    const access = session('access');
    access.nextDirective();
    access.reportAccessRestricted({
      runId: 'access',
      nodePath: target().categoryPath,
      kind: 'CAPTCHA',
      evidence: 'captcha',
    });
    expect(states.get(target().targetId)).toMatchObject({
      status: 'INCOMPLETE',
      previousBoundaryDate: '2026-09-04',
    });
  });

  test('crash resume continues the in-progress target without committing early', () => {
    const states = new TargetStateStore(path.join(dir, 'states.json'));
    states.reconcile(target());
    states.commit(target().targetId, {
      boundaryDate: '2026-09-04',
      boundaryIds: ['100'],
      pagesVisited: 1,
      newListings: 1,
      completedAt: '2026-09-04T12:00:00Z',
    });
    const firstProcess = session('resume-run', new Set(['100']));
    firstProcess.nextDirective();
    firstProcess.submitPageBatch(
      batch(
        'resume-run',
        1,
        [
          ['110', '11 Eylül 2026'],
          ['109', '10 Eylül 2026'],
        ],
        true,
      ),
    );
    expect(states.get(target().targetId)?.previousBoundaryDate).toBe(
      '2026-09-04',
    );

    const secondProcess = resume('resume-run');
    expect(secondProcess.nextDirective()).toMatchObject({ page: 2 });
    const result = secondProcess.submitPageBatch(
      batch(
        'resume-run',
        2,
        [
          ['104', '4 Eylül 2026'],
          ['103', '3 Eylül 2026'],
          ['102', '2 Eylül 2026'],
        ],
        true,
      ),
    );
    expect(result).toMatchObject({
      boundaryReached: true,
      watermarkCommitted: true,
    });
    expect(states.get(target().targetId)).toMatchObject({
      status: 'COMPLETE',
      previousBoundaryDate: '2026-09-11',
      pagesVisitedLastRun: 2,
    });
  });

  test('wrong redirect and non-newest ordering fail closed', () => {
    const redirect = session('redirect');
    redirect.nextDirective();
    const wrong = batch('redirect', 1, [['1', '11 Eylül 2026']], false);
    wrong.pageUrl = 'https://www.sahibinden.com/audi-a3-a3-sedan';
    expect(() => redirect.submitPageBatch(wrong)).toThrow('REDIRECT_MISMATCH');

    const ordering = session('ordering');
    ordering.nextDirective();
    expect(() =>
      ordering.submitPageBatch(
        batch(
          'ordering',
          1,
          [
            ['10', '10 Eylül 2026'],
            ['11', '11 Eylül 2026'],
          ],
          false,
        ),
      ),
    ).toThrow('not newest-first');
  });

  test('staged validation failure leaves the prior watermark unchanged', () => {
    const states = new TargetStateStore(path.join(dir, 'states.json'));
    states.reconcile(target());
    states.commit(target().targetId, {
      boundaryDate: '2026-09-04',
      boundaryIds: ['100'],
      pagesVisited: 1,
      newListings: 1,
      completedAt: '2026-09-04T12:00:00Z',
    });
    const runDir = path.join(dir, 'validation-fail');
    const publisher = new AtomicWeeklyMarketPublisher(
      path.join(dir, 'published'),
    );
    jest.spyOn(publisher, 'publishTarget').mockImplementation(() => {
      throw new Error('VALIDATION_FAIL injected');
    });
    const refresh = WeeklyMarketSession.start({
      runId: 'validation-fail',
      source: 'sahibinden',
      baseUrl: BASE,
      tree: testTree(),
      snapshot,
      selectedTargetIds: [target().targetId],
      checkpointFile: new AtomicChecksummedFile<WeeklyCheckpointPayload>(
        path.join(runDir, 'checkpoint.json'),
      ),
      evidence: new WeeklyEvidenceStore(path.join(runDir, 'raw.jsonl')),
      rawPageDir: path.join(runDir, 'raw-pages'),
      states,
      publisher,
      knownListingIds: new Set(['100']),
      now: () => new Date('2026-09-11T12:00:00Z'),
    });
    refresh.nextDirective();
    expect(() =>
      refresh.submitPageBatch(
        batch(
          'validation-fail',
          1,
          [
            ['110', '11 Eylül 2026'],
            ['100', '4 Eylül 2026'],
          ],
          false,
        ),
      ),
    ).toThrow('VALIDATION_FAIL');
    expect(states.get(target().targetId)).toMatchObject({
      status: 'INCOMPLETE',
      previousBoundaryDate: '2026-09-04',
      lastSuccessfulRefreshAt: '2026-09-04T12:00:00Z',
    });
  });

  test.each([
    ['login', '<title>sahibinden.com Giriş</title><form id="loginForm"></form>', 'LOGIN_REQUIRED'],
    [
      'two-factor',
      '<title>2 Aşamalı Doğrulama</title><form id="loginPopupForm"></form>',
      'TWO_FACTOR_REQUIRED',
    ],
    [
      'access-restricted',
      '<title>Hata</title><form id="informUsForm"></form>',
      'ACCESS_RESTRICTED',
    ],
  ])('%s raw page leaves the target incomplete without a watermark', (name, html, failure) => {
    const refresh = session(`blocked-${name}`);
    refresh.nextDirective();
    const blocked = batch(`blocked-${name}`, 1, [], false);
    blocked.rawHtml = html;
    expect(() => refresh.submitPageBatch(blocked)).toThrow(failure);
    expect(
      new TargetStateStore(path.join(dir, 'states.json')).get(
        target().targetId,
      ),
    ).toMatchObject({
      status: 'INCOMPLETE',
      previousBoundaryDate: null,
      lastSuccessfulRefreshAt: null,
    });
  });
});
