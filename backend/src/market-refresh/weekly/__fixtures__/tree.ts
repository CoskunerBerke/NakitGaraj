import {
  HierarchyNode,
  HierarchyTree,
} from '../../../vehicle-hierarchy/hierarchy-tree';
import { nodeIdFromPath } from '../../../vehicle-hierarchy/category-path';

export function testTree(): HierarchyTree {
  const paths = [
    ['Audi'],
    ['Audi', 'A3'],
    ['Audi', 'A3', 'A3 Sportback'],
    ['Audi', 'A3', 'A3 Sportback', '35 TFSI'],
    ['Audi', 'A3', 'A3 Sportback', '35 TFSI', 'Advanced'],
    ['Audi', 'A3', 'A3 Sportback', '35 TFSI', 'S Line'],
    ['Audi', 'A3', 'A3 Sedan'],
    ['Audi', 'A3', 'A3 Sedan', '35 TFSI'],
    ['BMW'],
    ['BMW', 'A3'],
  ];
  const id = (segments: string[]) => nodeIdFromPath(segments);
  const nodes = new Map<string, HierarchyNode>();
  for (const segments of paths) {
    const nodeId = id(segments);
    const children = paths.filter(
      (candidate) =>
        candidate.length === segments.length + 1 &&
        segments.every((part, index) => candidate[index] === part),
    );
    const childIds = children.map(id);
    const isLeaf = childIds.length === 0;
    nodes.set(nodeId, {
      id: nodeId,
      name: segments[segments.length - 1],
      parentId: segments.length === 1 ? null : id(segments.slice(0, -1)),
      depth: segments.length - 1,
      pathSegments: segments,
      fullPath: segments.join(' / '),
      categoryString: segments.join(' '),
      hasChildren: childIds.length > 0,
      terminalConfirmed: isLeaf,
      isLeaf,
      childIds,
      ownListingCount: 0,
      totalListingCount: 0,
      sourceFiles: [],
      derived: false,
    });
  }
  return { nodes, rootIds: ['audi', 'bmw'], unresolved: [] };
}
