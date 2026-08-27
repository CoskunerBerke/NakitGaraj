/**
 * TUM MANUEL HTML KORPUSUNU SATIR SEVIYESINDE YENIDEN COZUMLE — SALT OKUNUR.
 *
 *   npm run listings:build
 *
 * Kaynaga TEK ISTEK gitmez, hicbir tabloya yazilmaz, hicbir HTML silinmez.
 * Uretilen tek sey turetilmis bir artefakttir (gitignore'lu).
 *
 * NEDEN: bir ilanin kimligi bugune kadar GELDIGI DOSYANIN kategorisi
 * sayiliyordu. Oysa ust kategori sayfalarindaki satirlar dosya adindan daha
 * derin kimlik tasir ("Audi A3 ...html" icinde "A3 Sedan 35 TFSI"). Bu adim,
 * her satiri kendi model metniyle EN DERIN KANITLANMIS dugume baglar.
 *
 * TEKILLESTIRME: ayni ilan hem ust sayfada hem kendi sayfasinda kaydedilmis
 * olabilir. `listingId` kararli kimliktir; ilan BIR KEZ sayilir ve en guclu
 * kanit kazanir.
 */
import * as fs from 'fs';
import * as path from 'path';
import { artifactToTree, loadArtifact, resolveArtifactPath } from './hierarchy-source';
import { extractListingRows } from './listing-rows';
import { isExactEvidence, ListingEvidence, resolveListing } from './listing-resolver';
import { HierarchyNode, HierarchyTree } from './hierarchy-tree';

export interface ListingAssignment {
  nodeId: string;
  evidence: ListingEvidence;
  depth: number;
  /** Hangi dosyadan kazanildi — koken takibi icin. */
  sourceFile: string;
}

export interface AssignmentArtifact {
  version: string;
  builtAt: string;
  /** listingId -> atama */
  assignments: Record<string, ListingAssignment>;
  stats: Record<string, number>;
}

export const ASSIGNMENT_ARTIFACT_VERSION = 'listing-assignments-v1';

export function assignmentArtifactPath(): string {
  return path.join(path.dirname(resolveArtifactPath()), 'listing-assignments.json');
}

/**
 * Daha guclu kanit hangisi?
 *
 * Once KESIN olan kazanir (PARTIAL/AMBIGUOUS asla bir kesini gecemez), sonra
 * DAHA DERIN olan, esitlikte kendi sayfasindan gelen (PAGE_EXACT).
 */
function stronger(a: ListingAssignment, b: ListingAssignment): ListingAssignment {
  const ax = isExactEvidence(a.evidence) ? 1 : 0;
  const bx = isExactEvidence(b.evidence) ? 1 : 0;
  if (ax !== bx) return ax > bx ? a : b;
  if (a.depth !== b.depth) return a.depth > b.depth ? a : b;
  if (a.evidence !== b.evidence) return a.evidence === 'PAGE_EXACT' ? a : b;
  return a;
}

export function buildAssignments(
  tree: HierarchyTree,
  read: (file: string) => string | null = safeRead,
): AssignmentArtifact {
  /** sourceFile -> sayfanin baglam dugumu (breadcrumb'dan kurulmus agactan). */
  const pageNode = new Map<string, HierarchyNode>();
  for (const node of tree.nodes.values()) {
    for (const file of node.sourceFiles) pageNode.set(file, node);
  }

  const assignments = new Map<string, ListingAssignment>();
  const stats: Record<string, number> = {
    filesSeen: 0,
    filesUnreadable: 0,
    filesWithoutContext: 0,
    rowsSeen: 0,
    rowsWithModelText: 0,
    rowsWithoutModelText: 0,
    duplicatesAcrossPages: 0,
  };

  for (const [file, node] of pageNode) {
    const html = read(file);
    if (html === null) {
      stats.filesUnreadable += 1;
      continue;
    }
    stats.filesSeen += 1;

    for (const row of extractListingRows(html)) {
      stats.rowsSeen += 1;
      const modelText = row.cells.join(' ').trim();
      if (modelText) stats.rowsWithModelText += 1;
      else stats.rowsWithoutModelText += 1;

      const resolved = resolveListing(tree, node, modelText);
      const candidate: ListingAssignment = {
        nodeId: resolved.nodeId,
        evidence: resolved.evidence,
        depth: resolved.depth,
        sourceFile: file,
      };
      const existing = assignments.get(row.listingId);
      if (!existing) {
        assignments.set(row.listingId, candidate);
        continue;
      }
      stats.duplicatesAcrossPages += 1;
      assignments.set(row.listingId, stronger(existing, candidate));
    }
  }

  for (const assignment of assignments.values()) {
    stats[`evidence_${assignment.evidence}`] = (stats[`evidence_${assignment.evidence}`] || 0) + 1;
    stats[`depth_${assignment.depth}`] = (stats[`depth_${assignment.depth}`] || 0) + 1;
  }
  stats.uniqueListings = assignments.size;
  stats.exactListings = [...assignments.values()].filter((a) => isExactEvidence(a.evidence)).length;

  return {
    version: ASSIGNMENT_ARTIFACT_VERSION,
    builtAt: new Date().toISOString(),
    assignments: Object.fromEntries(assignments),
    stats,
  };
}

function safeRead(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

export function loadAssignments(
  filePath = assignmentArtifactPath(),
): AssignmentArtifact | null {
  if (!fs.existsSync(filePath)) return null;
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as AssignmentArtifact;
  return parsed.version === ASSIGNMENT_ARTIFACT_VERSION ? parsed : null;
}

export async function main(): Promise<void> {
  const artifact = loadArtifact();
  if (!artifact) {
    throw new Error(`Hierarchy artifact yok (${resolveArtifactPath()}). Once "npm run hierarchy:build".`);
  }
  const tree = artifactToTree(artifact);
  console.log(`[listings] hierarchy: ${tree.nodes.size} nodes`);

  const started = Date.now();
  const built = buildAssignments(tree);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  const s = built.stats;
  console.log(`[listings] parsed ${s.filesSeen} files in ${seconds}s (unreadable: ${s.filesUnreadable})`);
  console.log(`[listings] rows seen: ${s.rowsSeen} (with model text: ${s.rowsWithModelText}, without: ${s.rowsWithoutModelText})`);
  console.log(`[listings] unique listings: ${s.uniqueListings} (duplicate row sightings across pages: ${s.duplicatesAcrossPages})`);
  console.log(`[listings] exact (priceable): ${s.exactListings}`);
  for (const key of Object.keys(s).filter((k) => k.startsWith('evidence_')).sort()) {
    console.log(`[listings]   ${key.replace('evidence_', '').padEnd(16)} ${s[key]}`);
  }
  for (const key of Object.keys(s).filter((k) => k.startsWith('depth_')).sort()) {
    console.log(`[listings]   ${key.padEnd(16)} ${s[key]}`);
  }

  const out = assignmentArtifactPath();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(built), 'utf-8');
  fs.renameSync(tmp, out);
  console.log(`[listings] artifact written: ${out}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[listings] failed:', err?.message || err);
    process.exit(1);
  });
}
