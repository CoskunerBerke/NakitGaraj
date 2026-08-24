/**
 * MARKET REFRESH CLI — V1.
 *
 * Komutlar zamanlanmis DEGILDIR; elle calistirilir. Gercek site erisimi
 * varsayilan olarak KAPALIDIR (bkz. playwright-driver: MARKET_REFRESH_ALLOW_REAL).
 *
 *   fixture   sentetik veriyle uctan uca toplama (ag erisimi yok)
 *   status    checkpoint durumunu okur
 *   resume    checkpoint'ten devam eder
 *   dry-run   staging'i snapshot ile karsilastirir (MUTASYON YOK)
 */
import * as path from 'path';
import { COLLECTOR_VERSION } from './contracts';
import { FixtureBrowserDriver, FixturePages } from './browser-driver';
import { CheckpointStore } from './checkpoint-store';
import { CollectorRunner, resumeQueueFromCheckpoint } from './collector-runner';
import { createJobs, JobQueue } from './job-queue';
import { StagingStore } from './staging-store';
import { evaluateQuality } from './quality-gate';
import { runDryRunDiff } from './dry-run-diff';
import { PrismaSnapshotReader, resolveSnapshotPath } from './snapshot-reference';
import { summarizeReport, writeRunReport, RunReport } from './run-report';
import { syntheticListingPage } from './__fixtures__/synthetic-page';

const STATE_DIR = path.resolve(__dirname, '../../data/market-refresh');
const CHECKPOINT_PATH = path.join(STATE_DIR, 'checkpoint.json');

function stagingPathFor(runId: string): string {
  return path.join(STATE_DIR, 'staging', `${runId}.jsonl`);
}

function reportPathFor(runId: string): string {
  return path.join(STATE_DIR, 'reports', `${runId}.json`);
}

function argValue(flag: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  return process.argv[idx + 1];
}

/** Sentetik evren — gercek kaynak burada TANIMLI DEGILDIR. */
function fixtureUniverse(): { specs: any[]; pages: FixturePages } {
  const specs = [
    { source: 'SAHIBINDEN_HTML', make: 'Audi', family: 'A3' },
    { source: 'SAHIBINDEN_HTML', make: 'Audi', family: 'A4' },
    { source: 'SAHIBINDEN_HTML', make: 'BMW', family: '3 Serisi' },
  ];
  const pages: FixturePages = {};
  for (const spec of specs) {
    const id = `${spec.source.toLowerCase()}:${spec.make.toLowerCase()}:${spec.family
      .toLowerCase()
      .replace(/\s+/g, '-')}`;
    pages[id] = Array.from({ length: 3 }, (_v, i) =>
      syntheticListingPage(
        [
          { id: `${id}-${i + 1}-a`, make: spec.make, model: spec.family },
          { id: `${id}-${i + 1}-b`, make: spec.make, model: spec.family },
        ],
        { hasNextPage: i < 2 },
      ),
    );
  }
  return { specs, pages };
}

async function commandFixture(): Promise<void> {
  const runId = argValue('--run-id') || `fixture-${Date.now()}`;
  const deadlineMs = Number(argValue('--deadline-ms', '0')) || null;
  const { specs, pages } = fixtureUniverse();

  const staging = new StagingStore(stagingPathFor(runId));
  const runner = new CollectorRunner({
    runId,
    driver: new FixtureBrowserDriver(pages),
    queue: new JobQueue(createJobs(specs)),
    staging,
    checkpoint: new CheckpointStore(CHECKPOINT_PATH),
    snapshotPath: resolveSnapshotPath(),
    deadlineMs,
  });

  const result = await runner.run();
  const quality = evaluateQuality(result.metrics);
  const report: RunReport = { ...result.report, quality, diff: null };
  writeRunReport(reportPathFor(runId), report);

  console.log(summarizeReport(report));
  console.log(`report    : ${reportPathFor(runId)}`);
}

function commandStatus(): void {
  const store = new CheckpointStore(CHECKPOINT_PATH);
  if (!store.exists()) {
    console.log(`No checkpoint at ${CHECKPOINT_PATH}`);
    return;
  }
  const payload = store.load();
  const counts = payload.jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});
  console.log(`checkpoint: ${store.path}`);
  console.log(`run       : ${payload.runId} (${payload.version})`);
  console.log(`updated   : ${payload.updatedAt}`);
  console.log(`jobs      : ${JSON.stringify(counts)}`);
  console.log(`staging   : ${payload.stagingFile}`);
  console.log(`snapshot  : ${payload.snapshotPath ?? 'not set'}`);
  for (const job of payload.jobs) {
    console.log(`  ${job.status.padEnd(12)} ${job.id} page=${job.cursor.page}`);
  }
}

async function commandResume(): Promise<void> {
  const checkpoint = new CheckpointStore(CHECKPOINT_PATH);
  const resumed = resumeQueueFromCheckpoint(checkpoint);
  const { pages } = fixtureUniverse();

  const runner = new CollectorRunner({
    runId: resumed.runId,
    driver: new FixtureBrowserDriver(pages),
    queue: resumed.queue,
    staging: new StagingStore(resumed.stagingFile),
    checkpoint,
    snapshotPath: resumed.snapshotPath,
    deadlineMs: Number(argValue('--deadline-ms', '0')) || null,
  });

  const result = await runner.run();
  const quality = evaluateQuality(result.metrics);
  const report: RunReport = { ...result.report, quality, diff: null };
  writeRunReport(reportPathFor(resumed.runId), report);
  console.log(summarizeReport(report));
}

async function commandDryRun(): Promise<void> {
  const runId = argValue('--run-id');
  if (!runId) throw new Error('dry-run requires --run-id <id>');
  const makes = (argValue('--makes') || '').split(',').map((m) => m.trim()).filter(Boolean);
  const source = argValue('--source', 'SAHIBINDEN_HTML')!;

  const staging = new StagingStore(stagingPathFor(runId));
  const observations = staging.readAll();

  const reader = new PrismaSnapshotReader(resolveSnapshotPath());
  await reader.open();
  try {
    const diff = await runDryRunDiff({ source, observations, reader, scope: { makes } });
    // Snapshot gercekten degismedi mi — dosya parmak izi ile dogrula.
    reader.assertUnmutated();

    console.log(`collector : ${COLLECTOR_VERSION}`);
    console.log(`snapshot  : ${reader.describe().path}`);
    console.log(`scope     : ${makes.length ? makes.join(', ') : '(none)'}`);
    console.log(`observed  : ${diff.totalObserved} (comparable ${diff.totalComparable})`);
    console.log(`counts    : ${JSON.stringify(diff.counts)}`);
    console.log(`snapshot total: ${diff.snapshotTotal}  scope size: ${diff.snapshotScopeSize}`);
    console.log(`DB MODIFIED: ${diff.dbModified ? 'YES' : 'NO'}`);
  } finally {
    await reader.close();
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  switch (command) {
    case 'fixture':
      return commandFixture();
    case 'status':
      return commandStatus();
    case 'resume':
      return commandResume();
    case 'dry-run':
      return commandDryRun();
    default:
      console.error('Usage: market-refresh <fixture|status|resume|dry-run> [options]');
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`market-refresh failed: ${err.message}`);
  process.exitCode = 1;
});
