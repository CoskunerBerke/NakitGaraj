import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CheckpointCorruptError, COLLECTOR_VERSION } from './contracts';
import { CheckpointPayload, CheckpointStore } from './checkpoint-store';
import { createJobs } from './job-queue';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ng-checkpoint-'));
}

function payload(dir: string): CheckpointPayload {
  return {
    version: COLLECTOR_VERSION,
    runId: 'run-1',
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
    jobs: createJobs([{ source: 'SAHIBINDEN_HTML', make: 'Audi', family: 'A3' }]),
    stagingFile: path.join(dir, 'staging.jsonl'),
    snapshotPath: path.join(dir, 'dev.db'),
  };
}

describe('market-refresh checkpoint durability', () => {
  let dir: string;
  let store: CheckpointStore;

  beforeEach(() => {
    dir = tmpDir();
    store = new CheckpointStore(path.join(dir, 'checkpoint.json'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips a checkpoint and leaves no temp files behind', () => {
    store.save(payload(dir));
    const loaded = store.load();
    expect(loaded.runId).toBe('run-1');
    expect(loaded.jobs).toHaveLength(1);
    const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp-'));
    expect(leftovers).toHaveLength(0);
  });

  it('fails safely on a corrupted checkpoint instead of resetting progress', () => {
    store.save(payload(dir));
    const raw = JSON.parse(fs.readFileSync(store.path, 'utf-8'));
    raw.payload.jobs[0].cursor.page = 999; // checksum artik tutmaz
    fs.writeFileSync(store.path, JSON.stringify(raw), 'utf-8');

    expect(() => store.load()).toThrow(CheckpointCorruptError);
  });

  it('fails safely on truncated JSON', () => {
    store.save(payload(dir));
    const raw = fs.readFileSync(store.path, 'utf-8');
    fs.writeFileSync(store.path, raw.slice(0, Math.floor(raw.length / 2)), 'utf-8');
    expect(() => store.load()).toThrow(CheckpointCorruptError);
  });

  it('rejects a checkpoint written by a different collector version', () => {
    const p = payload(dir);
    store.save(p);
    const raw = JSON.parse(fs.readFileSync(store.path, 'utf-8'));
    raw.payload.version = 'v0';
    // Checksum'i yeni surumle tutarli hale getir ki testin reddi SURUM kaynakli olsun.
    const crypto = require('crypto');
    raw.checksum = crypto
      .createHash('sha256')
      .update(JSON.stringify(raw.payload))
      .digest('hex');
    fs.writeFileSync(store.path, JSON.stringify(raw), 'utf-8');

    expect(() => store.load()).toThrow(/version/i);
  });

  it('quarantines a corrupt checkpoint rather than deleting the evidence', () => {
    store.save(payload(dir));
    fs.writeFileSync(store.path, '{ broken', 'utf-8');
    const quarantined = store.quarantine();
    expect(fs.existsSync(quarantined)).toBe(true);
    expect(store.exists()).toBe(false);
  });
});
