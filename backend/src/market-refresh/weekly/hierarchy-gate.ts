/**
 * EXACT MARKET TARGET SNAPSHOT — direct-edge integrity gate.
 *
 * Market collection does not discover or reinterpret hierarchy. It freezes
 * terminal targets from the already-built, already-validated tree and proves
 * every root -> target hop in both directions before returning a single URL.
 */
import * as crypto from 'crypto';
import {
  HierarchyNode,
  HierarchyTree,
} from '../../vehicle-hierarchy/hierarchy-tree';
import { sahibindenSlug } from '../../vehicle-hierarchy/nav-children';

export interface MarketTarget {
  targetId: string;
  hierarchyVersion: string;
  targetIdentityHash: string;
  fullPath: string;
  pathSegments: string[];
  /** Exact source category path. Paging/sorting parameters are added later. */
  categoryPath: string;
  depth: number;
}

export interface PathIntegrityReport {
  hierarchyVersion: string;
  marketTargets: number;
  pathsChecked: number;
  edgesChecked: number;
  skippedLevels: number;
  wrongParents: number;
  orphans: number;
  ambiguousPaths: number;
  findings: string[];
  ok: boolean;
}

export interface MarketTargetSnapshot {
  version: 'market-target-snapshot-v1';
  builtAt: string;
  hierarchyVersion: string;
  targets: MarketTarget[];
  integrity: PathIntegrityReport;
}

export interface TargetSnapshotOptions {
  /** nodeId -> exact URL/path learned from coverage/navigation evidence. */
  sourcePathsByNode?: Map<string, string>;
  now?: () => Date;
}

function hash(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

/** Deterministic: builtAt, counts and source files deliberately do not participate. */
export function hierarchyVersionOf(tree: HierarchyTree): string {
  return hash(
    [...tree.nodes.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((node) => ({
        id: node.id,
        name: node.name,
        parentId: node.parentId,
        depth: node.depth,
        pathSegments: node.pathSegments,
        childIds: [...node.childIds].sort(),
        terminalConfirmed: node.terminalConfirmed,
        isLeaf: node.isLeaf,
      })),
  );
}

function normalizedSourcePath(raw: string): string {
  const url = new URL(raw, 'https://www.sahibinden.com/');
  url.searchParams.delete('pagingOffset');
  url.searchParams.delete('pagingSize');
  url.searchParams.delete('sorting');
  url.searchParams.sort();
  const query = url.searchParams.toString();
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  return query ? `${pathname}?${query}` : pathname;
}

function expectedPrefix(parent: HierarchyNode, child: HierarchyNode): boolean {
  if (child.pathSegments.length !== parent.pathSegments.length + 1)
    return false;
  return parent.pathSegments.every(
    (segment, index) => child.pathSegments[index] === segment,
  );
}

export function buildMarketTargetSnapshot(
  tree: HierarchyTree,
  options: TargetSnapshotOptions = {},
): MarketTargetSnapshot {
  const hierarchyVersion = hierarchyVersionOf(tree);
  const findings: string[] = [];
  let pathsChecked = 0;
  let edgesChecked = 0;
  let skippedLevels = 0;
  let wrongParents = 0;
  let orphans = 0;
  let ambiguousPaths = 0;

  const targets: MarketTarget[] = [];
  const pathOwners = new Map<string, string>();
  const sourceOwners = new Map<string, string>();

  const candidates = [...tree.nodes.values()]
    // resultCount is intentionally absent: terminality is structural evidence only.
    .filter(
      (node) =>
        node.isLeaf &&
        !node.hasChildren &&
        node.terminalConfirmed &&
        node.childIds.length === 0,
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const leaf of candidates) {
    pathsChecked += 1;
    const reverse: HierarchyNode[] = [];
    const visited = new Set<string>();
    let cursor: HierarchyNode | undefined = leaf;
    let broken = false;

    while (cursor) {
      if (visited.has(cursor.id)) {
        ambiguousPaths += 1;
        findings.push(`CYCLE ${leaf.fullPath} at ${cursor.id}`);
        broken = true;
        break;
      }
      visited.add(cursor.id);
      reverse.push(cursor);
      if (!cursor.parentId) break;
      const parent = tree.nodes.get(cursor.parentId);
      if (!parent) {
        orphans += 1;
        findings.push(`ORPHAN ${cursor.id} -> ${cursor.parentId}`);
        broken = true;
        break;
      }
      edgesChecked += 1;
      if (!parent.childIds.includes(cursor.id)) {
        wrongParents += 1;
        findings.push(
          `WRONG_PARENT ${parent.id} does not contain ${cursor.id}`,
        );
        broken = true;
      }
      if (
        cursor.depth !== parent.depth + 1 ||
        !expectedPrefix(parent, cursor)
      ) {
        skippedLevels += 1;
        findings.push(`SKIPPED_LEVEL ${parent.fullPath} -> ${cursor.fullPath}`);
        broken = true;
      }
      cursor = parent;
    }

    const chain = reverse.reverse();
    const root = chain[0];
    if (!root || root.parentId !== null || !tree.rootIds.includes(root.id)) {
      orphans += 1;
      findings.push(`ORPHAN_ROOT ${leaf.fullPath}`);
      broken = true;
    }
    if (
      leaf.depth !== leaf.pathSegments.length - 1 ||
      chain.length !== leaf.pathSegments.length
    ) {
      skippedLevels += 1;
      findings.push(`PATH_DEPTH_MISMATCH ${leaf.fullPath}`);
      broken = true;
    }

    const pathKey = leaf.pathSegments.join('\u0000');
    const priorPathOwner = pathOwners.get(pathKey);
    if (priorPathOwner && priorPathOwner !== leaf.id) {
      ambiguousPaths += 1;
      findings.push(
        `AMBIGUOUS_PATH ${leaf.fullPath} -> ${priorPathOwner}, ${leaf.id}`,
      );
      broken = true;
    } else {
      pathOwners.set(pathKey, leaf.id);
    }

    const supplied = options.sourcePathsByNode?.get(leaf.id);
    const categoryPath = normalizedSourcePath(
      supplied || `/${sahibindenSlug(leaf.pathSegments)}`,
    );
    const priorSourceOwner = sourceOwners.get(categoryPath);
    if (priorSourceOwner && priorSourceOwner !== leaf.id) {
      ambiguousPaths += 1;
      findings.push(
        `AMBIGUOUS_SOURCE_PATH ${categoryPath} -> ${priorSourceOwner}, ${leaf.id}`,
      );
      broken = true;
    } else {
      sourceOwners.set(categoryPath, leaf.id);
    }

    if (broken) continue;
    const chainIdentity = chain.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      name: node.name,
      depth: node.depth,
    }));
    targets.push({
      targetId: leaf.id,
      hierarchyVersion,
      targetIdentityHash: hash({ chain: chainIdentity, categoryPath }),
      fullPath: leaf.fullPath,
      pathSegments: [...leaf.pathSegments],
      categoryPath,
      depth: leaf.depth,
    });
  }

  // Child references are checked globally too: a malformed non-target branch must
  // not hide merely because none of its descendants qualified as a target.
  for (const parent of tree.nodes.values()) {
    for (const childId of parent.childIds) {
      const child = tree.nodes.get(childId);
      if (!child) {
        orphans += 1;
        findings.push(`ORPHAN_CHILD ${parent.id} -> ${childId}`);
        continue;
      }
      if (child.parentId !== parent.id) {
        wrongParents += 1;
        findings.push(
          `WRONG_PARENT_REF ${parent.id} -> ${child.id} (child says ${child.parentId})`,
        );
      }
    }
  }

  const report: PathIntegrityReport = {
    hierarchyVersion,
    marketTargets: targets.length,
    pathsChecked,
    edgesChecked,
    skippedLevels,
    wrongParents,
    orphans,
    ambiguousPaths,
    findings,
    ok:
      skippedLevels === 0 &&
      wrongParents === 0 &&
      orphans === 0 &&
      ambiguousPaths === 0 &&
      targets.length === candidates.length,
  };

  return {
    version: 'market-target-snapshot-v1',
    builtAt: (options.now?.() || new Date()).toISOString(),
    hierarchyVersion,
    targets,
    integrity: report,
  };
}
