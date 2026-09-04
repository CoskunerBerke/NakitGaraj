/**
 * WEEKLY EXACT-TARGET SESSION.
 *
 * This is deliberately separate from the broad legacy market collector. It
 * consumes a frozen, integrity-gated target snapshot and acquires raw rows;
 * canonical placement remains in the existing listing resolver.
 */
import {
  AccessRestrictionReport,
  AutopilotDirective,
  AutopilotProtocolError,
  AutopilotState,
  PageBatch,
} from '../autopilot/autopilot-contracts';
import { AtomicChecksummedFile } from '../checkpoint-store';
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
import { WeeklyEvidenceStore, WeeklyRawObservation } from './evidence-store';
import { MarketTarget, MarketTargetSnapshot } from './hierarchy-gate';
import { addDays, parseListingDate } from './listing-date';
import { TargetRefreshState, TargetStateStore } from './target-state-store';
import { parseRawWeeklyPage, saveRawWeeklyPage } from './raw-page';

export const WEEKLY_SESSION_VERSION = 'weekly-market-session-v1';

type WeeklyItemStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'INCOMPLETE';

interface WeeklyWorkItem {
  target: MarketTarget;
  status: WeeklyItemStatus;
  nextPage: number;
  pagesVisited: number;
  newListings: number;
  duplicates: number;
  previousBoundaryDate: string | null;
  previousBoundaryIds: string[];
  newestDate: string | null;
  newestDateIds: string[];
  lastOldestDate: string | null;
  failure: string | null;
  boundaryReached: boolean;
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
  overlapDays: number;
  maxPagesPerTarget: number;
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
  overlapDays?: number;
  maxPagesPerTarget?: number;
  now?: () => Date;
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
  watermarkCommitted: boolean;
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
  targets: Array<{
    targetId: string;
    fullPath: string;
    status: WeeklyItemStatus;
    pagesVisited: number;
    newListings: number;
    duplicates: number;
    boundaryReached: boolean;
    failure: string | null;
  }>;
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
  private readonly overlapDays: number;
  private readonly maxPagesPerTarget: number;
  private readonly now: () => Date;

  private constructor(private readonly opts: WeeklySessionOptions) {
    this.now = opts.now ?? (() => new Date());
    this.createdAt = this.now().toISOString();
    this.updatedAt = this.createdAt;
    this.knownListingIds = new Set(opts.knownListingIds ?? []);
    for (const id of opts.publisher.knownListingIds())
      this.knownListingIds.add(id);
    this.overlapDays = opts.overlapDays ?? 1;
    this.maxPagesPerTarget = opts.maxPagesPerTarget ?? 20;
    if (!Number.isInteger(this.overlapDays) || this.overlapDays < 1) {
      throw new Error('Weekly overlapDays must be an integer >= 1');
    }
    if (
      !Number.isInteger(this.maxPagesPerTarget) ||
      this.maxPagesPerTarget < 1
    ) {
      throw new Error('Weekly maxPagesPerTarget must be a positive integer');
    }
  }

  static start(opts: WeeklySessionOptions): WeeklyMarketSession {
    const session = new WeeklyMarketSession(opts);
    session.assertSnapshot();
    opts.evidence.open();
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
      newestDateIds: [...item.newestDateIds],
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
      }
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
      expectedPages: this.maxPagesPerTarget,
      targetId: item.target.targetId,
      hierarchyVersion: item.target.hierarchyVersion,
      captureRawHtml: true,
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
                : pageStatus === 'PARSE_ERROR'
                  ? 'PARSE_ERROR'
                  : 'UNKNOWN_DATA_FORMAT';
        throw new Error(`${failure} raw page classified as ${pageStatus}`);
      }
      if (
        !rawPage.classification.breadcrumb ||
        rawPage.classification.breadcrumb.join('\u0000') !==
          item.target.pathSegments.join('\u0000')
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
      if (reportedIds.join('\u0000') !== parsedIds.join('\u0000')) {
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
      for (const record of records) {
        if (this.runSeenListingIds.has(record.sourceListingId)) {
          runDuplicates += 1;
        } else {
          this.runSeenListingIds.add(record.sourceListingId);
          if (!this.knownListingIds.has(record.sourceListingId)) newCount += 1;
        }
      }
      const appended = this.opts.evidence.appendMany(records);
      const duplicates = Math.max(runDuplicates, appended.duplicates);
      item.pagesVisited += 1;
      item.nextPage += 1;
      item.newListings += newCount;
      item.duplicates += duplicates;
      item.lastOldestDate = pageOldest ?? item.lastOldestDate;

      for (const record of records) {
        if (!item.newestDate || record.listingDate > item.newestDate) {
          item.newestDate = record.listingDate;
          item.newestDateIds = [record.sourceListingId];
        } else if (record.listingDate === item.newestDate) {
          item.newestDateIds.push(record.sourceListingId);
        }
      }
      item.newestDateIds = [...new Set(item.newestDateIds)].sort();

      const overlapStart = item.previousBoundaryDate
        ? addDays(item.previousBoundaryDate, -this.overlapDays)
        : null;
      item.boundaryReached =
        !batch.hasNextPage ||
        Boolean(overlapStart && pageOldest && pageOldest < overlapStart);

      if (
        !item.boundaryReached &&
        item.pagesVisited >= this.maxPagesPerTarget
      ) {
        throw new Error(
          `VALIDATION_FAIL safe boundary not reached within ${this.maxPagesPerTarget} pages`,
        );
      }

      let assignment: WeeklyAssignmentResult | null = null;
      let watermarkCommitted = false;
      if (item.boundaryReached) {
        assignment = assignWeeklyEvidence(
          this.opts.tree,
          this.opts.evidence.forTarget(item.target.targetId),
        );
        this.assertAssignmentSafe(assignment);
        const published = this.opts.publisher.publishTarget({
          hierarchyVersion: this.opts.snapshot.hierarchyVersion,
          tree: this.opts.tree,
          targets: this.opts.snapshot.targets,
          result: assignment,
          baselineAssignments: this.opts.baselineAssignments,
        });
        item.validation = published.validation;

        // This is intentionally last. Any exception above leaves the old
        // per-target boundary untouched.
        this.opts.states.commit(item.target.targetId, {
          boundaryDate: item.newestDate ?? item.previousBoundaryDate,
          boundaryIds: item.newestDate
            ? item.newestDateIds
            : item.previousBoundaryIds,
          pagesVisited: item.pagesVisited,
          newListings: item.newListings,
          completedAt: this.now().toISOString(),
        });
        watermarkCommitted = true;
        item.status = 'COMPLETE';
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
        watermarkCommitted,
      };
    } catch (error: any) {
      this.failItem(item, error?.message || String(error));
      throw error instanceof AutopilotProtocolError
        ? error
        : new AutopilotProtocolError(error?.message || String(error));
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
      doneJobs: this.items.filter((item) => item.status === 'COMPLETE').length,
      pendingJobs: this.items.filter(
        (item) => item.status === 'PENDING' || item.status === 'IN_PROGRESS',
      ).length,
      blockedJobs: this.items.filter((item) => item.status === 'INCOMPLETE')
        .length,
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
      targets: this.items.map((item) => ({
        targetId: item.target.targetId,
        fullPath: item.target.fullPath,
        status: item.status,
        pagesVisited: item.pagesVisited,
        newListings: item.newListings,
        duplicates: item.duplicates,
        boundaryReached: item.boundaryReached,
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
    return {
      target,
      status: 'PENDING',
      nextPage: 1,
      pagesVisited: 0,
      newListings: 0,
      duplicates: 0,
      previousBoundaryDate: state.previousBoundaryDate,
      previousBoundaryIds: [...state.seenListingIdsAtBoundary],
      newestDate: null,
      newestDateIds: [],
      lastOldestDate: null,
      failure: null,
      boundaryReached: false,
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

  private validateBatch(item: WeeklyWorkItem, batch: PageBatch): void {
    if (batch.runId !== this.opts.runId)
      throw new Error(`runId mismatch ${batch.runId}`);
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

  private failItem(item: WeeklyWorkItem, failure: string): void {
    item.status = 'INCOMPLETE';
    item.failure = failure;
    this.lastError = failure;
    this.state = 'INCOMPLETE';
    this.opts.states.fail(
      item.target.targetId,
      failure,
      item.pagesVisited,
      item.newListings,
    );
    this.persist();
  }

  private finishIfDone(): void {
    if (this.items.every((item) => item.status === 'COMPLETE')) {
      this.state = 'COMPLETE';
      this.lastError = null;
    } else if (this.items.some((item) => item.status === 'INCOMPLETE')) {
      this.state = 'INCOMPLETE';
    }
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
      overlapDays: this.overlapDays,
      maxPagesPerTarget: this.maxPagesPerTarget,
      evidenceFile: this.opts.evidence.path,
      items: this.items,
      runSeenListingIds: [...this.runSeenListingIds].sort(),
      lastError: this.lastError,
    });
  }
}
