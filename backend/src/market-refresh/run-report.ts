/**
 * KOSU RAPORU — denetlenebilir, tek dosya, sirlarsiz.
 * Rapor icine token, cerez, kimlik veya musteri PII'si YAZILMAZ.
 */
import * as fs from 'fs';
import * as path from 'path';
import { JobStatus, RunOutcome } from './contracts';
import { QualityResult } from './quality-gate';
import { DryRunDiffResult } from './dry-run-diff';
import { QualityMetrics } from './quality-gate';

export interface RunReport {
  runId: string;
  collectorVersion: string;
  startedAt: string;
  finishedAt: string;
  outcome: RunOutcome;
  durationMs: number;
  deadlineMs: number | null;
  jobCounts: Record<JobStatus, number>;
  metrics: QualityMetrics;
  staging: { path: string; written: number; duplicates: number; skippedCorruptLines: number };
  checkpointPath: string;
  snapshot: { kind: string; path: string | null };
  /** Erisim engeli olustuysa turu. */
  accessChallenge: string | null;
  quality: QualityResult | null;
  diff: DryRunDiffResult | null;
  /** V1 sozlesmesi: toplayici snapshot'a YAZMAZ. */
  dbModified: false;
}

export function writeRunReport(reportPath: string, report: RunReport): string {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  return reportPath;
}

export function summarizeReport(report: RunReport): string {
  const c = report.jobCounts;
  const lines = [
    `run       : ${report.runId} (${report.collectorVersion})`,
    `outcome   : ${report.outcome}`,
    `duration  : ${report.durationMs} ms`,
    `jobs      : complete=${c.COMPLETE} pending=${c.PENDING} in-progress=${c.IN_PROGRESS} ` +
      `blocked=${c.BLOCKED} failed=${c.FAILED}`,
    `pages     : ok=${report.metrics.pagesOk}/${report.metrics.pagesAttempted}`,
    `records   : extracted=${report.metrics.recordsExtracted} ` +
      `parseFailures=${report.metrics.parseFailures} duplicates=${report.metrics.duplicates}`,
    `staging   : ${report.staging.written} written, ${report.staging.duplicates} duplicate`,
    `challenge : ${report.accessChallenge ?? 'none'}`,
    `quality   : ${report.quality ? report.quality.status : 'not evaluated'}`,
    `db        : MODIFIED=${report.dbModified ? 'YES' : 'NO'}`,
  ];
  return lines.join('\n');
}
