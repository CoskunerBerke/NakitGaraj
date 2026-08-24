import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RawObservedListing } from './contracts';
import { StagingStore } from './staging-store';

function record(id: string, overrides: Partial<RawObservedListing> = {}): RawObservedListing {
  return {
    source: 'SAHIBINDEN_HTML',
    sourceListingId: id,
    sourceUrl: `https://fixture.invalid/ilan/${id}`,
    title: `Ilan ${id}`,
    sourceMake: 'Audi',
    sourceModel: 'A3',
    year: 2021,
    mileage: 45000,
    price: 1850000,
    currency: 'TRY',
    location: 'Istanbul',
    capturedAt: '2026-08-24T00:00:00.000Z',
    runId: 'run-1',
    jobId: 'sahibinden_html:audi:a3',
    page: 1,
    ...overrides,
  };
}

describe('market-refresh staging store', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-staging-'));
    file = path.join(dir, 'run-1.jsonl');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('appends records as JSONL and reports written counts', () => {
    const store = new StagingStore(file);
    store.open();
    const result = store.appendMany([record('1'), record('2')]);

    expect(result).toEqual({ written: 2, duplicates: 0 });
    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).sourceListingId).toBe('1');
  });

  it('deduplicates within a single session', () => {
    const store = new StagingStore(file);
    store.open();
    expect(store.append(record('1'))).toBe('WRITTEN');
    expect(store.append(record('1'))).toBe('DUPLICATE');
    expect(store.stats().written).toBe(1);
    expect(store.stats().duplicates).toBe(1);
  });

  it('stays deduplicated across a resume by rebuilding keys from the file', () => {
    const first = new StagingStore(file);
    first.open();
    first.appendMany([record('1'), record('2')]);

    // Sureç durdu; yeni ornek ayni dosyayi acar.
    const resumed = new StagingStore(file);
    resumed.open();
    expect(resumed.stats().knownKeys).toBe(2);
    expect(resumed.append(record('2'))).toBe('DUPLICATE');
    expect(resumed.append(record('3'))).toBe('WRITTEN');

    expect(resumed.readAll().map((r) => r.sourceListingId)).toEqual(['1', '2', '3']);
  });

  it('survives a half-written trailing line and counts it as corrupt', () => {
    const store = new StagingStore(file);
    store.open();
    store.appendMany([record('1'), record('2')]);
    fs.appendFileSync(file, '{"sourceListingId":"3","sour', 'utf-8');

    const resumed = new StagingStore(file);
    resumed.open();
    expect(resumed.stats().skippedCorruptLines).toBe(1);
    expect(resumed.stats().knownKeys).toBe(2);
    // Yarim satirdaki ilan gorulmemis sayilir; yeniden yazilabilir.
    expect(resumed.append(record('3'))).toBe('WRITTEN');
  });

  it('treats different runs as separate staging files', () => {
    const runA = new StagingStore(path.join(dir, 'run-a.jsonl'));
    const runB = new StagingStore(path.join(dir, 'run-b.jsonl'));
    runA.open();
    runB.open();
    runA.append(record('1', { runId: 'run-a' }));
    expect(runB.append(record('1', { runId: 'run-b' }))).toBe('WRITTEN');
  });

  it('refuses writes before open()', () => {
    const store = new StagingStore(file);
    expect(() => store.append(record('1'))).toThrow(/open\(\)/);
  });
});
