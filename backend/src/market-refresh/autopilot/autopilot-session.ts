/**
 * AUTOPILOT KOSU OTURUMU — DAYANIKLI DURUM MAKINESI.
 *
 * Uzanti "ne yapayim?" diye sorar, tek adim uygular, gozlemi geri gonderir.
 * KARAR BURADA verilir. Boylece tarayici tarafinda checkpoint/tekillestirme/
 * bolumleme mantiginin ikinci (ve kacinilmaz olarak ayrisan) bir kopyasi olmaz.
 *
 * DEGISMEZLER:
 *   - HER sayfa paketinden SONRA checkpoint yazilir.
 *   - Sayfa sirasi KATIDIR (page === pagesDone + 1); tekrar/atlama reddedilir.
 *   - >1000 dugum ASLA toplanmaz; gercek cocuklara bolunur, yoksa SERT isaretlenir.
 *   - Sayim okunamadiysa dugum "kucuk" VARSAYILMAZ.
 *   - Erisim engelinde bypass denenmez: BLOKE + checkpoint + dur.
 *   - Snapshot DB'sine HICBIR yazma yapilmaz; staging JSONL'e yazilir.
 */
import {
  AccessRestrictionReport,
  AutopilotDirective,
  AutopilotProtocolError,
  AutopilotState,
  AutopilotStatus,
  DiscoveryReport,
  PageBatch,
  PageBatchResult,
  WorkItemView,
} from './autopilot-contracts';
import { AutopilotScope, sameScope, ScopeGuard, ScopeRejection } from './scope-guard';
import { extractReportedCount } from './count-text';
import { filterImmediateChildren, TaxonomyChild } from './taxonomy';
import { AtomicChecksummedFile } from '../checkpoint-store';
import { StagingStore } from '../staging-store';
import { RawObservedListing } from '../contracts';
import { parseTurkishNumber, parseYear } from '../extraction';
import { sourceCategoryText, splitSourceCategory } from '../sahibinden-extraction';
import { classifyCard, GlobalListingDeduper, ReferenceFingerprint } from '../known-fingerprint';
import { expectedPagesFor, LEAF_CAP } from '../source-partition';
import {
  AUTOPILOT_PAGE_SIZE,
  buildCategoryUrl,
  buildLeafPageUrl,
  MAX_CARDS_PER_PAGE,
  MAX_PAGES_PER_LEAF,
  normalizeNodePath,
} from './source-url';

/**
 * v2: v1 checkpoint'leri REDDEDILIR. v1 sayimi metinden yanlis okuyabiliyordu
 * ("A3" -> 3) ve o sayima dayanan bir kosuyu devam ettirmek yanlis siniflamayi
 * surdururdu. Yeni kosu ID'siyle bastan baslanir.
 */
export const AUTOPILOT_VERSION = 'autopilot-v2';

/**
 * Ozyineleme derinlik tavani. Kaynak kendi kendini isaret eden bir cocuk
 * verirse ziyaret kumesi zaten korur; bu tavan patolojik derin agaclarda
 * kosunun sonsuza kadar bolunmesini engeller.
 */
export const MAX_PARTITION_DEPTH = 8;

/** Bir dugumun kaynak-buyuklugune gore sinifi (sozlesme dili). */
export type NodeState =
  | 'PENDING_DISCOVERY'
  | 'SPLIT_REQUIRED'
  | 'COLLECTABLE_LEAF'
  | 'UNSPLITTABLE_OVERSIZED';

export interface DiscoveryOutcome {
  outcome: 'COLLECTABLE_LEAF' | 'SPLIT_REQUIRED' | 'INCOMPLETE';
  enqueued: number;
  count: number | null;
  nodeState: NodeState;
}

export type IncompleteReason =
  | 'NO_TRUTHFUL_PARTITION'
  | 'UNKNOWN_COUNT'
  | 'UNKNOWN_CATEGORY_STRUCTURE'
  | 'EXCEEDS_SOURCE_PAGE_LIMIT'
  | 'MAX_DEPTH_REACHED'
  /** Kaynak, bildirdigi sayimdan FAZLA sonuc gosteriyor: sayim guvenilmez. */
  | 'REPORTED_COUNT_MISMATCH'
  /** Kapsam korumasi kesti — veri butunlugu hatasi DEGIL, kasitli test siniri. */
  | 'SCOPE_PAGE_LIMIT';

/** Kapsam disinda kaldigi icin kuyruga alinmayan dugum. */
export interface OutOfScopeNode {
  path: string;
  label: string;
  reason: ScopeRejection;
}

export interface IncompleteNode {
  path: string;
  label: string;
  count: number | null;
  reason: IncompleteReason;
}

/** Bilinen ilan referansi — 280k satirlik snapshot'in hafif gorunumu. */
export interface ReferenceLookup {
  get(sourceListingId: string): ReferenceFingerprint | null;
}

export class MapReferenceLookup implements ReferenceLookup {
  private readonly rows: Map<string, ReferenceFingerprint>;

  constructor(entries: Iterable<[string, ReferenceFingerprint]> = []) {
    this.rows = new Map(entries);
  }

  get(sourceListingId: string): ReferenceFingerprint | null {
    return this.rows.get(sourceListingId) ?? null;
  }
}

interface WorkItem {
  kind: 'DISCOVER' | 'LEAF';
  /** Kaynak-buyuklugune gore sinif; kararin denetlenebilir kaydi. */
  nodeState: NodeState;
  path: string;
  label: string;
  /** Bu dugumu ureten ebeveyn taksonomi yolu (kok icin null). */
  parentPath: string | null;
  /** Kokten buraya kaynak etiket izi — panelde marka/seri/alt kategori olur. */
  trail: string[];
  count: number | null;
  expectedPages: number | null;
  pagesDone: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'BLOCKED' | 'FAILED';
  observedCount: number;
  depth: number;
  /** Onceki sayfanin ID kumesi — sayfalama dongusu tespiti icin. */
  lastPageIds: string[];
}

interface Counters {
  observed: number;
  newCount: number;
  changedCount: number;
  unchangedCount: number;
  duplicateCount: number;
  invalidCount: number;
  parseFailures: number;
  detailFetches: number;
}

export interface AutopilotCheckpointPayload {
  version: string;
  runId: string;
  source: string;
  baseUrl: string;
  state: AutopilotState;
  createdAt: string;
  updatedAt: string;
  items: WorkItem[];
  seenPaths: string[];
  counters: Counters;
  incomplete: IncompleteNode[];
  outOfScope: OutOfScopeNode[];
  /** Kapsam checkpoint'te tasinir: devam ederken GENISLETILEMEZ. */
  scope: AutopilotScope | null;
  stagingFile: string;
  snapshotPath: string | null;
  deadlineAtMs: number | null;
  lastError: string | null;
}

export interface AutopilotSessionOptions {
  runId: string;
  source: string;
  baseUrl: string;
  staging: StagingStore;
  checkpointFile: AtomicChecksummedFile<AutopilotCheckpointPayload>;
  reference: ReferenceLookup;
  /** Duman/test kapsami. null = sinirsiz (normal aylik kosu). */
  scope?: AutopilotScope | null;
  snapshotPath?: string | null;
  /** Yurutme penceresi sonu (epoch ms). null = sinirsiz. */
  deadlineAtMs?: number | null;
  now?: () => number;
}

function emptyCounters(): Counters {
  return {
    observed: 0,
    newCount: 0,
    changedCount: 0,
    unchangedCount: 0,
    duplicateCount: 0,
    invalidCount: 0,
    parseFailures: 0,
    detailFetches: 0,
  };
}

export class AutopilotSession {
  private state: AutopilotState = 'IDLE';
  private items: WorkItem[] = [];
  private readonly seenPaths = new Set<string>();
  private counters: Counters = emptyCounters();
  private incomplete: IncompleteNode[] = [];
  private outOfScope: OutOfScopeNode[] = [];
  private guard: ScopeGuard | null;
  private deduper = new GlobalListingDeduper();
  private createdAt = new Date().toISOString();
  private updatedAt = this.createdAt;
  private lastError: string | null = null;
  private deadlineAtMs: number | null;
  private readonly now: () => number;

  private constructor(private readonly opts: AutopilotSessionOptions) {
    this.now = opts.now || (() => Date.now());
    this.deadlineAtMs = opts.deadlineAtMs ?? null;
    this.guard = opts.scope ? new ScopeGuard(opts.scope) : null;
  }

  /** Yaprak basina izin verilen azami sayfa: kaynak tavani VE kapsam tavani. */
  private get pageCeiling(): number {
    return Math.min(MAX_PAGES_PER_LEAF, this.guard ? this.guard.maxResultPages : MAX_PAGES_PER_LEAF);
  }

  // ---------------------------------------------------------------- lifecycle

  /** Yeni kosu: kokler DISCOVER isi olarak kuyruga girer, checkpoint yazilir. */
  static start(
    opts: AutopilotSessionOptions,
    roots: Array<{ path: string; label: string }>,
  ): AutopilotSession {
    if (!Array.isArray(roots) || roots.length === 0) {
      throw new AutopilotProtocolError('start: at least one root category is required');
    }
    const session = new AutopilotSession(opts);
    opts.staging.open();

    for (const root of roots) {
      if (!session.enqueue({ path: root.path, label: root.label, count: null }, 0, [])) {
        const rejected = session.outOfScope.find(
          (n) => normalizeNodePath(opts.baseUrl, root.path) === n.path,
        );
        if (rejected) {
          // Kok bile kapsam disindaysa kosu BASLAMAZ: sessizce bos kuyruk yerine acik hata.
          throw new AutopilotProtocolError(
            `Root "${root.path}" is outside the configured scope ` +
              `(${session.guard!.describe()}): ${rejected.reason}`,
          );
        }
      }
    }
    if (session.items.length === 0) {
      throw new AutopilotProtocolError('start: no root survived the scope guard');
    }
    session.state = 'RUNNING';
    session.persist();
    return session;
  }

  /**
   * Devam: checkpoint'ten aynen kaldigi yerden. Kuresel tekillestirme kumesi
   * staging dosyasindan YENIDEN KURULUR — checkpoint'i 280k ID ile sismekten
   * kurtarir ve tekillik kaynagini tek dosyada tutar.
   */
  static resume(opts: AutopilotSessionOptions): AutopilotSession {
    const session = new AutopilotSession(opts);
    const payload = opts.checkpointFile.load();
    if (payload.version !== AUTOPILOT_VERSION) {
      throw new AutopilotProtocolError(
        `Checkpoint version "${payload.version}" does not match "${AUTOPILOT_VERSION}"`,
      );
    }
    if (payload.runId !== opts.runId) {
      throw new AutopilotProtocolError(
        `Checkpoint runId "${payload.runId}" does not match requested "${opts.runId}"`,
      );
    }

    session.items = payload.items.map((i) => ({
      ...i,
      trail: Array.isArray(i.trail) ? [...i.trail] : [i.label],
      nodeState: i.nodeState || 'PENDING_DISCOVERY',
      parentPath: i.parentPath ?? null,
      lastPageIds: [...(i.lastPageIds || [])],
    }));
    for (const p of payload.seenPaths) session.seenPaths.add(p);
    session.counters = { ...emptyCounters(), ...payload.counters };
    session.incomplete = [...payload.incomplete];
    session.outOfScope = [...(payload.outOfScope || [])];

    /**
     * Kapsam GENISLETILEMEZ. Checkpoint kapsamli bir kosuya aitse, devam
     * ederken farkli (ya da kaldirilmis) bir kapsamla surdurmek, dar bir duman
     * kosusunu sessizce genis bir gezintiye cevirirdi.
     */
    const storedScope = payload.scope ?? null;
    const requestedScope = opts.scope ?? null;
    if (!sameScope(storedScope, requestedScope)) {
      throw new AutopilotProtocolError(
        'Resume refused: the checkpoint was written under a different scope. ' +
          'Restart the bridge with the same scope flags, or start a new run id.',
      );
    }
    session.guard = storedScope ? new ScopeGuard(storedScope) : null;

    session.createdAt = payload.createdAt;
    session.updatedAt = payload.updatedAt;
    session.lastError = payload.lastError;
    session.deadlineAtMs = opts.deadlineAtMs ?? payload.deadlineAtMs;

    opts.staging.open();
    session.deduper = new GlobalListingDeduper();
    for (const record of opts.staging.readAll()) session.deduper.observe(record.sourceListingId);

    /**
     * Yarim kalan ve BLOKE isler yeniden BEKLEMEDE. Yarim is icin ayni yonerge
     * tekrar uretilir; imlec sayfa duzeyinde durdugu icin en fazla TEK sayfa
     * yeniden okunur, tamamlanmis is asla tekrarlanmaz.
     */
    for (const item of session.items) {
      if (item.status === 'IN_PROGRESS' || item.status === 'BLOCKED') item.status = 'PENDING';
    }

    session.state = 'RUNNING';
    session.lastError = null;
    session.persist();
    return session;
  }

  static checkpointExists(file: AtomicChecksummedFile<AutopilotCheckpointPayload>): boolean {
    return file.exists();
  }

  pause(): void {
    if (this.state === 'RUNNING') this.state = 'PAUSED';
    this.persist();
  }

  stop(): void {
    this.state = 'IDLE';
    this.persist();
  }

  /** Erisim engeli: ATLATMA YOK. Mevcut is bloke, checkpoint, kosu durur. */
  reportAccessRestricted(report: AccessRestrictionReport): void {
    this.requireRun(report.runId);
    const current = this.items.find((i) => i.status === 'IN_PROGRESS');
    if (current) {
      current.status = 'BLOCKED';
    }
    this.state = 'ACCESS_RESTRICTED';
    this.lastError = `ACCESS_RESTRICTED (${report.kind})${
      report.evidence ? `: ${String(report.evidence).slice(0, 200)}` : ''
    }`;
    this.persist();
  }

  // ---------------------------------------------------------------- directives

  /** Bir sonraki TEK adim. Uzanti bunun disinda hicbir sey yapmaz. */
  nextDirective(): AutopilotDirective {
    if (this.state !== 'RUNNING') {
      return this.halt(this.state, this.lastError || `Run is ${this.state}`);
    }
    if (this.deadlineAtMs !== null && this.now() >= this.deadlineAtMs) {
      this.state = 'DEADLINE_REACHED';
      for (const item of this.items) {
        if (item.status === 'IN_PROGRESS') item.status = 'PENDING';
      }
      this.persist();
      return this.halt('DEADLINE_REACHED', 'Execution window closed; resume in the next window');
    }

    const item = this.pickNext();
    if (!item) {
      /**
       * DURUM ONCELIGI — "COMPLETE" SADECE GERCEKTEN TAMSA.
       *
       * Panelde ust satirin COMPLETE derken altta "Kosu tam mi: HAYIR"
       * yazmasi kullaniciyi yaniltti. Tamamlanma tek bir kaynaktan turer:
       * isRunComplete(). Degilse durum, EKSIKLIGIN SEBEBINI soyler.
       */
      const drained = this.drainedState();
      this.state = drained.state;
      this.persist();
      return this.halt(drained.state, drained.reason);
    }

    item.status = 'IN_PROGRESS';
    this.touch();

    if (item.kind === 'DISCOVER') {
      return {
        type: 'DISCOVER',
        runId: this.opts.runId,
        nodePath: item.path,
        label: item.label,
        url: buildCategoryUrl(this.opts.baseUrl, item.path),
      };
    }

    const page = item.pagesDone + 1;
    if (page > this.pageCeiling) {
      /**
       * Buraya normalde gelinmez (yaprak tavanda tamamlanir). Bozuk ya da elle
       * duzenlenmis bir checkpoint tavani asan sayfa uretmesin diye SERT kapi:
       * is kapatilir ve bir sonraki yonerge uretilir.
       */
      item.status = 'COMPLETE';
      this.pushIncomplete(item, this.guard ? 'SCOPE_PAGE_LIMIT' : 'EXCEEDS_SOURCE_PAGE_LIMIT');
      this.persist();
      return this.nextDirective();
    }
    return {
      type: 'COLLECT_PAGE',
      runId: this.opts.runId,
      nodePath: item.path,
      label: item.label,
      url: buildLeafPageUrl(this.opts.baseUrl, item.path, page),
      page,
      expectedPages: item.expectedPages ?? 1,
    };
  }

  // ---------------------------------------------------------------- discovery

  /**
   * Kesif sonucu. KURAL (source-partition ile ayni):
   *   count <= LEAF_CAP            -> COLLECTABLE_LEAF
   *   count >  LEAF_CAP + cocuk    -> BOL (ebeveyn TOPLANMAZ)
   *   count >  LEAF_CAP + ikincil  -> ikincil bolumlerle bol
   *   aksi halde                   -> EKSIK isaretle (sessiz kayip YASAK)
   */
  submitDiscovery(report: DiscoveryReport): DiscoveryOutcome {
    this.requireRun(report.runId);
    const item = this.requireItem(report.nodePath, 'DISCOVER');

    /**
     * SAYIM METINDEN BURADA cozulur (uzantida DEGIL).
     *
     * Canli kosuda kanitlandi: uzanti metindeki ilk rakam dizisini aliyordu ve
     * '"Audi A3 ..." aramanizda 6.559 ilan bulundu.' basliginda "A3" icindeki
     * 3'u yakaliyordu. 6.559 ilanlik EBEVEYN 3 ilanli bir yaprak sanildi ve
     * sayfalandi. Artik sayim "ilan" sozcugune bagli, test edilmis bir
     * ayristiriciyla cozuluyor ve tek dogru burada.
     */
    const count =
      report.countText !== undefined && report.countText !== null
        ? extractReportedCount(report.countText)
        : normalizeCount(report.count);
    const structure = report.childStructure ?? 'READ';

    /**
     * SECICI DOGRULAMA MODU (duman kosusu). Alt kategori yapisini okuyamadiysak
     * bunu "cocuk yok" diye yorumlamak, bir secici hatasini veri gercegine
     * cevirmek olurdu. Tahmin YOK: dur ve kullaniciya sor.
     */
    if (this.guard && this.guard.config.requireChildStructure && structure !== 'READ') {
      return this.haltOnUnreadable(item, 'UNKNOWN_CATEGORY_STRUCTURE', structure);
    }

    /** Sayim okunamadi: "kucuk" VARSAYILMAZ; duman modunda kosu durur. */
    if (count === null && this.guard && this.guard.config.stopOnUnknown) {
      return this.haltOnUnreadable(item, 'UNKNOWN_COUNT', structure);
    }

    item.count = count;

    /**
     * SERT SOZLESME — SIRALAMA BURADA ONEMLIDIR.
     *
     * Once BUYUKLUK karari verilir, sonra her sey. count > LEAF_CAP olan bir
     * dugum ASLA yaprak olamaz: kaynak o dugumun tamamini gosteremez, dolayisiyla
     * sayfalamak sessizce eksik veri uretir. Bu dal, yaprak dalindan ONCE gelir
     * ki bir gun eklenen bir "kucuk optimizasyon" sirayi bozamasin.
     */
    if (count === null || count > LEAF_CAP) {
      return this.requireSplit(item, count, report);
    }

    // Buradan sonrasi kesinlikle <= LEAF_CAP: kaynak bu dugumu tam gosterebilir.
    item.kind = 'LEAF';
    item.nodeState = 'COLLECTABLE_LEAF';
    /**
     * DOGAL beklenen sayfa: kaynagin bildirdigi sayimdan turer ve KAPSAM
     * tavanindan BAGIMSIZDIR. Duman testinin sayfa siniri bir yapragi kirpar,
     * ama asla bir dugumun buyuklugunu degistiremez.
     */
    item.expectedPages = Math.min(expectedPagesFor(count, AUTOPILOT_PAGE_SIZE), MAX_PAGES_PER_LEAF);
    item.status = 'PENDING';
    this.persist();
    return { outcome: 'COLLECTABLE_LEAF', enqueued: 0, count, nodeState: 'COLLECTABLE_LEAF' };
  }

  /**
   * count > LEAF_CAP (ya da okunamadi): dugum SPLIT_REQUIRED'dir.
   * Ebeveynin ilan sayfalari HICBIR KOSULDA gezilmez ya da toplanmaz.
   */
  private requireSplit(
    item: WorkItem,
    count: number | null,
    report: DiscoveryReport,
  ): DiscoveryOutcome {
    item.nodeState = 'SPLIT_REQUIRED';

    if (count === null) {
      // "Kucuk" VARSAYILMAZ. Kapsamli kosuda dur, aksi halde dugumu eksik isaretle.
      if (this.guard && this.guard.config.stopOnUnknown) {
        return this.haltOnUnreadable(item, 'UNKNOWN_COUNT', 'READ');
      }
      return this.markIncomplete(item, 'UNKNOWN_COUNT');
    }

    if (item.depth >= MAX_PARTITION_DEPTH) {
      return this.markIncomplete(item, 'MAX_DEPTH_REACHED');
    }

    // Cocuklar KESIN ALT SOY olmali: sayfalama/breadcrumb/kardes/reklam elenir.
    const children = filterImmediateChildren(
      item.path,
      report.children,
      item.depth + 1,
      (path) => normalizeNodePath(this.opts.baseUrl, path),
    );
    if (children.length > 0) {
      return this.splitInto(item, children);
    }

    /**
     * Gercek alt kategori yok: kimligi KORUYAN, kaynagin kendi UI'sinde
     * TRUTHFUL sekilde secilebilen ikincil bolumler (orn. yil) denenir.
     */
    const secondary = filterImmediateChildren(
      item.path,
      report.secondaryPartitions,
      item.depth + 1,
      (path) => normalizeNodePath(this.opts.baseUrl, path),
    );
    if (secondary.length > 0) {
      return this.splitInto(item, secondary);
    }

    /**
     * Hicbir gercek bolum yok. ILK 1000'I ALIP "tamam" DEMEK YASAK.
     * Kapsamli (secici dogrulama) kosusunda bu ayni zamanda taksonomi
     * seciciminin tutmadigi anlamina gelebilir, o yuzden kosu durur.
     */
    if (this.guard && this.guard.config.requireChildStructure) {
      return this.haltOnUnreadable(item, 'UNKNOWN_CATEGORY_STRUCTURE', 'EMPTY');
    }
    return this.markIncomplete(item, 'NO_TRUTHFUL_PARTITION');
  }

  private splitInto(item: WorkItem, children: TaxonomyChild[]): DiscoveryOutcome {
    // Ebeveyn TOPLANMAZ: yalnizca bolunmus sayilir.
    item.status = 'COMPLETE';
    item.nodeState = 'SPLIT_REQUIRED';
    let enqueued = 0;
    for (const child of children) {
      if (this.enqueue(child, child.depth, item.trail, item.path)) enqueued += 1;
    }
    this.persist();
    return {
      outcome: 'SPLIT_REQUIRED',
      enqueued,
      count: item.count,
      nodeState: 'SPLIT_REQUIRED',
    };
  }

  // --------------------------------------------------------------- page batch

  /** Tek sayfalik yakalama: siniflandir, tekillestir, staging'e yaz, checkpoint. */
  submitPageBatch(batch: PageBatch): PageBatchResult {
    this.requireRun(batch.runId);
    const item = this.requireItem(batch.nodePath, 'LEAF');

    const expected = item.pagesDone + 1;
    if (batch.page !== expected) {
      // Tekrar/atlama REDDEDILIR: cift sayim ve sonsuz sayfalama boyle onlenir.
      throw new AutopilotProtocolError(
        `Out-of-order page for "${item.path}": expected ${expected}, received ${batch.page}`,
      );
    }
    if (batch.page > MAX_PAGES_PER_LEAF) {
      throw new AutopilotProtocolError(
        `Page ${batch.page} exceeds source maximum ${MAX_PAGES_PER_LEAF}`,
      );
    }

    const cards = Array.isArray(batch.cards) ? batch.cards : [];
    if (cards.length > MAX_CARDS_PER_PAGE) {
      throw new AutopilotProtocolError(
        `Page carried ${cards.length} cards, above the ${MAX_CARDS_PER_PAGE} ceiling ` +
          `(${AUTOPILOT_PAGE_SIZE}/page was not honoured)`,
      );
    }

    const category = sourceCategoryText(String(batch.categoryText || ''));
    const { make, model } = splitSourceCategory(category);
    const capturedAt = new Date(this.now()).toISOString();

    const pageIds: string[] = [];
    const result: PageBatchResult = {
      accepted: 0,
      duplicates: 0,
      newCount: 0,
      changedCount: 0,
      unchangedCount: 0,
      detailFetches: 0,
      invalid: 0,
      leafComplete: false,
      paginationLoopStopped: false,
      countMismatch: false,
    };

    /**
     * SAYIM/GERCEKLIK KARSILASTIRMASI — HERHANGI BIR SATIR STAGING'E YAZILMADAN ONCE.
     *
     * Kaynak bu dugum icin N ilan bildirdiyse, sayfalar N'den anlamli olcude
     * fazla kart tasiyamaz. Tasiyorsa bildirilen sayim yanlistir; yanlis sayima
     * dayanan YAPRAK karari da yanlistir ve bu kartlar aslinda ASIRI BUYUK bir
     * ebeveyne aittir. Canli kosuda tam olarak bu oldu: 3 ilanli sanilan dugum
     * ilk sayfada 50 kart getirdi ve 151 satir yazildi.
     *
     * Dogru davranis: HICBIR SEY yazma, dur, sebebi kaydet.
     */
    if (item.count !== null) {
      const remaining = Math.max(0, item.count - item.observedCount);
      const promoAllowance = MAX_CARDS_PER_PAGE - AUTOPILOT_PAGE_SIZE;
      const allowedThisPage = Math.min(AUTOPILOT_PAGE_SIZE, remaining) + promoAllowance;
      if (cards.length > allowedThisPage) {
        return this.stopOnCountMismatch(item, batch, {
          ...result,
          invalid: cards.length,
        });
      }
    }


    for (const card of cards) {
      const id = String(card?.sourceListingId || '').trim();
      if (!id) {
        // Kimliksiz kart (reklam satiri) gozlem sayilmaz.
        result.invalid += 1;
        continue;
      }
      pageIds.push(id);

      // KURESEL TEKILLESTIRME: ayni ilan iki yaprakta gorulebilir; ilki kazanir.
      if (!this.deduper.observe(id)) {
        result.duplicates += 1;
        continue;
      }

      const price = parseTurkishNumber(card.priceText);
      const mileage = parseTurkishNumber(card.mileageText);
      const decision = classifyCard(
        { sourceListingId: id, price, mileage, title: String(card.title || '') },
        this.opts.reference.get(id),
      );

      if (decision.decision === 'NEW') result.newCount += 1;
      else if (decision.decision === 'CHANGED') result.changedCount += 1;
      else result.unchangedCount += 1;

      /**
       * BILINEN-DEGISMEMIS: pahali DETAY cikarimi ATLANIR (detailFetches 0),
       * ama KART gozlemi yine de staging'e yazilir. Yazilmasaydi diff bu ilani
       * kaynakta gorulmemis sayip SAHTE "MISSING" uretirdi.
       */
      const record: RawObservedListing = {
        source: this.opts.source,
        sourceListingId: id,
        sourceUrl: safeUrl(card.href, this.opts.baseUrl),
        title: String(card.title || '')
          .trim()
          .replace(/\s+/g, ' '),
        sourceMake: make,
        sourceModel: model,
        year: parseYear(card.yearText),
        mileage,
        price,
        currency: /TL/i.test(String(card.priceText || '')) ? 'TRY' : null,
        location:
          String(card.locationText || '')
            .trim()
            .replace(/\s+/g, ' ') || null,
        capturedAt,
        runId: this.opts.runId,
        jobId: item.path,
        page: batch.page,
      };
      if (this.opts.staging.append(record) === 'WRITTEN') result.accepted += 1;
      else result.duplicates += 1;
    }

    // SAYFALAMA DONGUSU: ayni ID kumesi tekrarlandiysa kaynak ilerlemiyordur.
    const repeated =
      pageIds.length > 0 &&
      item.lastPageIds.length === pageIds.length &&
      sameIdSet(item.lastPageIds, pageIds);

    item.pagesDone = batch.page;
    item.lastPageIds = pageIds;
    item.observedCount += result.accepted;

    this.counters.observed += result.accepted;
    this.counters.newCount += result.newCount;
    this.counters.changedCount += result.changedCount;
    this.counters.unchangedCount += result.unchangedCount;
    this.counters.duplicateCount += result.duplicates;
    this.counters.invalidCount += result.invalid;
    this.counters.parseFailures += Number(batch.parseFailures) || 0;

    /**
     * IKI AYRI TAVAN — KARISTIRILMAMALI.
     *
     * expectedPages  kaynagin BILDIRDIGI sayimdan turer. Dugumun gercek
     *                buyuklugudur ve duman testinden etkilenmez.
     * scopeCeiling   duman kosusunun kasitli kirpma siniridir.
     *
     * Ikisini tek degiskende birlestirmek, kapsam sinirini bir "buyukluk"
     * gibi gostererek asiri buyuk bir dugumu sahte yaprak yapabilirdi —
     * canli kosuda tam olarak bu oldu.
     */
    const expectedPages = item.expectedPages ?? 1;
    const scopeCeiling = this.pageCeiling;
    const scopeTruncates = scopeCeiling < expectedPages;

    if (repeated) {
      result.paginationLoopStopped = true;
      item.status = 'COMPLETE';
    } else if (!batch.hasNextPage) {
      item.status = 'COMPLETE';
    } else if (batch.page >= scopeCeiling && scopeTruncates) {
      /**
       * KAPSAM tavani: kasitli test siniri, veri butunlugu hatasi degil.
       * Is kapatilir ama kosu EKSIK isaretlenir — bu yaprak tam degildir.
       */
      item.status = 'COMPLETE';
      this.pushIncomplete(item, 'SCOPE_PAGE_LIMIT');
    } else if (batch.page >= MAX_PAGES_PER_LEAF) {
      /**
       * Kaynak tavaninda hala devam var: bu yaprak KAYNAKTA TAM GORUNMUYOR.
       * Sayim celiskisinden ONCE gelir cunku daha ozel ve daha eyleme donuk
       * bir teshistir: bu dugum kaynagin liste gorunumune sigmiyor.
       */
      item.status = 'FAILED';
      this.pushIncomplete(item, 'EXCEEDS_SOURCE_PAGE_LIMIT');
    } else if (batch.page >= expectedPages) {
      /**
       * Kaynak, bildirdigi sayimin gerektirdiginden FAZLA sayfa gosteriyor.
       *
       * Eskiden burada beklenti sessizce bir artiriliyordu; canli kosuda bu,
       * yanlis okunan bir sayimin (6.559 yerine 3) ustunu ortup 6.559 ilanlik
       * bir EBEVEYNI sayfalatti. Artik bu bir KIRMIZI BAYRAK: sayim
       * guvenilmezse dugumun sinifi da guvenilmez, o yuzden toplama DURUR.
       */
      return this.stopOnCountMismatch(item, batch, result);
    }

    result.leafComplete = item.status === 'COMPLETE';
    this.persist(); // HER SAYFADAN SONRA
    return result;
  }

  // ------------------------------------------------------------------- status

  status(): AutopilotStatus {
    const current = this.items.find((i) => i.status === 'IN_PROGRESS') || null;
    let done = 0;
    let pending = 0;
    let blocked = 0;
    for (const item of this.items) {
      if (item.status === 'COMPLETE') done += 1;
      else if (item.status === 'BLOCKED' || item.status === 'FAILED') blocked += 1;
      else pending += 1;
    }

    return {
      runId: this.opts.runId,
      state: this.state,
      source: this.opts.source,
      currentPath: current ? current.path : null,
      currentLabel: current ? current.label : null,
      currentTrail: current ? [...current.trail] : [],
      currentPage: current && current.kind === 'LEAF' ? current.pagesDone + 1 : null,
      doneJobs: done,
      pendingJobs: pending,
      blockedJobs: blocked,
      listingsObserved: this.counters.observed,
      newCount: this.counters.newCount,
      changedCount: this.counters.changedCount,
      unchangedCount: this.counters.unchangedCount,
      duplicateCount: this.counters.duplicateCount,
      unsplittable: this.incomplete.map((n) => ({ path: n.path, label: n.label, count: n.count })),
      scopeLimited: this.guard !== null,
      scope: this.guard ? this.guard.describe() : null,
      outOfScope: this.outOfScope.map((n) => ({ ...n })),
      runComplete: this.isRunComplete(),
      deadlineAt: this.deadlineAtMs === null ? null : new Date(this.deadlineAtMs).toISOString(),
      lastError: this.lastError,
      startedAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * AYLIK KOSU TAMAMLANMA SOZLESMESI:
   *   tum isler COMPLETE + bloke/hatali is yok + bolunemeyen dugum yok.
   */
  isRunComplete(): boolean {
    /**
     * Kapsamli bir kosu TANIMI GEREGI kismidir: hedef disi her sey hic
     * gezilmemistir. Aylik tazeleme olarak "tamam" demek yanlis olurdu.
     */
    if (this.guard) return false;
    if (this.incomplete.length > 0) return false;
    return this.items.every((i) => i.status === 'COMPLETE');
  }

  outOfScopeNodes(): OutOfScopeNode[] {
    return this.outOfScope.map((n) => ({ ...n }));
  }

  incompleteNodes(): IncompleteNode[] {
    return [...this.incomplete];
  }

  itemsView(): WorkItemView[] {
    return this.items.map((i) => ({
      kind: i.kind,
      nodeState: i.nodeState,
      path: i.path,
      label: i.label,
      parentPath: i.parentPath,
      trail: [...i.trail],
      count: i.count,
      expectedPages: i.expectedPages,
      pagesDone: i.pagesDone,
      status: i.status,
      observedCount: i.observedCount,
      depth: i.depth,
    }));
  }

  get currentState(): AutopilotState {
    return this.state;
  }

  // ------------------------------------------------------------------ private

  /** Kuyruk bittiginde hangi durum dogruyu soyler. */
  private drainedState(): { state: AutopilotState; reason: string } {
    if (this.isRunComplete()) {
      return { state: 'COMPLETE', reason: 'All partitions complete' };
    }

    const reasons = this.incomplete.map((n) => n.reason);
    const blocking = reasons.filter((r) => r !== 'SCOPE_PAGE_LIMIT');

    if (blocking.length === 0 && this.guard) {
      return {
        state: 'SMOKE_LIMIT_REACHED',
        reason:
          `Smoke run finished within its ${this.guard.maxResultPages}-page limit. ` +
          'This is a scoped test slice, not a complete monthly refresh.',
      };
    }
    return {
      state: 'INCOMPLETE',
      reason:
        `Queue drained but the run is INCOMPLETE: ${
          blocking.length > 0 ? [...new Set(blocking)].join(', ') : 'scope-limited'
        }.`,
    };
  }

  private pickNext(): WorkItem | null {
    return (
      this.items.find((i) => i.status === 'IN_PROGRESS') ||
      this.items.find((i) => i.status === 'PENDING') ||
      null
    );
  }

  private enqueue(
    node: { path: string; label: string; count: number | null },
    depth: number,
    parentTrail: string[],
    parentPath: string | null = null,
  ): boolean {
    const key = normalizeNodePath(this.opts.baseUrl, node.path);
    if (this.seenPaths.has(key)) return false; // ayni dugum iki kez islenmez

    // KAPSAM KAPISI: hedef disi dugum kuyruga HIC girmez, sebebiyle kaydedilir.
    if (this.guard) {
      const decision = this.guard.evaluate(key);
      if (!decision.allowed) {
        if (!this.outOfScope.some((n) => n.path === key)) {
          this.outOfScope.push({ path: key, label: node.label, reason: decision.reason! });
        }
        return false;
      }
    }

    this.seenPaths.add(key);

    const count = normalizeCount(node.count);
    const isLeaf = count !== null && count <= LEAF_CAP;
    this.items.push({
      kind: isLeaf ? 'LEAF' : 'DISCOVER',
      /**
       * Sayimi BILINEN ve <=LEAF_CAP olan cocuk dogrudan toplanabilir yapraktir;
       * digeri (buyuk YA DA sayimi bilinmeyen) once kesfedilmelidir. Sayimsiz
       * dugum ASLA yaprak sayilmaz.
       */
      nodeState: isLeaf ? 'COLLECTABLE_LEAF' : 'PENDING_DISCOVERY',
      path: key,
      label: node.label,
      parentPath,
      trail: [...parentTrail, node.label],
      count,
      /** DOGAL sayfa beklentisi — kapsam tavanindan bagimsiz. */
      expectedPages: isLeaf
        ? Math.min(expectedPagesFor(count as number, AUTOPILOT_PAGE_SIZE), MAX_PAGES_PER_LEAF)
        : null,
      pagesDone: 0,
      status: 'PENDING',
      observedCount: 0,
      depth,
      lastPageIds: [],
    });
    return true;
  }

  /**
   * Kaynak sayfasi TAHMIN gerektiren bir hale geldi (sayim ya da kategori
   * yapisi okunamiyor). Kosu DURUR: is bloke edilir, sebep kaydedilir,
   * checkpoint yazilir ve kullanicidan sayfaya bakmasi istenir.
   */
  private haltOnUnreadable(
    item: WorkItem,
    reason: IncompleteReason,
    structure: string,
  ): DiscoveryOutcome {
    item.status = 'BLOCKED';
    this.pushIncomplete(item, reason);
    this.state = 'ERROR';
    this.lastError =
      reason +
      ' at "' +
      item.path +
      '" (childStructure=' +
      structure +
      '). Source selectors could not read the page truthfully; nothing was guessed.';
    this.persist();
    return { outcome: 'INCOMPLETE', enqueued: 0, count: item.count, nodeState: item.nodeState };
  }

  /**
   * Bildirilen sayim ile kaynagin gercekte gosterdigi arasinda celiski var.
   * Sayima guvenilemiyorsa dugumun SINIFINA da guvenilemez, o yuzden bu yaprak
   * toplanmaz. Kapsamli (secici dogrulama) kosusunda tum kosu durur ki
   * kullanici seciciye baksin.
   */
  private stopOnCountMismatch(
    item: WorkItem,
    batch: PageBatch,
    result: PageBatchResult,
  ): PageBatchResult {
    item.status = 'BLOCKED';
    item.nodeState = 'PENDING_DISCOVERY';
    this.pushIncomplete(item, 'REPORTED_COUNT_MISMATCH');

    const detail =
      `REPORTED_COUNT_MISMATCH at "${item.path}": source reported ${item.count} listing(s) ` +
      `but page ${batch.page} still carries results. The reported count cannot be trusted, ` +
      'so this node was not collected. Nothing was staged from it.';

    if (this.guard) {
      this.state = 'ERROR';
      this.lastError = detail;
    } else {
      this.lastError = detail;
    }
    this.persist();
    return { ...result, countMismatch: true, leafComplete: false };
  }

  private markIncomplete(item: WorkItem, reason: IncompleteReason): DiscoveryOutcome {
    item.status = 'FAILED';
    if (reason === 'NO_TRUTHFUL_PARTITION' || reason === 'MAX_DEPTH_REACHED') {
      item.nodeState = 'UNSPLITTABLE_OVERSIZED';
    }
    this.pushIncomplete(item, reason);
    this.persist();
    return { outcome: 'INCOMPLETE', enqueued: 0, count: item.count, nodeState: item.nodeState };
  }

  private pushIncomplete(item: WorkItem, reason: IncompleteReason): void {
    if (this.incomplete.some((n) => n.path === item.path)) return;
    this.incomplete.push({ path: item.path, label: item.label, count: item.count, reason });
  }

  private requireRun(runId: string): void {
    if (runId !== this.opts.runId) {
      throw new AutopilotProtocolError(`Unknown runId "${runId}"`);
    }
  }

  private requireItem(nodePath: string, kind: 'DISCOVER' | 'LEAF'): WorkItem {
    const key = normalizeNodePath(this.opts.baseUrl, nodePath);
    const item = this.items.find((i) => i.path === key);
    if (!item) throw new AutopilotProtocolError(`Unknown node "${nodePath}"`);
    if (item.kind !== kind) {
      throw new AutopilotProtocolError(
        `Node "${item.path}" is a ${item.kind} node; received a ${kind} report`,
      );
    }
    if (item.status === 'COMPLETE') {
      throw new AutopilotProtocolError(`Node "${item.path}" is already complete`);
    }
    return item;
  }

  private touch(): void {
    this.updatedAt = new Date(this.now()).toISOString();
  }

  private halt(state: AutopilotState, reason: string): AutopilotDirective {
    return { type: 'HALT', runId: this.opts.runId, state, reason };
  }

  private persist(): void {
    this.touch();
    const payload: AutopilotCheckpointPayload = {
      version: AUTOPILOT_VERSION,
      runId: this.opts.runId,
      source: this.opts.source,
      baseUrl: this.opts.baseUrl,
      state: this.state,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      items: this.items,
      seenPaths: [...this.seenPaths],
      counters: this.counters,
      incomplete: this.incomplete,
      outOfScope: this.outOfScope,
      scope: this.guard ? this.guard.config : null,
      stagingFile: this.opts.staging.path,
      snapshotPath: this.opts.snapshotPath ?? null,
      deadlineAtMs: this.deadlineAtMs,
      lastError: this.lastError,
    };
    this.opts.checkpointFile.save(payload);
  }
}

function normalizeCount(count: number | null | undefined): number | null {
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return null;
  return Math.floor(count);
}

function sameIdSet(a: string[], b: string[]): boolean {
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

function safeUrl(href: string | null | undefined, baseUrl: string): string {
  const raw = String(href || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return '';
  }
}
