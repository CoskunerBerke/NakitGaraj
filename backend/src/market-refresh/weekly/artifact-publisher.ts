/**
 * VERSIONED WEEKLY MARKET ARTIFACT — validate first, publish by pointer swap.
 *
 * Candidate data is written to an immutable release file. Only after every
 * invariant passes is `current.json` atomically replaced. A failed candidate
 * can therefore never overwrite the last-known-good release.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { HierarchyTree } from '../../vehicle-hierarchy/hierarchy-tree';
import {
  WeeklyAssignmentResult,
  WeeklyListingAssignment,
} from './assignment-stage';
import { MarketTarget } from './hierarchy-gate';

export const WEEKLY_MARKET_ARTIFACT_VERSION = 'weekly-market-artifact-v1';
export const WEEKLY_MARKET_POINTER_VERSION = 'weekly-market-pointer-v1';

export interface WeeklyMarketArtifact {
  version: typeof WEEKLY_MARKET_ARTIFACT_VERSION;
  hierarchyVersion: string;
  publishedAt: string;
  assignments: Record<string, WeeklyListingAssignment>;
  pools: Record<string, string[]>;
}

interface CurrentPointer {
  version: typeof WEEKLY_MARKET_POINTER_VERSION;
  release: string;
  sha256: string;
  publishedAt: string;
  hierarchyVersion: string;
}

export interface PublishValidationReport {
  doubleExactAssignments: number;
  crossPoolDuplicates: number;
  siblingLeakage: number;
  parentLeakage: number;
  missingAssignments: number;
  wrongPoolAssignments: number;
  unknownTargetPools: number;
  ok: boolean;
}

export interface PublishResult {
  artifact: WeeklyMarketArtifact;
  validation: PublishValidationReport;
  releaseFile: string;
  /** Birlesik icerik yayindakiyle AYNI: yeni surum dosyasi yazilmadi, isaretci degismedi. */
  unchanged: boolean;
}

export interface BaselineExactAssignment {
  nodeId: string;
  evidence: string;
  depth: number;
}

function findPackageRoot(startDir: string): string {
  let dir = startDir;
  for (let up = 0; up < 8; up += 1) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

export function resolveWeeklyMarketArtifactRoot(): string {
  const configured = process.env.WEEKLY_MARKET_ARTIFACT_ROOT?.trim();
  if (configured) return path.resolve(configured);
  return path.join(
    findPackageRoot(__dirname),
    'data',
    'market-refresh',
    'weekly',
    'published',
  );
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function atomicWrite(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const fd = fs.openSync(tmp, 'wx');
  try {
    fs.writeFileSync(fd, contents, 'utf-8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
}

function validate(
  tree: HierarchyTree,
  targets: Map<string, MarketTarget>,
  result: WeeklyAssignmentResult,
): PublishValidationReport {
  const listingPool = new Map<string, string>();
  let crossPoolDuplicates = result.stats.crossPoolDuplicates;
  let missingAssignments = 0;
  let wrongPoolAssignments = 0;
  let unknownTargetPools = 0;

  for (const [nodeId, listingIds] of Object.entries(result.pools)) {
    const target = targets.get(nodeId);
    const node = tree.nodes.get(nodeId);
    if (
      !target ||
      !node ||
      !node.isLeaf ||
      node.hasChildren ||
      !node.terminalConfirmed ||
      node.childIds.length > 0
    ) {
      unknownTargetPools += 1;
    }
    for (const listingId of listingIds) {
      const previousPool = listingPool.get(listingId);
      if (previousPool && previousPool !== nodeId) crossPoolDuplicates += 1;
      listingPool.set(listingId, nodeId);
      const assignment = result.assignments[listingId];
      if (!assignment) missingAssignments += 1;
      else if (assignment.status !== 'EXACT' || assignment.nodeId !== nodeId) {
        wrongPoolAssignments += 1;
      }
    }
  }

  const report: PublishValidationReport = {
    doubleExactAssignments: result.stats.doubleExactAssignments,
    crossPoolDuplicates,
    siblingLeakage: result.stats.siblingLeakage,
    parentLeakage: result.stats.parentLeakage,
    missingAssignments,
    wrongPoolAssignments,
    unknownTargetPools,
    ok: false,
  };
  report.ok = Object.entries(report)
    .filter(([key]) => key !== 'ok')
    .every(([, value]) => value === 0);
  return report;
}

/**
 * Piyasa acisindan ANLAMLI icerik: yerlestirme + ilanin kendi verisi (fiyat,
 * yil, km, tarih, baslik, konum). Yakalama kaynagi (kosu, sayfa, zaman,
 * kaynak URL) degisince artefakt "degismis" sayilmaz; fiyat degisince sayilir.
 */
function marketFingerprint(
  assignments: Record<string, WeeklyListingAssignment>,
): string {
  const rows = Object.keys(assignments)
    .sort()
    .map((id) => {
      const a = assignments[id];
      const o = a.sourceObservation;
      return [
        id,
        a.status,
        a.nodeId ?? '',
        a.evidence ?? '',
        [...a.requestedTargetIds].sort().join(','),
        o ? [o.listingDate, o.price, o.year, o.mileage, o.currency, o.title, o.location, o.modelCells.join('|')].join('') : '',
      ].join('');
    });
  return sha256(rows.join('\n'));
}

function mergeAssignment(
  existing: WeeklyListingAssignment | undefined,
  incoming: WeeklyListingAssignment,
): WeeklyListingAssignment {
  if (!existing) return incoming;
  if (
    existing.status === 'EXACT' &&
    incoming.status === 'EXACT' &&
    existing.nodeId !== incoming.nodeId
  ) {
    return {
      sourceListingId: incoming.sourceListingId,
      status: 'AMBIGUOUS',
      nodeId: null,
      evidence: 'AMBIGUOUS',
      requestedTargetIds: [
        ...new Set([
          ...existing.requestedTargetIds,
          ...incoming.requestedTargetIds,
        ]),
      ].sort(),
      sourceObservation: null,
    };
  }
  if (incoming.status === 'EXACT') return incoming;
  // New canonical evidence that is no longer exact must evict an older exact
  // placement. Keeping the old row priceable would silently ignore a current
  // ambiguity/unresolved observation.
  if (existing.status === 'EXACT') return incoming;
  if (existing.status === 'AMBIGUOUS' || incoming.status === 'AMBIGUOUS') {
    return { ...incoming, status: 'AMBIGUOUS', evidence: 'AMBIGUOUS' };
  }
  return incoming;
}

export class AtomicWeeklyMarketPublisher {
  private readonly versionsDir: string;
  private readonly pointerFile: string;

  constructor(
    private readonly rootDir: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.versionsDir = path.join(rootDir, 'versions');
    this.pointerFile = path.join(rootDir, 'current.json');
  }

  /**
   * Isaretci degismedikce yayinlanmis artefakt yeniden okunmaz/ayristirilmaz.
   * Genis kosuda her hedef bitisi bir yayindir; onlarca MB'lik artefakti her
   * seferinde diskten okumak G/C'yi hedef sayisiyla carpardi. Isaretci
   * (current.json) atomik degistigi icin onun ozeti guvenli onbellek anahtaridir.
   */
  loadCurrent(): WeeklyMarketArtifact | null {
    if (!fs.existsSync(this.pointerFile)) return null;
    const pointerRaw = fs.readFileSync(this.pointerFile, 'utf-8');
    const revision = sha256(pointerRaw);
    if (this.cache && this.cache.revision === revision) return this.cache.artifact;
    const pointer = JSON.parse(pointerRaw) as CurrentPointer;
    if (
      pointer.version !== WEEKLY_MARKET_POINTER_VERSION ||
      !/^[a-zA-Z0-9._-]+$/.test(pointer.release)
    ) {
      throw new Error(`Invalid weekly market pointer at ${this.pointerFile}`);
    }
    const releaseFile = path.join(this.versionsDir, pointer.release);
    const raw = fs.readFileSync(releaseFile, 'utf-8');
    if (sha256(raw) !== pointer.sha256) {
      throw new Error(
        `Weekly market release checksum mismatch: ${releaseFile}`,
      );
    }
    const artifact = JSON.parse(raw) as WeeklyMarketArtifact;
    if (artifact.version !== WEEKLY_MARKET_ARTIFACT_VERSION) {
      throw new Error(`Unsupported weekly market artifact at ${releaseFile}`);
    }
    this.cache = { revision, artifact };
    return artifact;
  }

  private cache: { revision: string; artifact: WeeklyMarketArtifact } | null = null;

  /** Stable cache key; changes only when the atomic live pointer changes. */
  revision(): string | null {
    if (!fs.existsSync(this.pointerFile)) return null;
    return sha256(fs.readFileSync(this.pointerFile, 'utf-8'));
  }

  knownListingIds(): Set<string> {
    return new Set(Object.keys(this.loadCurrent()?.assignments ?? {}));
  }

  publishTarget(input: {
    hierarchyVersion: string;
    tree: HierarchyTree;
    targets: MarketTarget[];
    result: WeeklyAssignmentResult;
    /** Current corpus assignments, used only to detect cross-source conflicts. */
    baselineAssignments?: Record<string, BaselineExactAssignment>;
  }): PublishResult {
    const targetMap = new Map(
      input.targets.map((target) => [target.targetId, target]),
    );
    const validation = validate(input.tree, targetMap, input.result);
    if (!validation.ok) {
      throw new Error(`VALIDATION_FAIL ${JSON.stringify(validation)}`);
    }

    const current = this.loadCurrent();
    const assignments: Record<string, WeeklyListingAssignment> = {};
    for (const [listingId, assignment] of Object.entries(
      current?.assignments ?? {},
    )) {
      if (
        current?.hierarchyVersion === input.hierarchyVersion ||
        assignment.status !== 'EXACT'
      ) {
        assignments[listingId] = assignment;
        continue;
      }
      const target = assignment.nodeId
        ? targetMap.get(assignment.nodeId)
        : null;
      const observedPath =
        assignment.sourceObservation?.requestedTargetPath ?? [];
      const sameExactIdentity = Boolean(
        target &&
        observedPath.join('\u0000') === target.pathSegments.join('\u0000'),
      );
      assignments[listingId] = sameExactIdentity
        ? assignment
        : {
            ...assignment,
            status: 'UNRESOLVED',
            nodeId: null,
            evidence: 'UNRESOLVED',
            sourceObservation: null,
          };
    }
    for (const [listingId, assignment] of Object.entries(
      input.result.assignments,
    )) {
      assignments[listingId] = mergeAssignment(
        assignments[listingId],
        assignment,
      );
    }

    // The existing corpus pipeline remains authoritative evidence too. A
    // weekly exact observation may supersede a shallower proven ancestor, but
    // an equal/deeper contradictory branch is AMBIGUOUS and enters no pool.
    for (const [listingId, baseline] of Object.entries(
      input.baselineAssignments ?? {},
    )) {
      const incoming = assignments[listingId];
      if (
        !incoming ||
        incoming.status !== 'EXACT' ||
        !incoming.nodeId ||
        baseline.nodeId === incoming.nodeId ||
        (baseline.evidence !== 'PAGE_EXACT' &&
          baseline.evidence !== 'ROW_MODEL_EXACT')
      ) {
        continue;
      }
      const incomingNode = input.tree.nodes.get(incoming.nodeId);
      const baselineNode = input.tree.nodes.get(baseline.nodeId);
      if (
        incomingNode &&
        baselineNode &&
        incomingNode.depth > baselineNode.depth
      ) {
        continue;
      }
      assignments[listingId] = {
        ...incoming,
        status: 'AMBIGUOUS',
        nodeId: null,
        evidence: 'AMBIGUOUS',
        sourceObservation: null,
      };
    }

    // Pools are always regenerated from the merged exact assignments. A row
    // that becomes ambiguous is thereby removed from every exact pool.
    const poolSets = new Map<string, Set<string>>();
    for (const [listingId, assignment] of Object.entries(assignments)) {
      if (assignment.status !== 'EXACT' || !assignment.nodeId) continue;
      const pool = poolSets.get(assignment.nodeId) ?? new Set<string>();
      pool.add(listingId);
      poolSets.set(assignment.nodeId, pool);
    }
    const merged: WeeklyAssignmentResult = {
      assignments,
      pools: Object.fromEntries(
        [...poolSets.entries()].map(([nodeId, ids]) => [
          nodeId,
          [...ids].sort(),
        ]),
      ),
      stats: {
        exact: Object.values(assignments).filter((a) => a.status === 'EXACT')
          .length,
        ambiguous: Object.values(assignments).filter(
          (a) => a.status === 'AMBIGUOUS',
        ).length,
        unresolved: Object.values(assignments).filter(
          (a) => a.status === 'UNRESOLVED',
        ).length,
        doubleExactAssignments: 0,
        crossPoolDuplicates: 0,
        siblingLeakage: 0,
        parentLeakage: 0,
      },
    };
    const mergedValidation = validate(input.tree, targetMap, merged);
    if (!mergedValidation.ok) {
      throw new Error(`VALIDATION_FAIL ${JSON.stringify(mergedValidation)}`);
    }

    /**
     * KAYNAK DEGISMEDIYSE KOPYA SURUM YOK. Tekrarlanan tazeleme (0 yeni ilan,
     * ayni atamalar) yayin dizinini birbirinin aynisi dosyalarla doldurmamali;
     * dogrulama yine kostu, isaretci ve son-bilinen-iyi surum yerinde kalir.
     */
    if (
      current &&
      current.hierarchyVersion === input.hierarchyVersion &&
      marketFingerprint(current.assignments) === marketFingerprint(assignments) &&
      JSON.stringify(current.pools) === JSON.stringify(merged.pools)
    ) {
      const pointer = JSON.parse(fs.readFileSync(this.pointerFile, 'utf-8')) as CurrentPointer;
      return {
        artifact: current,
        validation: mergedValidation,
        releaseFile: path.join(this.versionsDir, pointer.release),
        unchanged: true,
      };
    }

    const publishedAt = this.now().toISOString();
    const artifact: WeeklyMarketArtifact = {
      version: WEEKLY_MARKET_ARTIFACT_VERSION,
      hierarchyVersion: input.hierarchyVersion,
      publishedAt,
      assignments,
      pools: merged.pools,
    };
    const raw = JSON.stringify(artifact);
    const digest = sha256(raw);
    const release = `${publishedAt.replace(/[:.]/g, '-')}-${digest.slice(0, 12)}.json`;
    const releaseFile = path.join(this.versionsDir, release);
    atomicWrite(releaseFile, raw);

    const pointer: CurrentPointer = {
      version: WEEKLY_MARKET_POINTER_VERSION,
      release,
      sha256: digest,
      publishedAt,
      hierarchyVersion: input.hierarchyVersion,
    };
    atomicWrite(this.pointerFile, JSON.stringify(pointer));
    return { artifact, validation: mergedValidation, releaseFile, unchanged: false };
  }
}
