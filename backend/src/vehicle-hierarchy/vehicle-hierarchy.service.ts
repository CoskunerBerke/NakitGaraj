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
import { findByPath, HierarchyNode, HierarchyTree } from './hierarchy-tree';
import { artifactToTree, loadArtifact, resolveArtifactPath } from './hierarchy-source';
import { identityFromPath, LeafTargetIdentity } from './leaf-target';
import { AssignmentArtifact, loadAssignments } from './build-listing-assignments';
import { isExactEvidence } from './listing-resolver';

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
  /** YAPRAK = cocugu yok VE terminal oldugu kaynaktan dogrulandi. */
  isLeaf: boolean;
  /**
   * Bu dugumun kendi sayfasi okundu ve alt kategori ILAN ETMEDI.
   *
   * `!hasChildren && !terminalConfirmed` => BILINMEYEN: kaynak bu kategoriyi
   * ilan etti ama sayfasini hic toplamadik. Secilebilir, FIYATLANAMAZ.
   */
  terminalConfirmed: boolean;
  /** Kaynakta ayri sayfa olarak gorulmedi. */
  derived: boolean;
  /**
   * Bu dugume KESIN olarak cozulmus, TEKILLESTIRILMIS ilan sayisi.
   *
   * Ust kategori sayfalarindaki satirlar kendi model kimliklerini tasir; bu
   * sayi o satirlardan kazanilanlari da icerir. Bir dugumun sayfasi hic
   * kaydedilmemis olsa bile burasi > 0 olabilir — "veri toplanmadi" demeden
   * once bakilmasi gereken yer budur.
   */
  marketListingCount: number;
}

function toDto(node: HierarchyNode, marketListingCount = 0): HierarchyNodeDto {
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
    terminalConfirmed: node.terminalConfirmed,
    derived: node.derived,
    marketListingCount,
  };
}

@Injectable()
export class VehicleHierarchyService {
  private readonly logger = new Logger(VehicleHierarchyService.name);
  private tree: HierarchyTree | null = null;
  /** nodeId -> KESIN cozulmus ilan kimlikleri (tekillestirilmis). */
  private poolByNode: Map<string, string[]> | null = null;
  private assignmentsMissing = false;

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

  /**
   * Satir-seviyesi atamalari — ilan havuzunun TEK kaynagi.
   *
   * Artefakt yoksa havuzlar BOS kabul edilir ve degerleme fail-closed
   * davranir; sessizce dosya-adi eslesmesine DONULMEZ, cunku o davranis
   * ust kategori satirlarini yanlis dugume yaziyordu.
   */
  private pools(): Map<string, string[]> {
    if (this.poolByNode) return this.poolByNode;
    const artifact: AssignmentArtifact | null = loadAssignments();
    const map = new Map<string, string[]>();
    if (!artifact) {
      if (!this.assignmentsMissing) {
        this.assignmentsMissing = true;
        this.logger.warn(
          'listing-assignments artifact not found. Run "npm run listings:build". ' +
            'Market pools are EMPTY until then (fail-closed).',
        );
      }
      this.poolByNode = map;
      return map;
    }
    for (const [listingId, assignment] of Object.entries(artifact.assignments)) {
      if (!isExactEvidence(assignment.evidence)) continue;
      const list = map.get(assignment.nodeId);
      if (list) list.push(listingId);
      else map.set(assignment.nodeId, [listingId]);
    }
    this.poolByNode = map;
    this.logger.log(`Listing assignments loaded: ${artifact.stats?.exactListings ?? 0} exact listings`);
    return map;
  }

  /** Bu dugume KESIN cozulmus ilan kimlikleri. */
  marketListingIds(nodeId: string): string[] {
    return this.pools().get(nodeId) ?? [];
  }

  reload(): void {
    this.tree = null;
    this.poolByNode = null;
    this.assignmentsMissing = false;
  }

  /** Kokler = markalar. */
  getRoots(): HierarchyNodeDto[] {
    const tree = this.require();
    return tree.rootIds
      .map((id) => tree.nodes.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      .map((n) => toDto(n, this.marketListingIds(n.id).length));
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
      .map((n) => toDto(n, this.marketListingIds(n.id).length));
  }

  getNode(id: string): HierarchyNodeDto {
    const tree = this.require();
    const node = tree.nodes.get(id);
    if (!node) throw new NotFoundException(`Unknown hierarchy node "${id}"`);
    return toDto(node, this.marketListingIds(node.id).length);
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
    return chain.map((n) => toDto(n, this.marketListingIds(n.id).length));
  }

  /**
   * Tam yolla cozumleme — son isme gore DEGIL.
   *
   * Kimlik slug'dan YENIDEN uretilmez; `findByPath` bulunan dugumun
   * segmentlerini birebir dogrular. Aksi halde slug cakismasi yasayan
   * dugumler ("Peugeot / 206" ve "Peugeot / 206 +") birbirine cozulurdu.
   */
  resolvePath(segments: string[]): HierarchyNodeDto {
    const tree = this.require();
    const node = findByPath(tree, segments);
    if (!node) throw new NotFoundException(`Unknown hierarchy path "${segments.join(' / ')}"`);
    return toDto(node, this.marketListingIds(node.id).length);
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
  resolveLeafTarget(leafId: string): {
    identity: LeafTargetIdentity;
    sourceFiles: string[];
    /** KESIN cozulmus ilan kimlikleri — emsal havuzu BUDUR. */
    listingIds: string[];
  } {
    const tree = this.require();
    const node = tree.nodes.get(String(leafId || '').trim());
    if (!node) {
      // Bilinmeyen kimlik: ebeveyne DUSULMEZ, istek reddedilir.
      throw new NotFoundException({
        reason: 'UNKNOWN_HIERARCHY_NODE',
        message: `Bilinmeyen araç hiyerarşi kimliği: "${leafId}"`,
      });
    }
    if (node.hasChildren) {
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
    /**
     * TERMINAL + KANIT.
     *
     * Kendi sayfasi kaydedilmemis bir dugum de fiyatlanabilir: ust kategori
     * sayfalarindaki satirlar kendi model kimliklerini tasir ve bu dugume
     * KESIN olarak cozulmus olabilir. "Sayfasi yok" ile "veri yok" ayni sey
     * degildir; korpus tuketilmeden NO_DATA denmez.
     *
     * Cocugu olan dugum yine terminal DEGILDIR (yukarida reddedildi).
     */
    const listingIds = this.marketListingIds(node.id);
    if (listingIds.length === 0) {
      throw new BadRequestException({
        reason: 'NO_COLLECTED_DATA',
        message:
          `"${node.fullPath}" için elimizde ilan bulunmuyor; bu kategori için değerleme yapılamıyor.`,
      });
    }
    return {
      identity: identityFromPath(node.pathSegments, node.fullPath),
      sourceFiles: [...node.sourceFiles],
      listingIds,
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
