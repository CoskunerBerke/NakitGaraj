import { RawObservedListing, SnapshotMutationForbiddenError } from './contracts';
import { runDryRunDiff } from './dry-run-diff';
import {
  InMemorySnapshotReader,
  PrismaSnapshotReader,
  SnapshotListing,
} from './snapshot-reference';

const SOURCE = 'SAHIBINDEN_HTML';

function observed(
  id: string,
  overrides: Partial<RawObservedListing> = {},
): RawObservedListing {
  return {
    source: SOURCE,
    sourceListingId: id,
    sourceUrl: `https://fixture.invalid/ilan/${id}`,
    title: `Ilan ${id}`,
    sourceMake: 'Audi',
    sourceModel: 'A3',
    year: 2021,
    mileage: 1000,
    price: 100,
    currency: 'TRY',
    location: 'Istanbul',
    capturedAt: '2026-08-24T00:00:00.000Z',
    runId: 'run-1',
    jobId: 'sahibinden_html:audi:a3',
    page: 1,
    ...overrides,
  };
}

function snapshotRow(
  id: string,
  overrides: Partial<SnapshotListing> = {},
): SnapshotListing {
  return {
    source: SOURCE,
    sourceListingId: id,
    price: 100,
    mileageKm: 1000,
    year: 2021,
    canonicalMake: 'Audi',
    canonicalModel: 'A3',
    ...overrides,
  };
}

describe('market-refresh dry-run diff', () => {
  const reader = new InMemorySnapshotReader([
    snapshotRow('u1'),
    snapshotRow('p1', { price: 150 }),
    snapshotRow('m1', { mileageKm: 4000 }),
    snapshotRow('d1'),
    snapshotRow('x1'),
  ]);

  const observations = [
    observed('u1'),
    observed('n1'),
    observed('p1', { price: 200 }),
    observed('m1', { mileage: 5000 }),
    observed('d1'),
    observed('d1'),
    observed('i1', { price: null }),
  ];

  it('classifies every observation and reports counts only', async () => {
    const result = await runDryRunDiff({
      source: SOURCE,
      observations,
      reader,
      scope: { makes: ['Audi'] },
    });

    expect(result.counts).toEqual({
      UNCHANGED: 2,
      NEW: 1,
      PRICE_CHANGED: 1,
      MILEAGE_CHANGED: 1,
      MISSING: 1,
      DUPLICATE: 1,
      INVALID: 1,
    });
    expect(result.totalObserved).toBe(7);
    expect(result.totalComparable).toBe(5);
  });

  it('never reports a database mutation in V1', async () => {
    const result = await runDryRunDiff({
      source: SOURCE,
      observations,
      reader,
      scope: { makes: ['Audi'] },
    });
    expect(result.dbModified).toBe(false);
  });

  it('treats a record with no price or no year as INVALID rather than guessing', async () => {
    const result = await runDryRunDiff({
      source: SOURCE,
      observations: [
        observed('a', { price: null }),
        observed('b', { year: null }),
        observed('c', { price: 0 }),
        observed('d', { sourceListingId: '' }),
      ],
      reader: new InMemorySnapshotReader([]),
      scope: { makes: [] },
    });
    expect(result.counts.INVALID).toBe(4);
    expect(result.counts.NEW).toBe(0);
  });

  it('counts a simultaneous price and mileage move as PRICE_CHANGED and flags it', async () => {
    const result = await runDryRunDiff({
      source: SOURCE,
      observations: [observed('both', { price: 999, mileage: 9999 })],
      reader: new InMemorySnapshotReader([snapshotRow('both')]),
      scope: { makes: ['Audi'] },
    });
    expect(result.counts.PRICE_CHANGED).toBe(1);
    expect(result.counts.MILEAGE_CHANGED).toBe(0);
    expect(result.priceAndMileageChanged).toBe(1);
  });

  it('limits MISSING to the collected scope', async () => {
    const scopedReader = new InMemorySnapshotReader([
      snapshotRow('audi-only'),
      snapshotRow('bmw-1', { canonicalMake: 'BMW' }),
    ]);
    const result = await runDryRunDiff({
      source: SOURCE,
      observations: [],
      reader: scopedReader,
      scope: { makes: ['Audi'] },
    });
    // Toplanmamis BMW kapsami MISSING sayilmaz.
    expect(result.counts.MISSING).toBe(1);
    expect(result.snapshotScopeSize).toBe(1);
  });

  it('exposes no write path to the snapshot', async () => {
    const prismaReader = new PrismaSnapshotReader('C:/nonexistent/snapshot.db');
    expect(() => prismaReader.write()).toThrow(SnapshotMutationForbiddenError);
    expect(typeof (prismaReader as any).create).toBe('undefined');
    expect(typeof (prismaReader as any).update).toBe('undefined');
    expect(typeof (prismaReader as any).delete).toBe('undefined');
  });
});
