/**
 * IS KUYRUGU — GENIS KAYNAK KATEGORISI GRANULARITESI.
 *
 * TOPLAMA GRANULARITESI SIHIRBAZ GRANULARITESI DEGILDIR.
 * Sihirbazin 46.932 gecerli yaprak ucu icin IS URETILMEZ; kaynak listeleme
 * sayfalari marka/aile kiriliminda gezilir (Audi/A3, Audi/A4, BMW/3 Serisi).
 * Yaprak duzeyi yorumlama, toplama sonrasi mevcut normalizer katmaninin isidir.
 */
import { CollectionJob, JobStatus } from './contracts';

export interface JobSpec {
  source: string;
  make: string;
  family: string;
}

/**
 * Kaza korumasi: yaprak duzeyinde is uretme girisimi burada patlar.
 * Gercek marka/aile evreni birkac yuzdur; binlerce is bir tasarim hatasidir.
 */
export const MAX_JOBS_V1 = 2000;

export class JobGranularityError extends Error {
  constructor(count: number) {
    super(
      `Refusing to build ${count} jobs (limit ${MAX_JOBS_V1}). Collection granularity must be ` +
        `broad source categories (make/family), not wizard leaf paths.`,
    );
    this.name = 'JobGranularityError';
  }
}

export function buildJobId(spec: JobSpec): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-');
  return `${norm(spec.source)}:${norm(spec.make)}:${norm(spec.family)}`;
}

export function createJobs(specs: JobSpec[]): CollectionJob[] {
  if (specs.length > MAX_JOBS_V1) {
    throw new JobGranularityError(specs.length);
  }
  const seen = new Set<string>();
  const jobs: CollectionJob[] = [];
  for (const spec of specs) {
    const id = buildJobId(spec);
    if (seen.has(id)) continue;
    seen.add(id);
    jobs.push({
      id,
      source: spec.source,
      make: spec.make,
      family: spec.family,
      status: 'PENDING',
      cursor: { page: 1, exhausted: false },
      attempts: 0,
      startedAt: null,
      updatedAt: null,
      lastError: null,
      observedCount: 0,
    });
  }
  return jobs;
}

export class JobQueue {
  private readonly jobs: Map<string, CollectionJob>;
  private readonly order: string[];

  constructor(jobs: CollectionJob[]) {
    if (jobs.length > MAX_JOBS_V1) {
      throw new JobGranularityError(jobs.length);
    }
    this.jobs = new Map(jobs.map((j) => [j.id, { ...j, cursor: { ...j.cursor } }]));
    this.order = jobs.map((j) => j.id);
  }

  /** Devam ettirilebilir siradaki is: yarim kalan once, sonra beklemedekiler. */
  next(): CollectionJob | null {
    const inProgress = this.order
      .map((id) => this.jobs.get(id)!)
      .find((j) => j.status === 'IN_PROGRESS');
    if (inProgress) return inProgress;
    return this.order.map((id) => this.jobs.get(id)!).find((j) => j.status === 'PENDING') || null;
  }

  get(id: string): CollectionJob | undefined {
    return this.jobs.get(id);
  }

  all(): CollectionJob[] {
    return this.order.map((id) => this.jobs.get(id)!);
  }

  countByStatus(): Record<JobStatus, number> {
    const counts: Record<JobStatus, number> = {
      PENDING: 0,
      IN_PROGRESS: 0,
      COMPLETE: 0,
      FAILED: 0,
      BLOCKED: 0,
    };
    for (const job of this.jobs.values()) counts[job.status] += 1;
    return counts;
  }

  private touch(job: CollectionJob): CollectionJob {
    job.updatedAt = new Date().toISOString();
    return job;
  }

  start(id: string): CollectionJob {
    const job = this.require(id);
    if (job.status === 'PENDING') {
      job.status = 'IN_PROGRESS';
      job.attempts += 1;
      job.startedAt = job.startedAt || new Date().toISOString();
    }
    return this.touch(job);
  }

  /** Sayfa tamamlandi: imlec ILERLETILIR — yeniden okuma boylece olmaz. */
  advance(id: string, completedPage: number, observed: number): CollectionJob {
    const job = this.require(id);
    job.cursor.page = completedPage + 1;
    job.observedCount += observed;
    return this.touch(job);
  }

  complete(id: string): CollectionJob {
    const job = this.require(id);
    job.status = 'COMPLETE';
    job.cursor.exhausted = true;
    return this.touch(job);
  }

  fail(id: string, error: string): CollectionJob {
    const job = this.require(id);
    job.status = 'FAILED';
    job.lastError = error;
    return this.touch(job);
  }

  /** Erisim engeli: is BLOKE edilir, veri kaybi olmadan devam ettirilebilir. */
  block(id: string, error: string): CollectionJob {
    const job = this.require(id);
    job.status = 'BLOCKED';
    job.lastError = error;
    return this.touch(job);
  }

  private require(id: string): CollectionJob {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`JobQueue: unknown job id "${id}"`);
    return job;
  }

  snapshot(): CollectionJob[] {
    return this.all().map((j) => ({ ...j, cursor: { ...j.cursor } }));
  }
}
