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
 *   - Kaynagin ACIK "bulunamadi" sayfasi ayristirici hatasi DEGILDIR: kanit
 *     tutulur, hedef kaynakta-yok (FAILED/NOT_FOUND) olur, korpusa yazilmaz,
 *     cocuk acilmaz, kosu SURER. Bilinmeyen HTML yine DURDURUR.
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
  StructureTiming,
} from './autopilot-contracts';
import { AtomicChecksummedFile } from '../checkpoint-store';
import { buildCategoryUrl, normalizeNodePath } from './source-url';
import { CorpusEvidence, CorpusStore } from './corpus-store';
import { RebuildResult, RebuildRunner } from './rebuild-runner';
import {
  LightGateFinding,
  LightGateReport,
  runLightStructureGate,
} from './structure-light-gate';
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

/**
 * KAPI KADANSI — OLCUME DAYALI VARSAYILANLAR (structure-2026-09).
 *
 *   131 tam yeniden kurma x ort. 192 s = 7.0 saat = aktif surenin %37'si.
 *   Sayfa basina alim dongusu (5000 ms tempo ile) ort. 6.4 s.
 *
 * Hafif kapi 50 sayfada bir kosar (bellek ici, ~100 ms / 8.5k hedef).
 * Tam kapi 400 sayfada bir YA DA 40 dakikada bir (hangisi once). Uzlastirici
 * duzeltmesi sonrasi tam kurma ~2 dk; 6500 kaydedilmis sayfada ~17 tam kapi
 * ~35 dk eder (%7). 250'de %11, 500'de %6 — 400, "en fazla ~25 dk dogrulanmamis
 * ilerleme" ile "kapi maliyeti" arasindaki secimdir; CLI'dan degistirilebilir.
 * Kosu sonu tam kapisi ZORUNLUDUR ve kapatilamaz.
 */
export const DEFAULT_LIGHT_CHECK_EVERY = 50;
export const DEFAULT_FULL_REBUILD_EVERY = 400;
export const DEFAULT_FULL_REBUILD_INTERVAL_MS = 40 * 60_000;
/** Checkpoint'te tutulan hafif kapi kaydi sayisi (dosya buyumesin). */
const LIGHT_GATE_HISTORY = 100;
/** ETA icin son N kaydedilmis sayfa dongusu. */
const CYCLE_WINDOW = 200;
/** Bir dongu bundan uzunsa kesinti sayilir ve ortalamaya girmez. */
const CYCLE_IDLE_MS = 15 * 60_000;
/** Rapor dosyasi en fazla bu siklikta yazilir (checkpoint HER basarida). */
const REPORT_THROTTLE_MS = 5_000;

export type PaceMode = 'SAFE' | 'OVERNIGHT';
export type StructureMode = 'FULL' | 'INCREMENTAL';

/**
 * TEMPO ON AYARLARI. Mevcut sert alt sinir (1000 ms) korunur; OVERNIGHT bunu
 * asagi cekmez, yalnizca temel araligi olcume dayali olarak kisaltir:
 * 6565 yakalama x (5000 ms tempo) = 11.7 saat alim; 2200 ms ile ~6.6 saat.
 * Kaynak bozulunca (yonlendirme/yok/yavaslama) geri cekilme carpani devreye girer.
 */
export const PACE_PRESETS: Record<PaceMode, { paceMs: number; jitter: number }> = {
  SAFE: { paceMs: 5000, jitter: 0.4 },
  OVERNIGHT: { paceMs: 2200, jitter: 0.3 },
};

/** Geri cekilme: basarisizlikta x1.5 (en fazla x4), 10 ardisik basaridan sonra x0.8 ile toparlanir. */
export const BACKOFF = {
  factor: 1.5,
  maxMultiplier: 4,
  recoverAfter: 10,
  recoverFactor: 0.8,
  /** Yakalama gidis-donusu, son 20'nin medyaninin bu kati VE en az 5 s ise "yavas" sayilir. */
  slowFactor: 2,
  slowFloorMs: 5000,
};

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
  /**
   * Kaynagin ACIK "bulunamadi" sayfasinin kanit kopyasi (kosu kanit dizini,
   * korpus DEGIL). Ebeveyn menusu bu hedefi ilan etti (parentKey/expectedPath
   * kalir), canli kaynak ise sayfanin olmadigini soyledi: iki olgu birlikte
   * yapisal kayma kanitidir. Eski checkpoint'lerde alan yoktur.
   */
  notFoundEvidence?: string | null;
  /**
   * Sayfanin KENDI kategori yolu (breadcrumb'in son href'i) — cekilen ve
   * korpustan karsilanan hedefte ayni sekilde kaydedilir; hafif kapi bunu
   * anahtarla karsilastirir. Eski checkpoint'lerde alan yoktur.
   */
  ownPath?: string | null;
  /**
   * INCREMENTAL: korpusta var ama bayat sayildi; yeniden cekilip korpus
   * kanitiyla KARSILASTIRILACAK (kopya yazilmaz). Karsilastirma tabani asagida.
   */
  reverify?: {
    evidenceFile: string;
    breadcrumb: string[];
    /** Korpus kanitinin dogrudan cocuk slug'lari (sirali). */
    childSlugs: string[];
  } | null;
  /** DRIFT sonucu: neyin degistigi. */
  driftKind?: DriftKind | null;
}

export type DriftKind =
  | 'CHILDREN_CHANGED'
  | 'BREADCRUMB_CHANGED'
  | 'REDIRECT_MISMATCH'
  | 'NOT_FOUND';

/** Kaynak kaymasi kaydi — drift-registry.json satiri. Tarihce SILINMEZ. */
export interface DriftRecord {
  key: string;
  kind: DriftKind;
  expectedPath: string[] | null;
  observedPath: string[] | null;
  before: string[] | null;
  after: string[] | null;
  evidenceFile: string | null;
  at: string;
  detail: string | null;
}

export interface LightGateRecord {
  at: string;
  ok: boolean;
  targetsChecked: number;
  waveSize: number;
  durationMs: number;
  findings: LightGateFinding[];
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
  /** Kaynagin acikca "yok" dedigi hedefler (canli + karantinadan gocen). */
  notFound: number;
  /** INCREMENTAL: yeniden cekilip korpusla AYNI cikan bayat sayfalar. */
  reverified: number;
  /** INCREMENTAL: yeniden cekilip korpustan FARKLI cikan sayfalar (kayma). */
  driftDetected: number;
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
  // ---- V2 (eski checkpoint'lerde yoktur; devam ederken varsayilanla dolar) ----
  structureMode?: StructureMode;
  lightChecks?: LightGateRecord[];
  lightGateCount?: number;
  sinceLightCheck?: number;
  lastFullRebuildAtMs?: number | null;
  timing?: StructureTiming;
  recentCycleMs?: number[];
  paceMultiplier?: number;
  successStreak?: number;
  drift?: DriftRecord[];
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
  /**
   * TAM KAPI: bu kadar sayfa kaydedildikten sonra yeniden kur + dogrula.
   * 0 = hic (yalnizca test/kuru kosu; kosu sonu kapisi da kapanir, YAYIN YOK).
   */
  rebuildEvery?: number;
  /** TAM KAPI sure esigi (ms): son tam kapidan bu kadar gecti VE yeni sayfa var. null = kapali. */
  fullRebuildIntervalMs?: number | null;
  rebuild?: RebuildRunner | null;
  /** HAFIF KAPI: bu kadar kabul edilmis sayfada bir bellek ici denetim. 0 = kapali. */
  lightCheckEvery?: number;
  /** Adimlar arasi temel bekleme ve jitter orani (0..1). Verilmezse paceMode on ayari. */
  paceMs?: number;
  jitter?: number;
  paceMode?: PaceMode;
  /**
   * INCREMENTAL: korpusta bulunan ama bu kadar gunden eski VE cocuklu (terminal
   * olmayan) sayfalar yeniden cekilip karsilastirilir. null = hicbir mevcut
   * sayfa yeniden cekilmez (FULL ile ayni yerel davranis).
   */
  structureMode?: StructureMode;
  staleDays?: number | null;
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
  notFound: number;
  rebuilds: RebuildRecord[];
  pauseReason: string | null;
  lastError: string | null;
  runComplete: boolean;
  // ---- V2 ----
  structureMode: StructureMode;
  paceMode: PaceMode;
  paceMs: number;
  lightCheckEvery: number;
  lightGates: number;
  lightGateFailures: number;
  fullRebuildEvery: number;
  fullRebuildIntervalMs: number | null;
  reverified: number;
  driftDetected: number;
  driftRecords: number;
  timing: StructureTiming;
  estimatedRemainingMs: number | null;
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
    notFound: 0,
    reverified: 0,
    driftDetected: 0,
  };
}

function emptyTiming(): StructureTiming {
  return {
    captureRoundTripMs: 0,
    captures: 0,
    corpusScanMs: 0,
    corpusScans: 0,
    lightGateMs: 0,
    fullGateMs: 0,
    persistMs: 0,
    persists: 0,
    avgCycleMs: null,
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
  private readonly fullRebuildIntervalMs: number | null;
  private readonly lightCheckEvery: number;
  private readonly paceMode: PaceMode;
  private readonly paceMs: number;
  private readonly jitter: number;
  private readonly structureMode: StructureMode;
  private readonly staleDays: number | null;
  // ---- V2 durumu ----
  private lightChecks: LightGateRecord[] = [];
  private lightGateCount = 0;
  private lightGateFailures = 0;
  private sinceLightCheck = 0;
  private lastFullRebuildAtMs: number | null = null;
  private timing: StructureTiming = emptyTiming();
  private recentCycleMs: number[] = [];
  private lastSavedAtMs: number | null = null;
  private paceMultiplier = 1;
  private successStreak = 0;
  private drift: DriftRecord[] = [];
  /** Yonerge verilen hedef -> verildigi an (gidis-donus olcumu; devamda sifirlanir). */
  private issuedAtMs = new Map<string, number>();
  private recentRoundTrips: number[] = [];
  private lastReportAtMs = 0;
  private lastDriftWritten = 0;

  private constructor(private readonly opts: StructureSessionOptions) {
    this.now = opts.now || (() => Date.now());
    this.random = opts.random || Math.random;
    this.log = opts.log || (() => undefined);
    // Kosu saati tek kaynaktan: sure esikleri createdAt'e gore olculur.
    this.createdAt = new Date(this.now()).toISOString();
    this.updatedAt = this.createdAt;
    this.deadlineAtMs = opts.deadlineAtMs ?? null;
    this.maxPages = opts.maxPages ?? null;
    this.rebuildEvery = Math.max(0, Math.floor(opts.rebuildEvery ?? 0));
    this.fullRebuildIntervalMs =
      opts.fullRebuildIntervalMs === undefined || opts.fullRebuildIntervalMs === null
        ? null
        : Math.max(60_000, Math.floor(opts.fullRebuildIntervalMs));
    this.lightCheckEvery = Math.max(0, Math.floor(opts.lightCheckEvery ?? DEFAULT_LIGHT_CHECK_EVERY));
    this.paceMode = opts.paceMode ?? 'SAFE';
    const preset = PACE_PRESETS[this.paceMode];
    // Sert alt sinir 1000 ms hicbir modda asagi cekilmez.
    this.paceMs = Math.max(1000, Math.floor(opts.paceMs ?? preset.paceMs));
    this.jitter = Math.min(0.9, Math.max(0, opts.jitter ?? preset.jitter));
    this.structureMode = opts.structureMode ?? 'FULL';
    this.staleDays =
      this.structureMode === 'INCREMENTAL' &&
      opts.staleDays !== undefined &&
      opts.staleDays !== null &&
      opts.staleDays >= 0
        ? Math.floor(opts.staleDays)
        : null;
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
    // V2 alanlari: eski checkpoint'te yoksa sifirdan baslar (davranis degismez).
    session.lightChecks = [...(payload.lightChecks || [])];
    session.lightGateCount = payload.lightGateCount || 0;
    session.lightGateFailures = session.lightChecks.filter((g) => !g.ok).length;
    session.sinceLightCheck = payload.sinceLightCheck || 0;
    session.lastFullRebuildAtMs = payload.lastFullRebuildAtMs ?? null;
    session.timing = { ...emptyTiming(), ...(payload.timing || {}) };
    session.recentCycleMs = [...(payload.recentCycleMs || [])];
    session.paceMultiplier = payload.paceMultiplier || 1;
    session.successStreak = payload.successStreak || 0;
    session.drift = [...(payload.drift || [])];

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
      /**
       * ESKI KOSUDAN KALAN "BILINMEYEN BICIM" ASLINDA KAYNAGIN BULUNAMADI
       * SAYFASIYSA: karantina kanitindan gocur, yeniden istemeden devam et.
       * (Onceki ayristirici bu sayfayi tanimiyordu; simdiki taniyor.)
       */
      if (session.migrateQuarantinedNotFound(target)) continue;
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
    /**
     * HAFIF KAPI ONCE: ucuz ve bellek ici; dusen dalga tam kurmaya gitmeden
     * durur. Sonra (gerekiyorsa) tam kapi.
     */
    if (this.lightCheckDue()) {
      const halted = this.runLightGate(false);
      if (halted) return halted;
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
      const scanStarted = this.now();
      const evidence = this.opts.corpus.present(target);
      this.timing.corpusScanMs += Math.max(0, this.now() - scanStarted);
      this.timing.corpusScans += 1;
      if (evidence && !this.wantsReverify(target, evidence)) {
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
      if (evidence) this.markForReverify(target, evidence);
      else if (target.origin === 'NAV') this.counters.discoveredMissing += 1;
      target.status = 'IN_PROGRESS';
      target.attempts += 1;
      target.updatedAt = this.stamp();
      this.persist();
      return this.capture(target);
    }
  }

  // ------------------------------------------------------------ light gate

  private lightCheckDue(): boolean {
    return this.lightCheckEvery > 0 && this.sinceLightCheck >= this.lightCheckEvery;
  }

  /**
   * Bellek ici yapi denetimi. Dusuyorsa kosu ERROR ile durur ve HALT doner;
   * geciyorsa null doner ve toplama surer. Kapi hicbir sey YAYINLAMAZ.
   */
  private runLightGate(final: boolean): AutopilotDirective | null {
    const report: LightGateReport = runLightStructureGate({
      targets: this.targets,
      siteRootKey: SITE_ROOT,
      waveSize: this.sinceLightCheck,
      now: this.now,
    });
    this.timing.lightGateMs += report.durationMs;
    this.lightGateCount += 1;
    this.lightChecks.push({
      at: report.checkedAt,
      ok: report.ok,
      targetsChecked: report.targetsChecked,
      waveSize: report.waveSize,
      durationMs: report.durationMs,
      findings: report.findings.slice(0, 50),
    });
    if (this.lightChecks.length > LIGHT_GATE_HISTORY) {
      this.lightChecks.splice(0, this.lightChecks.length - LIGHT_GATE_HISTORY);
    }
    this.sinceLightCheck = 0;
    if (report.ok) {
      this.log(
        `LIGHT GATE ${final ? '(final) ' : ''}PASS: ${report.targetsChecked} target(s), ` +
          `wave ${report.waveSize}, ${report.durationMs} ms`,
      );
      this.persist();
      return null;
    }
    this.lightGateFailures += 1;
    const summary = report.findings
      .slice(0, 5)
      .map((f) => `${f.kind} ${f.key}: ${f.detail}`)
      .join(' | ');
    this.state = 'ERROR';
    this.pauseReason =
      `LIGHT_GATE_FAIL (${report.findings.length} finding(s) over ${report.targetsChecked} target(s)): ${summary}. ` +
      'Collection stopped before the wave could spread; inspect the checkpoint/evidence, fix, then RESUME.';
    this.lastError = this.pauseReason;
    this.log(`LIGHT GATE FAIL: ${summary}`);
    this.persist();
    return this.halt('ERROR', this.pauseReason);
  }

  // ----------------------------------------------------- incremental refresh

  /**
   * INCREMENTAL + staleDays: korpustaki sayfa cocuklu (terminal degil) VE
   * dosyasi bayatsa yeniden cekilir. Terminal sayfalar yeniden cekilmez
   * (menuleri bos; degisim ancak ebeveynden gorulur). Site koku her zaman
   * yerelden karsilanir.
   */
  private wantsReverify(target: StructureTarget, evidence: CorpusEvidence): boolean {
    if (this.staleDays === null || target.key === SITE_ROOT) return false;
    const page = evidence.page;
    const own = page.ownPath ? page.ownPath.slice(1) : null;
    if (!own || !page.breadcrumb) return false;
    const split = splitNavChildren(page.navChildren ?? [], own, page.breadcrumb.length);
    if (split.direct.length === 0 && split.deeper.length === 0) return false;
    let mtimeMs: number;
    try {
      mtimeMs = fs.statSync(evidence.file).mtimeMs;
    } catch {
      return false;
    }
    return this.now() - mtimeMs >= this.staleDays * 86_400_000;
  }

  private markForReverify(target: StructureTarget, evidence: CorpusEvidence): void {
    const page = evidence.page;
    const chain = page.breadcrumb ?? [];
    const own = page.ownPath ? page.ownPath.slice(1) : '';
    const split = splitNavChildren(page.navChildren ?? [], own, chain.length);
    target.reverify = {
      evidenceFile: evidence.file,
      breadcrumb: [...chain],
      childSlugs: [...split.direct, ...split.deeper].map((c) => c.slug).sort(),
    };
    target.expectedPath = [...chain];
    target.expectedPrefix = null;
    target.evidenceFile = evidence.file;
    this.log(`REVERIFY ${target.key}: corpus evidence older than ${this.staleDays} day(s); refetching to compare`);
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
    this.recordRoundTrip(target);

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
      case 'NOT_FOUND_PAGE':
        return this.failNotFound(target, capture, page, base);
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
    target.ownPath = own;

    // INCREMENTAL yeniden dogrulama: korpus ezilmez, fark kayma olarak kaydedilir.
    if (target.reverify) return this.acceptReverified(target, capture, page, base, chain, own, html);

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
    this.noteSuccess();
    this.sinceRebuild += 1;
    this.sinceLightCheck += 1;
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

  /**
   * YENIDEN DOGRULAMA SONUCU (INCREMENTAL).
   *
   * Ayni breadcrumb + ayni dogrudan cocuk kumesi -> REVERIFIED: korpusa kopya
   * yazilmaz, kesif taze menuden surer, hedef COMPLETE. Cocuk kumesi degisti
   * -> DRIFT (CHILDREN_CHANGED): kanit kosu dizinine yazilir, kayit deftere
   * girer, hedef yine COMPLETE ve cocuklar TAZE menuden acilir (yeni cocuklar
   * korpusta yoksa cekilir). Breadcrumb degisti -> DRIFT (BREADCRUMB_CHANGED):
   * ebeveyn yolu artik bilinmiyor; cocuk ACILMAZ, hedef FAILED — insan baksin.
   * Hicbir durumda korpus dosyasi silinmez ya da ezilmez.
   */
  private acceptReverified(
    target: StructureTarget,
    capture: PageCapture,
    page: PageClassification,
    base: Omit<PageCaptureResult, 'outcome'>,
    chain: string[],
    own: string,
    html: string,
  ): PageCaptureResult {
    const basis = target.reverify!;
    const split = splitNavChildren(page.navChildren ?? [], own.slice(1), chain.length);
    const freshSlugs = [...split.direct, ...split.deeper].map((c) => c.slug).sort();
    const sameChain = samePath(chain, basis.breadcrumb);
    const sameChildren = freshSlugs.join('\n') === basis.childSlugs.join('\n');
    target.breadcrumb = [...chain];
    target.make = chain[0];
    target.depth = chain.length;
    target.updatedAt = this.stamp();
    target.reverify = null;

    if (sameChain && sameChildren) {
      target.status = 'COMPLETE';
      target.outcome = 'REVERIFIED';
      target.lastError = null;
      const expansion = this.expandChildren(target, page, own.slice(1));
      this.counters.reverified += 1;
      this.noteSuccess();
      this.appendCaptureLog(target, capture, page, 'REVERIFIED', expansion);
      this.log(`REVERIFIED ${chain.join(' / ')} (unchanged; +${expansion.enqueued} children, queue ${this.pendingCount()})`);
      this.persist();
      return { ...base, outcome: 'REVERIFIED', childrenDeclared: expansion.declared, childrenEnqueued: expansion.enqueued, childrenAlreadyKnown: expansion.known, terminal: target.terminal === true };
    }

    const evidence = this.writeEvidence('drift', target, html);
    const kind: DriftKind = sameChain ? 'CHILDREN_CHANGED' : 'BREADCRUMB_CHANGED';
    target.outcome = 'DRIFT';
    target.driftKind = kind;
    this.counters.driftDetected += 1;
    this.drift.push({
      key: target.key,
      kind,
      expectedPath: [...basis.breadcrumb],
      observedPath: [...chain],
      before: [...basis.childSlugs],
      after: freshSlugs,
      evidenceFile: evidence,
      at: target.updatedAt,
      detail: sameChain
        ? `direct children changed (${basis.childSlugs.length} -> ${freshSlugs.length}); corpus copy ${basis.evidenceFile}`
        : `breadcrumb changed from "${basis.breadcrumb.join(' / ')}" to "${chain.join(' / ')}"; corpus copy ${basis.evidenceFile}`,
    });

    if (sameChain) {
      target.status = 'COMPLETE';
      target.lastError = `DRIFT ${kind}`;
      const expansion = this.expandChildren(target, page, own.slice(1));
      this.noteSuccess();
      this.appendCaptureLog(target, capture, page, 'DRIFT', expansion, evidence);
      this.log(`DRIFT ${kind} ${target.key}: children ${basis.childSlugs.length} -> ${freshSlugs.length}; evidence ${evidence}; +${expansion.enqueued} children queued`);
      this.persist();
      return { ...base, outcome: 'DRIFT', childrenDeclared: expansion.declared, childrenEnqueued: expansion.enqueued, childrenAlreadyKnown: expansion.known, terminal: target.terminal === true };
    }

    target.status = 'FAILED';
    target.lastError = `DRIFT ${kind}: "${basis.breadcrumb.join(' / ')}" -> "${chain.join(' / ')}"`;
    this.counters.consecutiveFailures += 1;
    this.bumpBackoff('drift');
    this.appendCaptureLog(target, capture, page, 'DRIFT', null, evidence);
    this.log(`DRIFT ${kind} ${target.key}: ${target.lastError}; evidence ${evidence}; no children expanded`);
    const halted = this.haltIfTooManyFailures('DRIFT', target);
    this.persist();
    return halted
      ? { ...base, outcome: 'DRIFT', paused: true, pauseReason: halted }
      : { ...base, outcome: 'DRIFT' };
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
    // Torun beklentisi (kesin yol yok, ata oneki var): kesin yol diskteki sayfadan gelir.
    if (!isSiteRoot && !target.expectedPath && target.expectedPrefix && !samePath(chain, target.expectedPrefix)) {
      target.reconciledFrom = target.expectedPrefix.join(' / ');
      target.expectedPath = [...chain];
      target.expectedPrefix = null;
    }
    target.status = 'COMPLETE';
    target.outcome = 'ALREADY_PRESENT';
    target.evidenceFile = evidence.file;
    target.breadcrumb = [...chain];
    target.make = chain[0] ?? null;
    target.depth = chain.length;
    target.updatedAt = this.stamp();
    const own = page.ownPath;
    target.ownPath = isSiteRoot ? SITE_ROOT : (own ?? null);
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
    if (outcome === 'REDIRECT_MISMATCH') {
      this.counters.redirectMismatch += 1;
      this.drift.push({
        key: target.key,
        kind: 'REDIRECT_MISMATCH',
        expectedPath: target.expectedPath ?? target.expectedPrefix ?? null,
        observedPath: page.breadcrumb,
        before: null,
        after: null,
        evidenceFile: evidence,
        at: target.updatedAt,
        detail,
      });
    } else this.counters.noBreadcrumb += 1;
    this.counters.consecutiveFailures += 1;
    this.bumpBackoff(outcome);
    this.appendCaptureLog(target, capture, page, outcome, null, evidence);
    this.log(`FAIL ${outcome} at ${target.key}: ${detail}`);

    const halted = this.haltIfTooManyFailures(outcome, target);
    this.persist();
    return halted
      ? { ...base, outcome, paused: true, pauseReason: halted }
      : { ...base, outcome };
  }

  /**
   * Ardisik BASARISIZ hedef tavani (yonlendirme, breadcrumb'siz, vitrin,
   * kaynak "yok" dedi): tek tek olumcul degildir, ama arka arkaya gelmesi
   * kaynak yapisinin degistigini gosterebilir — dur, kanit dosyalarina bak,
   * sonra devam et. Devam sayaci sifirlar (resume).
   */
  private haltIfTooManyFailures(
    outcome: CaptureOutcome,
    target: StructureTarget,
  ): string | null {
    if (this.counters.consecutiveFailures < MAX_CONSECUTIVE_FAILURES)
      return null;
    this.state = 'ERROR';
    this.pauseReason =
      `${MAX_CONSECUTIVE_FAILURES} consecutive failures (last: ${outcome} at ${target.key}). ` +
      'The source structure may have changed; inspect the evidence files, then RESUME.';
    this.lastError = this.pauseReason;
    return this.pauseReason;
  }

  /**
   * KAYNAK ACIKCA "YOK" DEDI — HEDEF KAYBI, AYRISTIRICI HATASI DEGIL.
   *
   * Ebeveyn menusu bu hedefi ilan etti; canli kaynak ise bilinen bulunamadi
   * sayfasini dondurdu. Iki olgu da KORUNUR: hedef, ebeveyn anahtari ve
   * beklenen yol checkpoint'te kalir (ilan edildi), kanit kopyasi
   * evidence/not-found/ altina yazilir (kaynak yok dedi). Korpusa HICBIR SEY
   * yazilmaz; breadcrumb ya da cocuk UYDURULMAZ; ebeveyne birlestirilmez;
   * yerine slug turetilmez; ebeveynin ilanlari hedefe sayilmaz. Ayristirici
   * sayaci artmaz ve kosu DURMAZ: sonraki hedefe gecilir. Hedef bu kosu icin
   * kalici FAILED/NOT_FOUND'dur (yeniden istenmez) ve kosu sonu COMPLETE
   * degil INCOMPLETE olur — kaynagin sildigi kategori fiyatlanabilir
   * sayilmaz. Arka arkaya cok sayida "yok" yine ardisik-basarisizlik tavanina
   * takilir: kaynak yapisi degismis olabilir, insan baksin.
   */
  private failNotFound(
    target: StructureTarget,
    capture: PageCapture,
    page: PageClassification,
    base: Omit<PageCaptureResult, 'outcome'>,
  ): PageCaptureResult {
    const evidence = this.writeEvidence('not-found', target, capture.html);
    this.markNotFound(target, evidence);
    this.counters.consecutiveFailures += 1;
    this.bumpBackoff('NOT_FOUND');
    this.appendCaptureLog(target, capture, page, 'NOT_FOUND', null, evidence);
    const declared = (target.expectedPath ?? target.expectedPrefix ?? []).join(
      ' / ',
    );
    this.log(
      `NOT_FOUND ${target.key}: source explicitly reports the page unavailable ` +
        `(declared by ${target.parentKey ?? 'root'} as "${declared}"; ${page.detail ?? page.title}). ` +
        `Evidence kept, nothing saved, no child expansion; queue ${this.pendingCount()}`,
    );
    const halted = this.haltIfTooManyFailures('NOT_FOUND', target);
    this.persist();
    return halted
      ? { ...base, outcome: 'NOT_FOUND', paused: true, pauseReason: halted }
      : { ...base, outcome: 'NOT_FOUND' };
  }

  /** Canli yakalama ve eski karantina gocu icin ORTAK isaretleme. */
  private markNotFound(target: StructureTarget, evidence: string): void {
    target.status = 'FAILED';
    target.outcome = 'NOT_FOUND';
    target.lastError = notFoundDetail(target.key);
    target.notFoundEvidence = evidence;
    target.updatedAt = this.stamp();
    this.counters.notFound += 1;
    this.drift.push({
      key: target.key,
      kind: 'NOT_FOUND',
      expectedPath: target.expectedPath ?? target.expectedPrefix ?? null,
      observedPath: null,
      before: null,
      after: null,
      evidenceFile: evidence,
      at: target.updatedAt,
      detail: `declared by ${target.parentKey ?? 'root'}; source reports the page unavailable`,
    });
  }

  /**
   * ESKI CHECKPOINT GOCU — KARANTINADAKI KANIT ARTIK TANINIYOR MU.
   *
   * Eski ayristirici bulunamadi sayfasini UNKNOWN_HTML sayip hedefi BLOKE
   * etmisti. Devam ederken hedefin karantina kopyasi (dosya adi kaynagin kendi
   * kuralindan: <zaman>-<sira>-<slug>.html, en yenisi) bugunku ayristiriciyla
   * yeniden okunur. NOT_FOUND_PAGE cikarsa hedef yeniden ISTENMEDEN kalici
   * NOT_FOUND olur ve kosu surer. Baska bir sey cikarsa (gercekten bilinmeyen
   * bicim) eski yol degismez: deneme tavanina kadar bir sans daha. Goc
   * belirleyici ve idempotenttir: ikinci devamda hedef artik UNKNOWN_FORMAT
   * degildir, sayac tekrar artmaz. Karantina dosyasi yerinde kalir (tarihce);
   * checkpoint elle duzenlenmez, surum numarasi degismez.
   */
  private migrateQuarantinedNotFound(target: StructureTarget): boolean {
    if (target.outcome !== 'UNKNOWN_FORMAT') return false;
    if (target.status !== 'BLOCKED' && target.status !== 'FAILED') return false;
    const evidence = this.latestEvidenceFor('quarantine', target);
    if (!evidence) return false;
    let html: string;
    try {
      html = fs.readFileSync(evidence, 'utf-8');
    } catch (err) {
      this.log(
        `quarantine evidence unreadable for ${target.key}: ${describeError(err)}`,
      );
      return false;
    }
    const page = classifyPage(html, `${target.slug}.html`);
    if (page.status !== 'NOT_FOUND_PAGE') return false;
    target.reconciledFrom = target.lastError;
    this.markNotFound(target, evidence);
    this.log(
      `MIGRATED ${target.key}: quarantined copy is the source's explicit not-found page ` +
        `(${page.detail ?? page.title}); marked NOT_FOUND without another fetch. Evidence: ${evidence}`,
    );
    return true;
  }

  /** Bu hedefe ait EN YENI kanit dosyasi — ad kurali tam eslesir, onek/sonek karismaz. */
  private latestEvidenceFor(
    kind: string,
    target: StructureTarget,
  ): string | null {
    const dir = path.join(this.opts.runDir, 'evidence', kind);
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return null;
    }
    const pattern = new RegExp(
      `^\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z-\\d{4}-${escapeRegExp(evidenceSlug(target))}\\.html$`,
    );
    const matches = names.filter((n) => pattern.test(n)).sort();
    return matches.length > 0
      ? path.join(dir, matches[matches.length - 1])
      : null;
  }

  // ------------------------------------------------------------------ rebuild

  /**
   * TAM KAPI ZAMANI: sayfa esigi YA DA sure esigi (hangisi once). Sure esigi
   * yalnizca yeni kaydedilmis sayfa varken sayilir; bos bekleyis kapi acmaz.
   */
  private rebuildDue(): boolean {
    if (this.rebuildEvery <= 0 || !this.opts.rebuild || this.rebuildInFlight) return false;
    if (this.sinceRebuild >= this.rebuildEvery) return true;
    if (this.fullRebuildIntervalMs === null || this.sinceRebuild <= 0) return false;
    const since = this.lastFullRebuildAtMs ?? Date.parse(this.createdAt);
    return this.now() - since >= this.fullRebuildIntervalMs;
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
    this.lastFullRebuildAtMs = this.now();
    this.timing.fullGateMs += Math.max(
      0,
      Date.parse(result.finishedAt) - Date.parse(result.startedAt) || 0,
    );
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

  /**
   * Kuyruk bitti ya da sayfa butcesi doldu: once son hafif kapi (varsa yeni
   * sayfa), sonra (gerekliyse) ZORUNLU son tam kapi. Son hafif kapi gecmisse
   * bile yayin tam kapidan gecer; hafif kapi tek basina hicbir kosuyu kapatmaz.
   */
  private finish(): AutopilotDirective {
    if (this.lightCheckEvery > 0 && this.sinceLightCheck > 0) {
      const halted = this.runLightGate(true);
      if (halted) return halted;
    }
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
      notFound: this.counters.notFound,
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
      // ---- V2 ----
      structureMode: this.structureMode,
      paceMode: this.paceMode,
      paceMs: this.paceMs,
      paceMsCurrent: Math.round(this.paceMs * this.paceMultiplier),
      lightCheckEvery: this.lightCheckEvery,
      sinceLightCheck: this.sinceLightCheck,
      lightGates: this.lightGateCount,
      lastLightGate: this.lightChecks.length
        ? this.lightChecks[this.lightChecks.length - 1].ok
          ? 'PASS'
          : 'FAIL'
        : null,
      fullRebuildEvery: this.rebuildEvery,
      fullRebuildIntervalMs: this.fullRebuildIntervalMs,
      fullGates: this.rebuilds.length,
      reverified: this.counters.reverified,
      driftDetected: this.counters.driftDetected,
      timing: { ...this.timing, avgCycleMs: this.avgCycleMs() },
      estimatedRemainingMs: this.estimateRemainingMs(queued),
    };
  }

  // ------------------------------------------------------- pacing + timing

  /** Basari serisi: geri cekilme carpanini kademeli toparlar. */
  private noteSuccess(): void {
    this.counters.consecutiveFailures = 0;
    this.successStreak += 1;
    if (this.paceMultiplier > 1 && this.successStreak >= BACKOFF.recoverAfter) {
      this.paceMultiplier = Math.max(1, this.paceMultiplier * BACKOFF.recoverFactor);
      this.successStreak = 0;
      this.log(`PACE recover -> x${this.paceMultiplier.toFixed(2)} (${Math.round(this.paceMs * this.paceMultiplier)} ms)`);
    }
    this.recordCycle();
  }

  /**
   * Kaynak bozulma sinyali (yonlendirme, yok, breadcrumb'siz, kayma, yavas
   * yanit): tempo carpani buyur, sinirli. Guvenlik duvari burada DEGIL:
   * o, mevcut politika geregi kosuyu durdurur.
   */
  private bumpBackoff(reason: string): void {
    this.successStreak = 0;
    const next = Math.min(BACKOFF.maxMultiplier, this.paceMultiplier * BACKOFF.factor);
    if (next !== this.paceMultiplier) {
      this.paceMultiplier = next;
      this.log(`PACE backoff (${reason}) -> x${next.toFixed(2)} (${Math.round(this.paceMs * next)} ms)`);
    }
  }

  /** Yonerge -> yakalama gidis-donusu; medyanin cok ustunde ise yavaslama sinyali. */
  private recordRoundTrip(target: StructureTarget): void {
    const issued = this.issuedAtMs.get(target.key);
    this.issuedAtMs.delete(target.key);
    if (issued === undefined) return;
    const roundTrip = Math.max(0, this.now() - issued);
    this.timing.captureRoundTripMs += roundTrip;
    this.timing.captures += 1;
    const window = this.recentRoundTrips;
    if (window.length >= 20) {
      const sorted = [...window].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      if (roundTrip >= BACKOFF.slowFloorMs && roundTrip > median * BACKOFF.slowFactor) {
        this.bumpBackoff(`slow response ${roundTrip} ms vs median ${median} ms`);
      }
    }
    window.push(roundTrip);
    if (window.length > 20) window.shift();
  }

  /** Ardisik kaydedilmis sayfalar arasindaki dongu; kesinti ve kapi pencereleri disarida. */
  private recordCycle(): void {
    const at = this.now();
    if (this.lastSavedAtMs !== null) {
      const cycle = at - this.lastSavedAtMs;
      if (cycle > 0 && cycle < CYCLE_IDLE_MS) {
        this.recentCycleMs.push(cycle);
        if (this.recentCycleMs.length > CYCLE_WINDOW) this.recentCycleMs.shift();
      }
    }
    this.lastSavedAtMs = at;
  }

  private avgCycleMs(): number | null {
    if (this.recentCycleMs.length === 0) return null;
    return Math.round(this.recentCycleMs.reduce((a, b) => a + b, 0) / this.recentCycleMs.length);
  }

  /**
   * KABA TAHMIN: kuyruktaki her hedef cekilecek varsayilir (korpustan
   * karsilananlar tahmini kisaltir) + kalan tam kapilarin ortalama suresi.
   */
  private estimateRemainingMs(queued: number): number | null {
    const cycle = this.avgCycleMs();
    if (cycle === null || queued <= 0) return queued <= 0 ? 0 : null;
    let gates = 0;
    if (this.rebuildEvery > 0 && this.rebuilds.length > 0) {
      const avgGate = this.rebuilds.reduce(
        (sum, r) => sum + Math.max(0, Date.parse(r.finishedAt) - Date.parse(r.startedAt)),
        0,
      ) / this.rebuilds.length;
      gates = Math.ceil(queued / this.rebuildEvery) * avgGate;
    }
    return Math.round(queued * cycle + gates);
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
      notFound: c.notFound,
      rebuilds: [...this.rebuilds],
      pauseReason: this.pauseReason,
      lastError: this.lastError,
      runComplete: this.isRunComplete(),
      structureMode: this.structureMode,
      paceMode: this.paceMode,
      paceMs: this.paceMs,
      lightCheckEvery: this.lightCheckEvery,
      lightGates: this.lightGateCount,
      lightGateFailures: this.lightGateFailures,
      fullRebuildEvery: this.rebuildEvery,
      fullRebuildIntervalMs: this.fullRebuildIntervalMs,
      reverified: c.reverified,
      driftDetected: c.driftDetected,
      driftRecords: this.drift.length,
      timing: { ...this.timing, avgCycleMs: this.avgCycleMs() },
      estimatedRemainingMs: this.estimateRemainingMs(this.pendingCount()),
    };
  }

  /** Kaynak kaymasi defteri (yonlendirme, yok, cocuk/breadcrumb degisimi). */
  driftRegistry(): DriftRecord[] {
    return this.drift.map((record) => ({ ...record }));
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
    this.issuedAtMs.set(target.key, this.now());
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

  /**
   * Tempo: temel sure x geri cekilme carpani +- jitter. Rastgele "insan
   * taklidi" degil, sadece duzensiz aralik; sert alt sinir 1000 ms.
   */
  private nextDelay(): number {
    const spread = (this.random() * 2 - 1) * this.jitter;
    return Math.max(1000, Math.round(this.paceMs * this.paceMultiplier * (1 + spread)));
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
    const safeSlug = evidenceSlug(target);
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
    const started = this.now();
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
      structureMode: this.structureMode,
      lightChecks: this.lightChecks,
      lightGateCount: this.lightGateCount,
      sinceLightCheck: this.sinceLightCheck,
      lastFullRebuildAtMs: this.lastFullRebuildAtMs,
      timing: this.timing,
      recentCycleMs: this.recentCycleMs,
      paceMultiplier: this.paceMultiplier,
      successStreak: this.successStreak,
      drift: this.drift,
    };
    this.opts.checkpointFile.save(payload);
    /**
     * Rapor + kayma defteri insan icindir: durum degistiginde ya da en fazla
     * birkac saniyede bir yazilir (checkpoint ise HER basarida). Olculdu:
     * 8 MB'lik iki dosyayi her sayfada yazmak yalnizca G/C harcar.
     */
    const throttled =
      this.state === 'RUNNING' &&
      started - this.lastReportAtMs < REPORT_THROTTLE_MS &&
      this.drift.length === this.lastDriftWritten;
    if (!throttled) {
      this.lastReportAtMs = started;
      this.lastDriftWritten = this.drift.length;
      try {
        fs.mkdirSync(this.opts.runDir, { recursive: true });
        fs.writeFileSync(
          path.join(this.opts.runDir, 'report.json'),
          JSON.stringify(this.report(), null, 2),
          'utf-8',
        );
        fs.writeFileSync(
          path.join(this.opts.runDir, 'drift-registry.json'),
          JSON.stringify(
            { runId: this.opts.runId, updatedAt: this.updatedAt, records: this.drift },
            null,
            2,
          ),
          'utf-8',
        );
      } catch (err) {
        this.log(`report write failed: ${describeError(err)}`);
      }
    }
    this.timing.persistMs += Math.max(0, this.now() - started);
    this.timing.persists += 1;
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

/** Kanit dosyasi adi icin guvenli slug — yazma ve arama AYNI kurali kullanir. */
function evidenceSlug(target: Pick<StructureTarget, 'slug'>): string {
  return target.slug.replace(/[^a-z0-9._-]+/gi, '-').slice(0, 80);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Kaynagin acikca "yok" dedigi hedefin denetlenebilir aciklamasi (tam istenen anahtar). */
export function notFoundDetail(key: string): string {
  return `NOT_FOUND: source explicitly reports ${key} unavailable`;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
