/**
 * HEDEF BASINA ISLEMSEL FILIGRAN DEPOSU.
 *
 * Anahtar: KESIN dugum kimligi (targetId) + kimlik ozeti (kok -> hedef
 * zinciri + kaynak yolu). Marka adi, model metni ya da duz categoryString
 * ASLA anahtar degildir.
 *
 * Filigran yalnizca `commit` ile ilerler ve `commit` bir hedef tazelemesinin
 * SON adimidir. Basarisizlik (`fail`), kesinti (IN_PROGRESS -> INCOMPLETE) ve
 * kimlik degisimi (INVALIDATED) onceki basarili siniri hicbir zaman
 * degistirmez; kimlik degisiminde sinir SIFIRLANIR (miras yok).
 *
 * v2: sinir artik tarih + o gunun kimlikleri + sinirin altindaki capa
 * kimlikleri + kanit turu + baslangic politikasidir (bkz. boundary-rule).
 * v1 dosyalari okunur ve eksik alanlar bos capa ile doldurulur (bir sonraki
 * kosu tarih penceresiyle kanitlar ve capalari yazar). Bozuk dosya sessizce
 * sifirlanmaz: checksum/surum hatasi firlatir.
 */
import { AtomicChecksummedFile } from '../checkpoint-store';
import { BoundaryProof } from './boundary-rule';
import { MarketTarget, MarketTargetSnapshot } from './hierarchy-gate';

export const TARGET_STATE_VERSION = 'weekly-target-state-v2';
const LEGACY_TARGET_STATE_VERSION = 'weekly-target-state-v1';

export type TargetRefreshStatus =
  | 'FRESH'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETE'
  | 'INCOMPLETE'
  | 'INVALIDATED'
  /** Hedef artik gecerli kesin-terminal kumesinde degil (ebeveyn oldu / kalkti). */
  | 'STALE';

export interface TargetRefreshState {
  targetId: string;
  targetIdentityHash: string;
  fullPath: string;
  hierarchyVersion: string;
  lastSuccessfulRefreshAt: string | null;
  /** Son basarili tazelemenin en yeni ilan gunu (= previousCutoffDate). */
  previousBoundaryDate: string | null;
  /** O gun gorulen tum kimlikler (= boundaryListingIds). */
  seenListingIdsAtBoundary: string[];
  /** Sinir gununden eski ilk N kimlik (kaynak sirasiyla) — ortusme capalari. */
  overlapAnchorIds: string[];
  /** Son basarili kosuda sinirin kanitlandigi sayfa. */
  lastSuccessfulPageBoundary: number | null;
  /** Son basarili kosunun sinir kaniti. */
  lastBoundaryProof: BoundaryProof | null;
  /** Ilk basarili kosuda uygulanan baslangic politikasi (denetim icin). */
  baselinePolicy: { pages: number; days: number | null } | null;
  pagesVisitedLastRun: number;
  newListingsLastRun: number;
  status: TargetRefreshStatus;
  lastFailure: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TargetStateArtifact {
  version: string;
  updatedAt: string;
  targets: Record<string, TargetRefreshState>;
}

export interface SnapshotReconciliation {
  fresh: number;
  carried: number;
  invalidated: number;
  stale: number;
  interrupted: number;
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
    overlapAnchorIds: [],
    lastSuccessfulPageBoundary: null,
    lastBoundaryProof: null,
    baselinePolicy: null,
    pagesVisitedLastRun: 0,
    newListingsLastRun: 0,
    status,
    lastFailure: null,
    createdAt: now,
    updatedAt: now,
  };
}

function clone(state: TargetRefreshState): TargetRefreshState {
  return {
    ...state,
    seenListingIdsAtBoundary: [...state.seenListingIdsAtBoundary],
    overlapAnchorIds: [...state.overlapAnchorIds],
    baselinePolicy: state.baselinePolicy ? { ...state.baselinePolicy } : null,
  };
}

/** v1 kaydini v2 sekline getirir; kural alanlari bos, sinir korunur. */
function migrate(raw: Partial<TargetRefreshState> & { targetId: string }): TargetRefreshState {
  return {
    targetId: raw.targetId,
    targetIdentityHash: raw.targetIdentityHash ?? '',
    fullPath: raw.fullPath ?? '',
    hierarchyVersion: raw.hierarchyVersion ?? '',
    lastSuccessfulRefreshAt: raw.lastSuccessfulRefreshAt ?? null,
    previousBoundaryDate: raw.previousBoundaryDate ?? null,
    seenListingIdsAtBoundary: [...(raw.seenListingIdsAtBoundary ?? [])],
    overlapAnchorIds: [...(raw.overlapAnchorIds ?? [])],
    lastSuccessfulPageBoundary: raw.lastSuccessfulPageBoundary ?? null,
    lastBoundaryProof: raw.lastBoundaryProof ?? null,
    baselinePolicy: raw.baselinePolicy ? { ...raw.baselinePolicy } : null,
    pagesVisitedLastRun: raw.pagesVisitedLastRun ?? 0,
    newListingsLastRun: raw.newListingsLastRun ?? 0,
    status: raw.status ?? 'FRESH',
    lastFailure: raw.lastFailure ?? null,
    createdAt: raw.createdAt ?? raw.updatedAt ?? new Date(0).toISOString(),
    updatedAt: raw.updatedAt ?? new Date(0).toISOString(),
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
    if (
      (artifact.version !== TARGET_STATE_VERSION &&
        artifact.version !== LEGACY_TARGET_STATE_VERSION) ||
      !artifact.targets ||
      typeof artifact.targets !== 'object'
    ) {
      throw new Error(
        `Target state at ${this.path} is not ${TARGET_STATE_VERSION} (or the readable ${LEGACY_TARGET_STATE_VERSION})`,
      );
    }
    const targets: Record<string, TargetRefreshState> = {};
    for (const [id, raw] of Object.entries(artifact.targets)) {
      if (!raw || typeof raw !== 'object' || (raw as TargetRefreshState).targetId !== id) {
        throw new Error(`Target state at ${this.path} has a corrupt entry for ${id}`);
      }
      targets[id] = migrate(raw as TargetRefreshState);
    }
    return { version: TARGET_STATE_VERSION, updatedAt: artifact.updatedAt, targets };
  }

  get(targetId: string): TargetRefreshState | null {
    const state = this.read().targets[targetId];
    return state ? clone(state) : null;
  }

  /**
   * Carry a watermark only when the complete target identity is unchanged.
   * An unrelated hierarchy change merely rebinds hierarchyVersion. If a former
   * terminal becomes a parent it is absent from the target snapshot, and its
   * new children have different IDs/hashes and therefore start fresh.
   */
  reconcile(target: MarketTarget): TargetRefreshState {
    const artifact = this.read();
    const next = this.reconcileInto(artifact, target);
    this.save(artifact);
    return clone(next);
  }

  /**
   * TUM DONDURULMUS KUMEYE KARSI UZLASTIRMA (hiyerarsi mutasyonu).
   *
   *   - snapshot'ta olan, ayni kimlik  -> tasinir (surum yeniden baglanir)
   *   - snapshot'ta olan, farkli kimlik -> INVALIDATED, sinir sifir (miras yok)
   *   - snapshot'ta OLMAYAN             -> STALE: hedef artik kesin terminal
   *                                        degil; sinir denetim icin kalir ama
   *                                        hicbir cocuga aktarilmaz
   *   - IN_PROGRESS kalanlar            -> INCOMPLETE (kesinti)
   */
  reconcileSnapshot(snapshot: MarketTargetSnapshot): SnapshotReconciliation {
    const artifact = this.read();
    const now = this.now().toISOString();
    const result: SnapshotReconciliation = { fresh: 0, carried: 0, invalidated: 0, stale: 0, interrupted: 0 };
    const inSnapshot = new Set<string>();
    for (const target of snapshot.targets) {
      inSnapshot.add(target.targetId);
      const before = artifact.targets[target.targetId];
      const next = this.reconcileInto(artifact, target);
      if (!before) result.fresh += 1;
      else if (next.status === 'INVALIDATED' && before.status !== 'INVALIDATED') result.invalidated += 1;
      else {
        result.carried += 1;
        if (before.status === 'IN_PROGRESS') result.interrupted += 1;
      }
    }
    for (const [id, state] of Object.entries(artifact.targets)) {
      if (inSnapshot.has(id) || state.status === 'STALE') continue;
      artifact.targets[id] = {
        ...state,
        status: 'STALE',
        lastFailure: `TARGET_NOT_IN_SNAPSHOT ${snapshot.hierarchyVersion}`,
        updatedAt: now,
      };
      result.stale += 1;
    }
    this.save(artifact);
    return result;
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
      anchorIds?: string[];
      pageBoundary?: number | null;
      proof?: BoundaryProof | null;
      baselinePolicy?: { pages: number; days: number | null } | null;
      pagesVisited: number;
      newListings: number;
      completedAt: string;
    },
  ): TargetRefreshState {
    const current = this.get(targetId);
    if (!current) throw new Error(`Cannot commit unknown target ${targetId}`);
    if (current.status === 'STALE' || current.status === 'INVALIDATED') {
      throw new Error(`Cannot commit ${current.status} target ${targetId}; reconcile against the current snapshot first`);
    }

    const boundaryDate = input.boundaryDate ?? current.previousBoundaryDate;
    let boundaryIds = [...new Set(input.boundaryIds)].sort();
    let anchorIds = [...new Set(input.anchorIds ?? [])];
    if (input.boundaryDate === null) {
      // Bu kosu hicbir satir gormedi: onceki sinir ve capalar aynen korunur.
      boundaryIds = [...current.seenListingIdsAtBoundary];
      anchorIds = [...current.overlapAnchorIds];
    } else if (boundaryDate === current.previousBoundaryDate) {
      // Ayni gun: o gunun kimlik kumesi BIRLESIR (gec eklenenler unutulmaz).
      boundaryIds = [
        ...new Set([...current.seenListingIdsAtBoundary, ...boundaryIds]),
      ].sort();
      if (anchorIds.length === 0) anchorIds = [...current.overlapAnchorIds];
    }

    return this.patch(targetId, {
      status: 'COMPLETE',
      hierarchyVersion: current.hierarchyVersion,
      lastSuccessfulRefreshAt: input.completedAt,
      previousBoundaryDate: boundaryDate,
      seenListingIdsAtBoundary: boundaryIds,
      overlapAnchorIds: anchorIds,
      lastSuccessfulPageBoundary: input.pageBoundary ?? current.lastSuccessfulPageBoundary,
      lastBoundaryProof: input.proof ?? current.lastBoundaryProof,
      baselinePolicy: current.baselinePolicy ?? input.baselinePolicy ?? null,
      pagesVisitedLastRun: input.pagesVisited,
      newListingsLastRun: input.newListings,
      lastFailure: null,
    });
  }

  private reconcileInto(artifact: TargetStateArtifact, target: MarketTarget): TargetRefreshState {
    const now = this.now().toISOString();
    const existing = artifact.targets[target.targetId];
    let next: TargetRefreshState;

    if (!existing) {
      next = fresh(target, now);
    } else if (existing.targetIdentityHash !== target.targetIdentityHash) {
      next = fresh(target, now, 'INVALIDATED');
      next.createdAt = existing.createdAt;
      next.lastFailure = 'TARGET_IDENTITY_CHANGED';
    } else {
      next = {
        ...clone(existing),
        fullPath: target.fullPath,
        hierarchyVersion: target.hierarchyVersion,
        status:
          existing.status === 'IN_PROGRESS'
            ? 'INCOMPLETE'
            : existing.status === 'STALE'
              ? 'COMPLETE'
              : existing.status,
        lastFailure:
          existing.status === 'IN_PROGRESS'
            ? 'INTERRUPTED_BEFORE_WATERMARK_COMMIT'
            : existing.status === 'STALE'
              ? null
              : existing.lastFailure,
        updatedAt: now,
      };
      // STALE ama sinir hic kanitlanmamis bir hedef yeniden gorulurse taze sayilir.
      if (existing.status === 'STALE' && !existing.lastSuccessfulRefreshAt) next.status = 'FRESH';
    }
    artifact.targets[target.targetId] = next;
    return next;
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
    return clone(next);
  }

  private save(artifact: TargetStateArtifact): void {
    artifact.version = TARGET_STATE_VERSION;
    artifact.updatedAt = this.now().toISOString();
    this.file.save(artifact);
  }
}
