import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AccessChallengeError, CollectionJob, COLLECTOR_VERSION } from './contracts';
import { FixtureBrowserDriver, FixturePages, PageRequest } from './browser-driver';
import { CheckpointStore } from './checkpoint-store';
import { CollectorRunner, resumeQueueFromCheckpoint } from './collector-runner';
import { createJobs, JobQueue } from './job-queue';
import { StagingStore } from './staging-store';
import { syntheticListingPage } from './__fixtures__/synthetic-page';

const JOB_A = 'sahibinden_html:audi:a3';
const JOB_B = 'sahibinden_html:audi:a4';
const JOB_C = 'sahibinden_html:bmw:3-serisi';

const SPECS = [
  { source: 'SAHIBINDEN_HTML', make: 'Audi', family: 'A3' },
  { source: 'SAHIBINDEN_HTML', make: 'Audi', family: 'A4' },
  { source: 'SAHIBINDEN_HTML', make: 'BMW', family: '3 Serisi' },
];

/** Her sayfada tekil id'ler; sayfa n -> id'ler jobKey-n-1..2 */
function pages(jobKey: string, count: number, lastHasNext = false): string[] {
  return Array.from({ length: count }, (_v, i) =>
    syntheticListingPage(
      [{ id: `${jobKey}-${i + 1}-a` }, { id: `${jobKey}-${i + 1}-b` }],
      { hasNextPage: lastHasNext ? true : i < count - 1 },
    ),
  );
}

const FIXTURE_PAGES: FixturePages = {
  [JOB_A]: pages('a', 2),
  [JOB_B]: pages('b', 8),
  [JOB_C]: pages('c', 2),
};

describe('market-refresh collector runner', () => {
  let dir: string;
  let checkpointPath: string;
  let stagingPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-runner-'));
    checkpointPath = path.join(dir, 'checkpoint.json');
    stagingPath = path.join(dir, 'run-1.jsonl');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function build(opts: {
    jobs?: CollectionJob[];
    deadlineMs?: number | null;
    now?: () => number;
    onFetch?: (req: PageRequest) => void;
  }) {
    const driver = new FixtureBrowserDriver(FIXTURE_PAGES, undefined, { onFetch: opts.onFetch });
    const runner = new CollectorRunner({
      runId: 'run-1',
      driver,
      queue: new JobQueue(opts.jobs ?? createJobs(SPECS)),
      staging: new StagingStore(stagingPath),
      checkpoint: new CheckpointStore(checkpointPath),
      snapshotPath: path.join(dir, 'dev.db'),
      deadlineMs: opts.deadlineMs ?? null,
      now: opts.now,
    });
    return { driver, runner };
  }

  it('drains the whole queue and closes the browser', async () => {
    const { driver, runner } = build({});
    const result = await runner.run();

    expect(result.outcome).toBe('QUEUE_EXHAUSTED');
    expect(driver.closed).toBe(true);
    expect(result.jobs.every((j) => j.status === 'COMPLETE')).toBe(true);
    expect(result.metrics.recordsExtracted).toBe(24); // (2+8+2) sayfa x 2 ilan
    expect(result.report.dbModified).toBe(false);
  });

  it('writes a durable checkpoint after every page, not only at the end', async () => {
    let observedMidRun: any = null;
    const { runner } = build({
      onFetch: (req) => {
        if (req.job.id === JOB_A && req.page === 2) {
          // 1. sayfa bitmisken checkpoint DISKTE olmali.
          observedMidRun = JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));
        }
      },
    });
    await runner.run();

    expect(observedMidRun).not.toBeNull();
    const jobA = observedMidRun.payload.jobs.find((j: CollectionJob) => j.id === JOB_A);
    expect(jobA.cursor.page).toBe(2);
    expect(observedMidRun.payload.version).toBe(COLLECTOR_VERSION);
  });

  it('stops at the deadline, checkpoints, and closes the browser resumably', async () => {
    let clock = 0;
    const { driver, runner } = build({
      deadlineMs: 2500,
      now: () => clock,
      onFetch: () => {
        clock += 1000;
      },
    });
    const result = await runner.run();

    expect(result.outcome).toBe('DEADLINE_REACHED');
    expect(driver.closed).toBe(true);
    expect(driver.visits).toHaveLength(3);
    // Kosu yarim kaldi ama durum kalici.
    expect(fs.existsSync(checkpointPath)).toBe(true);
    const payload = new CheckpointStore(checkpointPath).load();
    expect(payload.jobs.some((j) => j.status !== 'COMPLETE')).toBe(true);
  });

  it('resumes without repeating complete work or losing pending work', async () => {
    // Kurulum: A tamam, B 4. sayfada, C beklemede.
    const jobs = createJobs(SPECS);
    const jobA = jobs.find((j) => j.id === JOB_A)!;
    jobA.status = 'COMPLETE';
    jobA.cursor = { page: 3, exhausted: true };
    const jobB = jobs.find((j) => j.id === JOB_B)!;
    jobB.status = 'IN_PROGRESS';
    jobB.cursor = { page: 4, exhausted: false };

    new CheckpointStore(checkpointPath).save({
      version: COLLECTOR_VERSION,
      runId: 'run-1',
      createdAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-24T00:00:00.000Z',
      jobs,
      stagingFile: stagingPath,
      snapshotPath: null,
    });

    const resumed = resumeQueueFromCheckpoint(new CheckpointStore(checkpointPath));
    expect(resumed.runId).toBe('run-1');

    const driver = new FixtureBrowserDriver(FIXTURE_PAGES);
    const runner = new CollectorRunner({
      runId: resumed.runId,
      driver,
      queue: resumed.queue,
      staging: new StagingStore(resumed.stagingFile),
      checkpoint: new CheckpointStore(checkpointPath),
      snapshotPath: resumed.snapshotPath,
      deadlineMs: null,
    });
    const result = await runner.run();

    // A TEKRARLANMAZ.
    expect(driver.visits.filter((v) => v.jobId === JOB_A)).toHaveLength(0);
    // B TAM 4. SAYFADAN devam eder.
    const bVisits = driver.visits.filter((v) => v.jobId === JOB_B).map((v) => v.page);
    expect(bVisits[0]).toBe(4);
    expect(bVisits).toEqual([4, 5, 6, 7, 8]);
    // C beklemedeydi, simdi islendi.
    expect(driver.visits.filter((v) => v.jobId === JOB_C).map((v) => v.page)).toEqual([1, 2]);
    expect(result.jobs.find((j) => j.id === JOB_C)!.status).toBe('COMPLETE');
  });

  it('keeps pending work pending when the run stops before reaching it', async () => {
    let clock = 0;
    const { runner } = build({
      deadlineMs: 1500,
      now: () => clock,
      onFetch: () => {
        clock += 1000;
      },
    });
    const result = await runner.run();

    expect(result.outcome).toBe('DEADLINE_REACHED');
    expect(result.jobs.find((j) => j.id === JOB_C)!.status).toBe('PENDING');
    expect(result.jobs.find((j) => j.id === JOB_C)!.cursor.page).toBe(1);
  });

  it('blocks the job and stops safely on an access challenge, without bypassing', async () => {
    const { driver, runner } = build({
      onFetch: (req) => {
        if (req.job.id === JOB_B && req.page === 2) {
          throw new AccessChallengeError('HTTP_429', req.job.id, req.page);
        }
      },
    });
    const result = await runner.run();

    expect(result.outcome).toBe('ACCESS_CHALLENGE');
    expect(result.accessChallenge).toBe('HTTP_429');
    expect(driver.closed).toBe(true);

    const blocked = result.jobs.find((j) => j.id === JOB_B)!;
    expect(blocked.status).toBe('BLOCKED');
    expect(blocked.lastError).toContain('HTTP_429');
    // Engelden ONCE toplananlar korunur.
    expect(new StagingStore(stagingPath).readAll().length).toBeGreaterThan(0);
    // Engelden sonra hicbir is denenmez.
    expect(driver.visits.filter((v) => v.jobId === JOB_C)).toHaveLength(0);
    expect(result.jobs.find((j) => j.id === JOB_C)!.status).toBe('PENDING');
  });

  it('does not double-write listings when the same run is executed twice', async () => {
    await build({}).runner.run();
    const afterFirst = new StagingStore(stagingPath).readAll().length;

    const second = build({ jobs: createJobs(SPECS) });
    await second.runner.run();
    const afterSecond = new StagingStore(stagingPath).readAll().length;

    expect(afterFirst).toBe(24);
    expect(afterSecond).toBe(24);
  });
});
