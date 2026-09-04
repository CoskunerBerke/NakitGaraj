import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { assignWeeklyEvidence } from '../market-refresh/weekly/assignment-stage';
import { AtomicWeeklyMarketPublisher } from '../market-refresh/weekly/artifact-publisher';
import { WeeklyRawObservation } from '../market-refresh/weekly/evidence-store';
import { buildMarketTargetSnapshot } from '../market-refresh/weekly/hierarchy-gate';
import { testTree } from '../market-refresh/weekly/__fixtures__/tree';
import { ASSIGNMENT_ARTIFACT_VERSION } from './build-listing-assignments';
import { VehicleHierarchyService } from './vehicle-hierarchy.service';

describe('weekly and corpus exact pool integration', () => {
  let dir: string;
  const oldHierarchy = process.env.VEHICLE_HIERARCHY_ARTIFACT;
  const oldWeekly = process.env.WEEKLY_MARKET_ARTIFACT_ROOT;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-weekly-pool-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (oldHierarchy === undefined)
      delete process.env.VEHICLE_HIERARCHY_ARTIFACT;
    else process.env.VEHICLE_HIERARCHY_ARTIFACT = oldHierarchy;
    if (oldWeekly === undefined) delete process.env.WEEKLY_MARKET_ARTIFACT_ROOT;
    else process.env.WEEKLY_MARKET_ARTIFACT_ROOT = oldWeekly;
  });

  test('conflicting exact assignments enter neither sibling pool', () => {
    const tree = testTree();
    const snapshot = buildMarketTargetSnapshot(tree);
    const advanced = snapshot.targets.find((target) =>
      target.targetId.endsWith('/advanced'),
    )!;
    const sline = snapshot.targets.find((target) =>
      target.targetId.endsWith('/s-line'),
    )!;
    const hierarchyPath = path.join(dir, 'hierarchy.json');
    process.env.VEHICLE_HIERARCHY_ARTIFACT = hierarchyPath;
    process.env.WEEKLY_MARKET_ARTIFACT_ROOT = path.join(dir, 'weekly');
    fs.writeFileSync(
      path.join(dir, 'listing-assignments.json'),
      JSON.stringify({
        version: ASSIGNMENT_ARTIFACT_VERSION,
        builtAt: '',
        stats: { exactListings: 1 },
        assignments: {
          conflict: {
            nodeId: advanced.targetId,
            evidence: 'PAGE_EXACT',
            depth: advanced.depth,
            sourceFile: 'x',
          },
        },
      }),
    );
    const row: WeeklyRawObservation = {
      source: 'sahibinden',
      sourceListingId: 'conflict',
      sourceUrl: '',
      title: '',
      modelCells: [],
      listingDate: '2026-09-04',
      listingDateText: '4 Eylül 2026',
      year: 2024,
      mileage: 10_000,
      price: 2_000_000,
      currency: 'TRY',
      location: 'İstanbul',
      capturedAt: '',
      runId: 'run',
      requestedTargetId: sline.targetId,
      requestedTargetPath: sline.pathSegments,
      page: 1,
    };
    new AtomicWeeklyMarketPublisher(
      process.env.WEEKLY_MARKET_ARTIFACT_ROOT,
    ).publishTarget({
      hierarchyVersion: snapshot.hierarchyVersion,
      tree,
      targets: snapshot.targets,
      result: assignWeeklyEvidence(tree, [row]),
    });

    const service = new VehicleHierarchyService();
    service.setTree(tree);
    expect(service.marketListingIds(advanced.targetId)).not.toContain(
      'conflict',
    );
    expect(service.marketListingIds(sline.targetId)).not.toContain('conflict');
    expect(service.marketPoolTrace(sline.targetId)).toMatchObject({
      selectedFullHierarchyPath: sline.pathSegments,
      crossPoolConflictsExcluded: ['conflict'],
      siblingLeakage: 0,
      parentLeakage: 0,
      parentFallback: false,
      siblingFallback: false,
    });
  });
});
