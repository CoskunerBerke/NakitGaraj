/**
 * TOPLAYICI KOSUCUSU — checkpoint, deadline ve erisim engeli semantigi.
 *
 * DEGISMEZLER:
 *   - Her BASARILI sayfadan SONRA checkpoint yazilir. Cokme aninda en fazla
 *     bir sayfa yeniden okunur; TAMAMLANMIS is asla tekrarlanmaz.
 *   - Deadline'a ulasilinca ISLENEN sayfa guvenli sekilde bitirilir, checkpoint
 *     yazilir, tarayici KAPATILIR ve kosu devam ettirilebilir halde biter.
 *   - Erisim engelinde BYPASS DENENMEZ: is BLOKE edilir, checkpoint yazilir,
 *     kosu durur.
 *   - Snapshot DB'sine HICBIR yazma yapilmaz.
 */
import {
  AccessChallengeError,
  CollectionJob,
  COLLECTOR_VERSION,
  RunOutcome,
} from './contracts';
import { BrowserDriver } from './browser-driver';
import { CheckpointStore } from './checkpoint-store';
import { StagingStore } from './staging-store';
import { JobQueue } from './job-queue';
import { QualityMetrics } from './quality-gate';
import { RunReport } from './run-report';

export interface RunnerOptions {
  runId: string;
  driver: BrowserDriver;
  queue: JobQueue;
  staging: StagingStore;
  checkpoint: CheckpointStore;
  snapshotPath: string | null;
  /** Azami kosu suresi (ms). null = sinirsiz. */
  deadlineMs: number | null;
  /** Is basina azami sayfa — sonsuz sayfalama korumasi. */
  maxPagesPerJob?: number;
  now?: () => number;
}

export interface RunnerResult {
  outcome: RunOutcome;
  accessChallenge: string | null;
  metrics: QualityMetrics;
  jobs: CollectionJob[];
  report: Omit<RunReport, 'quality' | 'diff'>;
}

const DEFAULT_MAX_PAGES_PER_JOB = 500;

export class CollectorRunner {
  private readonly now: () => number;

  constructor(private readonly opts: RunnerOptions) {
    this.now = opts.now || (() => Date.now());
  }

  async run(): Promise<RunnerResult> {
    const startedAtMs = this.now();
    const startedAt = new Date().toISOString();
    const deadlineAt =
      this.opts.deadlineMs === null ? null : startedAtMs + this.opts.deadlineMs;
    const maxPages = this.opts.maxPagesPerJob ?? DEFAULT_MAX_PAGES_PER_JOB;

    const metrics: QualityMetrics = {
      pagesAttempted: 0,
      pagesOk: 0,
      recordsExtracted: 0,
      parseFailures: 0,
      validPrice: 0,
      validYear: 0,
      validMileage: 0,
      duplicates: 0,
      previousTotal: 0,
      newTotal: 0,
    };

    let outcome: RunOutcome = 'QUEUE_EXHAUSTED';
    let accessChallenge: string | null = null;

    this.opts.staging.open();
    await this.opts.driver.open();

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (deadlineAt !== null && this.now() >= deadlineAt) {
          outcome = 'DEADLINE_REACHED';
          break;
        }

        const job = this.opts.queue.next();
        if (!job) {
          outcome = 'QUEUE_EXHAUSTED';
          break;
        }

        this.opts.queue.start(job.id);
        const page = job.cursor.page;

        if (page > maxPages) {
          this.opts.queue.complete(job.id);
          this.persist();
          continue;
        }

        metrics.pagesAttempted += 1;

        let result;
        try {
          result = await this.opts.driver.fetchPage({ job, page, runId: this.opts.runId });
        } catch (err) {
          if (err instanceof AccessChallengeError) {
            // BYPASS YOK. Bloke et, durumu kalici yaz, guvenle dur.
            this.opts.queue.block(job.id, `${err.kind} on page ${page}`);
            this.persist();
            accessChallenge = err.kind;
            outcome = 'ACCESS_CHALLENGE';
            break;
          }
          this.opts.queue.fail(job.id, (err as Error).message);
          this.persist();
          continue;
        }

        if (!result.pageOk) {
          this.opts.queue.fail(job.id, `page ${page} failed`);
          this.persist();
          continue;
        }

        metrics.pagesOk += 1;
        metrics.parseFailures += result.parseFailures;
        metrics.recordsExtracted += result.listings.length;
        for (const listing of result.listings) {
          if (listing.price !== null && listing.price > 0) metrics.validPrice += 1;
          if (listing.year !== null) metrics.validYear += 1;
          if (listing.mileage !== null) metrics.validMileage += 1;
        }

        const appended = this.opts.staging.appendMany(result.listings);
        metrics.duplicates += appended.duplicates;

        this.opts.queue.advance(job.id, page, appended.written);
        if (!result.hasNextPage) {
          this.opts.queue.complete(job.id);
        }

        // Checkpoint HER sayfadan sonra — devam ettirilebilirligin kaynagi.
        this.persist();
      }
    } finally {
      // Deadline, engel veya hata: tarayici HER durumda kapatilir.
      await this.opts.driver.close();
      this.persist();
    }

    const stagingStats = this.opts.staging.stats();
    metrics.newTotal = stagingStats.knownKeys;

    const finishedAt = new Date().toISOString();
    return {
      outcome,
      accessChallenge,
      metrics,
      jobs: this.opts.queue.snapshot(),
      report: {
        runId: this.opts.runId,
        collectorVersion: COLLECTOR_VERSION,
        startedAt,
        finishedAt,
        outcome,
        durationMs: this.now() - startedAtMs,
        deadlineMs: this.opts.deadlineMs,
        jobCounts: this.opts.queue.countByStatus(),
        metrics,
        staging: {
          path: this.opts.staging.path,
          written: stagingStats.written,
          duplicates: stagingStats.duplicates,
          skippedCorruptLines: stagingStats.skippedCorruptLines,
        },
        checkpointPath: this.opts.checkpoint.path,
        snapshot: { kind: 'not-opened', path: this.opts.snapshotPath },
        accessChallenge,
        dbModified: false,
      },
    };
  }

  private persist(): void {
    const nowIso = new Date().toISOString();
    const existing = this.opts.checkpoint.exists() ? this.safeLoadCreatedAt() : nowIso;
    this.opts.checkpoint.save({
      version: COLLECTOR_VERSION,
      runId: this.opts.runId,
      createdAt: existing,
      updatedAt: nowIso,
      jobs: this.opts.queue.snapshot(),
      stagingFile: this.opts.staging.path,
      snapshotPath: this.opts.snapshotPath,
    });
  }

  private safeLoadCreatedAt(): string {
    try {
      return this.opts.checkpoint.load().createdAt;
    } catch {
      // Bozuk checkpoint burada YUTULMAZ; yalnizca createdAt bilinmedigi icin
      // yeni damga kullanilir. Bozulma tespiti resume yolunda yapilir.
      return new Date().toISOString();
    }
  }
}

/** Checkpoint'ten devam ettirilebilir kuyruk kurar. */
export function resumeQueueFromCheckpoint(checkpoint: CheckpointStore): {
  queue: JobQueue;
  runId: string;
  stagingFile: string;
  snapshotPath: string | null;
} {
  const payload = checkpoint.load();
  return {
    queue: new JobQueue(payload.jobs),
    runId: payload.runId,
    stagingFile: payload.stagingFile,
    snapshotPath: payload.snapshotPath,
  };
}
