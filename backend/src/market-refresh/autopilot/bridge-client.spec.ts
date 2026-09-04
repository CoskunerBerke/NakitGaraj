/**
 * UZANTI <-> KOPRU BASLIK SOZLESMESI — GERCEK ISTEMCI KODUYLA.
 *
 * Canli Chrome'da "missing extension marker" goruldu: uzantinin kaynak
 * dosyalari isareti gonderiyordu ama Chrome onbellekten ESKI bir servis
 * calisani kosturuyordu. Bu test, Chrome'un yukledigi AYNI dosyayi
 * (`chrome-extension/market-refresh-autopilot/bridge-client.js`) Node `vm`
 * ile calistirir ve istegi o kodun kurdugu haliyle gercek kopruye gonderir.
 * Istek burada elle kurulmaz: sozlesme kayarsa bu test kayar.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vm from 'vm';
import { AtomicChecksummedFile } from '../checkpoint-store';
import { categoryPage } from '../__fixtures__/structure-page';
import {
  AutopilotBridge,
  AUTOPILOT_EXTENSION_HEADER,
  AUTOPILOT_EXTENSION_MARKER,
  BridgeSessionProvider,
} from './autopilot-bridge';
import { CorpusIndex } from './corpus-store';
import { StructureCheckpointPayload, StructureSession } from './structure-session';

const EXTENSION_DIR = path.resolve(
  __dirname,
  '../../../../chrome-extension/market-refresh-autopilot',
);
const CLIENT_FILE = path.join(EXTENSION_DIR, 'bridge-client.js');

interface BridgeClient {
  EXTENSION_HEADER: string;
  EXTENSION_MARKER: string;
  CLIENT_VERSION: number;
  assertLoopbackBridge(url: string): string;
  buildRequest(
    bridgeUrl: string,
    pathname: string,
    options?: { method?: string; body?: unknown },
  ): { url: string; init: { method: string; headers: Record<string, string>; body?: string } };
  bridgeFetch(
    bridgeUrl: string,
    pathname: string,
    options?: { method?: string; body?: unknown },
    fetchImpl?: typeof fetch,
  ): Promise<any>;
}

/** Chrome'un `importScripts` ile yukledigi dosyanin AYNISI, dokunulmadan. */
function loadRealClient(): BridgeClient {
  const code = fs.readFileSync(CLIENT_FILE, 'utf-8');
  const sandbox: Record<string, unknown> = { URL, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: CLIENT_FILE });
  const client = sandbox.NgBridgeClient as BridgeClient | undefined;
  if (!client) throw new Error('bridge-client.js did not export NgBridgeClient');
  return client;
}

let tmpDir: string;
let bridge: AutopilotBridge;
let bridgeUrl: string;
let client: BridgeClient;

function structureProvider(): BridgeSessionProvider {
  const corpusDir = path.join(tmpDir, 'corpus');
  fs.mkdirSync(corpusDir, { recursive: true });
  const runDir = path.join(tmpDir, 'run');
  const corpus = new CorpusIndex({ loadTree: () => null, rootOverride: corpusDir });
  let session: StructureSession | null = null;
  const base = {
    runId: 'contract',
    source: 'sahibinden',
    baseUrl: 'https://www.sahibinden.com/',
    checkpointFile: new AtomicChecksummedFile<StructureCheckpointPayload>(
      path.join(runDir, 'checkpoint.json'),
    ),
    corpus,
    runDir,
    rebuildEvery: 0,
    random: () => 0.5,
  };
  return {
    current: () => session,
    start: () => {
      session = StructureSession.start({ ...base, deadlineAtMs: null }, ['/zorlu']);
      return session;
    },
    resume: () => {
      session = StructureSession.resume({ ...base, deadlineAtMs: null });
      return session;
    },
  };
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-contract-'));
  client = loadRealClient();
  bridge = new AutopilotBridge({ provider: structureProvider(), port: 0 });
  const bound = await bridge.listen();
  bridgeUrl = `http://${bound.host}:${bound.port}`;
});

afterEach(async () => {
  await bridge.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('THE REAL EXTENSION CLIENT SPEAKS THE BRIDGE CONTRACT', () => {
  it('builds every request with the exact header the bridge expects', () => {
    expect(client.EXTENSION_HEADER).toBe(AUTOPILOT_EXTENSION_HEADER);
    expect(client.EXTENSION_MARKER).toBe(AUTOPILOT_EXTENSION_MARKER);
    const get = client.buildRequest(bridgeUrl, '/autopilot/status');
    expect(get.url).toBe(`${bridgeUrl}/autopilot/status`);
    expect(get.init.method).toBe('GET');
    expect(get.init.headers[AUTOPILOT_EXTENSION_HEADER]).toBe(AUTOPILOT_EXTENSION_MARKER);
    expect(get.init.body).toBeUndefined();

    const post = client.buildRequest(bridgeUrl, '/autopilot/start', { method: 'POST', body: { roots: [] } });
    expect(post.init.headers).toEqual({
      [AUTOPILOT_EXTENSION_HEADER]: AUTOPILOT_EXTENSION_MARKER,
      'content-type': 'application/json',
    });
    expect(post.init.body).toBe('{"roots":[]}');
  });

  it('GET /autopilot/status -> 200 through the real helper', async () => {
    const status = await client.bridgeFetch(bridgeUrl, '/autopilot/status', {}, fetch);
    expect(status).toEqual({ state: 'IDLE', runId: null });
  });

  it('the same request WITHOUT the marker -> 403 (security stays enforced)', async () => {
    const { url, init } = client.buildRequest(bridgeUrl, '/autopilot/status');
    delete init.headers[AUTOPILOT_EXTENSION_HEADER];
    const res = await fetch(url, init);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'MISSING_EXTENSION_MARKER' });
  });

  it('a stale client sending the old x-autopilot-token instead of the marker -> 403', async () => {
    const res = await fetch(`${bridgeUrl}/autopilot/status`, {
      headers: { 'x-autopilot-token': 'anything' },
    });
    expect(res.status).toBe(403);
  });

  it('surfaces the bridge error code in the thrown message so the popup can show it', async () => {
    const stripped: typeof fetch = (input, init) => {
      const headers = { ...(init?.headers as Record<string, string>) };
      delete headers[AUTOPILOT_EXTENSION_HEADER];
      return fetch(input, { ...init, headers });
    };
    await expect(client.bridgeFetch(bridgeUrl, '/autopilot/status', {}, stripped)).rejects.toThrow(
      /403 MISSING_EXTENSION_MARKER/,
    );
  });

  it('START, /next, page-capture, pause, resume and stop are accepted through the same helper', async () => {
    const started = await client.bridgeFetch(bridgeUrl, '/autopilot/start', { method: 'POST', body: { roots: [] } }, fetch);
    expect(started).toMatchObject({ state: 'RUNNING', mode: 'STRUCTURE' });

    const next = await client.bridgeFetch(bridgeUrl, '/autopilot/next', {}, fetch);
    expect(next).toMatchObject({ type: 'CAPTURE_PAGE', targetKey: '/zorlu' });

    const captured = await client.bridgeFetch(
      bridgeUrl,
      '/autopilot/page-capture',
      {
        method: 'POST',
        body: {
          runId: next.runId,
          targetKey: next.targetKey,
          finalUrl: next.url,
          title: 'Zorlu',
          html: categoryPage({ chain: [{ label: 'Zorlu', slug: 'zorlu' }], nav: [] }),
        },
      },
      fetch,
    );
    expect(captured).toMatchObject({ outcome: 'SAVED', terminal: true });

    expect((await client.bridgeFetch(bridgeUrl, '/autopilot/pause', { method: 'POST' }, fetch)).state).toBe('PAUSED');
    expect((await client.bridgeFetch(bridgeUrl, '/autopilot/resume', { method: 'POST' }, fetch)).state).toBe('RUNNING');
    expect((await client.bridgeFetch(bridgeUrl, '/autopilot/stop', { method: 'POST' }, fetch)).state).toBe('IDLE');
  });

  it('refuses any bridge address that is not loopback', () => {
    expect(() => client.assertLoopbackBridge('http://192.168.1.5:8791')).toThrow(/127\.0\.0\.1/);
    expect(() => client.assertLoopbackBridge('https://127.0.0.1:8791')).toThrow();
    expect(client.assertLoopbackBridge('http://localhost:8791/')).toBe('http://localhost:8791');
  });
});

describe('THE SERVICE WORKER CANNOT DRIFT FROM THE SHARED CLIENT', () => {
  const read = (file: string) => fs.readFileSync(path.join(EXTENSION_DIR, file), 'utf-8');

  it('background.js loads bridge-client.js and never calls fetch on its own', () => {
    const background = read('background.js');
    expect(background).toMatch(/^importScripts\('bridge-client\.js'\);/m);
    expect(background).not.toMatch(/\bfetch\(/);
    expect(background).not.toContain(AUTOPILOT_EXTENSION_HEADER);
    expect(background).toMatch(/NgBridgeClient\.bridgeFetch\(config\.bridgeUrl, path, options\)/);
  });

  it('popup.js never talks to the bridge directly', () => {
    const popup = read('popup.js');
    expect(popup).not.toMatch(/\bfetch\(/);
    expect(popup).not.toMatch(/127\.0\.0\.1:\d+\//);
  });

  it('the manifest loads a classic worker (importScripts) with loopback host permissions', () => {
    const manifest = JSON.parse(read('manifest.json'));
    expect(manifest.background).toEqual({ service_worker: 'background.js' });
    expect(manifest.host_permissions).toEqual(
      expect.arrayContaining(['http://127.0.0.1/*', 'http://localhost/*']),
    );
    expect(manifest.version).not.toBe('1.0.0'); // eski onbellekli servis calisanini dusuren surum atlamasi
  });
});
