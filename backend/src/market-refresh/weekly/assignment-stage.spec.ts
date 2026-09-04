import { assignWeeklyEvidence } from './assignment-stage';
import { WeeklyRawObservation } from './evidence-store';
import { testTree } from './__fixtures__/tree';

function row(
  id: string,
  targetId: string,
  path: string[],
  modelCells: string[],
): WeeklyRawObservation {
  return {
    source: 'sahibinden',
    sourceListingId: id,
    sourceUrl: '',
    title: '',
    modelCells,
    listingDate: '2026-09-04',
    listingDateText: '4 Eylül 2026',
    year: null,
    mileage: null,
    price: null,
    currency: null,
    location: null,
    capturedAt: '2026-09-04T00:00:00Z',
    runId: 'run',
    requestedTargetId: targetId,
    requestedTargetPath: path,
    page: 1,
  };
}

describe('weekly assignment staging', () => {
  test('dedupes pagination and excludes unresolved without pool leakage', () => {
    const tree = testTree();
    const target = tree.nodes.get('audi/a3/a3-sportback/35-tfsi/advanced')!;
    const observations = [
      row('1', target.id, target.pathSegments, []),
      { ...row('1', target.id, target.pathSegments, []), page: 2 },
      row('2', target.id, target.pathSegments, ['not a proven child']),
    ];
    const result = assignWeeklyEvidence(tree, observations);
    expect(result.pools[target.id]).toEqual(['1']);
    expect(result.assignments['2'].status).toBe('UNRESOLVED');
    expect(result.stats).toMatchObject({
      exact: 1,
      unresolved: 1,
      doubleExactAssignments: 0,
      crossPoolDuplicates: 0,
      siblingLeakage: 0,
      parentLeakage: 0,
    });
  });

  test('same listing proven in sibling targets becomes ambiguous and enters no pool', () => {
    const tree = testTree();
    const advanced = tree.nodes.get('audi/a3/a3-sportback/35-tfsi/advanced')!;
    const sline = tree.nodes.get('audi/a3/a3-sportback/35-tfsi/s-line')!;
    const result = assignWeeklyEvidence(tree, [
      row('shared', advanced.id, advanced.pathSegments, []),
      row('shared', sline.id, sline.pathSegments, []),
    ]);
    expect(result.assignments.shared.status).toBe('AMBIGUOUS');
    expect(Object.values(result.pools).flat()).not.toContain('shared');
    expect(result.stats.doubleExactAssignments).toBe(1);
  });
});
