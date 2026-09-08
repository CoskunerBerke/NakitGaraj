/**
 * WEEKLY EXACT-TARGET SESSION.
 *
 * This is deliberately separate from the broad legacy market collector. It
 * consumes a frozen, integrity-gated target snapshot and acquires raw rows;
 * canonical placement remains in the existing listing resolver.
 *
 * V2 — SAFE INCREMENTAL BOUNDARY (see boundary-rule.ts):
 *   newest-first pages -> raw evidence -> per-target boundary decision
 *   (date re-entry + anchor ids + bounded overlap, or explicit first-run
 *   baseline policy) -> assignment -> staged/atomic publish -> watermark
 *   commit as the LAST transactional step. Any failure before that leaves the
 *   previous per-target watermark untouched.
 */
import {
  AccessRestrictionReport,
  AutopilotDirective,
  AutopilotProtocolError,
  AutopilotState,
  PageBatch,
} from '../autopilot/autopilot-contracts';
import { AtomicChecksummedFile } from '../checkpoint-store';
import {
  classifyFailure,
  FailureScope,
  TargetFailureDetail,
} from './failure-scope';
import { parseTurkishNumber, parseYear } from '../extraction';
import {
  buildIncrementalPageUrl,
  MAX_CARDS_PER_PAGE,
  sameCategoryUrl,
} from '../autopilot/source-url';
import { HierarchyTree } from '../../vehicle-hierarchy/hierarchy-tree';
import {
  assignWeeklyEvidence,
  WeeklyAssignmentResult,
} from './assignment-stage';
import {
  AtomicWeeklyMarketPublisher,
  BaselineExactAssignment,
  PublishValidationReport,
} from './artifact-publisher';
import {
  BoundaryPolicy,
  BoundaryProof,
  DEFAULT_BOUNDARY_POLICY,
  deriveNextBoundary,
  evaluateBoundary,
  validateBoundaryPolicy,
} from './boundary-rule';
import { WeeklyEvidenceStore, WeeklyRawObservation } from './evidence-store';
import { MarketTarget, MarketTargetSnapshot } from './hierarchy-gate';
import { parseListingDate, sourceToday } from './listing-date';
import { TargetRefreshState, TargetStateStore } from './target-state-store';
import { parseRawWeeklyPage, saveRawWeeklyPage } from './raw-page';

export const WEEKLY_SESSION_VERSION = 'weekly-market-session-v2';

/** Sinir altindaki kac kimlik capa olarak saklanir (bir sayfanin cogu). */
export const DEFAULT_ANCHOR_SIZE = 20;
/** Ardisik hedefler arasi ve sayfalar arasi tempo (ms); sert alt sinir 1000. */
export const DEFAULT_WEEKLY_PACE_MS = 2200;
export const DEFAULT_WEEKLY_JITTER = 0.3;

type WeeklyItemStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'INCOMPLETE';

interface WeeklyWorkItem {
  target: MarketTarget;
  status: WeeklyItemStatus;
  nextPage: number;
  pagesVisited: number;
  newListings: number;
  duplicates: number;
  /** Onceki basarili sinir (yoksa taze hedef). */
  previousBoundaryDate: string | null;
  previousBoundaryIds: string[];
  previousAnchorIds: string[];
  /** Bu kosuda bu hedeften gorulen tum kimlikler (sinir kaniti icin). */
  seenIds: string[];
  newestDate: string | null;
  lastOldestDate: string | null;
  failure: string | null;
  /** Makine-okur basarisizlik kaydi — teshis ve yeniden deneme icin. */
  failureDetail: TargetFailureDetail | null;
  boundaryReached: boolean;
  boundaryProof: BoundaryProof | null;
  boundaryReason: string | null;
  /** HELD: filigran degismedi (basarisiz/eksik). ADVANCED: islem tamamlandi. */
  watermark: 'HELD' | 'ADVANCED' | null;
  exact: number;
  ambiguous: number;
  unresolved: number;
  startedAt: string | null;
  finishedAt: string | null;
  validation: PublishValidationReport | null;
}

export interface WeeklyCheckpointPayload {
  version: typeof WEEKLY_SESSION_VERSION;
  runId: string;
  source: string;
  baseUrl: string;
  hierarchyVersion: string;
  state: AutopilotState;
  createdAt: string;
  updatedAt: string;
  boundaryPolicy: BoundaryPolicy;
  anchorSize: number;
  paceMs: number;
  jitter: number;
  evidenceFile: string;
  items: WeeklyWorkItem[];
  runSeenListingIds: string[];
  lastError: string | null;
}

export interface WeeklySessionOptions {
  runId: string;
  source: string;
  baseUrl: string;
  tree: HierarchyTree;
  snapshot: MarketTargetSnapshot;
  selectedTargetIds: string[];
  checkpointFile: AtomicChecksummedFile<WeeklyCheckpointPayload>;
  evidence: WeeklyEvidenceStore;
  rawPageDir: string;
  states: TargetStateStore;
  publisher: AtomicWeeklyMarketPublisher;
  baselineAssignments?: Record<string, BaselineExactAssignment>;
  knownListingIds?: Set<string>;
  /** Sinir politikasi; verilmeyen alanlar DEFAULT_BOUNDARY_POLICY'den. */
  boundaryPolicy?: Partial<BoundaryPolicy>;
  /** Geriye uyum: boundaryPolicy.overlapDays / maxPagesPerTarget ile ayni. */
  overlapDays?: number;
  maxPagesPerTarget?: number;
  anchorSize?: number;
  paceMs?: number;
  jitter?: number;
  random?: () => number;
  now?: () => Date;
}

export interface WeeklyRunSummary {
  runId: string;
  hierarchyVersion: string;
  state: AutopilotState;
  targetsSelected: number;
  targetsAttempted: number;
  targetsCompleted: number;
  targetsPending: number;
  targetsFailed: number;
  targetsBlocked: number;
  pagesRead: number;
  newListings: number;
  duplicatesSuppressed: number;
  exact: number;
  ambiguousExcluded: number;
  unresolvedExcluded: number;
  watermarksAdvanced: number;
  watermarksHeld: number;
  failedTargetIds: string[];
  failures: TargetFailureDetail[];
}

export interface WeeklyPageResult {
  accepted: number;
  duplicates: number;
  newCount: number;
  exact: number;
  ambiguous: number;
  unresolved: number;
  targetComplete: boolean;
  boundaryReached: boolean;
  boundaryProof: BoundaryProof | null;
  boundaryReason: string;
  watermarkCommitted: boolean;
  /**
   * Bu hedef basarisiz oldu ama KOSU devam ediyor.
   *
   * Sonucu HTTP hatasi yerine normal yanit olarak dondurmek, uzantinin
   * `next` isteyip SONRAKI hedefe gecmesini saglar. Basarisizlik gizlenmez;
   * `targetComplete` false kalir ve filigran ilerlemez.
   */
  targetFailed?: boolean;
  failureCode?: string;
  failureScope?: FailureScope;
  retryable?: boolean;
}

export interface WeeklyTargetStatus {
  targetId: string;
  fullPath: string;
  status: WeeklyItemStatus;
  pagesVisited: number;
  newListings: number;
  duplicates: number;
  boundaryReached: boolean;
  boundaryProof: BoundaryProof | null;
  boundaryReason: string | null;
  watermark: 'HELD' | 'ADVANCED' | null;
  previousBoundaryDate: string | null;
  failure: string | null;
}

export interface WeeklyStatus {
  runId: string;
  mode: 'WEEKLY_MARKET';
  state: AutopilotState;
  source: string;
  hierarchyVersion: string;
  pathIntegrity: MarketTargetSnapshot['integrity'];
  currentPath: string | null;
  currentTrail: string[];
  currentPage: number | null;
  doneJobs: number;
  pendingJobs: number;
  blockedJobs: number;
  listingsObserved: number;
  newCount: number;
  duplicateCount: number;
  runComplete: boolean;
  lastError: string | null;
  startedAt: string;
  updatedAt: string;
  // ---- V2 ----
  targetsTotal: number;
  targetsUnchanged: number;
  targetsChanged: number;
  targetsFailed: number;
  targetsFresh: number;
  currentTargetId: string | null;
  currentTargetExactPath: string | null;
  currentBoundary: string | null;
  pagesRequested: number;
  /** Onceki sinir sayesinde okunmayan sayfalar (tavan - okunan, tamamlanan hedeflerde). */
  pagesAvoidedByBoundary: number;
  duplicateSightings: number;
  exactAssignments: number;
  ambiguousAssignments: number;
  unresolvedAssignments: number;
  watermarkHolds: number;
  watermarkAdvances: number;
  boundaryPolicy: BoundaryPolicy;
  paceMs: number;
  /** Tamamlanan hedeflerin ortalama suresi x bekleyen hedef. Olcum yoksa null. */
  estimatedRemainingMs: number | null;
  totalWallMs: number;
  targets: WeeklyTargetStatus[];
}

function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return '';
  }
}

export class WeeklyMarketSession {
  private state: AutopilotState = 'IDLE';
  private items: WeeklyWorkItem[] = [];
  private runSeenListingIds = new Set<string>();
  private createdAt: string;
  private updatedAt: string;
  private lastError: string | null = null;
  private readonly knownListingIds: Set<string>;
  private readonly policy: BoundaryPolicy;
  private readonly anchorSize: number;
  private readonly paceMs: number;
  private readonly jitter: number;
  private readonly random: () => number;
  private readonly now: () => Date;

  private constructor(private readonly opts: WeeklySessionOptions) {
    this.now = opts.now ?? (() => new Date());
    this.random = opts.random ?? Math.random;
    this.createdAt = this.now().toISOString();
    this.updatedAt = this.createdAt;
    this.knownListingIds = new Set(opts.knownListingIds ?? []);
    for (const id of opts.publisher.knownListingIds())
      this.knownListingIds.add(id);
    this.policy = {
      ...DEFAULT_BOUNDARY_POLICY,
      ...(opts.overlapDays !== undefined
        ? { overlapDays: opts.overlapDays }
        : {}),
      ...(opts.maxPagesPerTarget !== undefined
        ? { maxPagesPerTarget: opts.maxPagesPerTarget }
        : {}),
      ...(opts.boundaryPolicy ?? {}),
    };
    validateBoundaryPolicy(this.policy);
    this.anchorSize = opts.anchorSize ?? DEFAULT_ANCHOR_SIZE;
    if (!Number.isInteger(this.anchorSize) || this.anchorSize < 1) {
      throw new Error('Weekly anchorSize must be a positive integer');
    }
    this.paceMs = Math.max(
      1000,
      Math.floor(opts.paceMs ?? DEFAULT_WEEKLY_PACE_MS),
    );
    this.jitter = Math.min(
      0.9,
      Math.max(0, opts.jitter ?? DEFAULT_WEEKLY_JITTER),
    );
  }

  static start(opts: WeeklySessionOptions): WeeklyMarketSession {
    const session = new WeeklyMarketSession(opts);
    session.assertSnapshot();
    opts.evidence.open();
    // Hiyerarsi mutasyonu: tum kume uzlastirilir (INVALIDATED / STALE / kesinti).
    opts.states.reconcileSnapshot(opts.snapshot);
    const targetById = new Map(
      opts.snapshot.targets.map((target) => [target.targetId, target]),
    );
    if (opts.selectedTargetIds.length === 0) {
      throw new AutopilotProtocolError(
        'Weekly start requires at least one explicit exact target',
      );
    }
    const selected = [...new Set(opts.selectedTargetIds)];
    for (const targetId of selected) {
      const target = targetById.get(targetId);
      if (!target)
        throw new AutopilotProtocolError(
          `Unknown/non-terminal market target ${targetId}`,
        );
      const state = opts.states.reconcile(target);
      session.items.push(session.itemFrom(target, state));
    }
    session.state = 'RUNNING';
    session.persist();
    return session;
  }

  static resume(opts: WeeklySessionOptions): WeeklyMarketSession {
    const session = new WeeklyMarketSession(opts);
    session.assertSnapshot();
    opts.evidence.open();
    const payload = opts.checkpointFile.load();
    if (payload.version !== WEEKLY_SESSION_VERSION) {
      throw new AutopilotProtocolError(
        `Unsupported weekly checkpoint ${payload.version}`,
      );
    }
    if (payload.runId !== opts.runId) {
      throw new AutopilotProtocolError(
        `Checkpoint run ${payload.runId} != ${opts.runId}`,
      );
    }
    if (payload.hierarchyVersion !== opts.snapshot.hierarchyVersion) {
      throw new AutopilotProtocolError(
        'Resume refused: hierarchy version changed; freeze a new target snapshot and start a new run',
      );
    }
    const currentTargets = new Map(
      opts.snapshot.targets.map((target) => [target.targetId, target]),
    );
    for (const item of payload.items) {
      const current = currentTargets.get(item.target.targetId);
      if (
        !current ||
        current.targetIdentityHash !== item.target.targetIdentityHash
      ) {
        throw new AutopilotProtocolError(
          `Resume refused: exact target identity changed for ${item.target.targetId}`,
        );
      }
    }
    session.items = payload.items.map((item) => ({
      ...item,
      target: { ...item.target, pathSegments: [...item.target.pathSegments] },
      previousBoundaryIds: [...item.previousBoundaryIds],
      previousAnchorIds: [...(item.previousAnchorIds ?? [])],
      seenIds: [...(item.seenIds ?? [])],
      validation: item.validation ? { ...item.validation } : null,
    }));
    session.runSeenListingIds = new Set(payload.runSeenListingIds);
    session.createdAt = payload.createdAt;
    session.updatedAt = payload.updatedAt;
    session.lastError = payload.lastError;
    session.state = payload.state === 'COMPLETE' ? 'COMPLETE' : 'RUNNING';

    // Crash window: publish + watermark commit succeeded, but checkpoint did
    // not. Completion is safe to acknowledge because the state commit is the
    // final transactional operation and has a timestamp within this run.
    for (const item of session.items) {
      if (item.status !== 'IN_PROGRESS') continue;
      const state = opts.states.get(item.target.targetId);
      if (
        state?.status === 'COMPLETE' &&
        state.lastSuccessfulRefreshAt &&
        state.lastSuccessfulRefreshAt >= payload.createdAt
      ) {
        item.status = 'COMPLETE';
        item.boundaryReached = true;
        item.watermark = 'ADVANCED';
        item.finishedAt = state.lastSuccessfulRefreshAt;
      }
    }
    /**
     * BASARISIZ HEDEFLER YENIDEN DENENEBILIR OLMALI.
     *
     * Devam eden kosuda INCOMPLETE kalan bir hedef bir daha hic servis
     * edilmiyordu (kuyruk yalnizca PENDING/IN_PROGRESS servis eder), yani
     * gecici bir hata hedefi kalici olarak dusuruyordu.
     *
     * Yeniden denemenin ANLAMSIZ oldugu hatalar disarida birakilir:
     * "bulunamadi" ve "yanlis sayfaya yonlendirildi" kaynak yapisinin
     * degistigini gosterir; tekrar istemek ayni sonucu verir ve kaynaga
     * bosuna yuk olur. Onlar INCOMPLETE kalir ve raporda gorunur.
     */
    for (const item of session.items) {
      if (item.status !== 'INCOMPLETE') continue;
      if (item.failureDetail && !item.failureDetail.retryable) continue;
      item.status = 'PENDING';
      item.watermark = null;
      item.finishedAt = null;
    }
    session.finishIfDone();
    session.persist();
    return session;
  }

  nextDirective(): AutopilotDirective {
    if (this.state !== 'RUNNING') {
      return {
        type: 'HALT',
        runId: this.opts.runId,
        state: this.state,
        reason: this.lastError || this.state,
      };
    }
    const item = this.items.find(
      (candidate) =>
        candidate.status === 'PENDING' || candidate.status === 'IN_PROGRESS',
    );
    if (!item) {
      const allComplete = this.items.every(
        (candidate) => candidate.status === 'COMPLETE',
      );
      this.finishIfDone();
      return {
        type: 'HALT',
        runId: this.opts.runId,
        state: this.state,
        reason: allComplete
          ? 'All exact targets committed'
          : 'Target incomplete',
      };
    }
    if (item.status === 'PENDING') {
      this.opts.states.begin(item.target);
      item.status = 'IN_PROGRESS';
      item.startedAt = this.now().toISOString();
      this.persist();
    }
    return {
      type: 'COLLECT_PAGE',
      runId: this.opts.runId,
      nodePath: item.target.categoryPath,
      label: item.target.fullPath,
      url: buildIncrementalPageUrl(
        this.opts.baseUrl,
        item.target.categoryPath,
        item.nextPage,
      ),
      page: item.nextPage,
      expectedPages: this.policy.maxPagesPerTarget,
      targetId: item.target.targetId,
      hierarchyVersion: item.target.hierarchyVersion,
      captureRawHtml: true,
      delayMs: this.nextDelay(),
    };
  }

  submitPageBatch(batch: PageBatch): WeeklyPageResult {
    const item = this.currentItem();
    try {
      this.validateBatch(item, batch);
      if (!batch.rawHtml || !batch.rawHtml.trim()) {
        throw new Error('UNKNOWN_DATA_FORMAT raw HTML was not captured');
      }
      const rawFile = saveRawWeeklyPage(
        this.opts.rawPageDir,
        item.target.targetId,
        batch.page,
        batch.rawHtml,
      );
      const rawPage = parseRawWeeklyPage(batch.rawHtml, rawFile);
      const pageStatus = rawPage.classification.status;
      if (pageStatus !== 'CATEGORY_PAGE') {
        const failure =
          pageStatus === 'LOGIN_PAGE'
            ? 'LOGIN_REQUIRED'
            : pageStatus === 'TWO_FACTOR_PAGE'
              ? 'TWO_FACTOR_REQUIRED'
              : pageStatus === 'ACCESS_RESTRICTION_PAGE'
                ? 'ACCESS_RESTRICTED'
                : pageStatus === 'NOT_FOUND_PAGE'
                  ? 'TARGET_NOT_FOUND'
                  : pageStatus === 'PARSE_ERROR'
                    ? 'PARSE_ERROR'
                    : 'UNKNOWN_DATA_FORMAT';
        throw new Error(`${failure} raw page classified as ${pageStatus}`);
      }
      if (
        !rawPage.classification.breadcrumb ||
        JSON.stringify(rawPage.classification.breadcrumb) !==
          JSON.stringify(item.target.pathSegments)
      ) {
        throw new Error(
          `REDIRECT_MISMATCH breadcrumb ${JSON.stringify(rawPage.classification.breadcrumb)} ` +
            `!= ${JSON.stringify(item.target.pathSegments)}`,
        );
      }
      const reportedIds = batch.cards
        .map((card) => clean(card.sourceListingId))
        .sort();
      const parsedIds = rawPage.rows.map((row) => row.sourceListingId).sort();
      if (JSON.stringify(reportedIds) !== JSON.stringify(parsedIds)) {
        throw new Error(
          'PARSE_ERROR extension row IDs differ from hardened raw-HTML parser',
        );
      }
      if (batch.hasNextPage !== rawPage.hasNextPage) {
        throw new Error(
          'PARSE_ERROR next-page evidence differs between DOM report and raw HTML',
        );
      }
      const capturedAt = this.now().toISOString();
      const parsed = rawPage.rows.map((card, index) => {
        const listingDate = parseListingDate(card.listingDateText, this.now());
        if (!listingDate) {
          throw new Error(
            `UNKNOWN_DATA_FORMAT card ${index + 1}: listing date ${JSON.stringify(card.listingDateText)}`,
          );
        }
        return { card, listingDate };
      });

      for (let index = 1; index < parsed.length; index += 1) {
        if (parsed[index].listingDate > parsed[index - 1].listingDate) {
          throw new Error(
            `VALIDATION_FAIL page is not newest-first at card ${index + 1}`,
          );
        }
      }
      const pageNewest = parsed[0]?.listingDate ?? null;
      const pageOldest = parsed[parsed.length - 1]?.listingDate ?? null;
      if (
        item.lastOldestDate &&
        pageNewest &&
        pageNewest > item.lastOldestDate
      ) {
        throw new Error(
          'VALIDATION_FAIL pagination is not newest-first across pages',
        );
      }
      if (batch.hasNextPage && parsed.length === 0) {
        throw new Error('PARSE_ERROR empty page reported a next page');
      }

      const records: WeeklyRawObservation[] = parsed.map(
        ({ card, listingDate }) => ({
          source: this.opts.source,
          sourceListingId: clean(card.sourceListingId),
          sourceUrl: safeUrl(card.href, this.opts.baseUrl),
          title: clean(card.title),
          modelCells: card.modelCells.map(clean).filter(Boolean),
          listingDate,
          listingDateText: clean(card.listingDateText),
          year: parseYear(card.yearText),
          mileage: parseTurkishNumber(card.mileageText),
          price: parseTurkishNumber(card.priceText),
          currency: /TL/i.test(String(card.priceText ?? '')) ? 'TRY' : null,
          location: clean(card.locationText) || null,
          capturedAt,
          runId: this.opts.runId,
          requestedTargetId: item.target.targetId,
          requestedTargetPath: [...item.target.pathSegments],
          page: batch.page,
        }),
      );

      let newCount = 0;
      let runDuplicates = 0;
      const seen = new Set(item.seenIds);
      for (const record of records) {
        if (this.runSeenListingIds.has(record.sourceListingId)) {
          runDuplicates += 1;
        } else {
          this.runSeenListingIds.add(record.sourceListingId);
          if (!this.knownListingIds.has(record.sourceListingId)) newCount += 1;
        }
        seen.add(record.sourceListingId);
      }
      const appended = this.opts.evidence.appendMany(records);
      const duplicates = Math.max(runDuplicates, appended.duplicates);
      item.seenIds = [...seen];
      item.pagesVisited += 1;
      item.nextPage += 1;
      item.newListings += newCount;
      item.duplicates += duplicates;
      item.lastOldestDate = pageOldest ?? item.lastOldestDate;
      if (pageNewest && (!item.newestDate || pageNewest > item.newestDate)) {
        item.newestDate = pageNewest;
      }

      /**
       * GUVENLI SINIR: tarih + kimlik + ortusme (ya da ilk kosu politikasi).
       * Tavan asildi ve kanit yoksa hedef BASARISIZ, filigran degismez.
       */
      const decision = evaluateBoundary({
        hasNextPage: batch.hasNextPage,
        pagesVisited: item.pagesVisited,
        oldestDateSeen: item.lastOldestDate,
        seenIds: seen,
        prior: item.previousBoundaryDate
          ? {
              boundaryDate: item.previousBoundaryDate,
              boundaryIds: new Set(item.previousBoundaryIds),
              anchorIds: new Set(item.previousAnchorIds),
            }
          : null,
        today: sourceToday(this.now()),
        policy: this.policy,
      });
      item.boundaryReached = decision.reached;
      item.boundaryProof = decision.proof;
      item.boundaryReason = decision.reason;
      if (!decision.reached && decision.exhausted) {
        throw new Error(
          `VALIDATION_FAIL safe boundary not proven within ${this.policy.maxPagesPerTarget} page(s): ${decision.reason}`,
        );
      }

      let assignment: WeeklyAssignmentResult | null = null;
      let watermarkCommitted = false;
      if (item.boundaryReached) {
        const observations = this.opts.evidence.forTarget(item.target.targetId);
        assignment = assignWeeklyEvidence(this.opts.tree, observations);
        this.assertAssignmentSafe(assignment);
        const published = this.opts.publisher.publishTarget({
          hierarchyVersion: this.opts.snapshot.hierarchyVersion,
          tree: this.opts.tree,
          targets: this.opts.snapshot.targets,
          result: assignment,
          baselineAssignments: this.opts.baselineAssignments,
        });
        item.validation = published.validation;
        item.exact = assignment.stats.exact;
        item.ambiguous = assignment.stats.ambiguous;
        item.unresolved = assignment.stats.unresolved;

        // Bir sonraki kosunun siniri: en yeni gun + o gunun kimlikleri + capalar.
        const next = deriveNextBoundary(observations, this.anchorSize);
        const completedAt = this.now().toISOString();
        // This is intentionally last. Any exception above leaves the old
        // per-target boundary untouched.
        this.opts.states.commit(item.target.targetId, {
          boundaryDate: next.boundaryDate,
          boundaryIds: next.boundaryIds,
          anchorIds: next.anchorIds,
          pageBoundary: item.pagesVisited,
          proof: decision.proof,
          baselinePolicy: item.previousBoundaryDate
            ? null
            : {
                pages: this.policy.initialBaselinePages,
                days: this.policy.initialBaselineDays,
              },
          pagesVisited: item.pagesVisited,
          newListings: item.newListings,
          completedAt,
        });
        watermarkCommitted = true;
        item.status = 'COMPLETE';
        item.watermark = 'ADVANCED';
        item.finishedAt = completedAt;
        this.finishIfDone();
      }
      this.persist();
      return {
        accepted: appended.written,
        duplicates,
        newCount,
        exact: assignment?.stats.exact ?? 0,
        ambiguous: assignment?.stats.ambiguous ?? 0,
        unresolved: assignment?.stats.unresolved ?? 0,
        targetComplete: item.status === 'COMPLETE',
        boundaryReached: item.boundaryReached,
        boundaryProof: item.boundaryProof,
        boundaryReason: decision.reason,
        watermarkCommitted,
      };
    } catch (error: any) {
      const message = error?.message || String(error);
      const scope = this.failItem(item, message, 'PAGE_SUBMIT');

      /**
       * KURESEL engel: sonraki hedef de ayni duvara carpar, kosu durur ve
       * hata cagrana YUKSELIR (kopru HTTP hatasi dondurur).
       */
      if (scope === 'RUN' || error instanceof AutopilotProtocolError) {
        throw error instanceof AutopilotProtocolError
          ? error
          : new AutopilotProtocolError(message);
      }

      /**
       * HEDEFE OZEL engel: yalnizca BU hedef duser. Hata firlatmak koprunun
       * HTTP hatasi dondurmesine ve kosunun bitmesine yol acardi; bunun
       * yerine dogru sonuc dondurulur, uzanti `next` isteyip SONRAKI hedefe
       * gecer. Basarisizlik gizlenmez: `targetComplete` false, filigran HELD.
       */
      const verdict = classifyFailure(message);
      return {
        accepted: 0,
        duplicates: 0,
        newCount: 0,
        exact: 0,
        ambiguous: 0,
        unresolved: 0,
        targetComplete: false,
        boundaryReached: false,
        boundaryProof: null,
        boundaryReason: verdict.code,
        watermarkCommitted: false,
        targetFailed: true,
        failureCode: verdict.code,
        failureScope: verdict.scope,
        retryable: verdict.retryable,
      };
    }
  }

  reportAccessRestricted(report: AccessRestrictionReport): void {
    if (report.runId !== this.opts.runId) {
      throw new AutopilotProtocolError(
        `Access report run ${report.runId} != ${this.opts.runId}`,
      );
    }
    const item = this.items.find(
      (candidate) => candidate.status === 'IN_PROGRESS',
    );
    if (item)
      this.failItem(
        item,
        `${report.kind}: ${clean(report.evidence) || 'no detail'}`,
      );
    this.state = 'ACCESS_RESTRICTED';
    this.persist();
  }

  pause(): void {
    if (this.state === 'RUNNING') this.state = 'PAUSED';
    this.persist();
  }

  stop(): void {
    const item = this.items.find(
      (candidate) => candidate.status === 'IN_PROGRESS',
    );
    if (item) this.failItem(item, 'MANUAL_STOP_BEFORE_SAFE_BOUNDARY');
    this.state = 'INCOMPLETE';
    this.persist();
  }

  status(): WeeklyStatus {
    const current =
      this.items.find((item) => item.status === 'IN_PROGRESS') ??
      this.items.find((item) => item.status === 'PENDING') ??
      null;
    const complete = this.items.filter((item) => item.status === 'COMPLETE');
    const pending = this.items.filter(
      (item) => item.status === 'PENDING' || item.status === 'IN_PROGRESS',
    );
    const failed = this.items.filter((item) => item.status === 'INCOMPLETE');
    const durations = complete
      .filter((item) => item.startedAt && item.finishedAt)
      .map((item) => Date.parse(item.finishedAt!) - Date.parse(item.startedAt!))
      .filter((ms) => ms >= 0);
    const avgTargetMs = durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;
    return {
      runId: this.opts.runId,
      mode: 'WEEKLY_MARKET',
      state: this.state,
      source: this.opts.source,
      hierarchyVersion: this.opts.snapshot.hierarchyVersion,
      pathIntegrity: this.opts.snapshot.integrity,
      currentPath: current?.target.categoryPath ?? null,
      currentTrail: current ? [...current.target.pathSegments] : [],
      currentPage: current ? current.nextPage : null,
      doneJobs: complete.length,
      pendingJobs: pending.length,
      blockedJobs: failed.length,
      listingsObserved: this.runSeenListingIds.size,
      newCount: this.items.reduce((sum, item) => sum + item.newListings, 0),
      duplicateCount: this.items.reduce(
        (sum, item) => sum + item.duplicates,
        0,
      ),
      runComplete: this.state === 'COMPLETE',
      lastError: this.lastError,
      startedAt: this.createdAt,
      updatedAt: this.updatedAt,
      targetsTotal: this.items.length,
      targetsUnchanged: complete.filter((item) => item.newListings === 0)
        .length,
      targetsChanged: complete.filter((item) => item.newListings > 0).length,
      targetsFailed: failed.length,
      targetsFresh: this.items.filter((item) => !item.previousBoundaryDate)
        .length,
      currentTargetId: current?.target.targetId ?? null,
      currentTargetExactPath: current?.target.fullPath ?? null,
      currentBoundary: current
        ? (current.boundaryReason ??
          (current.previousBoundaryDate
            ? `previous boundary ${current.previousBoundaryDate} (${current.previousBoundaryIds.length} id(s), ${current.previousAnchorIds.length} anchor(s))`
            : `fresh target: baseline ${this.policy.initialBaselinePages} page(s)` +
              (this.policy.initialBaselineDays
                ? ` / ${this.policy.initialBaselineDays} day(s)`
                : '')))
        : null,
      pagesRequested: this.items.reduce(
        (sum, item) => sum + item.pagesVisited,
        0,
      ),
      pagesAvoidedByBoundary: complete
        .filter((item) => item.previousBoundaryDate)
        .reduce(
          (sum, item) =>
            sum +
            Math.max(0, this.policy.maxPagesPerTarget - item.pagesVisited),
          0,
        ),
      duplicateSightings: this.opts.evidence.stats().duplicates,
      exactAssignments: complete.reduce((sum, item) => sum + item.exact, 0),
      ambiguousAssignments: complete.reduce(
        (sum, item) => sum + item.ambiguous,
        0,
      ),
      unresolvedAssignments: complete.reduce(
        (sum, item) => sum + item.unresolved,
        0,
      ),
      watermarkHolds: this.items.filter((item) => item.watermark === 'HELD')
        .length,
      watermarkAdvances: this.items.filter(
        (item) => item.watermark === 'ADVANCED',
      ).length,
      boundaryPolicy: { ...this.policy },
      paceMs: this.paceMs,
      estimatedRemainingMs:
        avgTargetMs === null
          ? pending.length === 0
            ? 0
            : null
          : Math.round(avgTargetMs * pending.length),
      totalWallMs: Math.max(
        0,
        Date.parse(this.updatedAt) - Date.parse(this.createdAt),
      ),
      targets: this.items.map((item) => ({
        targetId: item.target.targetId,
        fullPath: item.target.fullPath,
        status: item.status,
        pagesVisited: item.pagesVisited,
        newListings: item.newListings,
        duplicates: item.duplicates,
        boundaryReached: item.boundaryReached,
        boundaryProof: item.boundaryProof,
        boundaryReason: item.boundaryReason,
        watermark: item.watermark,
        previousBoundaryDate: item.previousBoundaryDate,
        failure: item.failure,
      })),
    };
  }

  private assertSnapshot(): void {
    const gate = this.opts.snapshot.integrity;
    if (
      !gate.ok ||
      gate.skippedLevels !== 0 ||
      gate.wrongParents !== 0 ||
      gate.orphans !== 0 ||
      gate.ambiguousPaths !== 0
    ) {
      throw new AutopilotProtocolError(
        `PATH_INTEGRITY_GATE_FAIL ${JSON.stringify(gate)}`,
      );
    }
  }

  private itemFrom(
    target: MarketTarget,
    state: TargetRefreshState,
  ): WeeklyWorkItem {
    // INVALIDATED / FRESH / STALE: onceki sinir KULLANILMAZ (miras yok).
    const usable =
      state.status === 'COMPLETE' ||
      state.status === 'INCOMPLETE' ||
      state.status === 'PENDING';
    return {
      target,
      status: 'PENDING',
      nextPage: 1,
      pagesVisited: 0,
      newListings: 0,
      duplicates: 0,
      previousBoundaryDate: usable ? state.previousBoundaryDate : null,
      previousBoundaryIds: usable ? [...state.seenListingIdsAtBoundary] : [],
      previousAnchorIds: usable ? [...state.overlapAnchorIds] : [],
      seenIds: [],
      newestDate: null,
      lastOldestDate: null,
      failure: null,
      failureDetail: null,
      boundaryReached: false,
      boundaryProof: null,
      boundaryReason: null,
      watermark: null,
      exact: 0,
      ambiguous: 0,
      unresolved: 0,
      startedAt: null,
      finishedAt: null,
      validation: null,
    };
  }

  private currentItem(): WeeklyWorkItem {
    const item = this.items.find(
      (candidate) => candidate.status === 'IN_PROGRESS',
    );
    if (!item)
      throw new AutopilotProtocolError('No weekly target is awaiting a page');
    return item;
  }

  /**
   * GENIS KOSU OZETI — DOGRUYU SOYLER.
   *
   * Basarisiz hedefi olan bir kosu kendini temiz basari ILAN ETMEZ; ama
   * digerlerinin ilerlemesini de silmez. Cagiran taraf `failedTargetIds` ile
   * tam olarak neyi yeniden deneyecegini bilir.
   */
  summary(): WeeklyRunSummary {
    const by = (status: WeeklyItemStatus) =>
      this.items.filter((item) => item.status === status);
    const failed = by('INCOMPLETE');
    const complete = by('COMPLETE');
    const blocked = failed.filter(
      (item) => item.failureDetail?.scope === 'RUN',
    );
    return {
      runId: this.opts.runId,
      hierarchyVersion: this.opts.snapshot.hierarchyVersion,
      state: this.state,
      targetsSelected: this.items.length,
      targetsAttempted: this.items.filter((item) => item.startedAt !== null)
        .length,
      targetsCompleted: complete.length,
      targetsPending: by('PENDING').length + by('IN_PROGRESS').length,
      targetsFailed: failed.length,
      targetsBlocked: blocked.length,
      pagesRead: this.items.reduce((sum, item) => sum + item.pagesVisited, 0),
      newListings: this.items.reduce((sum, item) => sum + item.newListings, 0),
      duplicatesSuppressed: this.items.reduce(
        (sum, item) => sum + item.duplicates,
        0,
      ),
      exact: this.items.reduce((sum, item) => sum + item.exact, 0),
      ambiguousExcluded: this.items.reduce(
        (sum, item) => sum + item.ambiguous,
        0,
      ),
      unresolvedExcluded: this.items.reduce(
        (sum, item) => sum + item.unresolved,
        0,
      ),
      watermarksAdvanced: this.items.filter(
        (item) => item.watermark === 'ADVANCED',
      ).length,
      watermarksHeld: this.items.filter((item) => item.watermark === 'HELD')
        .length,
      failedTargetIds: failed.map((item) => item.target.targetId),
      failures: failed
        .map((item) => item.failureDetail)
        .filter((detail): detail is TargetFailureDetail => detail !== null),
    };
  }

  private nextDelay(): number {
    const spread = (this.random() * 2 - 1) * this.jitter;
    return Math.max(1000, Math.round(this.paceMs * (1 + spread)));
  }

  private validateBatch(item: WeeklyWorkItem, batch: PageBatch): void {
    if (batch.runId !== this.opts.runId) {
      // Protokol hatasi (yanlis kosuya gonderim): hedefe yazilmaz, YUKSELIR.
      throw new AutopilotProtocolError(`runId mismatch ${batch.runId}`);
    }
    if (batch.page !== item.nextPage) {
      throw new Error(
        `PARSE_ERROR expected page ${item.nextPage}, received ${batch.page}`,
      );
    }
    if (
      !sameCategoryUrl(
        this.opts.baseUrl,
        item.target.categoryPath,
        batch.nodePath,
      )
    ) {
      throw new Error(`REDIRECT_MISMATCH node path ${batch.nodePath}`);
    }
    if (
      !sameCategoryUrl(
        this.opts.baseUrl,
        item.target.categoryPath,
        batch.pageUrl,
      )
    ) {
      throw new Error(`REDIRECT_MISMATCH final URL ${batch.pageUrl}`);
    }
    if (batch.cards.length > MAX_CARDS_PER_PAGE) {
      throw new Error(
        `PARSE_ERROR ${batch.cards.length} cards exceeds ${MAX_CARDS_PER_PAGE}`,
      );
    }
    if (batch.parseFailures > 0) {
      throw new Error(
        `PARSE_ERROR page reported ${batch.parseFailures} row failure(s)`,
      );
    }
    const ids = batch.cards.map((card) => clean(card.sourceListingId));
    if (ids.some((id) => !id)) throw new Error('PARSE_ERROR empty listing id');
  }

  private assertAssignmentSafe(result: WeeklyAssignmentResult): void {
    const stats = result.stats;
    if (
      stats.doubleExactAssignments !== 0 ||
      stats.crossPoolDuplicates !== 0 ||
      stats.siblingLeakage !== 0 ||
      stats.parentLeakage !== 0
    ) {
      throw new Error(`VALIDATION_FAIL ${JSON.stringify(stats)}`);
    }
  }

  /**
   * Bir hedefi basarisiz isaretler.
   *
   * KOSU DURUMU BURADA KAPATILMAZ. Onceden `state = 'INCOMPLETE'` yaziliyordu
   * ve `nextDirective` 'RUNNING' degilse HALT dondugu icin TEK hata butun
   * kuyrugu kapatiyordu. Artik kosu durumu yalnizca yapilacak is kalmadiginda
   * (ya da engel KURESEL oldugunda) yerlesir.
   *
   * Hicbir kapsam basarisiz hedefi COMPLETE yapmaz; filigran HELD kalir.
   */
  private failItem(
    item: WeeklyWorkItem,
    failure: string,
    stage: TargetFailureDetail['stage'] = 'PAGE_SUBMIT',
  ): FailureScope {
    const verdict = classifyFailure(failure);
    item.status = 'INCOMPLETE';
    item.failure = failure;
    item.watermark = 'HELD';
    item.finishedAt = this.now().toISOString();
    item.failureDetail = {
      runId: this.opts.runId,
      targetId: item.target.targetId,
      exactPath: item.target.pathSegments.join(' / '),
      hierarchyVersion: this.opts.snapshot.hierarchyVersion,
      ordinal: this.items.indexOf(item),
      status: 'INCOMPLETE',
      stage,
      code: verdict.code,
      scope: verdict.scope,
      retryable: verdict.retryable,
      message: failure.slice(0, 500),
      at: item.finishedAt,
      pagesRead: item.pagesVisited,
      rawEvidenceWritten: item.pagesVisited > 0,
      stagedObservations: item.newListings,
      watermarkAdvanced: false,
    };
    this.lastError = failure;
    this.opts.states.fail(
      item.target.targetId,
      failure,
      item.pagesVisited,
      item.newListings,
    );
    if (verdict.scope === 'RUN') this.state = 'INCOMPLETE';
    else this.settleIfNoWorkLeft();
    this.persist();
    return verdict.scope;
  }

  /**
   * Kuyrukta is KALMADIYSA kosu durumunu yerlestirir.
   *
   * Eskiden her tamamlamada cagriliyor ve "herhangi bir item INCOMPLETE ise
   * kosu INCOMPLETE" diyordu; bu, bekleyen hedefler dururken kuyrugu
   * kapatiyordu. Artik once "yapilacak is var mi" sorulur.
   */
  private settleIfNoWorkLeft(): void {
    const pending = this.items.some(
      (item) => item.status === 'PENDING' || item.status === 'IN_PROGRESS',
    );
    if (pending) return;
    if (this.items.every((item) => item.status === 'COMPLETE')) {
      this.state = 'COMPLETE';
      this.lastError = null;
    } else {
      this.state = 'INCOMPLETE';
    }
  }

  /** Geriye donuk ad: yerlesme karari tek yerde (`settleIfNoWorkLeft`). */
  private finishIfDone(): void {
    this.settleIfNoWorkLeft();
  }

  private persist(): void {
    this.updatedAt = this.now().toISOString();
    this.opts.checkpointFile.save({
      version: WEEKLY_SESSION_VERSION,
      runId: this.opts.runId,
      source: this.opts.source,
      baseUrl: this.opts.baseUrl,
      hierarchyVersion: this.opts.snapshot.hierarchyVersion,
      state: this.state,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      boundaryPolicy: this.policy,
      anchorSize: this.anchorSize,
      paceMs: this.paceMs,
      jitter: this.jitter,
      evidenceFile: this.opts.evidence.path,
      items: this.items,
      runSeenListingIds: [...this.runSeenListingIds].sort(),
      lastError: this.lastError,
    });
  }
}
