/**
 * ARTIMLI PIYASA TAZELEMESI V2 — hedef basina guvenli sinir (tarih + kimlik +
 * ortusme), ilk kosu politikasi, hiyerarsi mutasyonu, filigran tutma,
 * tekilestirme ve kesin havuz sizintisizligi.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PageBatch } from '../autopilot/autopilot-contracts';
import { buildIncrementalPageUrl } from '../autopilot/source-url';
import { AtomicChecksummedFile } from '../checkpoint-store';
import { categoryPage, notFoundPage, unknownPage } from '../__fixtures__/structure-page';
import { assignWeeklyEvidence } from './assignment-stage';
import { AtomicWeeklyMarketPublisher } from './artifact-publisher';
import { WeeklyEvidenceStore, WeeklyRawObservation } from './evidence-store';
import { buildMarketTargetSnapshot, MarketTarget, MarketTargetSnapshot } from './hierarchy-gate';
import { TargetStateStore } from './target-state-store';
import { WeeklyCheckpointPayload, WeeklyMarketSession, WeeklySessionOptions } from './weekly-session';
import { testTree } from './__fixtures__/tree';
import { HierarchyNode, HierarchyTree } from '../../vehicle-hierarchy/hierarchy-tree';
import { nodeIdFromPath } from '../../vehicle-hierarchy/category-path';

const BASE = 'https://www.sahibinden.com/';
const NOW = new Date('2026-09-11T12:00:00Z');

let dir: string;
let snapshot: MarketTargetSnapshot;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-weekly-v2-'));
  snapshot = buildMarketTargetSnapshot(testTree());
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const target = (suffix = '/advanced'): MarketTarget =>
  snapshot.targets.find((item) => item.targetId.endsWith(suffix))!;

type Row = [string, string] | [string, string, string];

function batch(runId: string, page: number, rows: Row[], hasNextPage: boolean, exact: MarketTarget = target()): PageBatch {
  const rawHtml = categoryPage({
    chain: exact.pathSegments.map((label, index) => ({
      label,
      slug: exact.pathSegments.slice(0, index + 1).join('-').toLocaleLowerCase('tr'),
    })),
    rows: rows.map(([id, date, model]) => ({ id, date, model: model ?? '' })),
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
    cards: rows.map(([id, date, model]) => ({
      sourceListingId: id,
      href: `/ilan/${id}`,
      title: id,
      priceText: '1.000.000 TL',
      mileageText: '10.000 km',
      yearText: '2022',
      locationText: 'İstanbul',
      modelCells: model ? [model] : [],
      listingDateText: date,
    })),
  };
}

function options(runId: string, over: Partial<WeeklySessionOptions> = {}): WeeklySessionOptions {
  const runDir = path.join(dir, runId);
  return {
    runId,
    source: 'sahibinden',
    baseUrl: BASE,
    tree: testTree(),
    snapshot,
    selectedTargetIds: [target().targetId],
    checkpointFile: new AtomicChecksummedFile<WeeklyCheckpointPayload>(path.join(runDir, 'checkpoint.json')),
    evidence: new WeeklyEvidenceStore(path.join(runDir, 'raw.jsonl')),
    states: new TargetStateStore(path.join(dir, 'states.json')),
    publisher: new AtomicWeeklyMarketPublisher(path.join(dir, 'published')),
    rawPageDir: path.join(runDir, 'raw-pages'),
    boundaryPolicy: { minAnchorMatches: 3 },
    anchorSize: 5,
    random: () => 0.5,
    now: () => NOW,
    ...over,
  };
}
const start = (runId: string, over: Partial<WeeklySessionOptions> = {}) => WeeklyMarketSession.start(options(runId, over));
const states = () => new TargetStateStore(path.join(dir, 'states.json'));

/** Ilk (taze) kosu: iki sayfa, liste sonu -> sinir 09-11, capalar 09-10/09-09 kimlikleri. */
function baseline(runId = 'baseline'): void {
  const first = start(runId);
  first.nextDirective();
  first.submitPageBatch(batch(runId, 1, [['902', '11 Eylül 2026'], ['901', '11 Eylül 2026'], ['801', '10 Eylül 2026'], ['802', '10 Eylül 2026'], ['803', '9 Eylül 2026']], true));
  first.nextDirective();
  first.submitPageBatch(batch(runId, 2, [['804', '9 Eylül 2026'], ['805', '8 Eylül 2026'], ['806', '7 Eylül 2026']], false));
  expect(first.status().state).toBe('COMPLETE');
  expect(states().get(target().targetId)).toMatchObject({
    status: 'COMPLETE',
    previousBoundaryDate: '2026-09-11',
    seenListingIdsAtBoundary: ['901', '902'],
    overlapAnchorIds: ['801', '802', '803', '804', '805'],
    lastBoundaryProof: 'END_OF_LISTING',
    lastSuccessfulPageBoundary: 2,
    baselinePolicy: { pages: 20, days: null },
  });
}

describe('incremental market refresh: per-target safe boundary', () => {
  test('1+16) unchanged target: one page re-observing the boundary day and anchors stops with zero new and no duplicate artifact', () => {
    baseline();
    const releasesBefore = fs.readdirSync(path.join(dir, 'published', 'versions')).length;
    const second = start('second');
    expect(second.status().currentBoundary).toContain('previous boundary 2026-09-11');
    second.nextDirective();
    const result = second.submitPageBatch(
      batch('second', 1, [['902', '11 Eylül 2026'], ['901', '11 Eylül 2026'], ['801', '10 Eylül 2026'], ['802', '10 Eylül 2026'], ['803', '9 Eylül 2026']], true),
    );
    expect(result).toMatchObject({ newCount: 0, targetComplete: true, boundaryReached: true, boundaryProof: 'ANCHOR_IDS', watermarkCommitted: true });
    expect(second.status()).toMatchObject({
      state: 'COMPLETE',
      targetsUnchanged: 1,
      targetsChanged: 0,
      pagesRequested: 1,
      pagesAvoidedByBoundary: 19,
      watermarkAdvances: 1,
      watermarkHolds: 0,
      newCount: 0,
    });
    expect(states().get(target().targetId)).toMatchObject({
      previousBoundaryDate: '2026-09-11',
      seenListingIdsAtBoundary: ['901', '902'],
      overlapAnchorIds: ['801', '802', '803'],
      lastSuccessfulPageBoundary: 1,
      pagesVisitedLastRun: 1,
    });
    // Ayni icerik: kopya surum dosyasi yazilmadi.
    expect(fs.readdirSync(path.join(dir, 'published', 'versions')).length).toBe(releasesBefore);
    // Ikinci kosunun kanit dosyasi bagimsizdir, ama havuz hala tek kopya tasir.
    expect(second['opts'].publisher.loadCurrent()!.pools[target().targetId]).toEqual(['801', '802', '803', '804', '805', '806', '901', '902']);
  });

  test('2) one page of new listings: collect them, prove the old boundary on the same page, stop', () => {
    baseline();
    const run = start('one-page');
    run.nextDirective();
    const result = run.submitPageBatch(
      batch('one-page', 1, [['1003', '13 Eylül 2026'], ['1002', '12 Eylül 2026'], ['1001', '12 Eylül 2026'], ['902', '11 Eylül 2026'], ['901', '11 Eylül 2026'], ['801', '10 Eylül 2026'], ['802', '10 Eylül 2026'], ['803', '9 Eylül 2026']], true),
    );
    expect(result).toMatchObject({ newCount: 3, boundaryReached: true, boundaryProof: 'ANCHOR_IDS', watermarkCommitted: true });
    expect(states().get(target().targetId)).toMatchObject({
      previousBoundaryDate: '2026-09-13',
      seenListingIdsAtBoundary: ['1003'],
      overlapAnchorIds: ['1002', '1001', '902', '901', '801'],
    });
    expect(run.status()).toMatchObject({ targetsChanged: 1, targetsUnchanged: 0 });
  });

  test('3) several pages of new listings: continue until the boundary day is passed and anchors overlap', () => {
    baseline();
    const run = start('many');
    run.nextDirective();
    expect(run.submitPageBatch(batch('many', 1, [['1105', '14 Eylül 2026'], ['1104', '14 Eylül 2026'], ['1103', '13 Eylül 2026']], true))).toMatchObject({ boundaryReached: false, newCount: 3 });
    run.nextDirective();
    expect(run.submitPageBatch(batch('many', 2, [['1102', '12 Eylül 2026'], ['1101', '12 Eylül 2026'], ['902', '11 Eylül 2026']], true))).toMatchObject({ boundaryReached: false, newCount: 2 });
    expect(run.status().targets[0].boundaryReason).toContain('not yet passed');
    run.nextDirective();
    const third = run.submitPageBatch(batch('many', 3, [['901', '11 Eylül 2026'], ['801', '10 Eylül 2026'], ['802', '10 Eylül 2026'], ['803', '9 Eylül 2026']], true));
    expect(third).toMatchObject({ boundaryReached: true, boundaryProof: 'ANCHOR_IDS', watermarkCommitted: true, newCount: 0 });
    expect(states().get(target().targetId)).toMatchObject({ previousBoundaryDate: '2026-09-14', pagesVisitedLastRun: 3, lastSuccessfulPageBoundary: 3 });
  });

  test('4) same-date late listing: reaching the boundary day with only known ids is NOT a stop; the late id on the next page is collected', () => {
    baseline();
    const run = start('late');
    run.nextDirective();
    const first = run.submitPageBatch(batch('late', 1, [['902', '11 Eylül 2026'], ['901', '11 Eylül 2026']], true));
    expect(first).toMatchObject({ boundaryReached: false, newCount: 0 });
    run.nextDirective();
    const second = run.submitPageBatch(batch('late', 2, [['903', '11 Eylül 2026'], ['801', '10 Eylül 2026'], ['802', '10 Eylül 2026'], ['803', '9 Eylül 2026']], true));
    expect(second).toMatchObject({ boundaryReached: true, newCount: 1, watermarkCommitted: true });
    expect(states().get(target().targetId)).toMatchObject({
      previousBoundaryDate: '2026-09-11',
      seenListingIdsAtBoundary: ['901', '902', '903'],
    });
    expect(run['opts'].publisher.loadCurrent()!.pools[target().targetId]).toContain('903');
  });

  test('5) a listing repeated across pages is one exact assignment and one pool entry', () => {
    const run = start('dup');
    run.nextDirective();
    run.submitPageBatch(batch('dup', 1, [['701', '11 Eylül 2026'], ['702', '10 Eylül 2026']], true));
    run.nextDirective();
    const result = run.submitPageBatch(batch('dup', 2, [['702', '10 Eylül 2026'], ['703', '9 Eylül 2026']], false));
    expect(result).toMatchObject({ duplicates: 1, accepted: 1, exact: 3, targetComplete: true });
    const current = run['opts'].publisher.loadCurrent()!;
    expect(current.pools[target().targetId]).toEqual(['701', '702', '703']);
    expect(Object.keys(current.assignments).sort()).toEqual(['701', '702', '703']);
    expect(run.status().duplicateSightings).toBe(1);
  });

  test('6) the same listing seen on a parent page and its child page resolves to the deepest proven node once', () => {
    const tree = testTree();
    const parent = tree.nodes.get(nodeIdFromPath(['Audi', 'A3', 'A3 Sportback', '35 TFSI']))!;
    const child = tree.nodes.get(nodeIdFromPath(['Audi', 'A3', 'A3 Sportback', '35 TFSI', 'Advanced']))!;
    const seen = (node: HierarchyNode, cells: string[]): WeeklyRawObservation => ({
      source: 'sahibinden', sourceListingId: 'shared', sourceUrl: '', title: '', modelCells: cells,
      listingDate: '2026-09-11', listingDateText: '11 Eylül 2026', year: 2022, mileage: 1, price: 1, currency: 'TRY',
      location: null, capturedAt: '', runId: 'r', requestedTargetId: node.id, requestedTargetPath: node.pathSegments, page: 1,
    });
    const result = assignWeeklyEvidence(tree, [seen(parent, ['Advanced']), seen(child, [])]);
    expect(result.assignments.shared).toMatchObject({ status: 'EXACT', nodeId: child.id });
    expect(result.pools).toEqual({ [child.id]: ['shared'] });
    expect(result.stats).toMatchObject({ exact: 1, ambiguous: 0, doubleExactAssignments: 0, siblingLeakage: 0, parentLeakage: 0 });
  });

  test('7+19) a listing proven exactly in two sibling targets is AMBIGUOUS and enters neither pool; sibling/parent leakage stays 0', () => {
    const advanced = target('/advanced');
    const sline = target('/s-line');
    const run = start('conflict', { selectedTargetIds: [advanced.targetId, sline.targetId] });
    run.nextDirective();
    run.submitPageBatch(batch('conflict', 1, [['601', '11 Eylül 2026'], ['602', '10 Eylül 2026']], false, advanced));
    run.nextDirective();
    run.submitPageBatch(batch('conflict', 1, [['601', '11 Eylül 2026'], ['603', '10 Eylül 2026']], false, sline));
    expect(run.status().state).toBe('COMPLETE');
    const current = run['opts'].publisher.loadCurrent()!;
    expect(current.assignments['601']).toMatchObject({ status: 'AMBIGUOUS', nodeId: null });
    expect(current.pools[advanced.targetId]).toEqual(['602']);
    expect(current.pools[sline.targetId]).toEqual(['603']);
    expect(run.status().targets.every((t) => t.watermark === 'ADVANCED')).toBe(true);
  });

  test('8) partial failure before the boundary holds the watermark and counts as a hold', () => {
    baseline();
    const run = start('partial');
    run.nextDirective();
    run.submitPageBatch(batch('partial', 1, [['501', '13 Eylül 2026']], true));
    run.nextDirective();
    expect(() => run.submitPageBatch({ ...batch('partial', 3, [['502', '12 Eylül 2026']], true) })).toThrow('expected page 2');
    expect(states().get(target().targetId)).toMatchObject({ status: 'INCOMPLETE', previousBoundaryDate: '2026-09-11', overlapAnchorIds: ['801', '802', '803', '804', '805'] });
    expect(run.status()).toMatchObject({ watermarkHolds: 1, targetsFailed: 1, state: 'INCOMPLETE' });
    expect(run.status().targets[0].watermark).toBe('HELD');
  });

  test('10+11) unknown page format and the source not-found page both fail the target without advancing the watermark', () => {
    baseline();
    const unknown = start('unknown');
    unknown.nextDirective();
    const bad = batch('unknown', 1, [], false);
    bad.rawHtml = unknownPage();
    expect(() => unknown.submitPageBatch(bad)).toThrow('UNKNOWN_DATA_FORMAT');
    expect(states().get(target().targetId)).toMatchObject({ status: 'INCOMPLETE', previousBoundaryDate: '2026-09-11', lastFailure: expect.stringContaining('UNKNOWN_DATA_FORMAT') });

    const removed = start('removed');
    removed.nextDirective();
    const gone = batch('removed', 1, [], false);
    gone.rawHtml = notFoundPage();
    expect(() => removed.submitPageBatch(gone)).toThrow('TARGET_NOT_FOUND');
    expect(states().get(target().targetId)).toMatchObject({ status: 'INCOMPLETE', previousBoundaryDate: '2026-09-11', lastFailure: expect.stringContaining('TARGET_NOT_FOUND') });
  });

  test('12) a page declaring a shorter canonical breadcrumb is a redirect mismatch, never merged', () => {
    const run = start('canonical');
    run.nextDirective();
    const shorter = batch('canonical', 1, [['121', '11 Eylül 2026']], false, target('35-tfsi') ?? target());
    // Ayni URL istendi, sayfa kendini ebeveyn kategori olarak tanitiyor.
    shorter.nodePath = target().categoryPath;
    shorter.pageUrl = buildIncrementalPageUrl(BASE, target().categoryPath, 1);
    expect(() => run.submitPageBatch(shorter)).toThrow('REDIRECT_MISMATCH');
    expect(states().get(target().targetId)).toMatchObject({ status: 'INCOMPLETE', previousBoundaryDate: null });
  });

  test('9+17) a crash after raw evidence but before commit resumes with the old watermark until the target really completes', () => {
    baseline();
    const first = start('crash');
    first.nextDirective();
    first.submitPageBatch(batch('crash', 1, [['401', '13 Eylül 2026']], true));
    expect(states().get(target().targetId)).toMatchObject({ status: 'IN_PROGRESS', previousBoundaryDate: '2026-09-11' });
    const resumed = WeeklyMarketSession.resume(options('crash'));
    expect(resumed.nextDirective()).toMatchObject({ page: 2, delayMs: 2200 });
    expect(resumed.status().targets[0].watermark).toBeNull();
    const done = resumed.submitPageBatch(batch('crash', 2, [['902', '11 Eylül 2026'], ['901', '11 Eylül 2026'], ['801', '10 Eylül 2026'], ['802', '10 Eylül 2026'], ['803', '9 Eylül 2026']], true));
    expect(done).toMatchObject({ boundaryReached: true, watermarkCommitted: true });
    expect(states().get(target().targetId)).toMatchObject({ status: 'COMPLETE', previousBoundaryDate: '2026-09-13', pagesVisitedLastRun: 2 });
    // Ham kanit iki surecte de tek dosyada, kopyasiz.
    expect(new WeeklyEvidenceStore(path.join(dir, 'crash', 'raw.jsonl')).readAll().map((r) => r.sourceListingId)).toEqual(['401', '902', '901', '801', '802', '803']);
  });

  test('exhausting the page cap without boundary proof fails the target and holds the watermark', () => {
    baseline();
    const run = start('cap', { boundaryPolicy: { minAnchorMatches: 3, maxPagesPerTarget: 2 } });
    run.nextDirective();
    run.submitPageBatch(batch('cap', 1, [['301', '15 Eylül 2026']], true));
    run.nextDirective();
    expect(() => run.submitPageBatch(batch('cap', 2, [['302', '14 Eylül 2026']], true))).toThrow('safe boundary not proven');
    expect(states().get(target().targetId)).toMatchObject({ status: 'INCOMPLETE', previousBoundaryDate: '2026-09-11' });
  });

  test('20) fresh target follows the explicit baseline policy and records it; the page cap is a success, not a failure', () => {
    const run = start('fresh', { boundaryPolicy: { minAnchorMatches: 3, initialBaselinePages: 2, maxPagesPerTarget: 5 } });
    expect(run.status().currentBoundary).toContain('fresh target: baseline 2 page(s)');
    run.nextDirective();
    expect(run.submitPageBatch(batch('fresh', 1, [['201', '11 Eylül 2026']], true))).toMatchObject({ boundaryReached: false });
    run.nextDirective();
    expect(run.submitPageBatch(batch('fresh', 2, [['202', '10 Eylül 2026']], true))).toMatchObject({ boundaryReached: true, boundaryProof: 'BASELINE_POLICY', watermarkCommitted: true });
    expect(states().get(target().targetId)).toMatchObject({ baselinePolicy: { pages: 2, days: null }, previousBoundaryDate: '2026-09-11', overlapAnchorIds: ['202'] });
    const days = start('fresh-days', {
      states: new TargetStateStore(path.join(dir, 'states-days.json')),
      boundaryPolicy: { minAnchorMatches: 3, initialBaselineDays: 30 },
    });
    days.nextDirective();
    expect(days.submitPageBatch(batch('fresh-days', 1, [['211', '11 Eylül 2026'], ['210', '1 Ağustos 2026']], true))).toMatchObject({ boundaryProof: 'BASELINE_POLICY' });
  });
});

describe('hierarchy mutation and target state', () => {
  function treeWith(extra: string[][]): HierarchyTree {
    const base = testTree();
    for (const segments of extra) {
      const id = nodeIdFromPath(segments);
      const parentId = nodeIdFromPath(segments.slice(0, -1));
      const parent = base.nodes.get(parentId)!;
      parent.childIds = [...parent.childIds, id].sort();
      parent.hasChildren = true;
      parent.isLeaf = false;
      parent.terminalConfirmed = false;
      base.nodes.set(id, {
        id, name: segments[segments.length - 1], parentId, depth: segments.length - 1, pathSegments: segments,
        fullPath: segments.join(' / '), categoryString: segments.join(' '), hasChildren: false, terminalConfirmed: true,
        isLeaf: true, childIds: [], ownListingCount: 0, totalListingCount: 0, sourceFiles: [], derived: false,
      });
    }
    return base;
  }

  test('13+15) a former terminal that gains a child goes STALE; the new child starts FRESH with no inherited watermark', () => {
    baseline();
    const mutated = treeWith([['Audi', 'A3', 'A3 Sportback', '35 TFSI', 'Advanced', 'Plus']]);
    const next = buildMarketTargetSnapshot(mutated);
    const store = states();
    const report = store.reconcileSnapshot(next);
    expect(report).toMatchObject({ stale: 1 });
    expect(store.get(target().targetId)).toMatchObject({ status: 'STALE', previousBoundaryDate: '2026-09-11' });
    const child = next.targets.find((t) => t.targetId.endsWith('/advanced/plus'))!;
    expect(store.get(child.targetId)).toMatchObject({ status: 'FRESH', previousBoundaryDate: null, overlapAnchorIds: [] });

    const run = WeeklyMarketSession.start(options('child', { tree: mutated, snapshot: next, selectedTargetIds: [child.targetId], states: store }));
    expect(run.status()).toMatchObject({ targetsFresh: 1 });
    expect(run.status().currentBoundary).toContain('fresh target');
    expect(() => store.commit(target().targetId, { boundaryDate: '2026-09-12', boundaryIds: [], pagesVisited: 1, newListings: 0, completedAt: NOW.toISOString() })).toThrow('STALE');
  });

  test('14) a hierarchy version change on an unrelated branch keeps the target state valid', () => {
    baseline();
    const unrelated = treeWith([['BMW', 'A3', 'Sedan']]);
    const next = buildMarketTargetSnapshot(unrelated);
    expect(next.hierarchyVersion).not.toBe(snapshot.hierarchyVersion);
    const store = states();
    // BMW / A3 was itself a leaf target and gained a child: it goes STALE; the Audi target is untouched.
    expect(store.reconcileSnapshot(next)).toMatchObject({ carried: expect.any(Number), invalidated: 0, stale: 1 });
    expect(store.get(target().targetId)).toMatchObject({ status: 'COMPLETE', previousBoundaryDate: '2026-09-11', hierarchyVersion: next.hierarchyVersion });
    const run = WeeklyMarketSession.start(options('unrelated', { tree: unrelated, snapshot: next, states: store }));
    expect(run.status().currentBoundary).toContain('previous boundary 2026-09-11');
  });

  test('15) a changed exact identity (same node id, different source path) is INVALIDATED: boundary reset, nothing inherited', () => {
    baseline();
    const moved = buildMarketTargetSnapshot(testTree(), {
      sourcePathsByNode: new Map([[target().targetId, '/audi-a3-a3-sportback-35-tfsi-advanced-yeni']]),
    });
    const store = states();
    expect(store.reconcileSnapshot(moved)).toMatchObject({ invalidated: 1 });
    expect(store.get(target().targetId)).toMatchObject({ status: 'INVALIDATED', previousBoundaryDate: null, overlapAnchorIds: [], lastFailure: 'TARGET_IDENTITY_CHANGED' });
    const run = WeeklyMarketSession.start(options('moved', { snapshot: moved, states: store }));
    expect(run.status().currentBoundary).toContain('fresh target');
    expect(() => WeeklyMarketSession.resume(options('baseline', { snapshot: moved, states: store }))).toThrow(/identity changed|hierarchy version changed/);
  });

  test('18) a failed atomic publish preserves the last-known-good artifact and the watermark', () => {
    baseline();
    const publisher = new AtomicWeeklyMarketPublisher(path.join(dir, 'published'));
    const before = fs.readFileSync(path.join(dir, 'published', 'current.json'), 'utf-8');
    jest.spyOn(publisher, 'publishTarget').mockImplementation(() => {
      throw new Error('VALIDATION_FAIL injected');
    });
    const run = start('publish-fail', { publisher });
    run.nextDirective();
    expect(() => run.submitPageBatch(batch('publish-fail', 1, [['111', '12 Eylül 2026'], ['902', '11 Eylül 2026'], ['901', '11 Eylül 2026'], ['801', '10 Eylül 2026'], ['802', '10 Eylül 2026'], ['803', '9 Eylül 2026']], true))).toThrow('VALIDATION_FAIL');
    expect(fs.readFileSync(path.join(dir, 'published', 'current.json'), 'utf-8')).toBe(before);
    expect(states().get(target().targetId)).toMatchObject({ status: 'INCOMPLETE', previousBoundaryDate: '2026-09-11', seenListingIdsAtBoundary: ['901', '902'] });
  });

  test('v1 target-state files are readable and migrate to v2 without losing the boundary', () => {
    const file = path.join(dir, 'legacy.json');
    const legacy = new AtomicChecksummedFile<any>(file);
    legacy.save({
      version: 'weekly-target-state-v1',
      updatedAt: '2026-09-04T12:00:00Z',
      targets: {
        [target().targetId]: {
          targetId: target().targetId, targetIdentityHash: target().targetIdentityHash, fullPath: target().fullPath,
          hierarchyVersion: target().hierarchyVersion, lastSuccessfulRefreshAt: '2026-09-04T12:00:00Z', previousBoundaryDate: '2026-09-04',
          seenListingIdsAtBoundary: ['99'], pagesVisitedLastRun: 3, newListingsLastRun: 1, status: 'COMPLETE', lastFailure: null, updatedAt: '2026-09-04T12:00:00Z',
        },
      },
    });
    const store = new TargetStateStore(file, () => NOW);
    expect(store.get(target().targetId)).toMatchObject({ previousBoundaryDate: '2026-09-04', seenListingIdsAtBoundary: ['99'], overlapAnchorIds: [], lastBoundaryProof: null });
    store.reconcile(target());
    expect(JSON.parse(fs.readFileSync(file, 'utf-8')).payload.version).toBe('weekly-target-state-v2');
    const corrupt = new AtomicChecksummedFile<any>(path.join(dir, 'corrupt.json'));
    corrupt.save({ version: 'weekly-target-state-v2', updatedAt: '', targets: { x: { targetId: 'y' } } });
    expect(() => new TargetStateStore(path.join(dir, 'corrupt.json')).read()).toThrow('corrupt entry');
  });
});
