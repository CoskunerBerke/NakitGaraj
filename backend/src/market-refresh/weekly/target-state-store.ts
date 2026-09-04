/** Per-exact-target transactional watermark store. */
import { AtomicChecksummedFile } from '../checkpoint-store';
import { MarketTarget } from './hierarchy-gate';

export const TARGET_STATE_VERSION = 'weekly-target-state-v1';

export type TargetRefreshStatus =
  | 'FRESH'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETE'
  | 'INCOMPLETE'
  | 'INVALIDATED';

export interface TargetRefreshState {
  targetId: string;
  targetIdentityHash: string;
  fullPath: string;
  hierarchyVersion: string;
  lastSuccessfulRefreshAt: string | null;
  /** Newest listing calendar day seen by the last successful refresh. */
  previousBoundaryDate: string | null;
  /** Every listing ID seen on previousBoundaryDate, including excluded rows. */
  seenListingIdsAtBoundary: string[];
  pagesVisitedLastRun: number;
  newListingsLastRun: number;
  status: TargetRefreshStatus;
  lastFailure: string | null;
  updatedAt: string;
}

export interface TargetStateArtifact {
  version: string;
  updatedAt: string;
  targets: Record<string, TargetRefreshState>;
}

function fresh(
  target: MarketTarget,
  now: string,
  status: TargetRefreshStatus = 'FRESH',
): TargetRefreshState {
  return {
    targetId: target.targetId,
    targetIdentityHash: target.targetIdentityHash,
    fullPath: target.fullPath,
    hierarchyVersion: target.hierarchyVersion,
    lastSuccessfulRefreshAt: null,
    previousBoundaryDate: null,
    seenListingIdsAtBoundary: [],
    pagesVisitedLastRun: 0,
    newListingsLastRun: 0,
    status,
    lastFailure: null,
    updatedAt: now,
  };
}

export class TargetStateStore {
  private readonly file: AtomicChecksummedFile<TargetStateArtifact>;

  constructor(
    filePath: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.file = new AtomicChecksummedFile<TargetStateArtifact>(filePath);
  }

  get path(): string {
    return this.file.path;
  }

  read(): TargetStateArtifact {
    if (!this.file.exists()) {
      return {
        version: TARGET_STATE_VERSION,
        updatedAt: this.now().toISOString(),
        targets: {},
      };
    }
    const artifact = this.file.load();
    if (artifact.version !== TARGET_STATE_VERSION || !artifact.targets) {
      throw new Error(
        `Target state at ${this.path} is not ${TARGET_STATE_VERSION}`,
      );
    }
    return artifact;
  }

  get(targetId: string): TargetRefreshState | null {
    return this.read().targets[targetId] ?? null;
  }

  /**
   * Carry a watermark only when the complete target identity is unchanged.
   * An unrelated hierarchy change merely rebinds hierarchyVersion. If a former
   * terminal becomes a parent it is absent from the target snapshot, and its
   * new children have different IDs/hashes and therefore start fresh.
   */
  reconcile(target: MarketTarget): TargetRefreshState {
    const artifact = this.read();
    const now = this.now().toISOString();
    const existing = artifact.targets[target.targetId];
    let next: TargetRefreshState;

    if (!existing) {
      next = fresh(target, now);
    } else if (existing.targetIdentityHash !== target.targetIdentityHash) {
      next = fresh(target, now, 'INVALIDATED');
      next.lastFailure = 'TARGET_IDENTITY_CHANGED';
    } else {
      next = {
        ...existing,
        fullPath: target.fullPath,
        hierarchyVersion: target.hierarchyVersion,
        status:
          existing.status === 'IN_PROGRESS' ? 'INCOMPLETE' : existing.status,
        lastFailure:
          existing.status === 'IN_PROGRESS'
            ? 'INTERRUPTED_BEFORE_WATERMARK_COMMIT'
            : existing.lastFailure,
        updatedAt: now,
      };
    }
    artifact.targets[target.targetId] = next;
    this.save(artifact);
    return {
      ...next,
      seenListingIdsAtBoundary: [...next.seenListingIdsAtBoundary],
    };
  }

  begin(target: MarketTarget): TargetRefreshState {
    const current = this.reconcile(target);
    return this.patch(
      target.targetId,
      {
        status: 'IN_PROGRESS',
        pagesVisitedLastRun: 0,
        newListingsLastRun: 0,
        lastFailure: null,
      },
      current,
    );
  }

  fail(
    targetId: string,
    failure: string,
    pagesVisited: number,
    newListings: number,
  ): TargetRefreshState {
    return this.patch(targetId, {
      status: 'INCOMPLETE',
      pagesVisitedLastRun: pagesVisited,
      newListingsLastRun: newListings,
      lastFailure: failure,
    });
  }

  commit(
    targetId: string,
    input: {
      boundaryDate: string | null;
      boundaryIds: string[];
      pagesVisited: number;
      newListings: number;
      completedAt: string;
    },
  ): TargetRefreshState {
    const current = this.get(targetId);
    if (!current) throw new Error(`Cannot commit unknown target ${targetId}`);

    const boundaryDate = input.boundaryDate ?? current.previousBoundaryDate;
    let boundaryIds = [...new Set(input.boundaryIds)].sort();
    if (boundaryDate === current.previousBoundaryDate) {
      boundaryIds = [
        ...new Set([...current.seenListingIdsAtBoundary, ...boundaryIds]),
      ].sort();
    }

    return this.patch(targetId, {
      status: 'COMPLETE',
      hierarchyVersion: current.hierarchyVersion,
      lastSuccessfulRefreshAt: input.completedAt,
      previousBoundaryDate: boundaryDate,
      seenListingIdsAtBoundary: boundaryIds,
      pagesVisitedLastRun: input.pagesVisited,
      newListingsLastRun: input.newListings,
      lastFailure: null,
    });
  }

  private patch(
    targetId: string,
    values: Partial<TargetRefreshState>,
    fallback?: TargetRefreshState,
  ): TargetRefreshState {
    const artifact = this.read();
    const current = artifact.targets[targetId] ?? fallback;
    if (!current) throw new Error(`Unknown target state ${targetId}`);
    const next = { ...current, ...values, updatedAt: this.now().toISOString() };
    artifact.targets[targetId] = next;
    this.save(artifact);
    return {
      ...next,
      seenListingIdsAtBoundary: [...next.seenListingIdsAtBoundary],
    };
  }

  private save(artifact: TargetStateArtifact): void {
    artifact.updatedAt = this.now().toISOString();
    this.file.save(artifact);
  }
}
