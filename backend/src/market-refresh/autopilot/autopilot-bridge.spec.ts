/**
 * YEREL KOPRU — GUVENLIK VE DOGRULAMA SOZLESMELERI.
 *
 * Kopruda JETON YOKTUR. Koruma dort katmandan gelir: geri dongu baglantisi,
 * geri dongu Host'u, uzanti kokeni ve tum yollarda zorunlu (gizli olmayan)
 * uzanti isareti. Bu testler bir web sayfasinin ya da bicimsiz bir istegin
 * kosuyu suruklemesini imkansiz kilar.
 */
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { AtomicChecksummedFile } from '../checkpoint-store';
import { StagingStore } from '../staging-store';
import {
  AutopilotBridge,
  AUTOPILOT_EXTENSION_HEADER,
  AUTOPILOT_EXTENSION_MARKER,
  BridgeSessionProvider,
} from './autopilot-bridge';
import {
  AutopilotCheckpointPayload,
  AutopilotSession,
  AutopilotSessionOptions,
  MapReferenceLookup,
} from './autopilot-session';

const RUN_ID = 'bridge-run';
const BASE_URL = 'https://www.sahibinden.com/';
const EXTENSION_ORIGIN = `chrome-extension://${'a'.repeat(32)}`;

let tmpDir: string;
let bridge: AutopilotBridge;
let port: number;
let session: AutopilotSession | null;

function sessionOptions(): AutopilotSessionOptions {
  return {
    runId: RUN_ID,
    source: 'sahibinden',
    baseUrl: BASE_URL,
    staging: new StagingStore(path.join(tmpDir, 'staging.jsonl')),
    checkpointFile: new AtomicChecksummedFile<AutopilotCheckpointPayload>(
      path.join(tmpDir, 'checkpoint.json'),
    ),
    reference: new MapReferenceLookup(),
    snapshotPath: null,
    deadlineAtMs: null,
  };
}

interface CallOptions {
  /** null = isareti HIC gonderme; string = bu degeri gonder. */
  marker?: string | null;
  origin?: string | null;
  host?: string;
  body?: unknown;
  rawBody?: string;
}

function call(
  method: string,
  pathname: string,
  options: CallOptions = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; json: any }> {
  const headers: Record<string, string> = {};
  const marker = options.marker === undefined ? AUTOPILOT_EXTENSION_MARKER : options.marker;
  if (marker !== null) headers[AUTOPILOT_EXTENSION_HEADER] = marker;
  if (options.origin) headers['origin'] = options.origin;
  if (options.host) headers['host'] = options.host;

  const payload =
    options.rawBody !== undefined
      ? options.rawBody
      : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined;
  if (payload !== undefined) {
    headers['content-type'] = 'application/json';
    headers['content-length'] = String(Buffer.byteLength(payload));
  }

  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method, headers }, (res) => {
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
        resolve({ status: res.statusCode || 0, headers: res.headers, json });
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

async function startRun() {
  return call('POST', '/autopilot/start', {
    body: { roots: [{ path: '/audi-a3', label: 'Audi A3' }] },
  });
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-bridge-'));
  session = null;

  const provider: BridgeSessionProvider = {
    current: () => session,
    start: ({ roots, deadlineMs }) => {
      session = AutopilotSession.start(
        { ...sessionOptions(), deadlineAtMs: deadlineMs === null ? null : Date.now() + deadlineMs },
        roots,
      );
      return session;
    },
    resume: () => {
      session = AutopilotSession.resume(sessionOptions());
      return session;
    },
  };

  bridge = new AutopilotBridge({ provider, port: 0 });
  const bound = await bridge.listen();
  port = bound.port;
  expect(bound.host).toBe('127.0.0.1');
});

afterEach(async () => {
  await bridge.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ------------------------------------------------------------------- binding

describe('BRIDGE BIND', () => {
  it('binds to the loopback interface only, never 0.0.0.0', async () => {
    const inner = (bridge as any).server as http.Server;
    const address = inner.address() as any;
    expect(address.address).toBe('127.0.0.1');
    expect(address.address).not.toBe('0.0.0.0');
  });

  it('refuses a request whose Host header is not a loopback name (DNS rebinding)', async () => {
    const res = await call('GET', '/autopilot/status', { host: 'attacker.example' });
    expect(res.status).toBe(403);
    expect(res.json.error).toBe('BAD_HOST');
  });
});

// -------------------------------------------------------------------- capability

describe('BRIDGE NEEDS NO SECRET', () => {
  it('serves status with no token of any kind', async () => {
    const res = await call('GET', '/autopilot/status');
    expect(res.status).toBe(200);
    expect(res.json.state).toBe('IDLE');
  });

  it('starts a run with no token of any kind', async () => {
    const res = await startRun();
    expect(res.status).toBe(200);
    expect(res.json.state).toBe('RUNNING');
  });

  it('never answers with an authentication challenge', async () => {
    const res = await call('GET', '/autopilot/status');
    expect(res.status).not.toBe(401);
    expect(res.headers['www-authenticate']).toBeUndefined();
  });
});

describe('BRIDGE EXTENSION MARKER', () => {
  /**
   * Isaret gizli DEGILDIR; isi tarayiciyi on-kontrole zorlamaktir. Yine de
   * TUM yollarda zorunludur, cunku basit bir cross-origin GET on-kontrolsuz
   * gider ve `GET /autopilot/next` durum degistirir.
   */
  it('rejects a state-changing POST with no extension marker', async () => {
    const res = await call('POST', '/autopilot/start', {
      marker: null,
      body: { roots: [{ path: '/audi-a3', label: 'Audi A3' }] },
    });
    expect(res.status).toBe(403);
    expect(res.json.error).toBe('MISSING_EXTENSION_MARKER');
  });

  it('rejects the state-changing GET /autopilot/next with no marker', async () => {
    await startRun();
    const res = await call('GET', '/autopilot/next', { marker: null });
    expect(res.status).toBe(403);
    expect(res.json.error).toBe('MISSING_EXTENSION_MARKER');
  });

  it('rejects status with no marker as well', async () => {
    const res = await call('GET', '/autopilot/status', { marker: null });
    expect(res.status).toBe(403);
  });

  it('rejects a marker carrying the wrong value', async () => {
    const res = await call('GET', '/autopilot/status', { marker: 'nope' });
    expect(res.status).toBe(403);
  });

  it('leaves the run untouched when a request is rejected', async () => {
    await startRun();
    await call('POST', '/autopilot/stop', { marker: null });
    const status = await call('GET', '/autopilot/status');
    expect(status.json.state).toBe('RUNNING');
  });
});

// ------------------------------------------------------------------------ CORS

describe('BRIDGE ORIGIN POLICY', () => {
  it('rejects a request from an ordinary web page origin', async () => {
    const res = await call('GET', '/autopilot/status', { origin: 'https://www.sahibinden.com' });
    expect(res.status).toBe(403);
    expect(res.json.error).toBe('BAD_ORIGIN');
  });

  it('answers the preflight for a chrome extension origin', async () => {
    const res = await call('OPTIONS', '/autopilot/status', {
      origin: EXTENSION_ORIGIN,
      marker: null,
    });
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(EXTENSION_ORIGIN);
    expect(res.headers['access-control-allow-headers']).toContain(AUTOPILOT_EXTENSION_HEADER);
  });

  /**
   * Bir web sayfasinin on-kontrolu CORS izni ALMAZ, dolayisiyla tarayici asil
   * istegi hic gondermez. Kopruyu web sayfalarindan koruyan mekanizma budur.
   */
  it('gives a web page preflight no CORS grant', async () => {
    const res = await call('OPTIONS', '/autopilot/start', {
      origin: 'https://www.sahibinden.com',
      marker: null,
    });
    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('serves a chrome extension origin with the matching CORS header', async () => {
    const res = await call('GET', '/autopilot/status', { origin: EXTENSION_ORIGIN });
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(EXTENSION_ORIGIN);
  });
});

// ------------------------------------------------------------------ validation

describe('BRIDGE PAYLOAD VALIDATION', () => {
  it('rejects a body that is not JSON', async () => {
    const res = await call('POST', '/autopilot/start', { rawBody: '{not json' });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('BAD_BODY');
  });

  it('rejects a start call with no roots', async () => {
    const res = await call('POST', '/autopilot/start', { body: { roots: [] } });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('PROTOCOL');
  });

  it('rejects a page batch with a missing listing id', async () => {
    await startRun();
    await call('GET', '/autopilot/next');
    await call('POST', '/autopilot/discovery', {
      body: { runId: RUN_ID, nodePath: '/audi-a3', count: 20, children: [] },
    });
    await call('GET', '/autopilot/next');

    const res = await call('POST', '/autopilot/page-batch', {
      body: {
        runId: RUN_ID,
        nodePath: '/audi-a3',
        page: 1,
        categoryText: 'Audi A3',
        cards: [{ title: 'no id' }],
        hasNextPage: false,
      },
    });
    expect(res.status).toBe(400);
    expect(res.json.message).toContain('sourceListingId');
  });

  it('rejects a page batch with a non-integer page', async () => {
    await startRun();
    const res = await call('POST', '/autopilot/page-batch', {
      body: { runId: RUN_ID, nodePath: '/audi-a3', page: 0, cards: [] },
    });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown access-restriction kind', async () => {
    await startRun();
    const res = await call('POST', '/autopilot/access-restricted', {
      body: { runId: RUN_ID, kind: 'SOMETHING_ELSE' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects work before a run exists', async () => {
    const res = await call('GET', '/autopilot/next');
    expect(res.status).toBe(400);
    expect(res.json.message).toContain('No active run');
  });

  it('returns 404 for an unknown route', async () => {
    const res = await call('GET', '/autopilot/nope');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------- happy path

describe('BRIDGE RUN FLOW', () => {
  it('drives start -> discover -> collect -> status over HTTP', async () => {
    const started = await startRun();
    expect(started.status).toBe(200);
    expect(started.json.state).toBe('RUNNING');

    const discoverDirective = await call('GET', '/autopilot/next');
    expect(discoverDirective.json).toMatchObject({
      type: 'DISCOVER',
      url: 'https://www.sahibinden.com/audi-a3',
    });

    await call('POST', '/autopilot/discovery', {
      body: { runId: RUN_ID, nodePath: '/audi-a3', count: 60, children: [] },
    });

    const pageDirective = await call('GET', '/autopilot/next');
    expect(pageDirective.json).toMatchObject({
      type: 'COLLECT_PAGE',
      page: 1,
      expectedPages: 2,
      url: 'https://www.sahibinden.com/audi-a3?pagingSize=50&pagingOffset=0',
    });

    const batch = await call('POST', '/autopilot/page-batch', {
      body: {
        runId: RUN_ID,
        nodePath: '/audi-a3',
        page: 1,
        categoryText: 'Audi A3 Fiyatları & Modelleri',
        pageUrl: pageDirective.json.url,
        hasNextPage: false,
        parseFailures: 0,
        cards: [
          {
            sourceListingId: '1234567',
            href: '/ilan/1234567/detay',
            title: 'Audi A3 1.6 TDI',
            priceText: '1.450.000 TL',
            mileageText: '120.000',
            yearText: '2018',
            locationText: 'İstanbul',
          },
        ],
      },
    });
    expect(batch.status).toBe(200);
    expect(batch.json).toMatchObject({ accepted: 1, newCount: 1, detailFetches: 0, leafComplete: true });

    const status = await call('GET', '/autopilot/status');
    expect(status.json).toMatchObject({ listingsObserved: 1, runComplete: true });
  });

  it('pauses and stops the run through the bridge', async () => {
    await startRun();
    const paused = await call('POST', '/autopilot/pause');
    expect(paused.json.state).toBe('PAUSED');

    const next = await call('GET', '/autopilot/next');
    expect(next.json).toMatchObject({ type: 'HALT', state: 'PAUSED' });

    const resumed = await call('POST', '/autopilot/resume');
    expect(resumed.json.state).toBe('RUNNING');

    const stopped = await call('POST', '/autopilot/stop');
    expect(stopped.json.state).toBe('IDLE');
  });

  it('records an access restriction and halts instead of retrying', async () => {
    await startRun();
    await call('GET', '/autopilot/next');

    const reported = await call('POST', '/autopilot/access-restricted', {
      body: { runId: RUN_ID, nodePath: '/audi-a3', kind: 'CAPTCHA', evidence: 'browser check' },
    });
    expect(reported.json.state).toBe('ACCESS_RESTRICTED');

    const next = await call('GET', '/autopilot/next');
    expect(next.json).toMatchObject({ type: 'HALT', state: 'ACCESS_RESTRICTED' });
  });
});
