/**
 * OZYINELEMELI BOLUMLEME SOZLESMELERI — kucuk yapisal fixture'lar (canli
 * HTML kopyasi DEGIL; yalniz sayim/agac yapisi).
 */
import {
  planPartition,
  isPlanComplete,
  expectedPagesFor,
  LEAF_CAP,
  SourceNode,
} from './source-partition';

describe('planPartition', () => {
  test('count <= 1000 -> tek toplanabilir yaprak, 50/sayfa', async () => {
    const root: SourceNode = { path: 'audi-a3', label: 'Audi A3', count: 948 };
    const plan = await planPartition(root);
    expect(plan.leaves).toHaveLength(1);
    expect(plan.leaves[0].kind).toBe('COLLECTABLE_LEAF');
    expect(plan.leaves[0].expectedPages).toBe(Math.ceil(948 / 50)); // 19
    expect(plan.unsplittable).toHaveLength(0);
    expect(isPlanComplete(plan)).toBe(true);
  });

  test('sinir tam LEAF_CAP: yaprak (bolme yok)', async () => {
    const plan = await planPartition({ path: 'x', label: 'X', count: LEAF_CAP });
    expect(plan.leaves).toHaveLength(1);
    expect(plan.unsplittable).toHaveLength(0);
  });

  test('count > 1000 -> ebeveyn TOPLANMAZ, cocuklar toplanir', async () => {
    const root: SourceNode = {
      path: 'bmw-3-serisi',
      label: 'BMW 3 Serisi',
      count: 11265,
      children: [
        { path: 'bmw-3-315', label: '315', count: 11 },
        { path: 'bmw-3-316', label: '316', count: 22 },
        { path: 'bmw-3-318i', label: '318i', count: 948 },
      ],
    };
    const plan = await planPartition(root);
    const paths = plan.leaves.map((l) => l.path).sort();
    expect(paths).toEqual(['bmw-3-315', 'bmw-3-316', 'bmw-3-318i']);
    // Ebeveyn asla yaprak olmaz.
    expect(plan.leaves.find((l) => l.path === 'bmw-3-serisi')).toBeUndefined();
    expect(isPlanComplete(plan)).toBe(true);
  });

  test('ic ice > 1000 -> OZYINELEMELI split (316i tekrar bolunur)', async () => {
    const root: SourceNode = {
      path: 'bmw-3-serisi', label: 'BMW 3 Serisi', count: 11265,
      children: [
        { path: 'bmw-3-316i', label: '316i', count: 1694, children: [
          { path: 'bmw-3-316i-2015-2018', label: '316i 2015-2018', count: 900 },
          { path: 'bmw-3-316i-2019-2024', label: '316i 2019-2024', count: 794 },
        ] },
        { path: 'bmw-3-318i', label: '318i', count: 948 },
      ],
    };
    const plan = await planPartition(root);
    const paths = plan.leaves.map((l) => l.path).sort();
    expect(paths).toEqual(['bmw-3-316i-2019-2024', 'bmw-3-316i-2015-2018', 'bmw-3-318i'].sort());
    // 316i'nin kendisi yaprak DEGIL (1694 > 1000).
    expect(plan.leaves.find((l) => l.path === 'bmw-3-316i')).toBeUndefined();
  });

  test('cocuk yok ama TRUTHFUL ikincil bolum (yil) varsa onunla bolunur', async () => {
    const root: SourceNode = {
      path: 'x-big', label: 'X Big', count: 1500,
      secondaryPartitions: [
        { path: 'x-big-2020', label: 'X 2020', count: 700 },
        { path: 'x-big-2021', label: 'X 2021', count: 800 },
      ],
    };
    const plan = await planPartition(root);
    expect(plan.leaves.map((l) => l.path).sort()).toEqual(['x-big-2020', 'x-big-2021']);
    expect(plan.unsplittable).toHaveLength(0);
  });

  test('> 1000 + gercek bolum YOK -> UNSPLITTABLE_OVERSIZED (sessiz kayip yok)', async () => {
    const plan = await planPartition({ path: 'y-huge', label: 'Y Huge', count: 5000 });
    expect(plan.leaves).toHaveLength(0);
    expect(plan.unsplittable).toEqual([
      { kind: 'UNSPLITTABLE_OVERSIZED', path: 'y-huge', label: 'Y Huge', count: 5000 },
    ]);
    // Plan TAMAMLANMADI -> aylik tazeleme eksik.
    expect(isPlanComplete(plan)).toBe(false);
  });

  test('tembel kesif: children agacta yoksa discover ile getirilir', async () => {
    const root: SourceNode = { path: 'lazy', label: 'Lazy', count: 2000 };
    const discover = async (node: SourceNode) => {
      if (node.path === 'lazy') {
        return { children: [
          { path: 'lazy-a', label: 'A', count: 500 },
          { path: 'lazy-b', label: 'B', count: 600 },
        ] };
      }
      return {};
    };
    const plan = await planPartition(root, discover);
    expect(plan.leaves.map((l) => l.path).sort()).toEqual(['lazy-a', 'lazy-b']);
  });

  test('ayni dugum iki kez ziyaret edilmez (dongu korumasi)', async () => {
    const shared: SourceNode = { path: 'shared', label: 'S', count: 100 };
    const root: SourceNode = {
      path: 'root', label: 'R', count: 2000,
      children: [shared, shared],
    };
    const plan = await planPartition(root);
    expect(plan.leaves.filter((l) => l.path === 'shared')).toHaveLength(1);
  });

  test('expectedPagesFor: 50/sayfa, en az 1', () => {
    expect(expectedPagesFor(0)).toBe(1);
    expect(expectedPagesFor(1)).toBe(1);
    expect(expectedPagesFor(50)).toBe(1);
    expect(expectedPagesFor(51)).toBe(2);
    expect(expectedPagesFor(948)).toBe(19);
  });
});
