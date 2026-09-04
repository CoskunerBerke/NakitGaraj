import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildMarketTargetSnapshot } from './hierarchy-gate';
import { TargetStateStore } from './target-state-store';
import { testTree } from './__fixtures__/tree';

describe('per-target transactional state', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-weekly-state-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('failure never advances the committed boundary', () => {
    const target = buildMarketTargetSnapshot(testTree()).targets[0];
    const store = new TargetStateStore(path.join(dir, 'state.json'));
    store.reconcile(target);
    store.begin(target);
    store.commit(target.targetId, {
      boundaryDate: '2026-09-04',
      boundaryIds: ['old'],
      pagesVisited: 1,
      newListings: 1,
      completedAt: '2026-09-04T12:00:00Z',
    });
    store.begin(target);
    store.fail(target.targetId, 'CAPTCHA', 2, 3);
    expect(store.get(target.targetId)).toMatchObject({
      status: 'INCOMPLETE',
      previousBoundaryDate: '2026-09-04',
      seenListingIdsAtBoundary: ['old'],
      lastSuccessfulRefreshAt: '2026-09-04T12:00:00Z',
    });
  });

  test('changed identity is invalidated and new children never inherit a former parent watermark', () => {
    const tree = testTree();
    const snapshot = buildMarketTargetSnapshot(tree);
    const target = snapshot.targets.find((item) =>
      item.targetId.endsWith('advanced'),
    )!;
    const store = new TargetStateStore(path.join(dir, 'state.json'));
    store.reconcile(target);
    store.commit(target.targetId, {
      boundaryDate: '2026-09-04',
      boundaryIds: ['1'],
      pagesVisited: 1,
      newListings: 1,
      completedAt: '2026-09-04T12:00:00Z',
    });
    const changed = {
      ...target,
      targetIdentityHash: 'changed',
      hierarchyVersion: 'v2',
    };
    expect(store.reconcile(changed)).toMatchObject({
      status: 'INVALIDATED',
      previousBoundaryDate: null,
      lastSuccessfulRefreshAt: null,
    });

    // A new exact identity always receives fresh state; labels alone are never a key.
    const child = {
      ...changed,
      targetId: `${target.targetId}/new-package`,
      targetIdentityHash: 'new-child',
    };
    expect(store.reconcile(child)).toMatchObject({
      status: 'FRESH',
      previousBoundaryDate: null,
      seenListingIdsAtBoundary: [],
    });
  });
});
