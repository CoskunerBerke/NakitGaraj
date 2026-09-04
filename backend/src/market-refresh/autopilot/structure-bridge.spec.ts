/**
 * YAPI MODU — KOPRU UZERINDEN UCTAN UCA (UZANTI TAKLIDI).
 *
 * Bu test, uzantinin yaptigi HTTP konusmasinin AYNISINI yapar: /start, /next,
 * /page-capture, /resume. Sayfa HTML'i gercek Chrome yerine test fixture'indan
 * gelir; geri kalan her sey (kopru, oturum, ayristirici, korpus yazimi,
 * checkpoint) gercektir.
 */
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { AtomicChecksummedFile } from '../checkpoint-store';
import { StagingStore } from '../staging-store';
import { categoryPage, loginPage } from '../__fixtures__/structure-page';
import {
  AutopilotBridge,
  AUTOPILOT_EXTENSION_HEADER,
  AUTOPILOT_EXTENSION_MARKER,
  BridgeSessionProvider,
  MAX_CAPTURE_BODY_BYTES,
} from './autopilot-bridge';
import {
  AutopilotCheckpointPayload,
  AutopilotSession,
  MapReferenceLookup,
} from './autopilot-session';
import { CorpusIndex } from './corpus-store';
import {
  StructureCheckpointPayload,
  StructureSession,
} from './structure-session';

const RUN_ID = 'structure-bridge';
const BASE_URL = 'https://www.sahibinden.com/';

let tmpDir: string;
let bridge: AutopilotBridge;
let port: number;

function call(
  method: string,
  pathname: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {
    [AUTOPILOT_EXTENSION_HEADER]: AUTOPILOT_EXTENSION_MARKER,
  };
  const payload = body === undefined ? undefined : JSON.stringify(body);
  if (payload !== undefined) {
    headers['content-type'] = 'application/json';
    headers['content-length'] = String(Buffer.byteLength(payload));
  }
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: pathname, method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          let json: any = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = raw;
          }
          resolve({ status: res.statusCode || 0, json });
        });
      },
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

const ZORLU = { label: 'Zorlu', slug: 'zorlu' };
const makePage = () =>
  categoryPage({
    chain: [ZORLU],
    nav: [
      { label: 'Kartal', slug: 'zorlu-kartal', count: 500 },
      { label: 'Şahin', slug: 'zorlu-sahin', count: 300 },
    ],
  });

async function listen(provider: BridgeSessionProvider): Promise<void> {
  bridge = new AutopilotBridge({ provider, port: 0 });
  const bound = await bridge.listen();
  port = bound.port;
}

function structureProvider(): BridgeSessionProvider {
  const corpusDir = path.join(tmpDir, 'corpus');
  fs.mkdirSync(corpusDir, { recursive: true });
  const runDir = path.join(tmpDir, 'run');
  const corpus = new CorpusIndex({
    loadTree: () => null,
    rootOverride: corpusDir,
  });
  let session: StructureSession | null = null;
  const base = {
    runId: RUN_ID,
    source: 'sahibinden',
    baseUrl: BASE_URL,
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
      session = StructureSession.start({ ...base, deadlineAtMs: null }, [
        '/zorlu',
      ]);
      return session;
    },
    resume: () => {
      session = StructureSession.resume({ ...base, deadlineAtMs: null });
      return session;
    },
  };
}

function marketProvider(): BridgeSessionProvider {
  let session: AutopilotSession | null = null;
  const opts = () => ({
    runId: RUN_ID,
    source: 'sahibinden',
    baseUrl: BASE_URL,
    staging: new StagingStore(path.join(tmpDir, 'staging.jsonl')),
    checkpointFile: new AtomicChecksummedFile<AutopilotCheckpointPayload>(
      path.join(tmpDir, 'm-checkpoint.json'),
    ),
    reference: new MapReferenceLookup(),
    snapshotPath: null,
    deadlineAtMs: null,
  });
  return {
    current: () => session,
    start: ({ roots }) => {
      session = AutopilotSession.start(opts(), roots);
      return session;
    },
    resume: () => {
      session = AutopilotSession.resume(opts());
      return session;
    },
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-sbridge-'));
});

afterEach(async () => {
  await bridge.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('STRUCTURE MODE OVER THE BRIDGE', () => {
  it('drives capture -> save -> children -> pause -> resume exactly as the extension does', async () => {
    await listen(structureProvider());

    // START: uzanti kok gondermez; kokler CLI'dan gelir.
    const started = await call('POST', '/autopilot/start', { roots: [] });
    expect(started.status).toBe(200);
    expect(started.json).toMatchObject({
      state: 'RUNNING',
      mode: 'STRUCTURE',
      queued: 1,
    });

    const next = await call('GET', '/autopilot/next');
    expect(next.status).toBe(200);
    expect(next.json).toMatchObject({
      type: 'CAPTURE_PAGE',
      targetKey: '/zorlu',
      url: 'https://www.sahibinden.com/zorlu',
      expectedPath: null,
      delayMs: 5000,
    });

    const captured = await call('POST', '/autopilot/page-capture', {
      runId: RUN_ID,
      targetKey: '/zorlu',
      finalUrl: 'https://www.sahibinden.com/zorlu',
      title: 'Zorlu',
      html: makePage(),
    });
    expect(captured.status).toBe(200);
    expect(captured.json).toMatchObject({
      outcome: 'SAVED',
      childrenDeclared: 2,
      childrenEnqueued: 2,
    });
    expect(captured.json.status).toMatchObject({
      state: 'RUNNING',
      pagesSaved: 1,
      queued: 2,
      completed: 1,
    });
    expect(fs.existsSync(captured.json.savedFile)).toBe(true);
    expect(path.dirname(captured.json.savedFile)).toBe(
      path.join(tmpDir, 'corpus', 'Zorlu'),
    );

    const second = await call('GET', '/autopilot/next');
    expect(second.json).toMatchObject({
      type: 'CAPTURE_PAGE',
      targetKey: '/zorlu-kartal',
      expectedPath: ['Zorlu', 'Kartal'],
    });

    // Giris duvari: kosu durur, uzanti HALT alir, kullanici duzeltir, RESUME.
    const wall = await call('POST', '/autopilot/page-capture', {
      runId: RUN_ID,
      targetKey: '/zorlu-kartal',
      finalUrl: 'https://secure.sahibinden.com/giris',
      title: 'Giriş',
      html: loginPage(),
    });
    expect(wall.json).toMatchObject({
      outcome: 'LOGIN_REQUIRED',
      paused: true,
    });
    expect(wall.json.status.state).toBe('ACCESS_RESTRICTED');
    expect((await call('GET', '/autopilot/next')).json).toMatchObject({
      type: 'HALT',
      state: 'ACCESS_RESTRICTED',
    });

    const resumed = await call('POST', '/autopilot/resume');
    expect(resumed.json.state).toBe('RUNNING');
    expect((await call('GET', '/autopilot/next')).json).toMatchObject({
      type: 'CAPTURE_PAGE',
      targetKey: '/zorlu-kartal',
    });

    const status = await call('GET', '/autopilot/status');
    expect(status.json).toMatchObject({
      mode: 'STRUCTURE',
      securityBlocks: 1,
      pagesSaved: 1,
    });
  });

  it('rejects a capture without html and a capture for an unissued target', async () => {
    await listen(structureProvider());
    await call('POST', '/autopilot/start', { roots: [] });
    const noHtml = await call('POST', '/autopilot/page-capture', {
      runId: RUN_ID,
      targetKey: '/zorlu',
      html: '',
    });
    expect(noHtml.status).toBe(400);
    expect(noHtml.json.error).toBe('PROTOCOL');
    const unissued = await call('POST', '/autopilot/page-capture', {
      runId: RUN_ID,
      targetKey: '/zorlu',
      html: makePage(),
    });
    expect(unissued.status).toBe(400);
  });

  it('caps the capture body so the bridge cannot be fed unbounded payloads', async () => {
    await listen(structureProvider());
    await call('POST', '/autopilot/start', { roots: [] });
    await call('GET', '/autopilot/next');
    const huge = 'x'.repeat(MAX_CAPTURE_BODY_BYTES + 1024);
    const res = await call('POST', '/autopilot/page-capture', {
      runId: RUN_ID,
      targetKey: '/zorlu',
      html: huge,
    }).catch((err) => ({ status: -1, json: { error: String(err.message) } }));
    // Sunucu govdeyi keser: 400 doner ya da baglantiyi kapatir; her iki halde de KABUL ETMEZ.
    expect(res.status === 400 || res.status === -1).toBe(true);
    const status = await call('GET', '/autopilot/status');
    expect(status.json.pagesSaved).toBe(0);
  });

  it('refuses /page-capture on a market-mode run instead of silently accepting it', async () => {
    await listen(marketProvider());
    await call('POST', '/autopilot/start', {
      roots: [{ path: '/zorlu', label: 'Zorlu' }],
    });
    const res = await call('POST', '/autopilot/page-capture', {
      runId: RUN_ID,
      targetKey: '/zorlu',
      html: makePage(),
    });
    expect(res.status).toBe(400);
    expect(res.json.message).toMatch(/not supported/);
  });

  it('market mode still refuses to start with an empty root list', async () => {
    await listen(marketProvider());
    const res = await call('POST', '/autopilot/start', { roots: [] });
    expect(res.status).toBe(400);
  });
});
