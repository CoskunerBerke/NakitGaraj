/**
 * YEREL KOPRU — YALNIZCA 127.0.0.1, UZANTI ICIN.
 *
 * JETON YOK. Donen bir yetenek jetonu bu tamamen yerel is akisinda yalnizca
 * surtunme ve tekrarlanan 401 uretiyordu; kullanicinin her kosudan sonra bir
 * dosya bulup jeton yapistirmasi guvenlik degil zahmetti.
 *
 * YERINE GECEN KORUMA KATMANLARI:
 *   - Yalnizca 127.0.0.1'e baglanir. 0.0.0.0 ASLA. LAN'dan erisilemez.
 *   - Baglanti geri dongu adresinden gelmeli (uzak istemci reddedilir).
 *   - Host basligi 127.0.0.1/localhost olmalidir (DNS rebinding korumasi).
 *   - Origin VARSA yalnizca `chrome-extension://` olabilir. Sirandan bir web
 *     sayfasi cross-origin fetch'te Origin'i HER ZAMAN gonderir, dolayisiyla
 *     bu tek kural web sayfalarini disarida tutar.
 *   - Sabit, GIZLI OLMAYAN bir uzanti isareti (`X-NakitGaraj-Extension: 1`)
 *     TUM yollarda zorunludur. Amaci kimlik dogrulamak DEGIL, tarayiciyi
 *     on-kontrole (preflight) zorlamaktir; on-kontrol yalnizca uzanti
 *     kokenine cevap aldigi icin web sayfasi istegi hic gonderemez.
 *
 * ISARET NEDEN /status VE /next DAHIL HER YOLDA:
 *   Basit (simple) bir cross-origin GET on-kontrol GEREKTIRMEZ; tarayici
 *   yaniti gizler ama istek SUNUCUYA ULASIR. `GET /autopilot/next` durum
 *   degistirir (isi IN_PROGRESS yapar, checkpoint yazar). Isareti yalnizca
 *   POST'larda istemek bu yolu acik birakirdi.
 *
 * URETIM JWT/ADMIN KIMLIGI KULLANILMAZ.
 *
 * DURUSTLUK NOTU: bu katmanlarin hicbiri AYNI MAKINEDEKI baska bir yerel
 * surece karsi koruma degildir — o surec iki basligi da kolayca gonderebilir.
 * Kopru yalnizca kullanici baslattiginda calisir, yalnizca gitignore'lu bir
 * staging dizinine yazar ve snapshot DB'sine hicbir sekilde dokunmaz.
 */
import * as http from 'http';
import { AddressInfo } from 'net';
import {
  AccessRestrictionReport,
  AutopilotDirective,
  AutopilotProtocolError,
  ChildStructureSignal,
  DiscoveryReport,
  PageBatch,
  PageCapture,
} from './autopilot-contracts';

/**
 * Sabit, GIZLI OLMAYAN uzanti isareti. Kimlik dogrulama DEGILDIR; ozel baslik
 * oldugu icin tarayiciyi on-kontrole zorlar ve web sayfasi isteklerini keser.
 */
export const AUTOPILOT_EXTENSION_HEADER = 'x-nakitgaraj-extension';
export const AUTOPILOT_EXTENSION_MARKER = '1';

/** 16 MB: weekly batches may include the raw live DOM for hardened parsing. */
export const MAX_BODY_BYTES = 16 * 1024 * 1024;
/**
 * 16 MB: ham kategori sayfasi (canli DOM'un outerHTML'i). Korpustaki en buyuk
 * kayit ~0.6 MB; tavan, kaynak sayfaya reklam/betik sisse bile yeter ama
 * sinirsiz govdeye izin vermez.
 */
export const MAX_CAPTURE_BODY_BYTES = 16 * 1024 * 1024;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/**
 * Koprunun bir oturumdan bekledigi yuzey. Iki oturum turu vardir:
 *   - AutopilotSession  (piyasa modu: DISCOVER / COLLECT_PAGE, kart gozlemi)
 *   - StructureSession  (yapi modu: CAPTURE_PAGE, ham HTML -> korpus)
 * Her uc nokta yalnizca oturumun destekledigi islemi cagirir; digerine 400 doner.
 */
export interface BridgeSession {
  status(): unknown;
  nextDirective(): AutopilotDirective;
  pause(): void;
  stop(): void;
  reportAccessRestricted(report: AccessRestrictionReport): void;
  submitDiscovery?(report: DiscoveryReport): unknown;
  submitPageBatch?(batch: PageBatch): unknown;
  submitPageCapture?(capture: PageCapture): unknown;
}

export interface BridgeSessionProvider {
  /** Aktif oturum (yoksa null). */
  current(): BridgeSession | null;
  /** Yeni kosu baslat. Kok listesi bos olabilir; modun kendisi karar verir. */
  start(input: {
    roots: Array<{ path: string; label: string }>;
    deadlineMs: number | null;
  }): BridgeSession;
  /** Checkpoint'ten devam et. */
  resume(): BridgeSession;
}

export interface BridgeOptions {
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
  private readonly log: (line: string) => void;

  constructor(private readonly opts: BridgeOptions) {
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

  private async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const origin =
      typeof req.headers.origin === 'string' ? req.headers.origin : null;

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

    /**
     * 4) Uzanti isareti — TUM yollarda. Gizli degildir; on-kontrolu zorunlu
     *    kilarak web sayfasi isteklerini keser. Eksikse istek reddedilir.
     */
    if (!hasExtensionMarker(req)) {
      /**
       * TESHIS: hangi istemci isaretsiz konusuyor? Baslik ADLARI (degerleri
       * degil), Origin ve Sec-Fetch-Mode yazilir. Ornek: eski, onbellekten
       * kalmis bir servis calisani "x-autopilot-token" gonderir; bir web
       * sayfasi Origin'siz/https kokenli gelir; bir sekme gezintisi
       * sec-fetch-mode=navigate tasir.
       */
      this.log(
        `${req.method} ${req.url} -> 403 (missing extension marker; ` +
          `expected header "${AUTOPILOT_EXTENSION_HEADER}: ${AUTOPILOT_EXTENSION_MARKER}"; ` +
          `origin=${origin ?? '-'}; sec-fetch-mode=${String(req.headers['sec-fetch-mode'] ?? '-')}; ` +
          `headers=${describeHeaderNames(req)})`,
      );
      return sendJson(res, 403, { error: 'MISSING_EXTENSION_MARKER' }, origin);
    }

    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;

    let body: unknown = null;
    if (req.method === 'POST') {
      try {
        const limit =
          pathname === '/autopilot/page-capture'
            ? MAX_CAPTURE_BODY_BYTES
            : MAX_BODY_BYTES;
        body = await readJsonBody(req, limit);
      } catch (err: any) {
        return sendJson(
          res,
          400,
          { error: 'BAD_BODY', message: err.message },
          origin,
        );
      }
    }

    const ctx: RequestContext = {
      method: req.method || 'GET',
      pathname,
      origin,
      body,
    };

    try {
      const result = this.route(ctx);
      this.log(`${ctx.method} ${ctx.pathname} -> ${result.status}`);
      return sendJson(res, result.status, result.payload, origin);
    } catch (err: any) {
      if (err instanceof AutopilotProtocolError) {
        this.log(`${ctx.method} ${ctx.pathname} -> 400`);
        return sendJson(
          res,
          400,
          { error: 'PROTOCOL', message: err.message },
          origin,
        );
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
      const deadlineMs = parseOptionalPositiveInt(
        input.deadlineMs,
        'deadlineMs',
      );
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
      if (!session.submitDiscovery) throw unsupported('discovery');
      const report = parseDiscoveryReport(ctx.body);
      const outcome = session.submitDiscovery(report) as object;
      return { status: 200, payload: { ...outcome, status: session.status() } };
    }

    if (ctx.method === 'POST' && ctx.pathname === '/autopilot/page-batch') {
      const session = this.requireSession();
      if (!session.submitPageBatch) throw unsupported('page-batch');
      const batch = parsePageBatch(ctx.body);
      const result = session.submitPageBatch(batch) as object;
      return { status: 200, payload: { ...result, status: session.status() } };
    }

    /**
     * YAPI MODU: ham HTML yakalamasi. Govde burada YALNIZCA sekil olarak
     * dogrulanir; siniflandirma, kimlik kontrolu ve korpusa yazma oturumda,
     * korpusu okuyan ayni ayristiriciyla yapilir.
     */
    if (ctx.method === 'POST' && ctx.pathname === '/autopilot/page-capture') {
      const session = this.requireSession();
      if (!session.submitPageCapture) throw unsupported('page-capture');
      const capture = parsePageCapture(ctx.body);
      const result = session.submitPageCapture(capture) as object;
      return { status: 200, payload: { ...result, status: session.status() } };
    }

    if (
      ctx.method === 'POST' &&
      ctx.pathname === '/autopilot/access-restricted'
    ) {
      const session = this.requireSession();
      const report = parseAccessRestriction(ctx.body);
      session.reportAccessRestricted(report);
      return { status: 200, payload: session.status() };
    }

    return { status: 404, payload: { error: 'NOT_FOUND' } };
  }

  private requireSession(): BridgeSession {
    const session = this.opts.provider.current();
    if (!session)
      throw new AutopilotProtocolError(
        'No active run; call /autopilot/start first',
      );
    return session;
  }
}

function unsupported(endpoint: string): AutopilotProtocolError {
  return new AutopilotProtocolError(
    `/autopilot/${endpoint} is not supported by the active run mode (check --mode on the bridge)`,
  );
}

function hasExtensionMarker(req: http.IncomingMessage): boolean {
  const raw = req.headers[AUTOPILOT_EXTENSION_HEADER];
  const provided = Array.isArray(raw) ? raw[0] : raw;
  return (
    typeof provided === 'string' &&
    provided.trim() === AUTOPILOT_EXTENSION_MARKER
  );
}

// ------------------------------------------------------------------ helpers

function isLoopbackAddress(remote: string): boolean {
  const addr = remote.replace(/^::ffff:/, '');
  return addr === '127.0.0.1' || addr === '::1' || addr.startsWith('127.');
}

function isExtensionOrigin(origin: string): boolean {
  return /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}

/** Yalnizca baslik ADLARI; deger yazilmaz (cookie/yetki sizmasin). */
function describeHeaderNames(req: http.IncomingMessage): string {
  const names = Object.keys(req.headers)
    .filter(
      (name) =>
        !['host', 'connection', 'accept-encoding', 'accept-language'].includes(
          name,
        ),
    )
    .sort();
  return names.length ? names.join(',') : '(none)';
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  };
  if (origin && isExtensionOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] =
      `content-type, ${AUTOPILOT_EXTENSION_HEADER}`;
    headers['Access-Control-Max-Age'] = '600';
    /**
     * Chrome'un yerel ag on-kontrolu (Private/Local Network Access): geri
     * donguye giden istek icin tarayici bu izni sorar. YALNIZCA uzanti
     * kokenine verilir; isaret ve Origin kurallari aynen gecerlidir.
     */
    headers['Access-Control-Allow-Private-Network'] = 'true';
    headers['Access-Control-Allow-Local-Network'] = 'true';
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

function readJsonBody(
  req: http.IncomingMessage,
  limit = MAX_BODY_BYTES,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error(`Body exceeds ${limit} bytes`));
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

function parseOptionalPositiveInt(
  value: unknown,
  field: string,
): number | null {
  if (value === undefined || value === null) return null;
  return requirePositiveInt(value, field);
}

/**
 * Kok listesi. BOS OLABILIR: yapi modunda kokler CLI'dan gelir ve uzantinin
 * gonderdigi liste yok sayilir; piyasa modu bos listeyi kendisi reddeder.
 */
function parseRoots(value: unknown): Array<{ path: string; label: string }> {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new AutopilotProtocolError('"roots" must be an array');
  }
  return value.map((raw, i) => {
    const node = requireObject(raw);
    return {
      path: requireString(node.path, `roots[${i}].path`),
      label: typeof node.label === 'string' ? node.label : String(node.path),
    };
  });
}

/**
 * Alt kategori ADAYLARI. Sayim burada SAYIYA CEVRILMEZ ve aday burada
 * ELENMEZ: her ikisi de test edilmis kopru mantiginin isidir (count-text ve
 * taxonomy). Burasi yalnizca sekli dogrular.
 */
function parseChildren(value: unknown, field: string) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value))
    throw new AutopilotProtocolError(`"${field}" must be an array`);
  return value.map((raw, i) => {
    const node = requireObject(raw);
    const count = node.count;
    return {
      path: requireString(node.path, `${field}[${i}].path`),
      label: typeof node.label === 'string' ? node.label : String(node.path),
      countText: typeof node.countText === 'string' ? node.countText : null,
      count:
        typeof count === 'number' && Number.isFinite(count)
          ? Math.floor(count)
          : null,
    };
  });
}

const CHILD_STRUCTURE_SIGNALS = new Set(['READ', 'EMPTY', 'UNREADABLE']);

function parseDiscoveryReport(body: unknown): DiscoveryReport {
  const input = requireObject(body);
  const count = input.count;
  const structure = input.childStructure;
  if (
    structure !== undefined &&
    !CHILD_STRUCTURE_SIGNALS.has(String(structure))
  ) {
    throw new AutopilotProtocolError(
      `"childStructure" must be one of ${[...CHILD_STRUCTURE_SIGNALS].join(', ')}`,
    );
  }
  return {
    runId: requireString(input.runId, 'runId'),
    nodePath: requireString(input.nodePath, 'nodePath'),
    count:
      typeof count === 'number' && Number.isFinite(count)
        ? Math.floor(count)
        : null,
    /** Ham sayim metni: verildiginde sayiyi KOPRU cozer, uzanti degil. */
    ...(typeof input.countText === 'string'
      ? { countText: input.countText }
      : {}),
    children: parseChildren(input.children, 'children'),
    secondaryPartitions: parseChildren(
      input.secondaryPartitions,
      'secondaryPartitions',
    ),
    ...(structure === undefined
      ? {}
      : { childStructure: structure as ChildStructureSignal }),
  };
}

function parsePageBatch(body: unknown): PageBatch {
  const input = requireObject(body);
  const cards = input.cards;
  if (!Array.isArray(cards))
    throw new AutopilotProtocolError('"cards" must be an array');

  return {
    runId: requireString(input.runId, 'runId'),
    nodePath: requireString(input.nodePath, 'nodePath'),
    page: requirePositiveInt(input.page, 'page'),
    categoryText:
      typeof input.categoryText === 'string' ? input.categoryText : '',
    pageUrl: typeof input.pageUrl === 'string' ? input.pageUrl : '',
    hasNextPage: input.hasNextPage === true,
    parseFailures:
      typeof input.parseFailures === 'number' &&
      Number.isFinite(input.parseFailures)
        ? Math.max(0, Math.floor(input.parseFailures))
        : 0,
    ...(typeof input.rawHtml === 'string' ? { rawHtml: input.rawHtml } : {}),
    ...(typeof input.pageTitle === 'string'
      ? { pageTitle: input.pageTitle }
      : {}),
    cards: cards.map((raw, i) => {
      const card = requireObject(raw);
      return {
        sourceListingId: requireString(
          card.sourceListingId,
          `cards[${i}].sourceListingId`,
        ),
        href: typeof card.href === 'string' ? card.href : '',
        title: typeof card.title === 'string' ? card.title : '',
        priceText: typeof card.priceText === 'string' ? card.priceText : null,
        mileageText:
          typeof card.mileageText === 'string' ? card.mileageText : null,
        yearText: typeof card.yearText === 'string' ? card.yearText : null,
        locationText:
          typeof card.locationText === 'string' ? card.locationText : null,
        ...(Array.isArray(card.modelCells)
          ? {
              modelCells: card.modelCells.filter(
                (value): value is string => typeof value === 'string',
              ),
            }
          : {}),
        listingDateText:
          typeof card.listingDateText === 'string'
            ? card.listingDateText
            : null,
      };
    }),
  };
}

/**
 * Ham sayfa yakalamasi. HTML DEGISTIRILMEZ ve burada AYRISTIRILMAZ; yalnizca
 * bos olmadigi ve dize oldugu dogrulanir.
 */
function parsePageCapture(body: unknown): PageCapture {
  const input = requireObject(body);
  return {
    runId: requireString(input.runId, 'runId'),
    targetKey: requireString(input.targetKey, 'targetKey'),
    finalUrl: typeof input.finalUrl === 'string' ? input.finalUrl : '',
    title: typeof input.title === 'string' ? input.title : '',
    html: requireString(input.html, 'html'),
  };
}

const ACCESS_KINDS = new Set([
  'CAPTCHA',
  'AUTH_REQUIRED',
  /**
   * Oturum/dogrulama duvarlari AYRI kodlardir: `failure-scope.ts` bunlari
   * KOSU-FATAL sayar. Tek bir 'AUTH_REQUIRED' altinda toplamak, 2FA'yi
   * hedefe ozgu bir hata gibi gosterirdi.
   */
  'LOGIN_REQUIRED',
  'TWO_FACTOR_REQUIRED',
  'HTTP_403',
  'HTTP_429',
]);

function parseAccessRestriction(body: unknown): AccessRestrictionReport {
  const input = requireObject(body);
  const kind = requireString(input.kind, 'kind');
  if (!ACCESS_KINDS.has(kind)) {
    throw new AutopilotProtocolError(
      `"kind" must be one of ${[...ACCESS_KINDS].join(', ')}`,
    );
  }
  return {
    runId: requireString(input.runId, 'runId'),
    nodePath: typeof input.nodePath === 'string' ? input.nodePath : null,
    kind: kind as AccessRestrictionReport['kind'],
    evidence:
      typeof input.evidence === 'string'
        ? input.evidence.slice(0, 500)
        : undefined,
  };
}
