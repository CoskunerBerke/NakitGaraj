/**
 * VERI BUTUNLUGU DENETIMI — RAPORLAR, SILMEZ.
 *
 * Denetim hicbir kaydi degistirmez ya da silmez. Amaci, agacin kullanici
 * secim akisini tasiyacak kadar saglam olup olmadigini KANITLAMAKTIR:
 * kopuk dugum, dongu, cift yol, yanlis yaprak isareti gibi kusurlar sessizce
 * gecerse UI'da ara seviye kaybi olarak geri doner.
 */
import { HierarchyNode, HierarchyTree } from './hierarchy-tree';

export interface AuditFinding {
  kind:
    | 'ORPHAN_NODE'
    | 'CYCLE'
    | 'DUPLICATE_FULL_PATH'
    | 'DUPLICATE_CHILD_NAME'
    | 'EMPTY_NAME'
    | 'LEAF_WITH_CHILDREN'
    | 'NON_LEAF_WITHOUT_CHILDREN'
    | 'SOURCE_FILE_SHARED'
    | 'UNRESOLVED_CATEGORY';
  detail: string;
}

export interface AuditReport {
  totalNodes: number;
  rootCount: number;
  leafCount: number;
  /** Kaynagin ilan ettigi ama sayfasi toplanmamis dugumler (secilir, fiyatlanmaz). */
  unknownCount: number;
  derivedCount: number;
  maxDepth: number;
  depthHistogram: Record<number, number>;
  leafPathCount: number;
  findings: AuditFinding[];
  ok: boolean;
}

export function auditHierarchy(tree: HierarchyTree): AuditReport {
  const findings: AuditFinding[] = [];
  const nodes = [...tree.nodes.values()];

  const byFullPath = new Map<string, string[]>();
  const bySourceFile = new Map<string, string[]>();
  const depthHistogram: Record<number, number> = {};
  let leafCount = 0;
  let unknownCount = 0;
  let derivedCount = 0;
  let maxDepth = 0;

  for (const node of nodes) {
    if (!node.name || !node.name.trim()) {
      findings.push({ kind: 'EMPTY_NAME', detail: node.id });
    }

    // Kopuk dugum: ebeveyn kimligi var ama ebeveyn yok.
    if (node.parentId && !tree.nodes.has(node.parentId)) {
      findings.push({ kind: 'ORPHAN_NODE', detail: `${node.id} -> missing ${node.parentId}` });
    }

    // Yaprak isareti ile cocuk varligi TUTARLI olmali.
    if (node.isLeaf && node.childIds.length > 0) {
      findings.push({ kind: 'LEAF_WITH_CHILDREN', detail: node.fullPath });
    }
    /**
     * Cocugu olmayan ve terminal oldugu DOGRULANMAMIS dugum bir hata degil,
     * mesru BILINMEYEN durumudur: kaynak onu bir kategori olarak ilan etti
     * ama biz o sayfayi hic toplamadik. Bulgu sayilirsa denetim kalici olarak
     * kirmizi kalir; asil tehlike bunun tersiydi — bu dugumleri YAPRAK sayip
     * karisik havuzlariyla fiyatlamak.
     */
    if (!node.isLeaf && node.childIds.length === 0 && node.terminalConfirmed) {
      findings.push({ kind: 'NON_LEAF_WITHOUT_CHILDREN', detail: node.fullPath });
    }
    if (!node.isLeaf && node.childIds.length === 0 && !node.terminalConfirmed) {
      unknownCount += 1;
    }

    if (node.isLeaf) leafCount += 1;
    if (node.derived) derivedCount += 1;
    maxDepth = Math.max(maxDepth, node.depth);
    depthHistogram[node.depth] = (depthHistogram[node.depth] || 0) + 1;

    byFullPath.set(node.fullPath, [...(byFullPath.get(node.fullPath) || []), node.id]);
    for (const file of node.sourceFiles) {
      bySourceFile.set(file, [...(bySourceFile.get(file) || []), node.id]);
    }

    // Ayni ebeveyn altinda ayni isimli iki cocuk secim akisini belirsizlestirir.
    const seenChildNames = new Set<string>();
    for (const childId of node.childIds) {
      const child = tree.nodes.get(childId);
      if (!child) {
        findings.push({ kind: 'ORPHAN_NODE', detail: `${node.id} -> missing child ${childId}` });
        continue;
      }
      const key = child.name.toLocaleLowerCase('tr');
      if (seenChildNames.has(key)) {
        findings.push({
          kind: 'DUPLICATE_CHILD_NAME',
          detail: `${node.fullPath} -> ${child.name}`,
        });
      }
      seenChildNames.add(key);
    }
  }

  for (const [fullPath, ids] of byFullPath) {
    if (ids.length > 1) findings.push({ kind: 'DUPLICATE_FULL_PATH', detail: fullPath });
  }
  for (const [file, ids] of bySourceFile) {
    if (ids.length > 1) {
      findings.push({ kind: 'SOURCE_FILE_SHARED', detail: `${file} -> ${ids.join(', ')}` });
    }
  }

  // Dongu: her dugumden koke yurunebilmeli.
  for (const node of nodes) {
    const seen = new Set<string>([node.id]);
    let cursor: HierarchyNode | undefined = node;
    while (cursor && cursor.parentId) {
      if (seen.has(cursor.parentId)) {
        findings.push({ kind: 'CYCLE', detail: node.fullPath });
        break;
      }
      seen.add(cursor.parentId);
      cursor = tree.nodes.get(cursor.parentId);
    }
  }

  for (const value of tree.unresolved) {
    findings.push({ kind: 'UNRESOLVED_CATEGORY', detail: value });
  }

  return {
    totalNodes: nodes.length,
    rootCount: tree.rootIds.length,
    leafCount,
    unknownCount,
    derivedCount,
    maxDepth,
    depthHistogram,
    leafPathCount: leafCount,
    findings,
    // Cozulemeyen kategori raporlanir ama agaci BOZMAZ; digerleri sert kusurdur.
    ok: findings.every((f) => f.kind === 'UNRESOLVED_CATEGORY'),
  };
}

export function summarizeAudit(report: AuditReport): string {
  const byKind = new Map<string, number>();
  for (const f of report.findings) byKind.set(f.kind, (byKind.get(f.kind) || 0) + 1);
  const lines = [
    `nodes=${report.totalNodes} roots=${report.rootCount} leaves=${report.leafCount} ` +
    `unknown=${report.unknownCount} ` +
      `derived=${report.derivedCount} maxDepth=${report.maxDepth}`,
    `depth histogram: ${JSON.stringify(report.depthHistogram)}`,
    `findings: ${report.findings.length ? [...byKind].map(([k, n]) => `${k}=${n}`).join(' ') : 'none'}`,
    `ok: ${report.ok}`,
  ];
  return lines.join('\n');
}
