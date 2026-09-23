/**
 * YAYIN DIZINI BUDAMA ARACI.
 *
 *   npm run market:published:prune             -> yalnizca RAPOR (hicbir sey silinmez)
 *   npm run market:published:prune -- --apply  -> plani uygular, eski surumleri siler
 *
 * SILME VARSAYILAN DEGILDIR. `npm run ... --dry-run` yazan biri (arada `--`
 * olmadan) o bayragi npm'e vermis olur ve betige hic ulasmaz; varsayilan
 * silmek olsaydi bu yazim sessizce veri silerdi. Bu yuzden yon tersine
 * cevrildi: silmek icin ACIKCA `--apply` gerekir ve plan her zaman ONCE
 * yazdirilir.
 */
import * as fs from 'fs';
import {
  RetentionOutcome,
  formatRetentionSummary,
  planPublishedRetention,
  prunePublishedReleases,
  resolveRetentionPolicy,
} from './published-retention';
import { resolveWeeklyMarketArtifactRoot } from './artifact-publisher';
import { checkDisk } from './disk-guard';

export interface PruneArgs {
  apply: boolean;
  root: string;
  keepCount: number | null;
  json: boolean;
}

export const PRUNE_USAGE = [
  'Usage: market:published:prune [--apply] [--retain N] [--root DIR] [--json]',
  '',
  '  (default)     report only; deletes nothing',
  '  --apply       delete the obsolete releases the report lists',
  '  --dry-run     explicit no-op; the default already reports only',
  '  --retain N    historical releases to keep besides the live one',
  '                (env MARKET_PUBLISHED_RETENTION_COUNT)',
  '  --root DIR    published/ directory (default: the weekly artifact root)',
  '  --json        machine-readable output',
].join('\n');

/**
 * Tanimadigi bayragi YOK SAYMAZ. `--aply` gibi bir yazim hatasi sessizce
 * "rapor" ya da "sil" anlamina gelmemeli.
 */
export function parseArgs(argv: string[]): PruneArgs {
  const args: PruneArgs = {
    apply: false,
    root: resolveWeeklyMarketArtifactRoot(),
    keepCount: null,
    json: false,
  };
  let dryRunAsked = false;
  const value = (index: number, flag: string): string => {
    const next = argv[index];
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`${flag} needs a value\n\n${PRUNE_USAGE}`);
    }
    return next;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--dry-run') dryRunAsked = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--root') args.root = value(++i, '--root');
    else if (arg === '--retain' || arg === '--keep') {
      const raw = Number(value(++i, arg));
      if (!Number.isFinite(raw) || raw < 0) {
        throw new Error(
          `${arg} must be a non-negative number\n\n${PRUNE_USAGE}`,
        );
      }
      args.keepCount = Math.floor(raw);
    } else if (arg === '--help' || arg === '-h') {
      console.log(PRUNE_USAGE);
      process.exit(0);
    } else {
      throw new Error(`unknown argument "${arg}"\n\n${PRUNE_USAGE}`);
    }
  }

  if (args.apply && dryRunAsked) {
    throw new Error(
      `--apply and --dry-run contradict each other\n\n${PRUNE_USAGE}`,
    );
  }
  return args;
}

function main(): void {
  let args: PruneArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`\n  ${(error as Error).message}\n`);
    process.exitCode = 2;
    return;
  }

  if (!fs.existsSync(args.root)) {
    console.error(`\n  published directory not found: ${args.root}\n`);
    process.exitCode = 2;
    return;
  }

  const policy = resolveRetentionPolicy();
  if (args.keepCount !== null) policy.keepCount = args.keepCount;

  // PLAN ONCE. Silme ancak bu rapor yazildiktan sonra ve `--apply` ile olur.
  const plan = planPublishedRetention(args.root, policy);
  const preview: RetentionOutcome = {
    ok: true,
    dryRun: true,
    plan,
    deleted: [],
    freedBytes: 0,
    failed: [],
    error: null,
  };

  if (!args.json) {
    console.log('');
    console.log(
      `  PUBLISHED RELEASE RETENTION${args.apply ? '' : ' — REPORT ONLY (nothing deleted)'}`,
    );
    console.log('');
    for (const line of formatRetentionSummary(preview).split('\n')) {
      console.log(`  ${line}`);
    }
    const disk = checkDisk(args.root);
    console.log(
      `  Disk                ${(disk.freeBytes / 1024 ** 3).toFixed(1)} GB free at ${disk.path}`,
    );
    console.log('');
  }

  const outcome = args.apply
    ? prunePublishedReleases(args.root, { policy })
    : preview;

  if (args.json) {
    console.log(JSON.stringify(outcome, null, 2));
  } else if (args.apply) {
    console.log(`  Applied: deleted ${outcome.deleted.length} release(s).`);
    for (const failure of outcome.failed) {
      console.log(`    could not delete ${failure.file}: ${failure.error}`);
    }
    console.log('');
  } else if (plan.deletable.length > 0) {
    console.log('  Run again with --apply to delete them:');
    console.log('    npm run market:published:prune -- --apply');
    console.log('');
  }

  /**
   * Silinemeyen dosya ya da "karar veremedim" durumu yayini gecersiz kilmaz
   * ama sessiz de gecilmez: zamanlanmis bir is bunu gormeli.
   */
  process.exitCode = outcome.ok && plan.refusals.length === 0 ? 0 : 1;
}

if (require.main === module) main();
