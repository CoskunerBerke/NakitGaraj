import {
  buildMarketTargetSnapshot,
  hierarchyVersionOf,
} from './hierarchy-gate';
import { testTree } from './__fixtures__/tree';

describe('weekly exact path integrity gate', () => {
  test('accepts variable depth, same labels in different branches and only direct edges', () => {
    const tree = testTree();
    const snapshot = buildMarketTargetSnapshot(tree, {
      now: () => new Date('2026-09-04T00:00:00Z'),
    });
    expect(snapshot.integrity).toMatchObject({
      pathsChecked: 4,
      skippedLevels: 0,
      wrongParents: 0,
      orphans: 0,
      ambiguousPaths: 0,
      ok: true,
    });
    expect(snapshot.targets.map((target) => target.fullPath)).toEqual(
      expect.arrayContaining([
        'Audi / A3 / A3 Sportback / 35 TFSI / Advanced',
        'Audi / A3 / A3 Sedan / 35 TFSI',
        'BMW / A3',
      ]),
    );
    expect(
      snapshot.targets.find((target) => target.fullPath === 'BMW / A3')
        ?.targetId,
    ).not.toBe(
      snapshot.targets.find((target) => target.fullPath.includes('Audi / A3 /'))
        ?.targetId,
    );
  });

  test('rejects a skipped edge and wrong-parent reference', () => {
    const tree = testTree();
    const child = tree.nodes.get('audi/a3/a3-sportback/35-tfsi')!;
    child.parentId = 'audi/a3';
    const snapshot = buildMarketTargetSnapshot(tree);
    expect(snapshot.integrity.ok).toBe(false);
    expect(snapshot.integrity.skippedLevels).toBeGreaterThan(0);
    expect(snapshot.integrity.wrongParents).toBeGreaterThan(0);
  });

  test('hierarchy hash ignores volatile counts and changes on a direct edge change', () => {
    const tree = testTree();
    const before = hierarchyVersionOf(tree);
    tree.nodes.get('audi')!.totalListingCount = 99999;
    expect(hierarchyVersionOf(tree)).toBe(before);
    tree.nodes.get('audi/a3')!.childIds.reverse();
    expect(hierarchyVersionOf(tree)).toBe(before); // child ordering is not identity
    tree.nodes.get('audi/a3')!.childIds.pop();
    expect(hierarchyVersionOf(tree)).not.toBe(before);
  });

  test('does not promote a contradictory has-children node to a market target', () => {
    const tree = testTree();
    const leaf = tree.nodes.get('audi/a3/a3-sedan/35-tfsi')!;
    leaf.hasChildren = true;
    const snapshot = buildMarketTargetSnapshot(tree);
    expect(snapshot.targets.map((target) => target.targetId)).not.toContain(
      leaf.id,
    );
  });
});
