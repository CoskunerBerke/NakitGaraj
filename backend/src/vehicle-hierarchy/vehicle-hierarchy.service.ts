/**
 * KATEGORI AGACI SERVISI — UI'IN TEK DOGRU KAYNAGI.
 *
 * UI hicbir seviye SAYISI ya da SIRASI varsaymaz; yalnizca "bu dugumun
 * dogrudan cocuklari" sorusunu sorar ve agac bittiginde durur.
 *
 * FAIL-CLOSED: artefakt yuklenemezse "cocuk yok" DENMEZ. Bilinmeyen ile
 * yaprak ayni sey degildir; karistirmak, kullaniciya yanlis (ust seviye)
 * piyasa sonucu gostermek demektir. Bu durumda acikca hata firlatilir.
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HierarchyNode, HierarchyTree } from './hierarchy-tree';
import { artifactToTree, loadArtifact, resolveArtifactPath } from './hierarchy-source';
import { nodeIdFromPath } from './category-path';
import { identityFromPath, LeafTargetIdentity } from './leaf-target';

/** Frontend'in ihtiyaci olan asgari dugum sozlesmesi. */
export interface HierarchyNodeDto {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  fullPath: string;
  pathSegments: string[];
  /** Kaynakta gozlenen ilan sayisi. Yaprak kararini BELIRLEMEZ. */
  resultCount: number | null;
  /** Bu dugum + alt agac. */
  totalCount: number;
  hasChildren: boolean;
  isLeaf: boolean;
  /** Kaynakta ayri sayfa olarak gorulmedi, kardeslerinden turetildi. */
  derived: boolean;
}

function toDto(node: HierarchyNode): HierarchyNodeDto {
  return {
    id: node.id,
    name: node.name,
    parentId: node.parentId,
    depth: node.depth,
    fullPath: node.fullPath,
    pathSegments: node.pathSegments,
    resultCount: node.ownListingCount > 0 ? node.ownListingCount : null,
    totalCount: node.totalListingCount,
    hasChildren: node.hasChildren,
    isLeaf: node.isLeaf,
    derived: node.derived,
  };
}

@Injectable()
export class VehicleHierarchyService {
  private readonly logger = new Logger(VehicleHierarchyService.name);
  private tree: HierarchyTree | null = null;

  /** Artefakti tembel yukler. Yoksa UNKNOWN'dir — yaprak DEGIL. */
  private require(): HierarchyTree {
    if (this.tree) return this.tree;
    const artifact = loadArtifact();
    if (!artifact) {
      throw new ServiceUnavailableException(
        `Vehicle hierarchy artifact not available at ${resolveArtifactPath()}. ` +
          'Run "npm run hierarchy:build". The tree is NOT treated as empty.',
      );
    }
    this.tree = artifactToTree(artifact);
    this.logger.log(
      `Vehicle hierarchy loaded: ${this.tree.nodes.size} nodes, ${this.tree.rootIds.length} roots`,
    );
    return this.tree;
  }

  /** Test/yeniden kurma icin bellek ici agaci degistirir. */
  setTree(tree: HierarchyTree): void {
    this.tree = tree;
  }

  reload(): void {
    this.tree = null;
  }

  /** Kokler = markalar. */
  getRoots(): HierarchyNodeDto[] {
    const tree = this.require();
    return tree.rootIds
      .map((id) => tree.nodes.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      .map(toDto);
  }

  /**
   * SADECE secilen dugumun DOGRUDAN cocuklari.
   * Global model/paket listesi ASLA dondurulmez.
   */
  getChildren(parentId: string): HierarchyNodeDto[] {
    const tree = this.require();
    const parent = tree.nodes.get(parentId);
    if (!parent) throw new NotFoundException(`Unknown hierarchy node "${parentId}"`);
    return parent.childIds
      .map((id) => tree.nodes.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      .map(toDto);
  }

  getNode(id: string): HierarchyNodeDto {
    const tree = this.require();
    const node = tree.nodes.get(id);
    if (!node) throw new NotFoundException(`Unknown hierarchy node "${id}"`);
    return toDto(node);
  }

  /** Kokten dugume kadar tum atalar — breadcrumb icin. */
  getAncestors(id: string): HierarchyNodeDto[] {
    const tree = this.require();
    const node = tree.nodes.get(id);
    if (!node) throw new NotFoundException(`Unknown hierarchy node "${id}"`);

    const chain: HierarchyNode[] = [];
    let cursor: HierarchyNode | undefined = node;
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      chain.unshift(cursor);
      cursor = cursor.parentId ? tree.nodes.get(cursor.parentId) : undefined;
    }
    return chain.map(toDto);
  }

  /** Tam yolla cozumleme — son isme gore DEGIL. */
  resolvePath(segments: string[]): HierarchyNodeDto {
    const tree = this.require();
    const node = tree.nodes.get(nodeIdFromPath(segments));
    if (!node) throw new NotFoundException(`Unknown hierarchy path "${segments.join(' / ')}"`);
    return toDto(node);
  }

  /** Ilan eslesmesi icin bu dugumun (ve istege bagli alt agacinin) dosyalari. */
  sourceFilesFor(id: string, includeDescendants = false): string[] {
    const tree = this.require();
    const node = tree.nodes.get(id);
    if (!node) throw new NotFoundException(`Unknown hierarchy node "${id}"`);
    if (!includeDescendants) return [...node.sourceFiles];

    const files: string[] = [];
    const walk = (nodeId: string) => {
      const current = tree.nodes.get(nodeId);
      if (!current) return;
      files.push(...current.sourceFiles);
      for (const childId of current.childIds) walk(childId);
    };
    walk(id);
    return [...new Set(files)];
  }

  /**
   * DEGERLEME ICIN KESIN YAPRAK HEDEFI.
   *
   * FAIL-CLOSED: bilinmeyen kimlik ya da yaprak OLMAYAN dugum sessizce
   * ebeveyne dusmez; istek reddedilir. Kullanici "Audi > A3"te durduysa bu
   * tamamlanmis bir arac degildir ve A3'un ortalamasini ona vermek yanlis
   * fiyat gostermek olurdu.
   */
  resolveLeafTarget(leafId: string): { identity: LeafTargetIdentity; sourceFiles: string[] } {
    const tree = this.require();
    const node = tree.nodes.get(String(leafId || '').trim());
    if (!node) {
      // Bilinmeyen kimlik: ebeveyne DUSULMEZ, istek reddedilir.
      throw new NotFoundException({
        reason: 'UNKNOWN_HIERARCHY_NODE',
        message: `Bilinmeyen araç hiyerarşi kimliği: "${leafId}"`,
      });
    }
    if (!node.isLeaf) {
      /**
       * Yaprak OLMAYAN dugumle degerleme yapilamaz. Kullanici "Audi > A3"te
       * durduysa bu tamamlanmis bir arac degildir; A3'un ortalamasini vermek
       * yanlis fiyat gostermek olurdu. Eksik olan adim yanitla birlikte doner.
       */
      throw new BadRequestException({
        reason: 'NOT_A_LEAF',
        message: `"${node.fullPath}" tamamlanmış bir araç seçimi değil; alt seçenekleri var.`,
        children: node.childIds
          .map((id) => tree.nodes.get(id)?.name)
          .filter((n): n is string => Boolean(n)),
      });
    }
    return {
      identity: identityFromPath(node.pathSegments, node.fullPath),
      sourceFiles: [...node.sourceFiles],
    };
  }

  stats(): { nodes: number; roots: number; leaves: number; maxDepth: number } {
    const tree = this.require();
    const nodes = [...tree.nodes.values()];
    return {
      nodes: nodes.length,
      roots: tree.rootIds.length,
      leaves: nodes.filter((n) => n.isLeaf).length,
      maxDepth: nodes.reduce((max, n) => Math.max(max, n.depth), 0),
    };
  }
}
