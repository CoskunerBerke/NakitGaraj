import {
  BoundaryPolicy,
  DEFAULT_BOUNDARY_POLICY,
  deriveNextBoundary,
  evaluateBoundary,
  validateBoundaryPolicy,
} from './boundary-rule';

const policy: BoundaryPolicy = { ...DEFAULT_BOUNDARY_POLICY, minAnchorMatches: 3 };
const prior = {
  boundaryDate: '2026-09-05',
  boundaryIds: new Set(['b1', 'b2']),
  anchorIds: new Set(['a1', 'a2', 'a3', 'a4', 'a5']),
};
const today = '2026-09-11';

function decide(over: Partial<Parameters<typeof evaluateBoundary>[0]>) {
  return evaluateBoundary({
    hasNextPage: true,
    pagesVisited: 1,
    oldestDateSeen: null,
    seenIds: new Set(),
    prior,
    today,
    policy,
    ...over,
  });
}

describe('safe boundary rule: date + listing ids + bounded overlap', () => {
  test('end of listing is always a safe stop', () => {
    expect(decide({ hasNextPage: false, seenIds: new Set(['x']) })).toMatchObject({
      reached: true,
      proof: 'END_OF_LISTING',
    });
  });

  test('date alone never stops: reaching the boundary day without passing it continues', () => {
    const d = decide({ oldestDateSeen: '2026-09-05', seenIds: new Set(['n1', 'b1', 'b2', 'a1', 'a2', 'a3']) });
    expect(d).toMatchObject({ reached: false, dateReentered: false, boundaryMatches: 2, anchorMatches: 3 });
  });

  test('unchanged target: one page that re-enters the boundary day and re-observes anchors stops', () => {
    const d = decide({ oldestDateSeen: '2026-09-04', seenIds: new Set(['b1', 'b2', 'a1', 'a2', 'a3']) });
    expect(d).toMatchObject({ reached: true, proof: 'ANCHOR_IDS', anchorMatches: 3 });
  });

  test('anchors deleted at the source: the date window is the fallback proof', () => {
    const notEnough = decide({ oldestDateSeen: '2026-09-04', seenIds: new Set(['b1', 'a1']) });
    expect(notEnough).toMatchObject({ reached: false, anchorMatches: 1 });
    const window = decide({ oldestDateSeen: '2026-09-03', seenIds: new Set(['b1', 'a1']) });
    expect(window).toMatchObject({ reached: true, proof: 'DATE_WINDOW' });
  });

  test('a small anchor set only requires itself', () => {
    const smallPrior = { ...prior, anchorIds: new Set(['a1']) };
    expect(decide({ prior: smallPrior, oldestDateSeen: '2026-09-04', seenIds: new Set(['a1']) })).toMatchObject({
      reached: true,
      proof: 'ANCHOR_IDS',
    });
    const noAnchors = { ...prior, anchorIds: new Set<string>() };
    expect(decide({ prior: noAnchors, oldestDateSeen: '2026-09-04', seenIds: new Set(['b1']) })).toMatchObject({
      reached: false,
    });
    expect(decide({ prior: noAnchors, oldestDateSeen: '2026-09-03', seenIds: new Set(['b1']) })).toMatchObject({
      reached: true,
      proof: 'DATE_WINDOW',
    });
  });

  test('exhausting the page cap without proof marks the target unproven, never reached', () => {
    const d = decide({ pagesVisited: policy.maxPagesPerTarget, oldestDateSeen: '2026-09-05' });
    expect(d).toMatchObject({ reached: false, exhausted: true });
  });

  test('fresh target follows the explicit baseline policy: pages, or days when configured', () => {
    expect(decide({ prior: null, pagesVisited: 3 })).toMatchObject({ reached: false, exhausted: false });
    expect(decide({ prior: null, pagesVisited: policy.initialBaselinePages })).toMatchObject({
      reached: true,
      proof: 'BASELINE_POLICY',
    });
    const days = { ...policy, initialBaselineDays: 30 };
    expect(decide({ prior: null, policy: days, oldestDateSeen: '2026-08-20' })).toMatchObject({ reached: false });
    expect(decide({ prior: null, policy: days, oldestDateSeen: '2026-08-01' })).toMatchObject({
      reached: true,
      proof: 'BASELINE_POLICY',
    });
    expect(decide({ prior: null, pagesVisited: 20, policy: { ...policy, initialBaselinePages: 20 } })).toMatchObject({
      proof: 'BASELINE_POLICY',
    });
  });

  test('policy validation rejects zero/negative values and anything above the source maximum', () => {
    expect(() => validateBoundaryPolicy(DEFAULT_BOUNDARY_POLICY)).not.toThrow();
    expect(() => validateBoundaryPolicy({ ...policy, overlapDays: 0 })).toThrow('overlapDays');
    expect(() => validateBoundaryPolicy({ ...policy, initialBaselinePages: 21 })).toThrow('exceeds');
    expect(() => validateBoundaryPolicy({ ...policy, initialBaselineDays: 0 })).toThrow('initialBaselineDays');
  });

  test('deriveNextBoundary records the newest day, all its ids and the first anchors below it', () => {
    const next = deriveNextBoundary(
      [
        { sourceListingId: 'n2', listingDate: '2026-09-11' },
        { sourceListingId: 'n1', listingDate: '2026-09-11' },
        { sourceListingId: 'o1', listingDate: '2026-09-10' },
        { sourceListingId: 'o2', listingDate: '2026-09-09' },
        { sourceListingId: 'o2', listingDate: '2026-09-09' }, // sayfalama tekrari
        { sourceListingId: 'o3', listingDate: '2026-09-08' },
        { sourceListingId: 'o4', listingDate: '2026-09-07' },
      ],
      3,
    );
    expect(next).toEqual({ boundaryDate: '2026-09-11', boundaryIds: ['n1', 'n2'], anchorIds: ['o1', 'o2', 'o3'] });
    expect(deriveNextBoundary([], 3)).toEqual({ boundaryDate: null, boundaryIds: [], anchorIds: [] });
  });
});
