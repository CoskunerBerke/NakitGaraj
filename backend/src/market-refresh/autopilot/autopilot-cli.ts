/**
 * AUTOPILOT KOPRU BASLATICI.
 *
 * Kullanim:
 *   npm run market:autopilot:bridge -- --port 8791
 *   npm run market:autopilot:bridge -- --port 8791 --window 02:00-10:00
 *   npm run market:autopilot:bridge -- --port 8791 --reference off   (hizli duman testi)
 *
 * ILK CANLI DUMAN KOSUSU (kapsam korumali, tek model):
 *   npm run market:autopilot:bridge -- --port 8791
 *     --scope-root /audi-a3 --scope-make Audi --scope-series A3
 *     --max-result-pages 3 --require-child-structure --stop-on-unknown
 *     --makes Audi
 *
 * KAPSAM UZANTIDAN DEGIL BURADAN VERILIR. Uzanti guvenilmez bir istemcidir;
 * kapsami genisletebilseydi koruma koruma olmazdi.
 *
 * JETON YOK. Kopru yalnizca 127.0.0.1'e baglanir, Host'u dogrular, web sayfasi
 * kokenlerini reddeder ve tum yollarda sabit (gizli olmayan) uzanti isaretini
 * arar. Kullanicinin bir dosya bulup jeton yapistirmasi GEREKMEZ.
 */
import * as fs from 'fs';
import * as path from 'path';
import { AtomicChecksummedFile } from '../checkpoint-store';
import { StagingStore } from '../staging-store';
import { AutopilotBridge, BridgeSessionProvider } from './autopilot-bridge';
import {
  AutopilotCheckpointPayload,
  AutopilotSession,
  MapReferenceLookup,
  ReferenceLookup,
} from './autopilot-session';
import { SnapshotFingerprintLookup } from './snapshot-fingerprint-lookup';
import { AutopilotScope, normalizeScopeRoot } from './scope-guard';
import { buildCoverageQueue, loadManifest, pathKey } from './coverage-queue';
import { artifactToTree, loadArtifact } from '../../vehicle-hierarchy/hierarchy-source';
import { resolveSnapshotPath } from '../snapshot-reference';

const DEFAULT_SOURCE = 'sahibinden';
const DEFAULT_BASE_URL = 'https://www.sahibinden.com/';
/** Snapshot'taki `source` degeri korpustan gelir; gozlem kaynagindan farklidir. */
const DEFAULT_SNAPSHOT_SOURCE = 'SAHIBINDEN_HTML';

interface CliArgs {
  port: number;
  runId: string;
  source: string;
  baseUrl: string;
  windowSpec: string | null;
  reference: 'auto' | 'off';
  makes: string[];
  scope: AutopilotScope | null;
  /** Kapsama manifestosu yolu — verilirse hedefler BURADAN gelir. */
  coverageManifest: string | null;
  coveragePriorities: Array<'A' | 'B' | 'C' | 'D'>;
  coverageLimit: number | null;
}

function parseArgs(argv: string[]): CliArgs {
  const get = (name: string): string | null => {
    const idx = argv.indexOf(`--${name}`);
    if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) return argv[idx + 1];
    const inline = argv.find((a) => a.startsWith(`--${name}=`));
    return inline ? inline.slice(name.length + 3) : null;
  };

  const has = (name: string) => argv.includes(`--${name}`);

  const makes = (get('makes') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const scopeRoot = get('scope-root');
  const scopeMake = get('scope-make');
  const scopeSeries = get('scope-series');
  const maxResultPages = get('max-result-pages');

  let scope: AutopilotScope | null = null;
  if (scopeRoot || scopeMake || scopeSeries) {
    if (!scopeRoot || !scopeMake || !scopeSeries) {
      throw new Error(
        'Scope guard needs --scope-root, --scope-make and --scope-series together ' +
          '(a partial scope would silently allow expansion).',
      );
    }
    const pages = Number(maxResultPages || 3);
    if (!Number.isInteger(pages) || pages < 1) {
      throw new Error('--max-result-pages must be a positive integer');
    }
    scope = {
      rootPath: normalizeScopeRoot(scopeRoot, get('base-url') || DEFAULT_BASE_URL),
      make: scopeMake,
      series: scopeSeries,
      maxResultPages: pages,
      requireChildStructure: has('require-child-structure'),
      stopOnUnknown: has('stop-on-unknown'),
    };
  }

  return {
    scope,
    port: Number(get('port') || 8791),
    runId: get('run-id') || `autopilot-${new Date().toISOString().slice(0, 10)}`,
    source: get('source') || DEFAULT_SOURCE,
    baseUrl: get('base-url') || DEFAULT_BASE_URL,
    windowSpec: get('window'),
    reference: get('reference') === 'off' ? 'off' : 'auto',
    makes,
    coverageManifest: get('coverage-manifest'),
    coveragePriorities: ((get('coverage-priority') || 'A')
      .split(',')
      .map((p) => p.trim().toUpperCase())
      .filter((p) => ['A', 'B', 'C', 'D'].includes(p)) as Array<'A' | 'B' | 'C' | 'D'>),
    coverageLimit: get('coverage-limit') ? Number(get('coverage-limit')) : null,
  };
}

/**
 * KAPSAMA HEDEFLERI — UZANTIDAN DEGIL MANIFESTODAN.
 *
 * Uzantinin gonderdigi kok listesi YOK SAYILIR. Hedefler manifestodan gelir
 * ve o an diskte olmayanlarla sinirlanir; boylece "yalnizca eksikler"
 * garantisi guvenilmez bir istemciye BAGLI OLMAZ.
 */
function coverageRoots(args: CliArgs): Array<{ path: string; label: string }> | null {
  if (!args.coverageManifest) return null;

  /** Su anda diskte olan kategoriler — agac artefaktindan (breadcrumb turevli). */
  const present = new Set<string>();
  const artifact = loadArtifact();
  if (artifact) {
    const tree = artifactToTree(artifact);
    for (const node of tree.nodes.values()) {
      if (node.sourceFiles.length > 0) present.add(pathKey(node.pathSegments));
    }
  }

  const queue = buildCoverageQueue(loadManifest(args.coverageManifest), {
    priorities: args.coveragePriorities,
    limit: args.coverageLimit ?? undefined,
    alreadyPresent: present,
  });

  console.log(
    `[autopilot] coverage queue: ${queue.targets.length} target(s) ` +
      `(priority ${args.coveragePriorities.join(',')}), ` +
      `skipped: ${queue.skippedAlreadyPresent} already present, ` +
      `${queue.skippedOtherPriority} other priority; ` +
      `${queue.needsReview.length} need URL review (no source href)`,
  );
  for (const t of queue.targets.slice(0, 10)) {
    console.log(`[autopilot]   -> ${t.categoryUrl}  (${t.fullPath.join(' / ')})`);
  }
  if (queue.targets.length === 0) {
    throw new Error('Coverage queue is empty: nothing left to collect for the chosen priorities.');
  }
  return queue.roots;
}

/**
 * "02:00-10:00" -> bir sonraki kapanis aninin epoch ms degeri.
 * Kapanis saati suanki saatten kucukse ERTESI GUNE tasinir.
 */
export function resolveWindowDeadline(spec: string, now: Date = new Date()): number {
  const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(spec.trim());
  if (!match) throw new Error(`Invalid --window "${spec}"; expected HH:MM-HH:MM`);
  const endHour = Number(match[3]);
  const endMinute = Number(match[4]);

  const end = new Date(now);
  end.setHours(endHour, endMinute, 0, 0);
  if (end.getTime() <= now.getTime()) end.setDate(end.getDate() + 1);
  return end.getTime();
}

async function buildReference(args: CliArgs): Promise<{
  lookup: ReferenceLookup;
  describe: string;
  close: () => Promise<void>;
}> {
  if (args.reference === 'off') {
    return {
      lookup: new MapReferenceLookup(),
      describe: 'reference=off (every card classifies as NEW)',
      close: async () => undefined,
    };
  }
  const snapshotPath = resolveSnapshotPath();
  const lookup = new SnapshotFingerprintLookup(snapshotPath);
  await lookup.open({ source: DEFAULT_SNAPSHOT_SOURCE, canonicalMakes: args.makes });
  return {
    lookup,
    describe: `snapshot fingerprints: ${lookup.size} (read-only ${snapshotPath})`,
    close: () => lookup.close(),
  };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  const runDir = path.resolve(__dirname, '../../../data/market-refresh/autopilot', args.runId);
  fs.mkdirSync(runDir, { recursive: true });

  const staging = new StagingStore(path.join(runDir, 'staging.jsonl'));
  const checkpointFile = new AtomicChecksummedFile<AutopilotCheckpointPayload>(
    path.join(runDir, 'checkpoint.json'),
  );
  const reference = await buildReference(args);

  let session: AutopilotSession | null = null;

  const baseOptions = {
    runId: args.runId,
    source: args.source,
    baseUrl: args.baseUrl,
    staging,
    checkpointFile,
    reference: reference.lookup,
    scope: args.scope,
    snapshotPath: args.reference === 'off' ? null : resolveSnapshotPath(),
  };

  const deadlineFromWindow = () =>
    args.windowSpec ? resolveWindowDeadline(args.windowSpec) : null;

  const manifestRoots = coverageRoots(args);

  const provider: BridgeSessionProvider = {
    current: () => session,
    start: ({ roots, deadlineMs }) => {
      const deadlineAtMs =
        deadlineMs !== null ? Date.now() + deadlineMs : deadlineFromWindow();
      // Manifest modunda uzantinin kok listesi YOK SAYILIR.
      const effective = manifestRoots ?? roots;
      session = AutopilotSession.start({ ...baseOptions, deadlineAtMs }, effective);
      return session;
    },
    resume: () => {
      session = AutopilotSession.resume({ ...baseOptions, deadlineAtMs: deadlineFromWindow() });
      return session;
    },
  };

  const bridge = new AutopilotBridge({
    provider,
    port: args.port,
    log: (line) => console.log(`[autopilot] ${line}`),
  });

  const bound = await bridge.listen();

  console.log('');
  console.log('  NAKITGARAJ — CHROME AUTOPILOT BRIDGE');
  console.log(`  bind        http://${bound.host}:${bound.port}   (loopback only)`);
  console.log(`  run id      ${args.runId}`);
  console.log(`  source      ${args.source} (${args.baseUrl})`);
  console.log(`  run dir     ${runDir}`);
  console.log(`  reference   ${reference.describe}`);
  console.log(`  window      ${args.windowSpec || 'unbounded'}`);
  console.log(
    `  scope       ${
      args.scope
        ? `${args.scope.make} / ${args.scope.series} under ${args.scope.rootPath}, ` +
          `max ${args.scope.maxResultPages} page(s)/leaf` +
          `${args.scope.requireChildStructure ? ', stop if child structure unreadable' : ''}` +
          `${args.scope.stopOnUnknown ? ', stop if count unreadable' : ''}`
        : 'UNBOUNDED (full monthly refresh)'
    }`,
  );
  console.log('  auth        none — loopback bind + Host check + extension origin/marker');
  console.log('  -> Just set the bridge address in the extension popup and press START.');
  console.log('');

  const shutdown = async () => {
    await bridge.close();
    await reference.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[autopilot] failed to start: ${err?.message || err}`);
    process.exit(1);
  });
}
