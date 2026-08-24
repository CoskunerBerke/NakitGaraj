/**
 * AUTOPILOT KOPRU BASLATICI.
 *
 * Kullanim:
 *   npm run market:autopilot:bridge -- --port 8791
 *   npm run market:autopilot:bridge -- --port 8791 --window 02:00-10:00
 *   npm run market:autopilot:bridge -- --port 8791 --reference off   (hizli duman testi)
 *
 * JETON: kosuya ozel yetenek jetonu URETILIR ve yalnizca gitignore'lu bir
 * dosyaya yazilir. Normal gunlukte DEGERI GORUNMEZ; sadece dosya YOLU basilir.
 * Kullanici jetonu uzanti panelinden bir kez yapistirir.
 */
import * as fs from 'fs';
import * as path from 'path';
import { AtomicChecksummedFile } from '../checkpoint-store';
import { StagingStore } from '../staging-store';
import { AutopilotBridge, generateCapabilityToken, BridgeSessionProvider } from './autopilot-bridge';
import {
  AutopilotCheckpointPayload,
  AutopilotSession,
  MapReferenceLookup,
  ReferenceLookup,
} from './autopilot-session';
import { SnapshotFingerprintLookup } from './snapshot-fingerprint-lookup';
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
}

function parseArgs(argv: string[]): CliArgs {
  const get = (name: string): string | null => {
    const idx = argv.indexOf(`--${name}`);
    if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) return argv[idx + 1];
    const inline = argv.find((a) => a.startsWith(`--${name}=`));
    return inline ? inline.slice(name.length + 3) : null;
  };

  const makes = (get('makes') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    port: Number(get('port') || 8791),
    runId: get('run-id') || `autopilot-${new Date().toISOString().slice(0, 10)}`,
    source: get('source') || DEFAULT_SOURCE,
    baseUrl: get('base-url') || DEFAULT_BASE_URL,
    windowSpec: get('window'),
    reference: get('reference') === 'off' ? 'off' : 'auto',
    makes,
  };
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

  const tokenPath = path.join(runDir, 'bridge-token.txt');
  const token = generateCapabilityToken();
  fs.writeFileSync(tokenPath, token, { encoding: 'utf-8', mode: 0o600 });

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
    snapshotPath: args.reference === 'off' ? null : resolveSnapshotPath(),
  };

  const deadlineFromWindow = () =>
    args.windowSpec ? resolveWindowDeadline(args.windowSpec) : null;

  const provider: BridgeSessionProvider = {
    current: () => session,
    start: ({ roots, deadlineMs }) => {
      const deadlineAtMs =
        deadlineMs !== null ? Date.now() + deadlineMs : deadlineFromWindow();
      session = AutopilotSession.start({ ...baseOptions, deadlineAtMs }, roots);
      return session;
    },
    resume: () => {
      session = AutopilotSession.resume({ ...baseOptions, deadlineAtMs: deadlineFromWindow() });
      return session;
    },
  };

  const bridge = new AutopilotBridge({
    token,
    provider,
    port: args.port,
    // Jeton DEGERI burada asla gecmez — yalnizca metot/yol/durum.
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
  console.log(`  token file  ${tokenPath}`);
  console.log('  -> Paste the token file contents into the extension popup once.');
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
