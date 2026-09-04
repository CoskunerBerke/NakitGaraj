import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  assignWeeklyEvidence,
  WeeklyAssignmentResult,
} from './assignment-stage';
import { AtomicWeeklyMarketPublisher } from './artifact-publisher';
import { WeeklyRawObservation } from './evidence-store';
import { buildMarketTargetSnapshot } from './hierarchy-gate';
import { testTree } from './__fixtures__/tree';
import { nodeIdFromPath } from '../../vehicle-hierarchy/category-path';

describe('atomic weekly artifact publish', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-weekly-publish-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('failed validation preserves last-known-good pointer; success swaps it', () => {
    const tree = testTree();
    const snapshot = buildMarketTargetSnapshot(tree);
    const target = snapshot.targets.find((item) =>
      item.targetId.endsWith('/advanced'),
    )!;
    let tick = 0;
    const publisher = new AtomicWeeklyMarketPublisher(
      dir,
      () => new Date(`2026-09-04T00:00:0${tick++}Z`),
    );
    const observation: WeeklyRawObservation = {
      source: 'sahibinden',
      sourceListingId: 'safe',
      sourceUrl: '',
      title: '',
      modelCells: [],
      listingDate: '2026-09-04',
      listingDateText: '4 Eylül 2026',
      year: null,
      mileage: null,
      price: null,
      currency: null,
      location: null,
      capturedAt: '2026-09-04T00:00:00Z',
      runId: 'run',
      requestedTargetId: target.targetId,
      requestedTargetPath: target.pathSegments,
      page: 1,
    };
    const valid = assignWeeklyEvidence(tree, [observation]);
    publisher.publishTarget({
      hierarchyVersion: snapshot.hierarchyVersion,
      tree,
      targets: snapshot.targets,
      result: valid,
    });
    const pointer = path.join(dir, 'current.json');
    const before = fs.readFileSync(pointer, 'utf-8');

    const invalid: WeeklyAssignmentResult = {
      assignments: valid.assignments,
      pools: { [target.targetId]: ['missing'] },
      stats: { ...valid.stats },
    };
    expect(() =>
      publisher.publishTarget({
        hierarchyVersion: snapshot.hierarchyVersion,
        tree,
        targets: snapshot.targets,
        result: invalid,
      }),
    ).toThrow('VALIDATION_FAIL');
    expect(fs.readFileSync(pointer, 'utf-8')).toBe(before);
    expect(publisher.loadCurrent()?.pools[target.targetId]).toEqual(['safe']);

    const second = assignWeeklyEvidence(tree, [
      { ...observation, sourceListingId: 'new' },
    ]);
    publisher.publishTarget({
      hierarchyVersion: snapshot.hierarchyVersion,
      tree,
      targets: snapshot.targets,
      result: second,
    });
    expect(fs.readFileSync(pointer, 'utf-8')).not.toBe(before);
    expect(publisher.loadCurrent()?.pools[target.targetId]).toEqual([
      'new',
      'safe',
    ]);
  });

  test('former terminal pool is not copied when it becomes a parent', () => {
    const oldTree = testTree();
    const oldSnapshot = buildMarketTargetSnapshot(oldTree);
    const former = oldSnapshot.targets.find((item) =>
      item.targetId.endsWith('/advanced'),
    )!;
    let tick = 0;
    const publisher = new AtomicWeeklyMarketPublisher(
      dir,
      () => new Date(`2026-09-04T00:00:0${tick++}Z`),
    );
    const oldRow: WeeklyRawObservation = {
      source: 'sahibinden',
      sourceListingId: 'old-terminal',
      sourceUrl: '',
      title: '',
      modelCells: [],
      listingDate: '2026-09-04',
      listingDateText: '4 Eylül 2026',
      year: null,
      mileage: null,
      price: null,
      currency: null,
      location: null,
      capturedAt: '2026-09-04T00:00:00Z',
      runId: 'old',
      requestedTargetId: former.targetId,
      requestedTargetPath: former.pathSegments,
      page: 1,
    };
    publisher.publishTarget({
      hierarchyVersion: oldSnapshot.hierarchyVersion,
      tree: oldTree,
      targets: oldSnapshot.targets,
      result: assignWeeklyEvidence(oldTree, [oldRow]),
    });

    const newTree = testTree();
    const parent = newTree.nodes.get(former.targetId)!;
    const childPath = [...parent.pathSegments, 'Exclusive'];
    const childId = nodeIdFromPath(childPath);
    parent.childIds = [childId];
    parent.hasChildren = true;
    parent.isLeaf = false;
    parent.terminalConfirmed = false;
    newTree.nodes.set(childId, {
      ...parent,
      id: childId,
      name: 'Exclusive',
      parentId: parent.id,
      depth: parent.depth + 1,
      pathSegments: childPath,
      fullPath: childPath.join(' / '),
      categoryString: childPath.join(' '),
      childIds: [],
      hasChildren: false,
      isLeaf: true,
      terminalConfirmed: true,
    });
    const newSnapshot = buildMarketTargetSnapshot(newTree);
    const newTarget = newSnapshot.targets.find(
      (item) => item.targetId === childId,
    )!;
    const newRow = {
      ...oldRow,
      sourceListingId: 'new-child',
      runId: 'new',
      requestedTargetId: newTarget.targetId,
      requestedTargetPath: newTarget.pathSegments,
    };
    publisher.publishTarget({
      hierarchyVersion: newSnapshot.hierarchyVersion,
      tree: newTree,
      targets: newSnapshot.targets,
      result: assignWeeklyEvidence(newTree, [newRow]),
    });

    const current = publisher.loadCurrent()!;
    expect(current.pools[former.targetId]).toBeUndefined();
    expect(current.pools[newTarget.targetId]).toEqual(['new-child']);
    expect(current.assignments['old-terminal'].status).toBe('UNRESOLVED');
  });

  test('current unresolved evidence evicts an older exact placement', () => {
    const tree = testTree();
    const snapshot = buildMarketTargetSnapshot(tree);
    const target = snapshot.targets.find((item) =>
      item.targetId.endsWith('/advanced'),
    )!;
    const publisher = new AtomicWeeklyMarketPublisher(dir);
    const observation: WeeklyRawObservation = {
      source: 'sahibinden',
      sourceListingId: 'changed-row',
      sourceUrl: '',
      title: '',
      modelCells: [],
      listingDate: '2026-09-04',
      listingDateText: '4 Eylül 2026',
      year: null,
      mileage: null,
      price: null,
      currency: null,
      location: null,
      capturedAt: '2026-09-04T00:00:00Z',
      runId: 'first',
      requestedTargetId: target.targetId,
      requestedTargetPath: target.pathSegments,
      page: 1,
    };
    publisher.publishTarget({
      hierarchyVersion: snapshot.hierarchyVersion,
      tree,
      targets: snapshot.targets,
      result: assignWeeklyEvidence(tree, [observation]),
    });
    publisher.publishTarget({
      hierarchyVersion: snapshot.hierarchyVersion,
      tree,
      targets: snapshot.targets,
      result: assignWeeklyEvidence(tree, [
        { ...observation, runId: 'second', modelCells: ['unknown identity'] },
      ]),
    });
    expect(publisher.loadCurrent()?.assignments['changed-row'].status).toBe(
      'UNRESOLVED',
    );
    expect(publisher.loadCurrent()?.pools[target.targetId]).toBeUndefined();
  });

  test('baseline sibling conflict is ambiguous, while a shallower ancestor yields to deepest exact', () => {
    const tree = testTree();
    const snapshot = buildMarketTargetSnapshot(tree);
    const advanced = snapshot.targets.find((item) =>
      item.targetId.endsWith('/advanced'),
    )!;
    const sline = snapshot.targets.find((item) =>
      item.targetId.endsWith('/s-line'),
    )!;
    const parent = tree.nodes.get('audi/a3/a3-sportback/35-tfsi')!;
    const makeRow = (id: string): WeeklyRawObservation => ({
      source: 'sahibinden',
      sourceListingId: id,
      sourceUrl: '',
      title: '',
      modelCells: [],
      listingDate: '2026-09-04',
      listingDateText: '4 Eylül 2026',
      year: null,
      mileage: null,
      price: null,
      currency: null,
      location: null,
      capturedAt: '2026-09-04T00:00:00Z',
      runId: 'run',
      requestedTargetId: advanced.targetId,
      requestedTargetPath: advanced.pathSegments,
      page: 1,
    });
    const publisher = new AtomicWeeklyMarketPublisher(dir);
    publisher.publishTarget({
      hierarchyVersion: snapshot.hierarchyVersion,
      tree,
      targets: snapshot.targets,
      result: assignWeeklyEvidence(tree, [makeRow('sibling'), makeRow('deep')]),
      baselineAssignments: {
        sibling: {
          nodeId: sline.targetId,
          evidence: 'PAGE_EXACT',
          depth: sline.depth,
        },
        deep: {
          nodeId: parent.id,
          evidence: 'ROW_MODEL_EXACT',
          depth: parent.depth,
        },
      },
    });
    const current = publisher.loadCurrent()!;
    expect(current.assignments.sibling.status).toBe('AMBIGUOUS');
    expect(Object.values(current.pools).flat()).not.toContain('sibling');
    expect(current.assignments.deep).toMatchObject({
      status: 'EXACT',
      nodeId: advanced.targetId,
    });
  });
});
