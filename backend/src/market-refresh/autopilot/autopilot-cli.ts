/**
 * AUTOPILOT KOPRU BASLATICI.
 *
 * UC MOD, TEK KOPRU, TEK UZANTI:
 *
 *   --mode market     (varsayilan) aylik pazar tazelemesi: kart gozlemi -> staging JSONL
 *   --mode structure  YAPI TOPLAYICISI: kategori sayfalarini HAM HTML olarak korpusa
 *                     kaydeder, korpusu okuyan AYNI hardened ayristiriciyla okur,
 *                     menuden cikan dogrudan cocuklari kuyruga alir, her sayfadan
 *                     sonra checkpoint yazar, N sayfada bir agaci yeniden kurup
 *                     dogrulama kapisini kosar.
 *   --mode weekly     tek bir dondurulmus KESIN hedef: ham HTML -> mevcut
 *                     parser/resolver -> sinir+ID overlap -> atomik yayin.
 *
 * YAPI MODU:
 *   # kuru kosu — kaynaga istek YOK, kuyruk korpusa karsi acilir ve yazdirilir
 *   npm run market:autopilot:bridge -- --mode structure --run-id smoke-1 --roots /audi-a3-a3-sedan --dry-run
 *
 *   # sinirli duman kosusu (en fazla 3 sayfa cekilir)
 *   npm run market:autopilot:bridge -- --mode structure --run-id smoke-1 --roots /audi-a3-a3-sedan --max-pages 3
 *
 *   # tam yapisal kosu (site kokunden, tum markalar, sinirsiz; devam edilebilir)
 *   npm run market:autopilot:bridge -- --mode structure --run-id structure-2026-09
 *
 *   # V2 gece kosusu: hafif kapi 50 sayfada, tam kapi 400 sayfada / 40 dk, tempo OVERNIGHT
 *   npm run market:autopilot:bridge -- --mode structure --run-id structure-2026-10 \
 *     --pace-mode overnight --light-check-every 50 --full-rebuild-every 400 --full-rebuild-minutes 40 \
 *     --deadline 08:00
 *
 *   # V2 artimli yapi tazelemesi: mevcut korpus yerelden karsilanir, 30 gunden eski cocuklu
 *   # sayfalar yeniden cekilip karsilastirilir (kayma defteri), yeni/eksik sayfalar cekilir
 *   npm run market:autopilot:bridge -- --mode structure --run-id structure-inc-2026-10 \
 *     --structure-mode incremental --stale-days 30 --pace-mode overnight
 *
 *   Tempo ayarlari: --pace-mode safe|overnight, --pace-ms, --jitter (0..0.9), --concurrency 1
 *   Kapilar: --light-check-every N (0 = kapali), --full-rebuild-every N, --full-rebuild-minutes N
 *   Zorunlu son tam kapi hicbir bayrakla kapatilamaz; --no-rebuild yalnizca --dry-run / --max-pages ile.
 *
 * PIYASA MODU (degismedi):
 *   npm run market:autopilot:bridge -- --port 8791
 *   npm run market:autopilot:bridge -- --port 8791 --window 02:00-10:00
 *   npm run market:autopilot:bridge -- --port 8791 --reference off   (hizli duman testi)
 *   npm run market:autopilot:bridge -- --port 8791
 *     --scope-root /audi-a3 --scope-make Audi --scope-series A3
 *     --max-result-pages 3 --require-child-structure --stop-on-unknown --makes Audi
 *
 * HAFTALIK MOD (tam pazar kasitli olarak acik DEGIL):
 *   npm run market:weekly:bridge -- --run-id weekly-a3-advanced-1 \
 *     --target-id audi/a3/a3-sportback/35-tfsi/advanced --max-pages 20
 *
 * KAPSAM VE KOKLER UZANTIDAN DEGIL BURADAN VERILIR. Uzanti guvenilmez bir
 * istemcidir; kapsami genisletebilseydi koruma koruma olmazdi.
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
import {
  artifactToTree,
  loadArtifact,
  resolveArtifactPath,
} from '../../vehicle-hierarchy/hierarchy-source';
import { loadAssignments } from '../../vehicle-hierarchy/build-listing-assignments';
import { NodeCoverage } from '../../vehicle-hierarchy/build-coverage-manifest';
import { loadActiveHierarchyReceipt } from '../../vehicle-hierarchy/artifact-release';
import { resolveSnapshotPath } from '../snapshot-reference';
import { CorpusIndex } from './corpus-store';
import { NpmRebuildRunner } from './rebuild-runner';
import {
  DEFAULT_FULL_REBUILD_EVERY,
  DEFAULT_FULL_REBUILD_INTERVAL_MS,
  DEFAULT_LIGHT_CHECK_EVERY,
  PACE_PRESETS,
  PaceMode,
  SITE_ROOT,
  StructureCheckpointPayload,
  StructureMode,
  StructureSession,
  StructureSessionOptions,
} from './structure-session';
import { buildMarketTargetSnapshot } from '../weekly/hierarchy-gate';
import { TargetStateStore } from '../weekly/target-state-store';
import { WeeklyEvidenceStore } from '../weekly/evidence-store';
import { AtomicWeeklyMarketPublisher } from '../weekly/artifact-publisher';
import {
  DEFAULT_WEEKLY_JITTER,
  DEFAULT_WEEKLY_PACE_MS,
  WeeklyCheckpointPayload,
  WeeklyMarketSession,
} from '../weekly/weekly-session';
import { DEFAULT_BOUNDARY_POLICY } from '../weekly/boundary-rule';

const DEFAULT_SOURCE = 'sahibinden';
const DEFAULT_BASE_URL = 'https://www.sahibinden.com/';
/** Snapshot'taki `source` degeri korpustan gelir; gozlem kaynagindan farklidir. */
const DEFAULT_SNAPSHOT_SOURCE = 'SAHIBINDEN_HTML';

/**
 * Yapisal kapi kadansi V2 — olcume dayali (structure-2026-09, 131 tam kurma,
 * 7.0 saat = aktif surenin %37'si). Varsayilanlar structure-session'da tek
 * yerde durur: hafif kapi 50 sayfa, tam kapi 400 sayfa / 40 dk, son tam kapi
 * zorunlu. Piyasa modunun tempo varsayilanlari degismedi.
 */
const DEFAULT_PACE_MS = 5000;
const DEFAULT_JITTER = 0.4;

type Mode = 'market' | 'structure' | 'weekly';

interface CliArgs {
  mode: Mode;
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
  /** Yapi modu. */
  roots: string[];
  maxPages: number | null;
  rebuildEvery: number;
  /** null = yalnizca sayfa esigi. */
  fullRebuildIntervalMs: number | null;
  lightCheckEvery: number;
  paceMode: PaceMode;
  /** null = tempo on ayarindan. */
  paceMs: number | null;
  jitter: number | null;
  structureMode: StructureMode;
  staleDays: number | null;
  /** "HH:MM" — bugunun/yarinin o saati; --window ile birlikte verilemez. */
  deadline: string | null;
  concurrency: number;
  dryRun: boolean;
  /** Genis kosuda deterministik ilk N hedef (kanarya). null = sinirsiz. */
  targetLimit: number | null;
  /** Weekly mode: one explicit exact target, or every validated target with --all-targets. */
  targetId: string | null;
  allTargets: boolean;
  /** Weekly boundary policy (see weekly-session). null = engine default. */
  initialBaselinePages: number | null;
  initialBaselineDays: number | null;
  anchorSize: number | null;
  minAnchorMatches: number | null;
  overlapDays: number | null;
}

function parseArgs(argv: string[]): CliArgs {
  const get = (name: string): string | null => {
    const idx = argv.indexOf(`--${name}`);
    if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--'))
      return argv[idx + 1];
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
      rootPath: normalizeScopeRoot(
        scopeRoot,
        get('base-url') || DEFAULT_BASE_URL,
      ),
      make: scopeMake,
      series: scopeSeries,
      maxResultPages: pages,
      requireChildStructure: has('require-child-structure'),
      stopOnUnknown: has('stop-on-unknown'),
    };
  }

  const modeRaw = (get('mode') || 'market').toLowerCase();
  if (modeRaw !== 'market' && modeRaw !== 'structure' && modeRaw !== 'weekly') {
    throw new Error(
      `--mode must be "market", "structure" or "weekly", got "${modeRaw}"`,
    );
  }
  const mode = modeRaw;

  const positiveInt = (
    name: string,
    fallback: number | null,
  ): number | null => {
    const raw = get(name);
    if (raw === null) return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0)
      throw new Error(`--${name} must be a non-negative integer`);
    return n;
  };

  const jitterRaw = get('jitter');
  const jitter = jitterRaw === null ? null : Number(jitterRaw);
  if (
    jitter !== null &&
    (!Number.isFinite(jitter) || jitter < 0 || jitter > 0.9)
  ) {
    throw new Error('--jitter must be a number between 0 and 0.9');
  }

  const paceModeRaw = (get('pace-mode') || 'safe').toUpperCase();
  if (paceModeRaw !== 'SAFE' && paceModeRaw !== 'OVERNIGHT') {
    throw new Error(
      `--pace-mode must be "safe" or "overnight", got "${get('pace-mode')}"`,
    );
  }
  const paceMode = paceModeRaw;

  const structureModeRaw = (get('structure-mode') || 'full').toUpperCase();
  if (structureModeRaw !== 'FULL' && structureModeRaw !== 'INCREMENTAL') {
    throw new Error(
      `--structure-mode must be "full" or "incremental", got "${get('structure-mode')}"`,
    );
  }
  const structureMode = structureModeRaw;

  const concurrency = Number(get('concurrency') || 1);
  if (concurrency !== 1) {
    throw new Error(
      '--concurrency: only 1 is supported. Two-worker mode needs the shared limiter/lease design ' +
        '(see docs/overnight-collection-v2.md) and is intentionally not enabled.',
    );
  }

  const deadline = get('deadline');
  if (deadline !== null && !/^\d{1,2}:\d{2}$/.test(deadline.trim())) {
    throw new Error(`Invalid --deadline "${deadline}"; expected HH:MM`);
  }
  if (deadline !== null && get('window') !== null) {
    throw new Error('--deadline and --window are alternatives; give one');
  }

  const roots = (get('roots') || SITE_ROOT)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((r) => normalizeScopeRoot(r, get('base-url') || DEFAULT_BASE_URL));

  if (mode === 'structure' && (scope || get('coverage-manifest'))) {
    throw new Error(
      '--scope-* and --coverage-* flags belong to --mode market. ' +
        'Structure mode takes --roots, --max-pages, --structure-mode, --stale-days, --light-check-every, ' +
        '--full-rebuild-every, --full-rebuild-minutes, --pace-mode, --pace-ms, --jitter, --deadline, --dry-run.',
    );
  }
  const maxPages = positiveInt('max-pages', null);
  const noRebuild = has('no-rebuild');
  if (
    mode === 'structure' &&
    noRebuild &&
    !has('dry-run') &&
    maxPages === null
  ) {
    throw new Error(
      '--no-rebuild disables the mandatory final validation gate and is only allowed with --dry-run or a bounded --max-pages smoke run.',
    );
  }
  if (mode === 'weekly' && !get('target-id') && !has('all-targets')) {
    throw new Error(
      '--mode weekly requires one --target-id, or --all-targets for the broad baseline/refresh (start it deliberately).',
    );
  }
  if (mode === 'weekly' && get('target-id') && has('all-targets')) {
    throw new Error('--target-id and --all-targets are alternatives; give one');
  }
  /**
   * `--target-limit` yalnizca genis kosuyu SINIRLAR. Tek hedefli kosuda
   * sessizce yok saymak, kullaniciya uyguladigini sandigi bir sinir
   * uygulamamak olurdu.
   */
  if (mode === 'weekly' && get('target-limit') && !has('all-targets')) {
    throw new Error(
      '--target-limit only bounds --all-targets; it is meaningless with --target-id',
    );
  }
  if (
    mode === 'weekly' &&
    (scope || get('coverage-manifest') || has('dry-run'))
  ) {
    throw new Error(
      '--mode weekly accepts --target-id | --all-targets, --target-limit, --max-pages, --run-id, --port, pacing and boundary-policy flags only',
    );
  }
  const optionalInt = (name: string): number | null => positiveInt(name, null);

  return {
    mode,
    scope,
    port: Number(get('port') || 8791),
    runId:
      get('run-id') ||
      `${mode === 'structure' ? 'structure' : mode === 'weekly' ? 'weekly' : 'autopilot'}-${new Date().toISOString().slice(0, 10)}`,
    source: get('source') || DEFAULT_SOURCE,
    baseUrl: get('base-url') || DEFAULT_BASE_URL,
    windowSpec: get('window'),
    reference: get('reference') === 'off' ? 'off' : 'auto',
    makes,
    coverageManifest: get('coverage-manifest'),
    coveragePriorities: (get('coverage-priority') || 'A')
      .split(',')
      .map((p) => p.trim().toUpperCase())
      .filter((p) => ['A', 'B', 'C', 'D'].includes(p)) as Array<
      'A' | 'B' | 'C' | 'D'
    >,
    coverageLimit: get('coverage-limit') ? Number(get('coverage-limit')) : null,
    roots,
    maxPages,
    rebuildEvery: noRebuild
      ? 0
      : (positiveInt(
          'full-rebuild-every',
          positiveInt('rebuild-every', DEFAULT_FULL_REBUILD_EVERY),
        ) as number),
    fullRebuildIntervalMs: noRebuild
      ? null
      : (() => {
          const minutes = positiveInt(
            'full-rebuild-minutes',
            Math.round(DEFAULT_FULL_REBUILD_INTERVAL_MS / 60_000),
          ) as number;
          return minutes > 0 ? minutes * 60_000 : null;
        })(),
    lightCheckEvery: positiveInt(
      'light-check-every',
      DEFAULT_LIGHT_CHECK_EVERY,
    ) as number,
    paceMode,
    paceMs: optionalInt('pace-ms'),
    jitter,
    structureMode,
    staleDays: optionalInt('stale-days'),
    deadline: deadline ? deadline.trim() : null,
    concurrency,
    dryRun: has('dry-run'),
    targetId: get('target-id'),
    allTargets: has('all-targets'),
    targetLimit: parseTargetLimit(get('target-limit')),
    initialBaselinePages: optionalInt('initial-baseline-pages'),
    initialBaselineDays: optionalInt('initial-baseline-days'),
    anchorSize: optionalInt('anchor-size'),
    minAnchorMatches: optionalInt('min-anchor-matches'),
    overlapDays: optionalInt('overlap-days'),
  };
}

/** "08:00" -> bugunun (gectiyse yarinin) o saati, epoch ms. */
export function resolveDeadline(spec: string, now: Date = new Date()): number {
  return resolveWindowDeadline(`00:00-${spec}`, now);
}

/**
 * KAPSAMA HEDEFLERI — UZANTIDAN DEGIL MANIFESTODAN.
 *
 * Uzantinin gonderdigi kok listesi YOK SAYILIR. Hedefler manifestodan gelir
 * ve o an diskte olmayanlarla sinirlanir; boylece "yalnizca eksikler"
 * garantisi guvenilmez bir istemciye BAGLI OLMAZ.
 */
function coverageRoots(
  args: CliArgs,
): Array<{ path: string; label: string }> | null {
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
    console.log(
      `[autopilot]   -> ${t.categoryUrl}  (${t.fullPath.join(' / ')})`,
    );
  }
  if (queue.targets.length === 0) {
    throw new Error(
      'Coverage queue is empty: nothing left to collect for the chosen priorities.',
    );
  }
  return queue.roots;
}

/**
 * "02:00-10:00" -> bir sonraki kapanis aninin epoch ms degeri.
 * Kapanis saati suanki saatten kucukse ERTESI GUNE tasinir.
 */
/**
 * `--target-limit` dogrulamasi.
 *
 * Sessizce duzeltmek TEHLIKELIDIR: "0" ya da "abc" yazan biri kucuk bir
 * kanarya beklerken TUM hedef evrenini baslatabilir. Gecersiz deger acikca
 * reddedilir.
 */
export function parseTargetLimit(raw: string | null): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === '')
    return null;
  const text = String(raw).trim();
  if (!/^[0-9]+$/.test(text)) {
    throw new Error(`--target-limit must be a positive integer, got "${raw}"`);
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`--target-limit must be >= 1, got "${raw}"`);
  }
  return value;
}

export function resolveWindowDeadline(
  spec: string,
  now: Date = new Date(),
): number {
  const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(spec.trim());
  if (!match)
    throw new Error(`Invalid --window "${spec}"; expected HH:MM-HH:MM`);
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
  await lookup.open({
    source: DEFAULT_SNAPSHOT_SOURCE,
    canonicalMakes: args.makes,
  });
  return {
    lookup,
    describe: `snapshot fingerprints: ${lookup.size} (read-only ${snapshotPath})`,
    close: () => lookup.close(),
  };
}

/** backend paket koku — ts-node ve derlenmis kosuda ayni yere cikar. */
function backendRoot(): string {
  let dir = __dirname;
  for (let up = 0; up < 8; up += 1) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '../../..');
}

async function serve(
  args: CliArgs,
  provider: BridgeSessionProvider,
  banner: string[],
  onShutdown: () => Promise<void>,
): Promise<void> {
  const bridge = new AutopilotBridge({
    provider,
    port: args.port,
    log: (line) => console.log(`[autopilot] ${line}`),
  });
  const bound = await bridge.listen();

  console.log('');
  console.log('  NAKITGARAJ — CHROME AUTOPILOT BRIDGE');
  console.log(
    `  bind        http://${bound.host}:${bound.port}   (loopback only)`,
  );
  for (const line of banner) console.log(`  ${line}`);
  console.log(
    '  auth        none — loopback bind + Host check + extension origin/marker',
  );
  console.log(
    '  -> Set the bridge address in the extension popup and press START once.',
  );
  console.log('');

  const shutdown = async () => {
    await bridge.close();
    await onShutdown();
    /**
     * Cikis kodu MAKINE-OKUR: `onShutdown` ozeti yazip `process.exitCode`
     * ayarlayabilir. Kosu bir hedefte basarisiz olduysa kabuk bunu 0 gorup
     * "temiz" sanmamalidir.
     */
    process.exit(typeof process.exitCode === 'number' ? process.exitCode : 0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ------------------------------------------------------------------ market

async function runMarket(args: CliArgs): Promise<void> {
  const runDir = path.resolve(
    backendRoot(),
    'data/market-refresh/autopilot',
    args.runId,
  );
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
      session = AutopilotSession.start(
        { ...baseOptions, deadlineAtMs },
        effective,
      );
      return session;
    },
    resume: () => {
      session = AutopilotSession.resume({
        ...baseOptions,
        deadlineAtMs: deadlineFromWindow(),
      });
      return session;
    },
  };

  await serve(
    args,
    provider,
    [
      `mode        market (monthly refresh: card observations -> staging)`,
      `run id      ${args.runId}`,
      `source      ${args.source} (${args.baseUrl})`,
      `run dir     ${runDir}`,
      `reference   ${reference.describe}`,
      `window      ${args.windowSpec || 'unbounded'}`,
      `scope       ${
        args.scope
          ? `${args.scope.make} / ${args.scope.series} under ${args.scope.rootPath}, ` +
            `max ${args.scope.maxResultPages} page(s)/leaf` +
            `${args.scope.requireChildStructure ? ', stop if child structure unreadable' : ''}` +
            `${args.scope.stopOnUnknown ? ', stop if count unreadable' : ''}`
          : 'UNBOUNDED (full monthly refresh)'
      }`,
    ],
    () => reference.close(),
  );
}

// --------------------------------------------------------------- structure

async function runStructure(args: CliArgs): Promise<void> {
  const root = backendRoot();
  const artifact = loadArtifact();
  if (!artifact) {
    throw new Error(
      'Hierarchy artifact not found. Run "npm run hierarchy:build" first: the structure ' +
        'collector needs it to know which category pages the corpus already holds.',
    );
  }
  const corpus = new CorpusIndex();
  if (!corpus.root || !fs.existsSync(corpus.root)) {
    throw new Error(
      `Corpus root unknown or missing (${corpus.root || 'null'}). Set VEHICLE_CORPUS_ROOT ` +
        'to the folder that holds the make folders.',
    );
  }

  const runDirName = args.dryRun ? `${args.runId}-dry-run` : args.runId;
  const runDir = path.resolve(
    root,
    'data/market-refresh/autopilot',
    runDirName,
  );
  fs.mkdirSync(runDir, { recursive: true });
  const checkpointPath = path.join(runDir, 'checkpoint.json');
  if (args.dryRun && fs.existsSync(checkpointPath))
    fs.unlinkSync(checkpointPath);
  const checkpointFile = new AtomicChecksummedFile<StructureCheckpointPayload>(
    checkpointPath,
  );

  const log = (line: string) => console.log(`[structure] ${line}`);
  const rebuild =
    args.rebuildEvery > 0 && !args.dryRun
      ? new NpmRebuildRunner({
          cwd: root,
          logDir: path.join(runDir, 'rebuild-logs'),
          log,
        })
      : null;

  const preset = PACE_PRESETS[args.paceMode];
  const paceMs = Math.max(1000, args.paceMs ?? preset.paceMs);
  const jitter = args.jitter ?? preset.jitter;
  const baseOptions: Omit<StructureSessionOptions, 'deadlineAtMs'> = {
    runId: args.runId,
    source: args.source,
    baseUrl: args.baseUrl,
    checkpointFile,
    corpus,
    runDir,
    maxPages: args.maxPages,
    rebuildEvery: args.rebuildEvery,
    fullRebuildIntervalMs: args.fullRebuildIntervalMs,
    lightCheckEvery: args.lightCheckEvery,
    rebuild,
    paceMode: args.paceMode,
    paceMs,
    jitter,
    structureMode: args.structureMode,
    staleDays: args.staleDays,
    log,
  };

  const deadlineFromWindow = () =>
    args.deadline
      ? resolveDeadline(args.deadline)
      : args.windowSpec
        ? resolveWindowDeadline(args.windowSpec)
        : null;

  if (args.dryRun) {
    const session = StructureSession.start(
      { ...baseOptions, deadlineAtMs: null },
      args.roots,
    );
    const scan = session.scanCorpus();
    printDryRun(session, scan, args, corpus.root);
    return;
  }

  let session: StructureSession | null = null;
  const provider: BridgeSessionProvider = {
    current: () => session,
    start: ({ deadlineMs }) => {
      const deadlineAtMs =
        deadlineMs !== null ? Date.now() + deadlineMs : deadlineFromWindow();
      // Kokler CLI'dan gelir; uzantinin acik sekmesi kok DEGILDIR.
      session = StructureSession.start(
        { ...baseOptions, deadlineAtMs },
        args.roots,
      );
      return session;
    },
    resume: () => {
      session = StructureSession.resume({
        ...baseOptions,
        deadlineAtMs: deadlineFromWindow(),
      });
      return session;
    },
  };

  const resumable = checkpointFile.exists();
  await serve(
    args,
    provider,
    [
      `mode        structure ${args.structureMode} (recursive category pages -> raw HTML -> corpus)`,
      `run id      ${args.runId}${resumable ? '   (checkpoint found: START resumes it)' : ''}`,
      `source      ${args.source} (${args.baseUrl})`,
      `run dir     ${runDir}`,
      `corpus      ${corpus.root}  (${corpus.nodeCount} known nodes)`,
      `roots       ${args.roots.join(', ')}`,
      `budget      ${args.maxPages === null ? 'unbounded' : `max ${args.maxPages} page(s) this run`}`,
      `light gate  ${args.lightCheckEvery > 0 ? `every ${args.lightCheckEvery} accepted page(s) (in-memory, no publish)` : 'off'}`,
      `full gate   ${
        args.rebuildEvery > 0
          ? `every ${args.rebuildEvery} saved page(s)` +
            `${args.fullRebuildIntervalMs ? ` or ${Math.round(args.fullRebuildIntervalMs / 60_000)} min` : ''}` +
            ' + mandatory final'
          : 'OFF (bounded smoke / dry run only)'
      }`,
      `pacing      ${args.paceMode}: ${paceMs} ms ± ${Math.round(jitter * 100)}% · backoff x1.5 (max x4) on redirect/not-found/slow response · floor 1000 ms`,
      `stale       ${args.structureMode === 'INCREMENTAL' && args.staleDays !== null ? `refetch nonterminal pages older than ${args.staleDays} day(s), drift -> drift-registry.json` : 'no refetch of present pages'}`,
      `deadline    ${args.deadline ? `today/tomorrow ${args.deadline}` : args.windowSpec || 'unbounded'}`,
      `workers     ${args.concurrency}`,
    ],
    () => Promise.resolve(),
  );
}

// ------------------------------------------------------------------- weekly

async function runWeekly(args: CliArgs): Promise<void> {
  const root = backendRoot();
  const artifact = loadArtifact();
  if (!artifact) throw new Error('Validated hierarchy artifact not found');
  const receipt = loadActiveHierarchyReceipt(root);
  if (!receipt) {
    throw new Error(
      'Weekly refresh refused: no active PASS validation receipt. Run structure refresh/rebuild first.',
    );
  }
  const tree = artifactToTree(artifact);
  const coverageFile = path.join(
    path.dirname(resolveArtifactPath()),
    'page-coverage.json',
  );
  if (!fs.existsSync(coverageFile)) {
    throw new Error(
      `Weekly refresh refused: staged coverage graph missing (${coverageFile})`,
    );
  }
  const coverage = JSON.parse(
    fs.readFileSync(coverageFile, 'utf-8'),
  ) as NodeCoverage[];
  if (!Array.isArray(coverage))
    throw new Error(`Malformed coverage graph ${coverageFile}`);
  const sourcePaths = new Map(
    coverage.map((node) => [node.nodeId, node.categoryUrl]),
  );
  const snapshot = buildMarketTargetSnapshot(tree, {
    sourcePathsByNode: sourcePaths,
  });

  console.log(
    `[weekly] PATH gate: targets=${snapshot.integrity.marketTargets} ` +
      `paths=${snapshot.integrity.pathsChecked} edges=${snapshot.integrity.edgesChecked} ` +
      `skipped=${snapshot.integrity.skippedLevels} wrongParent=${snapshot.integrity.wrongParents} ` +
      `orphans=${snapshot.integrity.orphans} ambiguous=${snapshot.integrity.ambiguousPaths}`,
  );
  if (!snapshot.integrity.ok) {
    throw new Error(
      `PATH_INTEGRITY_GATE_FAIL ${snapshot.integrity.findings.slice(0, 10).join(' | ')}`,
    );
  }
  if (receipt.hierarchyVersion !== snapshot.hierarchyVersion) {
    throw new Error(
      `Weekly refresh refused: PASS receipt is for ${receipt.hierarchyVersion}, ` +
        `but loaded hierarchy is ${snapshot.hierarchyVersion}`,
    );
  }

  /**
   * HEDEF SECIMI: tek --target-id ya da --all-targets. Her secilen hedefin
   * sayfasi diskte VE terminal kaniti tam olmali; genis kosuda eksik kanitli
   * hedefler ATLANIR ve raporlanir (kosu onlar yuzunden durmaz, ama onlar
   * fiyatlanabilir de olmaz).
   */
  const coverageById = new Map(coverage.map((node) => [node.nodeId, node]));
  const eligible = (
    targetId: string,
  ): { ok: true } | { ok: false; reason: string } => {
    const node = coverageById.get(targetId);
    if (!node?.pageSavedOnDisk)
      return { ok: false, reason: 'page not saved on disk' };
    if (!node.terminalConfirmed)
      return { ok: false, reason: 'terminal not confirmed' };
    return { ok: true };
  };
  let selectedTargetIds: string[];
  const skippedTargets: Array<{ targetId: string; reason: string }> = [];
  if (args.allTargets) {
    selectedTargetIds = [];
    for (const candidate of snapshot.targets) {
      const verdict = eligible(candidate.targetId);
      if (verdict.ok) selectedTargetIds.push(candidate.targetId);
      else
        skippedTargets.push({
          targetId: candidate.targetId,
          reason: verdict.reason,
        });
    }
    if (selectedTargetIds.length === 0)
      throw new Error('Weekly refresh refused: no eligible exact target');
    /**
     * SINIR, DETERMINISTIK SIRADAN SONRA UYGULANIR.
     *
     * `snapshot.targets` dugum kimligine gore sirali uretilir ve uygunluk
     * suzgeci sirayi korur; bu yuzden ayni anlik goruntu + ayni secenekler
     * her zaman AYNI ilk N hedefi verir. Rastgele ya da kesif sirasina bagli
     * bir secim, kanaryayi tekrarlanamaz kilardi.
     */
    if (
      args.targetLimit !== null &&
      selectedTargetIds.length > args.targetLimit
    ) {
      selectedTargetIds = selectedTargetIds.slice(0, args.targetLimit);
    }
  } else {
    const targetId = args.targetId as string;
    const target = snapshot.targets.find(
      (candidate) => candidate.targetId === targetId,
    );
    if (!target) {
      throw new Error(
        `--target-id "${targetId}" is not a validated terminal target in hierarchy ${snapshot.hierarchyVersion}`,
      );
    }
    const verdict = eligible(targetId);
    if (!verdict.ok) {
      throw new Error(
        `Weekly refresh refused: exact target page/terminal evidence is incomplete for ${target.fullPath} (${verdict.reason})`,
      );
    }
    selectedTargetIds = [targetId];
  }
  const firstTarget = snapshot.targets.find(
    (candidate) => candidate.targetId === selectedTargetIds[0],
  )!;

  const weeklyRoot = path.join(root, 'data', 'market-refresh', 'weekly');
  const runDir = path.join(weeklyRoot, 'runs', args.runId);
  fs.mkdirSync(runDir, { recursive: true });
  const checkpointFile = new AtomicChecksummedFile<WeeklyCheckpointPayload>(
    path.join(runDir, 'checkpoint.json'),
  );
  const evidence = new WeeklyEvidenceStore(
    path.join(runDir, 'raw-observations.jsonl'),
  );
  const states = new TargetStateStore(
    path.join(weeklyRoot, 'target-state.json'),
  );
  const publisher = new AtomicWeeklyMarketPublisher(
    path.join(weeklyRoot, 'published'),
  );
  const baselineAssignments = loadAssignments();
  const knownListingIds = new Set(
    Object.keys(baselineAssignments?.assignments ?? {}),
  );
  const boundaryPolicy = {
    ...(args.overlapDays !== null ? { overlapDays: args.overlapDays } : {}),
    ...(args.minAnchorMatches !== null
      ? { minAnchorMatches: args.minAnchorMatches }
      : {}),
    ...(args.initialBaselinePages !== null
      ? { initialBaselinePages: args.initialBaselinePages }
      : {}),
    ...(args.initialBaselineDays !== null
      ? { initialBaselineDays: args.initialBaselineDays }
      : {}),
    ...(args.maxPages !== null ? { maxPagesPerTarget: args.maxPages } : {}),
  };
  const weeklyPreset = PACE_PRESETS[args.paceMode];
  const baseOptions = {
    runId: args.runId,
    source: args.source,
    baseUrl: args.baseUrl,
    tree,
    snapshot,
    selectedTargetIds,
    checkpointFile,
    evidence,
    rawPageDir: path.join(runDir, 'raw-pages'),
    states,
    publisher,
    knownListingIds,
    /**
     * Yonlendirme esdegerlik kaniti: varis URL'sini baska bir dugum
     * sahipleniyorsa esdeglik reddedilir (ebeveyn/cocuk cokmesi olmaz).
     */
    sourcePathsByNode: sourcePaths,
    baselineAssignments: baselineAssignments?.assignments,
    boundaryPolicy,
    anchorSize: args.anchorSize ?? undefined,
    paceMs:
      args.paceMs ??
      (args.paceMode === 'OVERNIGHT' ? weeklyPreset.paceMs : undefined),
    jitter: args.jitter ?? undefined,
  };
  const effectivePolicy = { ...DEFAULT_BOUNDARY_POLICY, ...boundaryPolicy };

  let session: WeeklyMarketSession | null = null;
  const provider: BridgeSessionProvider = {
    current: () => session,
    start: () => {
      session = checkpointFile.exists()
        ? WeeklyMarketSession.resume(baseOptions)
        : WeeklyMarketSession.start(baseOptions);
      return session;
    },
    resume: () => {
      session = WeeklyMarketSession.resume(baseOptions);
      return session;
    },
  };
  await serve(
    args,
    provider,
    [
      `mode        weekly (${args.allTargets ? 'ALL eligible exact targets' : 'one frozen exact target'}; raw HTML -> canonical placement)`,
      `run id      ${args.runId}${checkpointFile.exists() ? '   (checkpoint found: START resumes it)' : ''}`,
      `hierarchy   ${snapshot.hierarchyVersion} (PASS ${receipt.validatedAt})`,
      `targets     ${selectedTargetIds.length} selected` +
        (skippedTargets.length
          ? `, ${skippedTargets.length} skipped (page/terminal evidence incomplete)`
          : ''),
      `first       ${firstTarget.targetId}  (${firstTarget.fullPath})  ${firstTarget.categoryPath}`,
      `boundary    date re-entry + anchor ids (min ${effectivePolicy.minAnchorMatches}) or ${effectivePolicy.overlapDays}-day window; ` +
        `max ${effectivePolicy.maxPagesPerTarget} page(s)/target`,
      `baseline    fresh targets read ${effectivePolicy.initialBaselinePages} page(s)` +
        (effectivePolicy.initialBaselineDays
          ? ` or ${effectivePolicy.initialBaselineDays} day(s)`
          : '') +
        ' (explicit policy; no hidden depth)',
      `pacing      ${baseOptions.paceMs ?? DEFAULT_WEEKLY_PACE_MS} ms ± ${Math.round((baseOptions.jitter ?? DEFAULT_WEEKLY_JITTER) * 100)}%`,
      `run dir     ${runDir}`,
    ],
    async () => {
      if (!session) return;
      const sum = session.summary();
      console.log('');
      console.log('  WEEKLY RUN SUMMARY');
      console.log(`  run/hierarchy    ${sum.runId} / ${sum.hierarchyVersion}`);
      console.log(`  state            ${sum.state}`);
      console.log(
        `  targets          selected ${sum.targetsSelected}, attempted ${sum.targetsAttempted}, ` +
          `completed ${sum.targetsCompleted}, pending ${sum.targetsPending}, ` +
          `failed ${sum.targetsFailed}, blocked ${sum.targetsBlocked}`,
      );
      console.log(
        `  listings         ${sum.pagesRead} page(s), ${sum.newListings} new, ` +
          `${sum.duplicatesSuppressed} duplicate(s) suppressed`,
      );
      console.log(
        `  placement        exact ${sum.exact}, ambiguous excluded ${sum.ambiguousExcluded}, ` +
          `unresolved excluded ${sum.unresolvedExcluded}`,
      );
      console.log(
        `  watermarks       advanced ${sum.watermarksAdvanced}, held ${sum.watermarksHeld}`,
      );
      if (sum.failedTargetIds.length) {
        console.log('  failed targets:');
        for (const detail of sum.failures) {
          console.log(
            `    ${detail.targetId}  ${detail.code} (${detail.scope}` +
              `${detail.retryable ? ', retryable' : ', NOT retryable'}) after ${detail.pagesRead} page(s)`,
          );
        }
      }
      /**
       * Bir hedef bile basarisizsa kosu TEMIZ BASARI degildir. Cikis kodu 2
       * bunu betiklere gorunur kilar; digerlerinin ilerlemesi yine korunur.
       */
      process.exitCode =
        sum.state === 'COMPLETE' && sum.targetsFailed === 0 ? 0 : 2;
    },
  );
}

function printDryRun(
  session: StructureSession,
  scan: { present: number; missing: number },
  args: CliArgs,
  corpusRoot: string,
): void {
  const targets = session.targetsView();
  const pending = targets.filter((t) => t.status === 'PENDING');
  const byMake = new Map<string, number>();
  const byDepth = new Map<number, number>();
  for (const t of pending) {
    byMake.set(t.make || '?', (byMake.get(t.make || '?') || 0) + 1);
    const d = t.depth ?? -1;
    byDepth.set(d, (byDepth.get(d) || 0) + 1);
  }
  console.log('');
  console.log('  STRUCTURE DRY RUN — no request was sent to the source');
  console.log(`  corpus       ${corpusRoot}`);
  console.log(`  roots        ${args.roots.join(', ')}`);
  console.log(
    `  present      ${scan.present} category page(s) satisfied from disk (children expanded from them)`,
  );
  console.log(
    `  to fetch     ${pending.length} category page(s) missing from the corpus`,
  );
  console.log(
    `  by depth     ${[...byDepth.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([d, n]) => `d${d}=${n}`)
      .join('  ')}`,
  );
  console.log(
    `  by make      ${[...byMake.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([m, n]) => `${m}=${n}`)
      .join('  ')}${byMake.size > 15 ? '  ...' : ''}`,
  );
  console.log('');
  console.log('  first targets (in queue order):');
  for (const t of pending.slice(0, 30)) {
    console.log(
      `    ${t.key.padEnd(48)} ${(t.expectedPath || [t.label]).join(' / ')}` +
        `${t.navResultCount !== null ? `  (${t.navResultCount} ilan)` : ''}`,
    );
  }
  if (pending.length > 30)
    console.log(`    ... and ${pending.length - 30} more`);
  console.log('');
  console.log(
    `  dry-run checkpoint: ${session.report().runId} -> data/market-refresh/autopilot/${args.runId}-dry-run/`,
  );
}

export async function main(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  const args = parseArgs(argv);
  if (args.mode === 'structure') return runStructure(args);
  if (args.mode === 'weekly') return runWeekly(args);
  return runMarket(args);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[autopilot] failed to start: ${err?.message || err}`);
    process.exit(1);
  });
}
