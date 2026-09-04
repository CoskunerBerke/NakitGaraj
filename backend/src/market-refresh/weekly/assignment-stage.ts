/** Weekly evidence placement reuses the canonical tree walker; no second matcher. */
import { HierarchyTree } from '../../vehicle-hierarchy/hierarchy-tree';
import {
  isExactEvidence,
  ListingEvidence,
  resolveListing,
} from '../../vehicle-hierarchy/listing-resolver';
import { WeeklyRawObservation } from './evidence-store';

export type WeeklyPlacementStatus = 'EXACT' | 'AMBIGUOUS' | 'UNRESOLVED';

export interface WeeklyListingAssignment {
  sourceListingId: string;
  status: WeeklyPlacementStatus;
  nodeId: string | null;
  evidence: ListingEvidence | null;
  requestedTargetIds: string[];
  sourceObservation: WeeklyRawObservation | null;
}

export interface WeeklyAssignmentResult {
  assignments: Record<string, WeeklyListingAssignment>;
  pools: Record<string, string[]>;
  stats: {
    exact: number;
    ambiguous: number;
    unresolved: number;
    doubleExactAssignments: number;
    crossPoolDuplicates: number;
    siblingLeakage: number;
    parentLeakage: number;
  };
}

interface Candidate {
  observation: WeeklyRawObservation;
  nodeId: string;
  depth: number;
  evidence: ListingEvidence;
  exact: boolean;
}

function isAncestor(
  tree: HierarchyTree,
  possibleAncestor: string,
  nodeId: string,
): boolean {
  let cursor = tree.nodes.get(nodeId);
  const seen = new Set<string>();
  while (cursor?.parentId && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    if (cursor.parentId === possibleAncestor) return true;
    cursor = tree.nodes.get(cursor.parentId);
  }
  return false;
}

export function assignWeeklyEvidence(
  tree: HierarchyTree,
  observations: WeeklyRawObservation[],
): WeeklyAssignmentResult {
  const grouped = new Map<string, Candidate[]>();
  let siblingLeakage = 0;
  let parentLeakage = 0;

  for (const observation of observations) {
    const context = tree.nodes.get(observation.requestedTargetId);
    if (
      !context ||
      context.pathSegments.join('\u0000') !==
        observation.requestedTargetPath.join('\u0000')
    ) {
      const list = grouped.get(observation.sourceListingId) ?? [];
      list.push({
        observation,
        nodeId: '',
        depth: -1,
        evidence: 'UNRESOLVED',
        exact: false,
      });
      grouped.set(observation.sourceListingId, list);
      continue;
    }

    const resolved = resolveListing(
      tree,
      context,
      observation.modelCells.join(' ').trim(),
    );
    const exact = isExactEvidence(resolved.evidence);
    if (exact && resolved.nodeId !== context.id) {
      if (isAncestor(tree, resolved.nodeId, context.id)) parentLeakage += 1;
      else if (!isAncestor(tree, context.id, resolved.nodeId))
        siblingLeakage += 1;
    }
    const list = grouped.get(observation.sourceListingId) ?? [];
    list.push({
      observation,
      nodeId: resolved.nodeId,
      depth: resolved.depth,
      evidence: resolved.evidence,
      exact,
    });
    grouped.set(observation.sourceListingId, list);
  }

  const assignments: Record<string, WeeklyListingAssignment> = {};
  const poolSets = new Map<string, Set<string>>();
  let exact = 0;
  let ambiguous = 0;
  let unresolved = 0;
  let doubleExactAssignments = 0;
  let crossPoolDuplicates = 0;

  for (const [listingId, candidates] of grouped) {
    const exactCandidates = candidates.filter(
      (candidate) => candidate.exact && candidate.nodeId,
    );
    const deepest = exactCandidates.length
      ? Math.max(...exactCandidates.map((candidate) => candidate.depth))
      : -1;
    const winners = exactCandidates.filter(
      (candidate) => candidate.depth === deepest,
    );
    const winnerNodes = [...new Set(winners.map((winner) => winner.nodeId))];
    const requestedTargetIds = [
      ...new Set(
        candidates.map((candidate) => candidate.observation.requestedTargetId),
      ),
    ];

    if (winnerNodes.length > 1) {
      ambiguous += 1;
      doubleExactAssignments += 1;
      crossPoolDuplicates += 1;
      assignments[listingId] = {
        sourceListingId: listingId,
        status: 'AMBIGUOUS',
        nodeId: null,
        evidence: 'AMBIGUOUS',
        requestedTargetIds,
        sourceObservation: null,
      };
      continue;
    }

    if (winnerNodes.length === 1) {
      const winner = winners.find(
        (candidate) => candidate.nodeId === winnerNodes[0],
      )!;
      exact += 1;
      assignments[listingId] = {
        sourceListingId: listingId,
        status: 'EXACT',
        nodeId: winner.nodeId,
        evidence: winner.evidence,
        requestedTargetIds,
        sourceObservation: winner.observation,
      };
      const pool = poolSets.get(winner.nodeId) ?? new Set<string>();
      pool.add(listingId);
      poolSets.set(winner.nodeId, pool);
      continue;
    }

    const hasAmbiguous = candidates.some(
      (candidate) => candidate.evidence === 'AMBIGUOUS',
    );
    if (hasAmbiguous) ambiguous += 1;
    else unresolved += 1;
    assignments[listingId] = {
      sourceListingId: listingId,
      status: hasAmbiguous ? 'AMBIGUOUS' : 'UNRESOLVED',
      nodeId: null,
      evidence: hasAmbiguous ? 'AMBIGUOUS' : (candidates[0]?.evidence ?? null),
      requestedTargetIds,
      sourceObservation: null,
    };
  }

  return {
    assignments,
    pools: Object.fromEntries(
      [...poolSets.entries()].map(([nodeId, ids]) => [nodeId, [...ids].sort()]),
    ),
    stats: {
      exact,
      ambiguous,
      unresolved,
      doubleExactAssignments,
      crossPoolDuplicates,
      siblingLeakage,
      parentLeakage,
    },
  };
}
