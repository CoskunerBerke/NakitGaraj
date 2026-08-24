/**
 * YEREL KOPRU — 127.0.0.1'E BAGLI, YETENEK JETONUYLA KORUNUR.
 *
 * GUVENLIK DURUSU:
 *   - Yalnizca 127.0.0.1'e baglanir. 0.0.0.0 ASLA. Uzaktan erisilebilir bir
 *     yuzey acmak, yerel bir yardimci arac icin gereksiz bir risktir.
 *   - URETIM JWT/ADMIN KIMLIGI KULLANILMAZ. Kosuya ozel, kisa omurlu bir
 *     yetenek jetonu vardir; uygulamanin kimlik alani buraya sizmaz.
 *   - Jeton `X-Autopilot-Token` basliginda gelir ve SABIT ZAMANLI karsilastirilir.
 *   - Ozel baslik gerektigi icin tarayici on-kontrol (preflight) zorunlu olur;
 *     Origin yalnizca `chrome-extension://` olabilir. Boylece rastgele bir web
 *     sayfasi kopruyu CSRF ile surukleyemez.
 *   - Host basligi 127.0.0.1/localhost olmalidir (DNS rebinding korumasi).
 *   - Govde boyutu sinirlidir; JSON disi/bozuk govde 400 olur, kosu BOZULMAZ.
 *   - Jeton DEGERI normal gunlukte YAZILMAZ.
 */
import * as crypto from 'crypto';
import * as http from 'http';
import { AddressInfo } from 'net';
import {
  AccessRestrictionReport,
  AutopilotProtocolError,
  DiscoveryReport,
  PageBatch,
} from './autopilot-contracts';
import { AutopilotSession } from './autopilot-session';

export const AUTOPILOT_TOKEN_HEADER = 'x-autopilot-token';

/** 4 MB: 50 kartlik bir sayfa paketi icin fazlasiyla yeterli. */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export interface BridgeSessionProvider {
  /** Aktif oturum (yoksa null). */
  current(): AutopilotSession | null;
  /** Yeni kosu baslat. */
  start(input: { roots: Array<{ path: string; label: string }>; deadlineMs: number | null }): AutopilotSession;
  /** Checkpoint'ten devam et. */
  resume(): AutopilotSession;
}

export interface BridgeOptions {
  token: string;
  provider: BridgeSessionProvider;
  /** 0 = isletim sistemi bos port secsin (testler icin). */
  port?: number;
  /** Gunluk kancasi; jeton DEGERI asla gecilmez. */
  log?: (line: string) => void;
}

interface RequestContext {
  method: string;
  pathname: string;
  origin: string | null;
  body: unknown;
}

export class AutopilotBridge {
  private server: http.Server | null = null;
  private readonly tokenBuffer: Buffer;
  private readonly log: (line: string) => void;

  constructor(private readonly opts: BridgeOptions) {
    if (!opts.token || opts.token.length < 32) {
      throw new Error('AutopilotBridge: capability token must be at least 32 characters');
    }
    this.tokenBuffer = Buffer.from(opts.token, 'utf-8');
    this.log = opts.log || (() => undefined);
  }

  async listen(): Promise<{ host: string; port: number }> {
    const server = http.createServer((req, res) => {
      this.handle(req, res).catch((err) => {
        this.log(`bridge error: ${err?.message || err}`);
        sendJson(res, 500, { error: 'INTERNAL' }, null);
      });
    });
    this.server = server;

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      // 0.0.0.0 DEGIL: yalnizca geri dongu arayuzu.
      server.listen(this.opts.port ?? 0, '127.0.0.1', () => resolve());
    });

    const address = server.address() as AddressInfo;
    return { host: '127.0.0.1', port: address.port };
  }

  async close(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null;

    // 1) Uzak (loopback disi) baglantilar kabul edilmez.
    const remote = req.socket.remoteAddress || '';
    if (!isLoopbackAddress(remote)) {
      return sendJson(res, 403, { error: 'NON_LOOPBACK' }, null);
    }

    // 2) DNS rebinding korumasi: Host geri dongu adi olmali.
    const host = String(req.headers.host || '');
    const hostName = host.replace(/:\d+$/, '');
    if (!LOOPBACK_HOSTS.has(hostName)) {
      return sendJson(res, 403, { error: 'BAD_HOST' }, null);
    }

    // 3) Origin varsa YALNIZCA chrome-extension:// olabilir (CSRF korumasi).
    if (origin !== null && !isExtensionOrigin(origin)) {
      return sendJson(res, 403, { error: 'BAD_ORIGIN' }, null);
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(origin));
      res.end();
      return;
    }

    // 4) Yetenek jetonu — sabit zamanli.
    if (!this.hasValidToken(req)) {
      this.log(`${req.method} ${req.url} -> 401`);
      return sendJson(res, 401, { error: 'UNAUTHORIZED' }, origin);
    }

    let body: unknown = null;
    if (req.method === 'POST') {
      try {
        body = await readJsonBody(req);
      } catch (err: any) {
        return sendJson(res, 400, { error: 'BAD_BODY', message: err.message }, origin);
      }
    }

    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    const ctx: RequestContext = { method: req.method || 'GET', pathname, origin, body };

    try {
      const result = this.route(ctx);
      this.log(`${ctx.method} ${ctx.pathname} -> ${result.status}`);
      return sendJson(res, result.status, result.payload, origin);
    } catch (err: any) {
      if (err instanceof AutopilotProtocolError) {
        this.log(`${ctx.method} ${ctx.pathname} -> 400`);
        return sendJson(res, 400, { error: 'PROTOCOL', message: err.message }, origin);
      }
      throw err;
    }
  }

  private route(ctx: RequestContext): { status: number; payload: unknown } {
    const { provider } = this.opts;

    if (ctx.method === 'GET' && ctx.pathname === '/autopilot/status') {
      const session = provider.current();
      return {
        status: 200,
        payload: session ? session.status() : { state: 'IDLE', runId: null },
      };
    }

    if (ctx.method === 'POST' && ctx.pathname === '/autopilot/start') {
      const input = requireObject(ctx.body);
      const roots = parseRoots(input.roots);
      const deadlineMs = parseOptionalPositiveInt(input.deadlineMs, 'deadlineMs');
      const session = provider.start({ roots, deadlineMs });
      return { status: 200, payload: session.status() };
    }

    if (ctx.method === 'POST' && ctx.pathname === '/autopilot/resume') {
      const session = provider.resume();
      return { status: 200, payload: session.status() };
    }

    if (ctx.method === 'POST' && ctx.pathname === '/autopilot/pause') {
      const session = this.requireSession();
      session.pause();
      return { status: 200, payload: session.status() };
    }

    if (ctx.method === 'POST' && ctx.pathname === '/autopilot/stop') {
      const session = this.requireSession();
      session.stop();
      return { status: 200, payload: session.status() };
    }

    if (ctx.method === 'GET' && ctx.pathname === '/autopilot/next') {
      const session = this.requireSession();
      return { status: 200, payload: session.nextDirective() };
    }

    if (ctx.method === 'POST' && ctx.pathname === '/autopilot/discovery') {
      const session = this.requireSession();
      const report = parseDiscoveryReport(ctx.body);
      const outcome = session.submitDiscovery(report);
      return { status: 200, payload: { ...outcome, status: session.status() } };
    }

    if (ctx.method === 'POST' && ctx.pathname === '/autopilot/page-batch') {
      const session = this.requireSession();
      const batch = parsePageBatch(ctx.body);
      const result = session.submitPageBatch(batch);
      return { status: 200, payload: { ...result, status: session.status() } };
    }

    if (ctx.method === 'POST' && ctx.pathname === '/autopilot/access-restricted') {
      const session = this.requireSession();
      const report = parseAccessRestriction(ctx.body);
      session.reportAccessRestricted(report);
      return { status: 200, payload: session.status() };
    }

    return { status: 404, payload: { error: 'NOT_FOUND' } };
  }

  private requireSession(): AutopilotSession {
    const session = this.opts.provider.current();
    if (!session) throw new AutopilotProtocolError('No active run; call /autopilot/start first');
    return session;
  }

  private hasValidToken(req: http.IncomingMessage): boolean {
    const raw = req.headers[AUTOPILOT_TOKEN_HEADER];
    const provided = Array.isArray(raw) ? raw[0] : raw;
    if (typeof provided !== 'string' || provided.length === 0) return false;
    const providedBuffer = Buffer.from(provided, 'utf-8');
    if (providedBuffer.length !== this.tokenBuffer.length) return false;
    return crypto.timingSafeEqual(providedBuffer, this.tokenBuffer);
  }
}

// ------------------------------------------------------------------ helpers

export function generateCapabilityToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function isLoopbackAddress(remote: string): boolean {
  const addr = remote.replace(/^::ffff:/, '');
  return addr === '127.0.0.1' || addr === '::1' || addr.startsWith('127.');
}

function isExtensionOrigin(origin: string): boolean {
  return /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  };
  if (origin && isExtensionOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = `content-type, ${AUTOPILOT_TOKEN_HEADER}`;
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  payload: unknown,
  origin: string | null,
): void {
  const body = JSON.stringify(payload ?? {});
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...corsHeaders(origin),
  });
  res.end(body);
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error(`Body exceeds ${MAX_BODY_BYTES} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err: any) {
        reject(new Error(`Body is not valid JSON: ${err.message}`));
      }
    });
  });
}

// ------------------------------------------------------------- payload guards
// Uzanti guvenilmez bir istemcidir: her alan SUNUCU tarafinda dogrulanir.

function requireObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AutopilotProtocolError('Body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AutopilotProtocolError(`"${field}" must be a non-empty string`);
  }
  return value;
}

function requirePositiveInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new AutopilotProtocolError(`"${field}" must be a positive integer`);
  }
  return value;
}

function parseOptionalPositiveInt(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  return requirePositiveInt(value, field);
}

function parseRoots(value: unknown): Array<{ path: string; label: string }> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AutopilotProtocolError('"roots" must be a non-empty array');
  }
  return value.map((raw, i) => {
    const node = requireObject(raw);
    return {
      path: requireString(node.path, `roots[${i}].path`),
      label: typeof node.label === 'string' ? node.label : String(node.path),
    };
  });
}

function parseChildren(value: unknown, field: string) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new AutopilotProtocolError(`"${field}" must be an array`);
  return value.map((raw, i) => {
    const node = requireObject(raw);
    const count = node.count;
    return {
      path: requireString(node.path, `${field}[${i}].path`),
      label: typeof node.label === 'string' ? node.label : String(node.path),
      count: typeof count === 'number' && Number.isFinite(count) ? Math.floor(count) : -1,
    };
  });
}

function parseDiscoveryReport(body: unknown): DiscoveryReport {
  const input = requireObject(body);
  const count = input.count;
  return {
    runId: requireString(input.runId, 'runId'),
    nodePath: requireString(input.nodePath, 'nodePath'),
    count: typeof count === 'number' && Number.isFinite(count) ? Math.floor(count) : null,
    children: parseChildren(input.children, 'children'),
    secondaryPartitions: parseChildren(input.secondaryPartitions, 'secondaryPartitions'),
  };
}

function parsePageBatch(body: unknown): PageBatch {
  const input = requireObject(body);
  const cards = input.cards;
  if (!Array.isArray(cards)) throw new AutopilotProtocolError('"cards" must be an array');

  return {
    runId: requireString(input.runId, 'runId'),
    nodePath: requireString(input.nodePath, 'nodePath'),
    page: requirePositiveInt(input.page, 'page'),
    categoryText: typeof input.categoryText === 'string' ? input.categoryText : '',
    pageUrl: typeof input.pageUrl === 'string' ? input.pageUrl : '',
    hasNextPage: input.hasNextPage === true,
    parseFailures:
      typeof input.parseFailures === 'number' && Number.isFinite(input.parseFailures)
        ? Math.max(0, Math.floor(input.parseFailures))
        : 0,
    cards: cards.map((raw, i) => {
      const card = requireObject(raw);
      return {
        sourceListingId: requireString(card.sourceListingId, `cards[${i}].sourceListingId`),
        href: typeof card.href === 'string' ? card.href : '',
        title: typeof card.title === 'string' ? card.title : '',
        priceText: typeof card.priceText === 'string' ? card.priceText : null,
        mileageText: typeof card.mileageText === 'string' ? card.mileageText : null,
        yearText: typeof card.yearText === 'string' ? card.yearText : null,
        locationText: typeof card.locationText === 'string' ? card.locationText : null,
      };
    }),
  };
}

const ACCESS_KINDS = new Set(['CAPTCHA', 'AUTH_REQUIRED', 'HTTP_403', 'HTTP_429']);

function parseAccessRestriction(body: unknown): AccessRestrictionReport {
  const input = requireObject(body);
  const kind = requireString(input.kind, 'kind');
  if (!ACCESS_KINDS.has(kind)) {
    throw new AutopilotProtocolError(`"kind" must be one of ${[...ACCESS_KINDS].join(', ')}`);
  }
  return {
    runId: requireString(input.runId, 'runId'),
    nodePath: typeof input.nodePath === 'string' ? input.nodePath : null,
    kind: kind as AccessRestrictionReport['kind'],
    evidence: typeof input.evidence === 'string' ? input.evidence.slice(0, 500) : undefined,
  };
}
