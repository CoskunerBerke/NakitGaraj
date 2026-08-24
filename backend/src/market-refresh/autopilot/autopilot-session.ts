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
  ObservedChildNode,
  PageBatch,
  PageBatchResult,
  WorkItemView,
} from './autopilot-contracts';
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

export const AUTOPILOT_VERSION = 'autopilot-v1';

/**
 * Ozyineleme derinlik tavani. Kaynak kendi kendini isaret eden bir cocuk
 * verirse ziyaret kumesi zaten korur; bu tavan patolojik derin agaclarda
 * kosunun sonsuza kadar bolunmesini engeller.
 */
export const MAX_PARTITION_DEPTH = 8;

export type IncompleteReason =
  | 'NO_TRUTHFUL_PARTITION'
  | 'UNKNOWN_COUNT'
  | 'EXCEEDS_SOURCE_PAGE_LIMIT'
  | 'MAX_DEPTH_REACHED';

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
  path: string;
  label: string;
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
  private deduper = new GlobalListingDeduper();
  private createdAt = new Date().toISOString();
  private updatedAt = this.createdAt;
  private lastError: string | null = null;
  private deadlineAtMs: number | null;
  private readonly now: () => number;

  private constructor(private readonly opts: AutopilotSessionOptions) {
    this.now = opts.now || (() => Date.now());
    this.deadlineAtMs = opts.deadlineAtMs ?? null;
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
      session.enqueue({ path: root.path, label: root.label, count: null }, 0, []);
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
      lastPageIds: [...(i.lastPageIds || [])],
    }));
    for (const p of payload.seenPaths) session.seenPaths.add(p);
    session.counters = { ...emptyCounters(), ...payload.counters };
    session.incomplete = [...payload.incomplete];
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
      this.state = 'COMPLETE';
      this.persist();
      return this.halt(
        'COMPLETE',
        this.isRunComplete() ? 'All partitions complete' : 'Queue drained but run is INCOMPLETE',
      );
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
  submitDiscovery(
    report: DiscoveryReport,
  ): { outcome: 'LEAF' | 'SPLIT' | 'INCOMPLETE'; enqueued: number } {
    this.requireRun(report.runId);
    const item = this.requireItem(report.nodePath, 'DISCOVER');

    const count = normalizeCount(report.count);

    if (count !== null && count <= LEAF_CAP) {
      item.kind = 'LEAF';
      item.count = count;
      item.expectedPages = Math.min(
        expectedPagesFor(count, AUTOPILOT_PAGE_SIZE),
        MAX_PAGES_PER_LEAF,
      );
      item.status = 'PENDING';
      this.persist();
      return { outcome: 'LEAF', enqueued: 0 };
    }

    item.count = count;

    if (item.depth >= MAX_PARTITION_DEPTH) {
      return this.markIncomplete(item, 'MAX_DEPTH_REACHED');
    }

    const children = sanitizeChildren(report.children);
    if (children.length > 0) {
      // Ebeveyn TOPLANMAZ: >1000 sonuc kaynakta tam gorunmez.
      item.status = 'COMPLETE';
      let enqueued = 0;
      for (const child of children) {
        if (this.enqueue(child, item.depth + 1, item.trail)) enqueued += 1;
      }
      this.persist();
      return { outcome: 'SPLIT', enqueued };
    }

    const secondary = sanitizeChildren(report.secondaryPartitions);
    if (secondary.length > 0) {
      item.status = 'COMPLETE';
      let enqueued = 0;
      for (const part of secondary) {
        if (this.enqueue(part, item.depth + 1, item.trail)) enqueued += 1;
      }
      this.persist();
      return { outcome: 'SPLIT', enqueued };
    }

    return this.markIncomplete(item, count === null ? 'UNKNOWN_COUNT' : 'NO_TRUTHFUL_PARTITION');
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
    };

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

    const expectedPages = item.expectedPages ?? 1;
    const atSourceCap = batch.page >= MAX_PAGES_PER_LEAF;

    if (repeated) {
      result.paginationLoopStopped = true;
      item.status = 'COMPLETE';
    } else if (!batch.hasNextPage) {
      item.status = 'COMPLETE';
    } else if (batch.page >= expectedPages) {
      /**
       * Kaynak bildirilen sayimdan FAZLA sayfa gosteriyor: sayim eksik
       * bildirilmis. Sessizce kesmek veri kaybidir; kaynak tavanina kadar
       * devam edilir.
       */
      item.expectedPages = Math.min(expectedPages + 1, MAX_PAGES_PER_LEAF);
    }

    if (item.status !== 'COMPLETE' && atSourceCap) {
      if (batch.hasNextPage) {
        // Tavanda hala devam var: bu yaprak KAYNAKTA TAM GORUNMUYOR.
        item.status = 'FAILED';
        this.pushIncomplete(item, 'EXCEEDS_SOURCE_PAGE_LIMIT');
      } else {
        item.status = 'COMPLETE';
      }
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
    if (this.incomplete.length > 0) return false;
    return this.items.every((i) => i.status === 'COMPLETE');
  }

  incompleteNodes(): IncompleteNode[] {
    return [...this.incomplete];
  }

  itemsView(): WorkItemView[] {
    return this.items.map((i) => ({
      kind: i.kind,
      path: i.path,
      label: i.label,
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
  ): boolean {
    const key = normalizeNodePath(this.opts.baseUrl, node.path);
    if (this.seenPaths.has(key)) return false; // ayni dugum iki kez islenmez
    this.seenPaths.add(key);

    const count = normalizeCount(node.count);
    const isLeaf = count !== null && count <= LEAF_CAP;
    this.items.push({
      kind: isLeaf ? 'LEAF' : 'DISCOVER',
      path: key,
      label: node.label,
      trail: [...parentTrail, node.label],
      count,
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

  private markIncomplete(item: WorkItem, reason: IncompleteReason) {
    item.status = 'FAILED';
    this.pushIncomplete(item, reason);
    this.persist();
    return { outcome: 'INCOMPLETE' as const, enqueued: 0 };
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

function sanitizeChildren(children: ObservedChildNode[] | undefined): ObservedChildNode[] {
  if (!Array.isArray(children)) return [];
  return children.filter(
    (c) =>
      c && typeof c.path === 'string' && c.path.trim().length > 0 && typeof c.label === 'string',
  );
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
