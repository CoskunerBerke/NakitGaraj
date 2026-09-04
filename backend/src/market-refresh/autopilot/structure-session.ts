/**
 * YAPI TOPLAYICISI — OZYINELI KATEGORI KESFI, HAM HTML KANITI, TEK AYRISTIRICI.
 *
 * Toplayici bir KANIT TOPLAMA katmanidir; hiyerarsi/yerlestirme motoru guvenilen
 * cekirdektir. Buradaki her karar su siraya uyar:
 *
 *   HAM HTML TOPLA -> KAYDET -> MEVCUT HARDENED AYRISTIRICI -> BREADCRUMB + MENU
 *   -> KUYRUK GENISLET -> CHECKPOINT
 *
 * TOPLAYICI KARAR VERMEZ: marka/model/motor/paket sinirlari, yaprak durumu,
 * piyasa havuzu — hepsi agac kurucusunun isidir. Burada yalnizca su bilinir:
 * "bu sayfa gecerli bir kategori sayfasi mi, kendi breadcrumb'i hedefle ayni
 * mi, menusu hangi DOGRUDAN cocuklari ilan ediyor".
 *
 * DEGISMEZLER:
 *   - Kimlik dosya adi degil, sayfanin KENDI breadcrumb'idir. Yonlendirilmis
 *     sayfa (ust kategori, alakasiz sayfa) BASARI DEGILDIR ve korpusa yazilmaz.
 *   - Korpusta zaten okunabilir olan kategori YENIDEN ISTENMEZ; ama menusu
 *     yine okunur ve cocuklari kuyruga girer (kesif korpustan devam eder).
 *   - Guvenlik/giris/2FA/erisim sayfasinda ATLATMA YOK: dur, checkpoint, kullanici.
 *   - Ayristiricinin anlamadigi sayfada DUR: otomasyon ayristiriciyi gecemez.
 *   - HER basarili sayfadan sonra checkpoint yazilir; devam idempotenttir.
 *   - Marka adi, derinlik, "A3" gibi hicbir sey sabit yazilmaz.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  AccessRestrictionReport,
  AutopilotDirective,
  AutopilotProtocolError,
  AutopilotState,
  CaptureOutcome,
  PageCapture,
  PageCaptureResult,
  StructureStatus,
} from './autopilot-contracts';
import { AtomicChecksummedFile } from '../checkpoint-store';
import { buildCategoryUrl, normalizeNodePath } from './source-url';
import { CorpusEvidence, CorpusStore } from './corpus-store';
import { RebuildResult, RebuildRunner } from './rebuild-runner';
import {
  PageClassification,
  classifyPage,
} from '../../vehicle-hierarchy/page-classification';
import {
  OTOMOBIL,
  extractBreadcrumbChain,
  extractOwnPath,
  isStrictDescendantSlug,
  splitNavChildren,
} from '../../vehicle-hierarchy/nav-children';

export const STRUCTURE_VERSION = 'structure-v1';

/** Sitenin arac koku: cocuklari markalardir. Tek sabit yol budur, marka DEGIL. */
export const SITE_ROOT = OTOMOBIL;

/** Tek bir /next cagrisinda korpustan en fazla bu kadar dugum acilir. */
export const MAX_CORPUS_EXPANSIONS_PER_CALL = 100;
/** Ayni hedef bu kadar denemeden sonra kalici FAILED olur. */
export const MAX_ATTEMPTS = 3;
/** Ardisik basarisizlik tavani: kaynak yapisi degismis olabilir, dur. */
export const MAX_CONSECUTIVE_FAILURES = 5;
const REBUILD_POLL_MS = 10_000;
const SCAN_POLL_MS = 750;

export type TargetStatus =
  'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED' | 'BLOCKED';
/**
 * ROOT        CLI'dan verilen kok
 * NAV         bir sayfanin menusunden (dogrudan cocuk ya da atlanmis seviyeli torun)
 * BREADCRUMB  torun sayfasinin breadcrumb'inda gorulen, menude hic listelenmemis
 *             ara seviye; URL'i breadcrumb'in KENDI href'inden alindi
 */
export type TargetOrigin = 'ROOT' | 'NAV' | 'BREADCRUMB';

export interface StructureTarget {
  /** Normalize kategori yolu, orn. "/audi-a3-a3-sedan". Kuyruk kimligi. */
  key: string;
  slug: string;
  label: string;
  /** Beklenen breadcrumb zinciri (Otomobil'den sonrasi). Site koku icin []. */
  expectedPath: string[] | null;
  make: string | null;
  /** 0 = site koku, 1 = marka, ... Bilinmiyorsa null. */
  depth: number | null;
  parentKey: string | null;
  origin: TargetOrigin;
  status: TargetStatus;
  outcome: CaptureOutcome | null;
  attempts: number;
  /** Bu kosuda korpusa yazilan dosya. */
  savedFile: string | null;
  /** Hedefi zaten karsilayan mevcut korpus dosyasi. */
  evidenceFile: string | null;
  breadcrumb: string[] | null;
  childrenDeclared: number | null;
  /** Menu okundu ve alt kategori yok: kaynaktan dogrulanmis terminal. */
  terminal: boolean | null;
  /** Ebeveyn menusunun yazdigi ilan sayisi (site metadatasi). */
  navResultCount: number | null;
  lastError: string | null;
  updatedAt: string;
  /**
   * Kesin yol BILINMIYOR ama bu ata zinciri KESIN: kaynak menusu tek cocuklu
   * ara seviyeyi atlayip bu hedefi torun olarak listeledi. Breadcrumb bu
   * onekle baslamali, daha uzun olmali ve son etiketi `label` ile ayni olmali.
   * Eski checkpoint'lerde alan yoktur (= null).
   */
  expectedPrefix?: string[] | null;
  /** Menude dogrudan cocuk OLMAYAN alt soy baglantisi sayisi (torun ve otesi). */
  deeperDeclared?: number | null;
  /** Breadcrumb kaniti bu hedefin beklentisini degistirdiyse onceki beklenti/hata. */
  reconciledFrom?: string | null;
}

interface Counters {
  attempted: number;
  /**
   * --max-pages'e sayilan yakalamalar. Guvenlik duvari (giris/2FA/engel)
   * SAYILMAZ: kullanici oturumu duzeltip devam ettiginde ayni butceyle
   * kaldigi yerden surer; duvar sayfasi "toplanmis sayfa" degildir.
   */
  budgetUsed: number;
  saved: number;
  alreadyPresent: number;
  redirectMismatch: number;
  noBreadcrumb: number;
  securityBlocks: number;
  parseFailures: number;
  discoveredMissing: number;
  newTerminal: number;
  duplicatesSkipped: number;
  consecutiveFailures: number;
  /** Breadcrumb'in beklentiden DERIN cikip ayni dalda kaldigi kabul edilen sayfalar. */
  refinedPaths: number;
  /** Torun breadcrumb'indan URL'iyle kazanilan, menude hic listelenmemis ara seviyeler. */
  intermediatesRecovered: number;
  /** Devam ederken yeniden acilan eski sahte REDIRECT_MISMATCH hedefleri. */
  legacyRetried: number;
}

export interface RebuildRecord {
  startedAt: string;
  finishedAt: string;
  gate: 'PASS' | 'FAIL';
  ok: boolean;
  steps: Array<{ name: string; exitCode: number | null; seconds: number }>;
  detail: string | null;
  pagesSinceLast: number;
}

export interface StructureCheckpointPayload {
  version: string;
  mode: 'STRUCTURE';
  runId: string;
  source: string;
  baseUrl: string;
  state: AutopilotState;
  createdAt: string;
  updatedAt: string;
  roots: string[];
  targets: StructureTarget[];
  seenKeys: string[];
  counters: Counters;
  pauseReason: string | null;
  lastError: string | null;
  lastSuccessKey: string | null;
  lastSuccessAt: string | null;
  lastSavedFile: string | null;
  rebuilds: RebuildRecord[];
  sinceRebuild: number;
  deadlineAtMs: number | null;
  corpusRoot: string | null;
}

export interface StructureSessionOptions {
  runId: string;
  source: string;
  baseUrl: string;
  checkpointFile: AtomicChecksummedFile<StructureCheckpointPayload>;
  corpus: CorpusStore;
  /** Kanit dosyalari (engel/yonlendirme/karantina), gunluk ve rapor buraya. */
  runDir: string;
  /** Bu kosuda gonderilecek azami yakalama (duman testi). null = sinirsiz. */
  maxPages?: number | null;
  /** Bu kadar sayfa kaydedildikten sonra yeniden kur + dogrula. 0 = hic. */
  rebuildEvery?: number;
  rebuild?: RebuildRunner | null;
  /** Adimlar arasi temel bekleme ve jitter orani (0..1). */
  paceMs?: number;
  jitter?: number;
  deadlineAtMs?: number | null;
  now?: () => number;
  random?: () => number;
  log?: (line: string) => void;
}

export interface RunReport {
  runId: string;
  mode: 'STRUCTURE';
  state: AutopilotState;
  startedAt: string;
  updatedAt: string;
  durationMs: number;
  roots: string[];
  corpusRoot: string | null;
  targets: {
    total: number;
    complete: number;
    pending: number;
    inProgress: number;
    failed: number;
    blocked: number;
  };
  pagesAttempted: number;
  pagesSaved: number;
  alreadyPresent: number;
  redirectMismatch: number;
  noBreadcrumb: number;
  securityBlocks: number;
  parseFailures: number;
  newCategoryNodes: number;
  newTerminalNodes: number;
  duplicatesSkipped: number;
  refinedPaths: number;
  intermediatesRecovered: number;
  legacyRetried: number;
  rebuilds: RebuildRecord[];
  pauseReason: string | null;
  lastError: string | null;
  runComplete: boolean;
}

function emptyCounters(): Counters {
  return {
    attempted: 0,
    budgetUsed: 0,
    saved: 0,
    alreadyPresent: 0,
    redirectMismatch: 0,
    noBreadcrumb: 0,
    securityBlocks: 0,
    parseFailures: 0,
    discoveredMissing: 0,
    newTerminal: 0,
    duplicatesSkipped: 0,
    consecutiveFailures: 0,
    refinedPaths: 0,
    intermediatesRecovered: 0,
    legacyRetried: 0,
  };
}

export class StructureSession {
  private state: AutopilotState = 'IDLE';
  private targets: StructureTarget[] = [];
  private readonly seenKeys = new Set<string>();
  private counters: Counters = emptyCounters();
  private roots: string[] = [];
  private createdAt = new Date().toISOString();
  private updatedAt = this.createdAt;
  private pauseReason: string | null = null;
  private lastError: string | null = null;
  private lastSuccessKey: string | null = null;
  private lastSuccessAt: string | null = null;
  private lastSavedFile: string | null = null;
  private rebuilds: RebuildRecord[] = [];
  private sinceRebuild = 0;
  private rebuildInFlight = false;
  private finishAfterRebuild = false;
  private deadlineAtMs: number | null;
  private evidenceSeq = 0;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly log: (line: string) => void;
  private readonly maxPages: number | null;
  private readonly rebuildEvery: number;
  private readonly paceMs: number;
  private readonly jitter: number;

  private constructor(private readonly opts: StructureSessionOptions) {
    this.now = opts.now || (() => Date.now());
    this.random = opts.random || Math.random;
    this.log = opts.log || (() => undefined);
    this.deadlineAtMs = opts.deadlineAtMs ?? null;
    this.maxPages = opts.maxPages ?? null;
    this.rebuildEvery = Math.max(0, Math.floor(opts.rebuildEvery ?? 0));
    this.paceMs = Math.max(1000, Math.floor(opts.paceMs ?? 5000));
    this.jitter = Math.min(0.9, Math.max(0, opts.jitter ?? 0.4));
  }

  // ---------------------------------------------------------------- lifecycle

  /**
   * Yeni kosu YA DA devam: checkpoint varsa ondan surer (idempotent). Kesintiye
   * ugramis bir kosuyu ikinci kez "baslatmak" kopya hedef uretemez.
   */
  static start(
    opts: StructureSessionOptions,
    roots: string[],
  ): StructureSession {
    if (opts.checkpointFile.exists()) {
      const resumed = StructureSession.resume(opts);
      resumed.log(
        `checkpoint found for run "${opts.runId}": resuming instead of restarting`,
      );
      return resumed;
    }
    const clean = (roots || [])
      .map((r) => String(r || '').trim())
      .filter(Boolean);
    if (clean.length === 0) {
      throw new AutopilotProtocolError(
        'start: at least one root category path is required',
      );
    }
    const session = new StructureSession(opts);
    session.roots = clean;
    for (const root of clean) session.enqueueRoot(root);
    session.state = 'RUNNING';
    session.persist();
    return session;
  }

  static resume(opts: StructureSessionOptions): StructureSession {
    const session = new StructureSession(opts);
    const payload = opts.checkpointFile.load();
    if (payload.version !== STRUCTURE_VERSION || payload.mode !== 'STRUCTURE') {
      throw new AutopilotProtocolError(
        `Checkpoint at ${opts.checkpointFile.path} is not a ${STRUCTURE_VERSION} structure run`,
      );
    }
    if (payload.runId !== opts.runId) {
      throw new AutopilotProtocolError(
        `Checkpoint runId "${payload.runId}" does not match requested "${opts.runId}"`,
      );
    }
    session.roots = [...payload.roots];
    session.targets = payload.targets.map((t) => ({ ...t }));
    for (const key of payload.seenKeys) session.seenKeys.add(key);
    session.counters = {
      ...emptyCounters(),
      ...payload.counters,
      consecutiveFailures: 0,
    };
    session.createdAt = payload.createdAt;
    session.updatedAt = payload.updatedAt;
    session.lastSuccessKey = payload.lastSuccessKey;
    session.lastSuccessAt = payload.lastSuccessAt;
    session.lastSavedFile = payload.lastSavedFile;
    session.rebuilds = [...(payload.rebuilds || [])];
    session.sinceRebuild = payload.sinceRebuild || 0;
    session.deadlineAtMs = opts.deadlineAtMs ?? payload.deadlineAtMs;

    for (const target of session.targets) {
      // Bu kosuda yazilan sayfalar, artefakt yeniden kurulana kadar da mevcuttur.
      if (target.savedFile && target.breadcrumb) {
        opts.corpus.noteSaved(target.breadcrumb, target.savedFile);
      }
      /**
       * Yarim kalan is yeniden BEKLEMEDE (en fazla tek sayfa tekrar okunur).
       * BLOKE (bilinmeyen bicim) hedef, kullanici ayristiriciyi duzeltip
       * devam ettiginde bir sans daha alir; deneme tavaninda kalici FAILED.
       */
      if (target.status === 'IN_PROGRESS') target.status = 'PENDING';
      if (target.status === 'BLOCKED') {
        target.status = target.attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING';
      }
      /**
       * ESKI KOSUDAN KALAN SAHTE "YONLENDIRME" — GERI UYUMLU GOC.
       *
       * Kaynak menusu tek cocuklu ara seviyeyi atlayinca hedef "Cupra / Leon /
       * Impulse" beklentisiyle kuyruga girmis, sayfa ise "Cupra / Leon /
       * 1.5 eTSI / Impulse" demisti: ayni dal, ayni son etiket, araya bir
       * seviye girmis. Bu bir yonlendirme DEGILDIR; hedef yeniden denenir ve
       * kabul kurali (guvenli inceltme) sayfayi bu kez kaydeder. Gercek
       * kanonik uyusmazlik ("requested X but the page declares itself as Y")
       * FAILED kalir. Ikinci devam idempotenttir: PENDING'e donmus hedef
       * artik FAILED degildir, sayac tekrar artmaz.
       */
      if (isRetryableLegacyBreadcrumbMismatch(target)) {
        target.reconciledFrom = target.lastError;
        target.lastError = `RETRY(nested-nav): ${target.lastError}`;
        target.status = 'PENDING';
        session.counters.legacyRetried += 1;
      }
    }
    session.state = 'RUNNING';
    session.pauseReason = null;
    session.lastError = null;
    session.persist();
    return session;
  }

  pause(): void {
    if (this.state === 'RUNNING') this.state = 'PAUSED';
    this.pauseReason = this.pauseReason ?? 'Paused by user';
    this.persist();
  }

  stop(): void {
    this.state = 'IDLE';
    this.persist();
  }

  get currentState(): AutopilotState {
    return this.state;
  }

  /** Uzantinin DOM duzeyinde gordugu erisim engeli. ATLATMA YOK: dur. */
  reportAccessRestricted(report: AccessRestrictionReport): void {
    this.requireRun(report.runId);
    const current = this.targets.find((t) => t.status === 'IN_PROGRESS');
    if (current) {
      current.status = 'PENDING';
      current.lastError = `access restricted (${report.kind})`;
      current.updatedAt = this.stamp();
    }
    this.counters.securityBlocks += 1;
    this.state = 'ACCESS_RESTRICTED';
    this.pauseReason =
      `ACCESS_RESTRICTED (${report.kind})` +
      (current ? ` at ${current.key}` : '') +
      (report.evidence ? `: ${String(report.evidence).slice(0, 200)}` : '') +
      '. Fix the session manually in Chrome, then RESUME.';
    this.lastError = this.pauseReason;
    this.persist();
  }

  // ---------------------------------------------------------------- directives

  nextDirective(): AutopilotDirective {
    if (this.state === 'REBUILDING') {
      return this.wait(
        REBUILD_POLL_MS,
        'Rebuilding hierarchy/assignments and running the validation gate',
      );
    }
    if (this.state !== 'RUNNING') {
      return this.halt(
        this.state,
        this.pauseReason || this.lastError || `Run is ${this.state}`,
      );
    }
    if (this.deadlineAtMs !== null && this.now() >= this.deadlineAtMs) {
      this.state = 'DEADLINE_REACHED';
      for (const t of this.targets)
        if (t.status === 'IN_PROGRESS') t.status = 'PENDING';
      this.pauseReason = 'Execution window closed; resume in the next window';
      this.persist();
      return this.halt('DEADLINE_REACHED', this.pauseReason);
    }
    if (this.rebuildDue()) {
      this.startRebuild(false);
      return this.wait(
        REBUILD_POLL_MS,
        'Structural wave complete; rebuilding before continuing',
      );
    }

    // Yarim kalmis yakalama (devam sonrasi) ayni yonergeyi yeniden alir.
    const inProgress = this.targets.find((t) => t.status === 'IN_PROGRESS');
    if (inProgress) return this.capture(inProgress);

    let expansions = 0;
    for (;;) {
      if (this.maxPages !== null && this.counters.budgetUsed >= this.maxPages) {
        return this.finish();
      }
      const target = this.targets.find((t) => t.status === 'PENDING');
      if (!target) return this.finish();

      /**
       * ONCE KORPUS. Kategori zaten okunabilir halde diskteyse istek
       * GONDERILMEZ; ama menusu yine okunur ve cocuklari kuyruga girer —
       * kesif, mevcut kanittan devam eder.
       */
      const evidence = this.opts.corpus.present(target);
      if (evidence) {
        this.satisfyFromCorpus(target, evidence);
        expansions += 1;
        if (expansions >= MAX_CORPUS_EXPANSIONS_PER_CALL) {
          this.persist();
          return this.wait(
            SCAN_POLL_MS,
            'Scanning existing corpus for already-present categories',
          );
        }
        continue;
      }
      if (target.origin === 'NAV') this.counters.discoveredMissing += 1;
      target.status = 'IN_PROGRESS';
      target.attempts += 1;
      target.updatedAt = this.stamp();
      this.persist();
      return this.capture(target);
    }
  }

  /**
   * Kuyrugu ISTEK GONDERMEDEN korpusa karsi acar (kuru kosu). Mevcut dugumler
   * tamamlanir ve genisletilir; eksikler PENDING kalir. Sonuc: gercekten
   * cekilmesi gereken sayfalarin listesi.
   */
  scanCorpus(): { present: number; missing: number } {
    let present = 0;
    let missing = 0;
    for (let i = 0; i < this.targets.length; i += 1) {
      const target = this.targets[i];
      if (target.status !== 'PENDING') continue;
      const evidence = this.opts.corpus.present(target);
      if (evidence) {
        this.satisfyFromCorpus(target, evidence);
        present += 1;
      } else {
        missing += 1;
      }
    }
    this.persist();
    return { present, missing };
  }

  // ------------------------------------------------------------------ capture

  submitPageCapture(capture: PageCapture): PageCaptureResult {
    this.requireRun(capture.runId);
    const target = this.requireInProgress(capture.targetKey);
    this.counters.attempted += 1;
    this.counters.budgetUsed += 1;
    target.updatedAt = this.stamp();

    const html = String(capture.html || '');
    const page = classifyPage(html, `${target.slug}.html`);
    const base = {
      pageStatus: page.status,
      breadcrumb: page.breadcrumb,
      savedFile: null as string | null,
      childrenDeclared: 0,
      childrenEnqueued: 0,
      childrenAlreadyKnown: 0,
      terminal: false,
      paused: false,
      pauseReason: null as string | null,
    };

    switch (page.status) {
      case 'LOGIN_PAGE':
        return this.pauseForSecurity(
          target,
          capture,
          page,
          'LOGIN_REQUIRED',
          base,
        );
      case 'TWO_FACTOR_PAGE':
        return this.pauseForSecurity(
          target,
          capture,
          page,
          'TWO_FACTOR_REQUIRED',
          base,
        );
      case 'ACCESS_RESTRICTION_PAGE':
        return this.pauseForSecurity(
          target,
          capture,
          page,
          'ACCESS_RESTRICTED',
          base,
        );
      case 'PARSE_ERROR':
        return this.stopForParser(target, capture, page, 'PARSE_ERROR', base);
      case 'UNKNOWN_DATA_FORMAT':
      case 'SUSPICIOUS_EMPTY_PARSE':
      case 'UNKNOWN_HTML':
      case 'SAVED_ASSET':
        return this.stopForParser(
          target,
          capture,
          page,
          'UNKNOWN_FORMAT',
          base,
        );
      case 'SHOWCASE_OR_NON_CATEGORY_PAGE':
        if (target.key === SITE_ROOT)
          return this.acceptSiteRoot(target, capture, page, base);
        return this.fail(
          target,
          capture,
          page,
          'NON_CATEGORY_PAGE',
          base,
          'page is the site showcase, not a vehicle category',
        );
      case 'RESULT_PAGE':
        return this.fail(
          target,
          capture,
          page,
          'NO_BREADCRUMB',
          base,
          'listing rows without a category breadcrumb',
        );
      case 'CATEGORY_PAGE':
        return this.acceptCategory(target, capture, page, base);
      default:
        return this.stopForParser(
          target,
          capture,
          page,
          'UNKNOWN_FORMAT',
          base,
        );
    }
  }

  private acceptCategory(
    target: StructureTarget,
    capture: PageCapture,
    page: PageClassification,
    base: Omit<PageCaptureResult, 'outcome'>,
  ): PageCaptureResult {
    const html = String(capture.html || '');
    const own = ownPathOf(html);
    if (!own) {
      return this.fail(
        target,
        capture,
        page,
        'NO_BREADCRUMB',
        base,
        'breadcrumb carries no category link',
      );
    }
    if (own !== target.key) {
      return this.fail(
        target,
        capture,
        page,
        'REDIRECT_MISMATCH',
        base,
        `requested ${target.key} but the page declares itself as ${own}`,
      );
    }
    const chain = page.breadcrumb as string[];
    /**
     * KIMLIK IKI KATMANLI: (1) sayfanin kendi URL'i istenen URL ile AYNI olmali
     * (yukarida); (2) breadcrumb beklentiyle ayni dalda olmali. Beklenti
     * ebeveyn menusunden geldi ve kaynak menusu tek cocuklu ara seviyeyi
     * ATLAYABILIYOR: "Cupra / Leon / Impulse" beklenirken sayfa "Cupra / Leon /
     * 1.5 eTSI / Impulse" der. Ayni dal + ayni son etiket + araya giren
     * seviye(ler) = GUVENLI INCELTME; breadcrumb otoritedir. Baska dal, baska
     * son etiket ya da (1)'de baska URL = yonlendirme, korpusa yazilmaz.
     */
    const verdict = verifyExpectedPath(target, chain);
    if (!verdict.ok) {
      return this.fail(
        target,
        capture,
        page,
        'REDIRECT_MISMATCH',
        base,
        verdict.reason,
      );
    }
    const previousExpectation = (
      target.expectedPath ??
      target.expectedPrefix ??
      []
    ).join(' / ');
    if (verdict.refined) {
      target.reconciledFrom = previousExpectation;
      this.counters.refinedPaths += 1;
      this.log(
        `REFINED ${target.key}: expected "${previousExpectation}", source breadcrumb "${chain.join(' / ')}"`,
      );
    }
    target.expectedPath = [...chain];
    target.expectedPrefix = null;

    const savedFile = this.opts.corpus.save(chain, html);
    target.status = 'COMPLETE';
    target.outcome = 'SAVED';
    target.savedFile = savedFile;
    target.breadcrumb = [...chain];
    target.make = chain[0];
    target.depth = chain.length;
    target.lastError = null;
    target.updatedAt = this.stamp();

    // Breadcrumb'in gosterdigi, menude hic listelenmemis ara seviyeler kuyruga.
    const recovered = verdict.refined
      ? this.recoverIntermediates(target, html, chain)
      : 0;

    const expansion = this.expandChildren(target, page, own.slice(1));
    this.counters.saved += 1;
    this.counters.consecutiveFailures = 0;
    this.sinceRebuild += 1;
    this.lastSuccessKey = target.key;
    this.lastSuccessAt = target.updatedAt;
    this.lastSavedFile = savedFile;
    if (target.terminal) this.counters.newTerminal += 1;

    this.appendCaptureLog(target, capture, page, 'SAVED', expansion);
    this.log(
      `SAVED ${chain.join(' / ')}  (+${expansion.enqueued} new children, ` +
        `${expansion.declared} declared, ${expansion.deeper} deeper` +
        `${recovered > 0 ? `, +${recovered} intermediate(s) from breadcrumb` : ''}, ` +
        `queue ${this.pendingCount()})`,
    );
    this.persist();
    return {
      ...base,
      outcome: 'SAVED',
      savedFile,
      childrenDeclared: expansion.declared,
      childrenEnqueued: expansion.enqueued,
      childrenAlreadyKnown: expansion.known,
      terminal: target.terminal === true,
    };
  }

  /** Site koku: kategori degil, ama cocuklari (markalar) buradan ogrenilir. */
  private acceptSiteRoot(
    target: StructureTarget,
    capture: PageCapture,
    page: PageClassification,
    base: Omit<PageCaptureResult, 'outcome'>,
  ): PageCaptureResult {
    const html = String(capture.html || '');
    const own = ownPathOf(html);
    if (own !== SITE_ROOT) {
      return this.fail(
        target,
        capture,
        page,
        'REDIRECT_MISMATCH',
        base,
        `site root expected, page declares ${own}`,
      );
    }
    if (page.navChildren === null) {
      return this.stopForParser(target, capture, page, 'UNKNOWN_FORMAT', base);
    }
    // Kok sayfa arac kategorisi degildir: korpusa degil kosu kanit dizinine yazilir.
    const savedFile = this.writeEvidence('site-root', target, html);
    target.status = 'COMPLETE';
    target.outcome = 'SAVED';
    target.savedFile = savedFile;
    target.breadcrumb = [];
    target.depth = 0;
    target.updatedAt = this.stamp();
    const expansion = this.expandChildren(target, page, '');
    this.counters.consecutiveFailures = 0;
    this.lastSuccessKey = target.key;
    this.lastSuccessAt = target.updatedAt;
    this.appendCaptureLog(target, capture, page, 'SAVED', expansion);
    this.log(
      `SITE ROOT read: ${expansion.declared} make(s) declared, ${expansion.enqueued} queued`,
    );
    this.persist();
    return {
      ...base,
      outcome: 'SAVED',
      savedFile,
      childrenDeclared: expansion.declared,
      childrenEnqueued: expansion.enqueued,
      childrenAlreadyKnown: expansion.known,
    };
  }

  /** Korpusta zaten olan hedef: istek yok, ama kesif oradan surer. */
  private satisfyFromCorpus(
    target: StructureTarget,
    evidence: CorpusEvidence,
  ): void {
    const page = evidence.page;
    // Site koku (vitrin) breadcrumb zinciri tasimaz: zinciri bos, cocuklari markalar.
    const isSiteRoot = target.key === SITE_ROOT;
    const chain = isSiteRoot ? [] : (page.breadcrumb ?? []);
    target.status = 'COMPLETE';
    target.outcome = 'ALREADY_PRESENT';
    target.evidenceFile = evidence.file;
    target.breadcrumb = [...chain];
    target.make = chain[0] ?? null;
    target.depth = chain.length;
    target.updatedAt = this.stamp();
    const own = page.ownPath;
    const expansion = this.expandChildren(
      target,
      page,
      isSiteRoot ? '' : own ? own.slice(1) : null,
    );
    this.counters.alreadyPresent += 1;
    this.log(
      `PRESENT ${isSiteRoot ? 'site root' : chain.join(' / ')}  (+${expansion.enqueued} children from disk, queue ${this.pendingCount()})`,
    );
  }

  /**
   * Menuden cocuklar. Kural agacin kullandiginin AYNISIDIR (`splitNavChildren`):
   * dogrudan cocuk = alt soy slug'i + kaynagin seviye isareti. Ustler,
   * kardesler, sayfalama, reklam elenir. Kaynak tek cocuklu ara seviyeyi
   * atlayip TORUN listelediyse torun da kuyruga girer — ama kesin yol
   * beklentisiyle degil, "bu ata zincirinin altinda" beklentisiyle; kesin
   * yolu ve atlanan seviyenin URL'ini torunun kendi breadcrumb'i verir.
   * Sayfanin kendi slug'i breadcrumb'in son baglantisindan okunur — etiketten
   * turetilmis slug degil, kaynagin YAZDIGI yol.
   */
  private expandChildren(
    target: StructureTarget,
    page: PageClassification,
    ownSlug: string | null,
  ): { declared: number; enqueued: number; known: number; deeper: number } {
    const chain = page.breadcrumb ?? [];
    const nav = page.navChildren ?? [];
    const own = ownSlug ?? (chain.length > 0 ? null : '');
    if (own === null) {
      target.childrenDeclared = 0;
      target.deeperDeclared = 0;
      target.terminal = false;
      return { declared: 0, enqueued: 0, known: 0, deeper: 0 };
    }
    const split = splitNavChildren(nav, own, chain.length);

    let enqueued = 0;
    let known = 0;
    for (const child of split.direct) {
      const added = this.enqueueChild({
        key: `/${child.slug}`,
        slug: child.slug,
        label: child.label,
        expectedPath: [...chain, child.label],
        expectedPrefix: null,
        make: chain[0] ?? child.label,
        depth: chain.length + 1,
        parentKey: target.key,
        origin: 'NAV',
        navResultCount: child.count,
      });
      if (added) enqueued += 1;
      else known += 1;
    }
    for (const child of split.deeper) {
      const added = this.enqueueChild({
        key: `/${child.slug}`,
        slug: child.slug,
        label: child.label,
        expectedPath: null,
        expectedPrefix: [...chain],
        make: chain[0] ?? child.label,
        depth: null,
        parentKey: target.key,
        origin: 'NAV',
        navResultCount: child.count,
      });
      if (added) enqueued += 1;
      else known += 1;
    }
    target.childrenDeclared = split.direct.length;
    target.deeperDeclared = split.deeper.length;
    // Terminal: menu okundu, ne dogrudan cocuk ne de atlanmis seviyeli torun var.
    target.terminal =
      page.navChildren !== null &&
      own !== '' &&
      split.direct.length === 0 &&
      split.deeper.length === 0;
    return {
      declared: split.direct.length,
      enqueued,
      known,
      deeper: split.deeper.length,
    };
  }

  /** Kuyruga TEK giris noktasi: ayni anahtar ikinci kez girmez. */
  private enqueueChild(fields: {
    key: string;
    slug: string;
    label: string;
    expectedPath: string[] | null;
    expectedPrefix: string[] | null;
    make: string | null;
    depth: number | null;
    parentKey: string | null;
    origin: TargetOrigin;
    navResultCount: number | null;
  }): boolean {
    if (this.seenKeys.has(fields.key)) {
      this.counters.duplicatesSkipped += 1;
      return false;
    }
    this.seenKeys.add(fields.key);
    this.targets.push({
      key: fields.key,
      slug: fields.slug,
      label: fields.label,
      expectedPath: fields.expectedPath,
      expectedPrefix: fields.expectedPrefix,
      make: fields.make,
      depth: fields.depth,
      parentKey: fields.parentKey,
      origin: fields.origin,
      status: 'PENDING',
      outcome: null,
      attempts: 0,
      savedFile: null,
      evidenceFile: null,
      breadcrumb: null,
      childrenDeclared: null,
      deeperDeclared: null,
      terminal: null,
      navResultCount: fields.navResultCount,
      lastError: null,
      reconciledFrom: null,
      updatedAt: this.stamp(),
    });
    return true;
  }

  /**
   * ATLANAN ARA SEVIYELERI KAZAN — URL KAYNAKTAN, ETIKETTEN DEGIL.
   *
   * Inceltilmis bir sayfanin breadcrumb'i ("Cupra / Leon / 1.5 eTSI / Impulse")
   * menude hic listelenmemis bir ara seviyeyi gosterir. O seviyenin sayfasi
   * toplanmazsa dogrudan cocuklari hicbir zaman ogrenilmez. URL, breadcrumb
   * ogesinin KENDI href'inden alinir (/cupra-leon-1.5-etsi); etiketten slug
   * TURETILMEZ. Href kullanilabilir bir kategori yolu degilse seviye atlanir ve
   * gunluge yazilir (fail-closed, denetlenebilir).
   *
   * Ayni anahtar zaten kuyruktaysa kopya olusmaz; PENDING ise beklentisi
   * breadcrumb'a cekilir; eski sahte REDIRECT_MISMATCH ise yeniden acilir;
   * COMPLETE ise dokunulmaz.
   */
  private recoverIntermediates(
    target: StructureTarget,
    html: string,
    chain: string[],
  ): number {
    const crumbs = extractBreadcrumbChain(html);
    if (!crumbs || crumbs.length !== chain.length) return 0;
    let recovered = 0;
    let parentKey: string | null = null;
    for (let i = 0; i < crumbs.length - 1; i += 1) {
      const key = crumbs[i].path;
      const slug = key.replace(/^\//, '');
      const parentSlug = parentKey ? parentKey.replace(/^\//, '') : null;
      const usable =
        /^[a-z0-9][a-z0-9._-]*$/.test(slug) &&
        key !== SITE_ROOT &&
        (i === 0 ||
          (parentSlug !== null && isStrictDescendantSlug(parentSlug, slug))) &&
        isStrictDescendantSlug(slug, target.slug);
      if (!usable) {
        this.log(
          `SKIP intermediate level ${i + 1} ("${chain[i]}") of ${target.key}: breadcrumb href "${key}" is not a usable category path`,
        );
        parentKey = null;
        continue;
      }
      const expectedPath = chain.slice(0, i + 1);
      const existing = this.targets.find((t) => t.key === key);
      if (!existing) {
        if (
          this.enqueueChild({
            key,
            slug,
            label: chain[i],
            expectedPath,
            expectedPrefix: null,
            make: chain[0],
            depth: i + 1,
            parentKey,
            origin: 'BREADCRUMB',
            navResultCount: null,
          })
        ) {
          recovered += 1;
          this.counters.intermediatesRecovered += 1;
          this.log(
            `RECOVERED intermediate ${key} (${expectedPath.join(' / ')}) from breadcrumb of ${target.key}`,
          );
        }
      } else if (existing.status === 'PENDING') {
        if (
          !existing.expectedPath ||
          !samePathFolded(existing.expectedPath, expectedPath)
        ) {
          existing.reconciledFrom = (
            existing.expectedPath ??
            existing.expectedPrefix ??
            []
          ).join(' / ');
          existing.expectedPath = expectedPath;
          existing.expectedPrefix = null;
          existing.updatedAt = this.stamp();
        }
      } else if (
        existing.status === 'FAILED' &&
        existing.outcome === 'REDIRECT_MISMATCH' &&
        !isOwnSlugMismatch(existing)
      ) {
        existing.reconciledFrom = existing.lastError;
        existing.expectedPath = expectedPath;
        existing.expectedPrefix = null;
        existing.status = 'PENDING';
        existing.lastError = `RETRY(breadcrumb-evidence from ${target.key}): ${existing.lastError}`;
        existing.updatedAt = this.stamp();
        recovered += 1;
        this.counters.intermediatesRecovered += 1;
      }
      parentKey = key;
    }
    if (parentKey) target.parentKey = parentKey;
    return recovered;
  }

  // ----------------------------------------------------------------- failures

  private pauseForSecurity(
    target: StructureTarget,
    capture: PageCapture,
    page: PageClassification,
    outcome: 'LOGIN_REQUIRED' | 'TWO_FACTOR_REQUIRED' | 'ACCESS_RESTRICTED',
    base: Omit<PageCaptureResult, 'outcome'>,
  ): PageCaptureResult {
    const evidence = this.writeEvidence('security', target, capture.html);
    // Duvar sayfasi butceden dusmez: devam edince ayni sayfa ayni butceyle denenir.
    this.counters.budgetUsed = Math.max(0, this.counters.budgetUsed - 1);
    // Hedef kaybolmaz: kullanici oturumu duzeltince ayni sayfa yeniden denenir.
    target.status = 'PENDING';
    target.outcome = outcome;
    target.lastError = `${outcome}: ${page.title}`;
    target.updatedAt = this.stamp();
    this.counters.securityBlocks += 1;
    this.state = 'ACCESS_RESTRICTED';
    this.pauseReason =
      `${outcome} at ${target.key} (${page.status}: "${page.title}"). ` +
      'No bypass is attempted. Fix the session in Chrome, then RESUME. ' +
      `Evidence: ${evidence}`;
    this.lastError = this.pauseReason;
    this.appendCaptureLog(target, capture, page, outcome, null, evidence);
    this.log(`PAUSE ${outcome} at ${target.key}`);
    this.persist();
    return { ...base, outcome, paused: true, pauseReason: this.pauseReason };
  }

  /** Ayristirici sayfayi anlamadi: otomasyon burada DURUR, once ayristirici. */
  private stopForParser(
    target: StructureTarget,
    capture: PageCapture,
    page: PageClassification,
    outcome: 'UNKNOWN_FORMAT' | 'PARSE_ERROR',
    base: Omit<PageCaptureResult, 'outcome'>,
  ): PageCaptureResult {
    const evidence = this.writeEvidence('quarantine', target, capture.html);
    target.status = 'BLOCKED';
    target.outcome = outcome;
    target.lastError = `${outcome} (${page.status}): ${page.detail || page.title}`;
    target.updatedAt = this.stamp();
    this.counters.parseFailures += 1;
    this.state = 'ERROR';
    this.pauseReason =
      `${outcome} at ${target.key}: parser classified the page as ${page.status}` +
      (page.detail ? ` (${page.detail})` : '') +
      '. Collection stopped so a new save format cannot spread; fix the parser, then RESUME. ' +
      `Quarantined copy: ${evidence}`;
    this.lastError = this.pauseReason;
    this.appendCaptureLog(target, capture, page, outcome, null, evidence);
    this.log(`STOP ${outcome} at ${target.key} (${page.status})`);
    this.persist();
    return { ...base, outcome, paused: true, pauseReason: this.pauseReason };
  }

  private fail(
    target: StructureTarget,
    capture: PageCapture,
    page: PageClassification,
    outcome: 'REDIRECT_MISMATCH' | 'NO_BREADCRUMB' | 'NON_CATEGORY_PAGE',
    base: Omit<PageCaptureResult, 'outcome'>,
    detail: string,
  ): PageCaptureResult {
    const evidence = this.writeEvidence('mismatch', target, capture.html);
    target.status = 'FAILED';
    target.outcome = outcome;
    target.lastError = `${outcome}: ${detail}`;
    target.updatedAt = this.stamp();
    if (outcome === 'REDIRECT_MISMATCH') this.counters.redirectMismatch += 1;
    else this.counters.noBreadcrumb += 1;
    this.counters.consecutiveFailures += 1;
    this.appendCaptureLog(target, capture, page, outcome, null, evidence);
    this.log(`FAIL ${outcome} at ${target.key}: ${detail}`);

    if (this.counters.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      this.state = 'ERROR';
      this.pauseReason =
        `${MAX_CONSECUTIVE_FAILURES} consecutive failures (last: ${outcome} at ${target.key}). ` +
        'The source structure may have changed; inspect the evidence files, then RESUME.';
      this.lastError = this.pauseReason;
      this.persist();
      return { ...base, outcome, paused: true, pauseReason: this.pauseReason };
    }
    this.persist();
    return { ...base, outcome };
  }

  // ------------------------------------------------------------------ rebuild

  private rebuildDue(): boolean {
    return (
      this.rebuildEvery > 0 &&
      Boolean(this.opts.rebuild) &&
      !this.rebuildInFlight &&
      this.sinceRebuild >= this.rebuildEvery
    );
  }

  private startRebuild(finishAfter: boolean): void {
    if (!this.opts.rebuild || this.rebuildInFlight) return;
    this.rebuildInFlight = true;
    this.finishAfterRebuild = finishAfter;
    this.state = 'REBUILDING';
    const pages = this.sinceRebuild;
    this.log(`REBUILD start (${pages} page(s) since last rebuild)`);
    this.persist();
    this.opts.rebuild
      .run()
      .then((result) => this.onRebuildDone(result, pages))
      .catch((err) =>
        this.onRebuildDone(
          {
            ok: false,
            gate: 'FAIL',
            steps: [],
            startedAt: new Date(this.now()).toISOString(),
            finishedAt: new Date(this.now()).toISOString(),
            detail: `rebuild runner threw: ${describeError(err)}`,
          },
          pages,
        ),
      );
  }

  private onRebuildDone(result: RebuildResult, pages: number): void {
    this.rebuildInFlight = false;
    this.rebuilds.push({
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      gate: result.gate,
      ok: result.ok,
      steps: result.steps.map((s) => ({
        name: s.name,
        exitCode: s.exitCode,
        seconds: s.seconds,
      })),
      detail: result.detail,
      pagesSinceLast: pages,
    });
    this.sinceRebuild = 0;
    try {
      this.opts.corpus.reload();
    } catch (err) {
      this.log(`corpus reload failed: ${describeError(err)}`);
    }

    if (!result.ok) {
      this.state = 'ERROR';
      this.pauseReason =
        `VALIDATION_FAILED after rebuild (gate ${result.gate}): ${result.detail || 'see rebuild logs'}. ` +
        'Collection stopped; fix the parser/tree first, then RESUME.';
      this.lastError = this.pauseReason;
      this.log(`REBUILD gate FAIL: ${result.detail}`);
    } else if (this.finishAfterRebuild) {
      const drained = this.drainedState();
      this.state = drained.state;
      this.pauseReason = drained.reason;
      this.log(`REBUILD gate PASS; run finished as ${drained.state}`);
    } else {
      this.state = 'RUNNING';
      this.log('REBUILD gate PASS; collection continues');
    }
    this.finishAfterRebuild = false;
    this.persist();
  }

  /** Kuyruk bitti ya da sayfa butcesi doldu: once (gerekliyse) son yeniden kurma. */
  private finish(): AutopilotDirective {
    if (
      this.opts.rebuild &&
      this.rebuildEvery > 0 &&
      (this.sinceRebuild > 0 || this.rebuilds.length === 0) &&
      !this.rebuildInFlight
    ) {
      this.startRebuild(true);
      return this.wait(
        REBUILD_POLL_MS,
        'Final rebuild + validation before the run closes',
      );
    }
    const drained = this.drainedState();
    this.state = drained.state;
    this.pauseReason = drained.reason;
    this.persist();
    return this.halt(drained.state, drained.reason);
  }

  private drainedState(): { state: AutopilotState; reason: string } {
    const pending = this.targets.filter(
      (t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS',
    ).length;
    const failed = this.targets.filter((t) => t.status === 'FAILED').length;
    const blocked = this.targets.filter((t) => t.status === 'BLOCKED').length;
    if (
      pending > 0 &&
      this.maxPages !== null &&
      this.counters.budgetUsed >= this.maxPages
    ) {
      return {
        state: 'SMOKE_LIMIT_REACHED',
        reason:
          `Page budget of ${this.maxPages} reached with ${pending} target(s) still queued. ` +
          'Bounded run; raise --max-pages or start the full structure run.',
      };
    }
    if (failed === 0 && blocked === 0 && pending === 0) {
      return {
        state: 'COMPLETE',
        reason: 'Queue empty and no visited page added unvisited children',
      };
    }
    const reasons = new Set(
      this.targets
        .filter((t) => t.status === 'FAILED' || t.status === 'BLOCKED')
        .map((t) => t.outcome || t.status),
    );
    return {
      state: 'INCOMPLETE',
      reason: `Queue drained but ${failed} failed / ${blocked} blocked target(s): ${[...reasons].join(', ')}`,
    };
  }

  // ------------------------------------------------------------------- status

  status(): StructureStatus {
    const current =
      this.targets.find((t) => t.status === 'IN_PROGRESS') || null;
    let completed = 0;
    let queued = 0;
    let failed = 0;
    let blocked = 0;
    for (const t of this.targets) {
      if (t.status === 'COMPLETE') completed += 1;
      else if (t.status === 'FAILED') failed += 1;
      else if (t.status === 'BLOCKED') blocked += 1;
      else queued += 1;
    }
    const lastRebuild = this.rebuilds[this.rebuilds.length - 1];
    return {
      runId: this.opts.runId,
      mode: 'STRUCTURE',
      state: this.state,
      source: this.opts.source,
      completed,
      queued,
      remaining: queued,
      failed,
      blocked,
      attempted: this.counters.attempted,
      pagesSaved: this.counters.saved,
      alreadyPresent: this.counters.alreadyPresent,
      redirectMismatch: this.counters.redirectMismatch,
      securityBlocks: this.counters.securityBlocks,
      parseFailures: this.counters.parseFailures,
      newNodesDiscovered: this.counters.discoveredMissing,
      newTerminalNodes: this.counters.newTerminal,
      duplicatesSkipped: this.counters.duplicatesSkipped,
      refinedPaths: this.counters.refinedPaths,
      intermediatesRecovered: this.counters.intermediatesRecovered,
      legacyRetried: this.counters.legacyRetried,
      currentKey: current ? current.key : null,
      currentPath: current ? current.expectedPath : null,
      currentMake: current ? current.make : null,
      currentUrl: current
        ? buildCategoryUrl(this.opts.baseUrl, current.key)
        : null,
      lastSuccessKey: this.lastSuccessKey,
      lastSuccessAt: this.lastSuccessAt,
      lastSavedFile: this.lastSavedFile,
      pauseReason: this.state === 'RUNNING' ? null : this.pauseReason,
      lastError: this.lastError,
      maxPages: this.maxPages,
      rebuildEvery: this.rebuildEvery,
      rebuilds: this.rebuilds.length,
      sinceRebuild: this.sinceRebuild,
      lastGate: lastRebuild ? lastRebuild.gate : null,
      runComplete: this.isRunComplete(),
      deadlineAt:
        this.deadlineAtMs === null
          ? null
          : new Date(this.deadlineAtMs).toISOString(),
      startedAt: this.createdAt,
      updatedAt: this.updatedAt,
      currentTrail: current ? (current.expectedPath ?? [current.label]) : [],
      doneJobs: completed,
      pendingJobs: queued,
      blockedJobs: failed + blocked,
      scopeLimited: this.maxPages !== null,
      scope:
        this.maxPages !== null ? `max ${this.maxPages} page(s) this run` : null,
    };
  }

  /** Tam: her hedef COMPLETE (kaydedildi ya da zaten vardi), kuyruk bos, hata yok. */
  isRunComplete(): boolean {
    return (
      this.targets.length > 0 &&
      this.targets.every((t) => t.status === 'COMPLETE')
    );
  }

  targetsView(): StructureTarget[] {
    return this.targets.map((t) => ({
      ...t,
      expectedPath: t.expectedPath ? [...t.expectedPath] : null,
    }));
  }

  report(): RunReport {
    const c = this.counters;
    return {
      runId: this.opts.runId,
      mode: 'STRUCTURE',
      state: this.state,
      startedAt: this.createdAt,
      updatedAt: this.updatedAt,
      durationMs: Math.max(
        0,
        Date.parse(this.updatedAt) - Date.parse(this.createdAt),
      ),
      roots: [...this.roots],
      corpusRoot: this.opts.corpus.root,
      targets: {
        total: this.targets.length,
        complete: this.targets.filter((t) => t.status === 'COMPLETE').length,
        pending: this.targets.filter((t) => t.status === 'PENDING').length,
        inProgress: this.targets.filter((t) => t.status === 'IN_PROGRESS')
          .length,
        failed: this.targets.filter((t) => t.status === 'FAILED').length,
        blocked: this.targets.filter((t) => t.status === 'BLOCKED').length,
      },
      pagesAttempted: c.attempted,
      pagesSaved: c.saved,
      alreadyPresent: c.alreadyPresent,
      redirectMismatch: c.redirectMismatch,
      noBreadcrumb: c.noBreadcrumb,
      securityBlocks: c.securityBlocks,
      parseFailures: c.parseFailures,
      newCategoryNodes: c.discoveredMissing,
      newTerminalNodes: c.newTerminal,
      duplicatesSkipped: c.duplicatesSkipped,
      refinedPaths: c.refinedPaths,
      intermediatesRecovered: c.intermediatesRecovered,
      legacyRetried: c.legacyRetried,
      rebuilds: [...this.rebuilds],
      pauseReason: this.pauseReason,
      lastError: this.lastError,
      runComplete: this.isRunComplete(),
    };
  }

  // ------------------------------------------------------------------ private

  private enqueueRoot(rootPath: string): void {
    const key = normalizeNodePath(this.opts.baseUrl, rootPath);
    if (this.seenKeys.has(key)) return;
    this.seenKeys.add(key);
    const slug = key.replace(/^\//, '');
    const isSiteRoot = key === SITE_ROOT;
    const known = isSiteRoot ? [] : this.opts.corpus.knownPath(slug);
    this.targets.push({
      key,
      slug,
      label: known && known.length > 0 ? known[known.length - 1] : slug,
      expectedPath: known,
      make: known && known.length > 0 ? known[0] : null,
      depth: known ? known.length : null,
      parentKey: null,
      origin: 'ROOT',
      status: 'PENDING',
      outcome: null,
      attempts: 0,
      savedFile: null,
      evidenceFile: null,
      breadcrumb: null,
      childrenDeclared: null,
      terminal: null,
      navResultCount: null,
      lastError: null,
      updatedAt: this.stamp(),
    });
  }

  private capture(target: StructureTarget): AutopilotDirective {
    return {
      type: 'CAPTURE_PAGE',
      runId: this.opts.runId,
      targetKey: target.key,
      url: buildCategoryUrl(this.opts.baseUrl, target.key),
      label: target.label,
      expectedPath: target.expectedPath ? [...target.expectedPath] : null,
      delayMs: this.nextDelay(),
    };
  }

  /** Muhafazakar tempo: temel sure +- jitter. Rastgele "insan taklidi" degil, sadece duzensiz aralik. */
  private nextDelay(): number {
    const spread = (this.random() * 2 - 1) * this.jitter;
    return Math.max(1000, Math.round(this.paceMs * (1 + spread)));
  }

  private wait(delayMs: number, reason: string): AutopilotDirective {
    return { type: 'WAIT', runId: this.opts.runId, delayMs, reason };
  }

  private halt(state: AutopilotState, reason: string): AutopilotDirective {
    return { type: 'HALT', runId: this.opts.runId, state, reason };
  }

  private pendingCount(): number {
    return this.targets.filter((t) => t.status === 'PENDING').length;
  }

  private requireRun(runId: string): void {
    if (runId !== this.opts.runId)
      throw new AutopilotProtocolError(`Unknown runId "${runId}"`);
  }

  private requireInProgress(targetKey: string): StructureTarget {
    const key = normalizeNodePath(this.opts.baseUrl, targetKey);
    const target = this.targets.find((t) => t.key === key);
    if (!target)
      throw new AutopilotProtocolError(`Unknown target "${targetKey}"`);
    if (target.status !== 'IN_PROGRESS') {
      throw new AutopilotProtocolError(
        `Target "${target.key}" is ${target.status}; a capture is only accepted for the target issued by /next`,
      );
    }
    return target;
  }

  private writeEvidence(
    kind: string,
    target: StructureTarget,
    html: string,
  ): string {
    const dir = path.join(this.opts.runDir, 'evidence', kind);
    fs.mkdirSync(dir, { recursive: true });
    this.evidenceSeq += 1;
    const stamp = new Date(this.now()).toISOString().replace(/[:.]/g, '-');
    const safeSlug = target.slug.replace(/[^a-z0-9._-]+/gi, '-').slice(0, 80);
    const file = path.join(
      dir,
      `${stamp}-${String(this.evidenceSeq).padStart(4, '0')}-${safeSlug}.html`,
    );
    fs.writeFileSync(file, String(html || ''), 'utf-8');
    return file;
  }

  private appendCaptureLog(
    target: StructureTarget,
    capture: PageCapture,
    page: PageClassification,
    outcome: CaptureOutcome,
    expansion: { declared: number; enqueued: number; known: number } | null,
    evidenceFile: string | null = null,
  ): void {
    const line = {
      at: new Date(this.now()).toISOString(),
      runId: this.opts.runId,
      key: target.key,
      expectedPath: target.expectedPath,
      finalUrl: capture.finalUrl,
      title: capture.title,
      pageStatus: page.status,
      breadcrumb: page.breadcrumb,
      outcome,
      savedFile: target.savedFile,
      evidenceFile,
      childrenDeclared: expansion ? expansion.declared : null,
      childrenEnqueued: expansion ? expansion.enqueued : null,
      rowsOnPage: page.rows.length,
      bytes: String(capture.html || '').length,
    };
    try {
      fs.mkdirSync(this.opts.runDir, { recursive: true });
      fs.appendFileSync(
        path.join(this.opts.runDir, 'captures.jsonl'),
        JSON.stringify(line) + '\n',
        'utf-8',
      );
    } catch (err) {
      this.log(`capture log write failed: ${describeError(err)}`);
    }
  }

  private stamp(): string {
    this.updatedAt = new Date(this.now()).toISOString();
    return this.updatedAt;
  }

  private persist(): void {
    this.stamp();
    const payload: StructureCheckpointPayload = {
      version: STRUCTURE_VERSION,
      mode: 'STRUCTURE',
      runId: this.opts.runId,
      source: this.opts.source,
      baseUrl: this.opts.baseUrl,
      state: this.state,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      roots: this.roots,
      targets: this.targets,
      seenKeys: [...this.seenKeys],
      counters: this.counters,
      pauseReason: this.pauseReason,
      lastError: this.lastError,
      lastSuccessKey: this.lastSuccessKey,
      lastSuccessAt: this.lastSuccessAt,
      lastSavedFile: this.lastSavedFile,
      rebuilds: this.rebuilds,
      sinceRebuild: this.sinceRebuild,
      deadlineAtMs: this.deadlineAtMs,
      corpusRoot: this.opts.corpus.root,
    };
    this.opts.checkpointFile.save(payload);
    try {
      fs.mkdirSync(this.opts.runDir, { recursive: true });
      fs.writeFileSync(
        path.join(this.opts.runDir, 'report.json'),
        JSON.stringify(this.report(), null, 2),
        'utf-8',
      );
    } catch (err) {
      this.log(`report write failed: ${describeError(err)}`);
    }
  }
}

/**
 * Sayfanin KENDI kategori yolu: breadcrumb'in son baglantisi. Etiketten slug
 * turetmek yerine kaynagin yazdigi href okunur; kimlik kontrolu buna dayanir.
 * (Ayristiricinin `extractOwnPath`i — tek okuma yolu.)
 */
export function ownPathOf(html: string): string | null {
  return extractOwnPath(html);
}

function samePath(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

/**
 * Etiket esitligi icin Turkce duyarli katlama. YALNIZCA karsilastirma icindir;
 * kaydedilen yol ve dosya adi daima KAYNAGIN yazdigi casing'i tasir.
 */
export function foldLabel(value: string): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('tr');
}

function samePathFolded(a: string[], b: string[]): boolean {
  return (
    a.length === b.length && a.every((s, i) => foldLabel(s) === foldLabel(b[i]))
  );
}

/**
 * GUVENLI INCELTME: beklenen yol ile gercek breadcrumb AYNI DALDA, gercek DAHA
 * DERIN, SON ETIKET AYNI (Turkce katlamayla) ve fark yalnizca araya giren bir
 * ya da daha fazla ara seviye. Baska dal, yeniden adlandirilmis son etiket ya
 * da ayni derinlikte farkli etiket inceltme DEGILDIR.
 *
 *   Cupra / Leon / Impulse  ->  Cupra / Leon / 1.5 eTSI / Impulse   KABUL
 *   A / B / Trim            ->  A / C / Engine / Trim               RED (baska dal)
 *   A / B / Trim            ->  A / B / Engine / NewTrim            RED (son etiket)
 *   Zorlu / Kartal          ->  Zorlu / Kartal Yeni                 RED (derin degil)
 */
export function isSafeRefinement(
  expected: string[],
  actual: string[],
): boolean {
  if (!expected || !actual) return false;
  if (expected.length < 2 || actual.length <= expected.length) return false;
  const parent = expected.slice(0, -1);
  if (!samePathFolded(actual.slice(0, parent.length), parent)) return false;
  if (
    foldLabel(actual[actual.length - 1]) !==
    foldLabel(expected[expected.length - 1])
  ) {
    return false;
  }
  const inserted = actual.slice(parent.length, -1);
  return inserted.length >= 1 && inserted.every((s) => foldLabel(s).length > 0);
}

/** Torun hedefi: breadcrumb kesin ata zincirinin altinda ve son etiket ayni mi. */
export function isUnderExpectedPrefix(
  prefix: string[],
  actual: string[],
  lastLabel: string,
): boolean {
  if (actual.length <= prefix.length) return false;
  if (!samePathFolded(actual.slice(0, prefix.length), prefix)) return false;
  return foldLabel(actual[actual.length - 1]) === foldLabel(lastLabel);
}

export interface PathVerdict {
  ok: boolean;
  /** Kabul edildi ama beklenti breadcrumb'a cekildi (araya seviye girdi). */
  refined: boolean;
  reason: string;
}

/**
 * Hedefin beklentisiyle sayfanin breadcrumb'ini karsilastirir. Sayfanin
 * KENDI URL'inin istenen URL ile ayni oldugu ONCEDEN dogrulanmis olmalidir;
 * burasi yalnizca dal/etiket tutarliligina bakar.
 */
export function verifyExpectedPath(
  target: Pick<StructureTarget, 'expectedPath' | 'expectedPrefix' | 'label'>,
  chain: string[],
): PathVerdict {
  const expected = target.expectedPath;
  if (expected && expected.length > 0) {
    if (samePath(chain, expected))
      return { ok: true, refined: false, reason: 'exact' };
    if (samePathFolded(chain, expected)) {
      return {
        ok: true,
        refined: false,
        reason: 'exact (casing follows the source)',
      };
    }
    if (isSafeRefinement(expected, chain)) {
      return {
        ok: true,
        refined: true,
        reason: 'intermediate level(s) inserted by the source',
      };
    }
    return {
      ok: false,
      refined: false,
      reason: `breadcrumb "${chain.join(' / ')}" differs from expected "${expected.join(' / ')}"`,
    };
  }
  const prefix = target.expectedPrefix;
  if (prefix && prefix.length > 0) {
    if (isUnderExpectedPrefix(prefix, chain, target.label)) {
      return {
        ok: true,
        refined: true,
        reason: 'descendant resolved under its expected ancestor',
      };
    }
    return {
      ok: false,
      refined: false,
      reason:
        `breadcrumb "${chain.join(' / ')}" is not "${target.label}" under expected ancestor ` +
        `"${prefix.join(' / ')}"`,
    };
  }
  return { ok: true, refined: false, reason: 'no expectation' };
}

const LEGACY_BREADCRUMB_DIFF =
  /^REDIRECT_MISMATCH: breadcrumb "(.+)" differs from expected "(.+)"$/;
const LEGACY_OWN_SLUG =
  /^REDIRECT_MISMATCH: requested \S+ but the page declares itself as /;

/** Gercek kanonik uyusmazlik: sayfa istenen URL'den BASKA bir URL oldugunu soyledi. */
export function isOwnSlugMismatch(
  target: Pick<StructureTarget, 'lastError'>,
): boolean {
  return LEGACY_OWN_SLUG.test(String(target.lastError ?? ''));
}

/**
 * Eski checkpoint'teki FAILED hedef, guvenli inceltme kuraliyla yeniden
 * denenebilir mi. Yalnizca "breadcrumb differs from expected" sinifi VE
 * yapisal olarak ayni dal + ayni son etiket + araya giren seviye. Kanonik
 * ("requested X but the page declares itself as Y") uyusmazlik ASLA acilmaz.
 */
export function isRetryableLegacyBreadcrumbMismatch(
  target: Pick<StructureTarget, 'status' | 'outcome' | 'lastError'>,
): boolean {
  if (target.status !== 'FAILED' || target.outcome !== 'REDIRECT_MISMATCH')
    return false;
  const m = LEGACY_BREADCRUMB_DIFF.exec(String(target.lastError ?? ''));
  if (!m) return false;
  return isSafeRefinement(m[2].split(' / '), m[1].split(' / '));
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
