/**
 * OZYINELEMELI KAYNAK BOLUMLEME — GENEL (marka/model'e OZEL DAL YOK).
 *
 * KAYNAK SINIRI: liste gorunumu en fazla ~50 ilan/sayfa x 20 sayfa = 1000
 * ilan gosterir. Bu yuzden 1000'den COK ilanli bir kaynak dugumu ASLA
 * "tamam" sayilamaz; toplanirsa sessiz veri kaybi olur.
 *
 * KURAL (her dugum icin ayni):
 *   count <= LEAF_CAP           -> COLLECTABLE_LEAF (50/sayfa, tum sayfalar)
 *   count >  LEAF_CAP + cocuk   -> SPLIT (ebeveyn TOPLANMAZ, cocuklar kuyruga)
 *   count >  LEAF_CAP + cocuksuz + ikincil bolum (orn. yil) varsa -> o bolumle bol
 *   count >  LEAF_CAP + hicbir gercek bolum yok -> UNSPLITTABLE_OVERSIZED (SERT)
 *
 * Cocuk kategorileri ve ikincil filtreler KAYNAGIN kendi UI'sinden gelir;
 * uydurma gizli filtre YOK. Planlayici saf ve deterministiktir: gercek
 * gezinme surucusu bu plani uygular.
 */

/** Kaynagin liste gorunumunde gosterebildigi azami ilan (50/sayfa x 20 sayfa). */
export const LEAF_CAP = 1000;

/** Kaynaktan GOZLENEN bir kategori dugumu (sayim + varsa cocuklar). */
export interface SourceNode {
  /** Kaynak yolu, orn. "audi-a3" veya "bmw-3-serisi-316i". Kimliktir. */
  path: string;
  /** Insan-okur etiket (kaynagin kendi metni). */
  label: string;
  /** Kaynagin bildirdigi ilan sayisi. */
  count: number;
  /**
   * Kaynak UI'sinde bu dugumun altinda GERCEKTEN gorulen alt kategoriler.
   * Yoksa bos. Uydurulmaz.
   */
  children?: SourceNode[];
  /**
   * Kimligi KORUYAN, kaynak UI'sinin TRUTHFUL sekilde destekledigi ikincil
   * bolumler (orn. yil araligi). Yalnizca cocuk kategorisi yetmezse kullanilir.
   */
  secondaryPartitions?: SourceNode[];
}

export type PlanNodeKind = 'COLLECTABLE_LEAF' | 'SPLIT' | 'UNSPLITTABLE_OVERSIZED';

export interface PlanLeaf {
  kind: 'COLLECTABLE_LEAF';
  path: string;
  label: string;
  count: number;
  /** 50/sayfa varsayimiyla beklenen sayfa sayisi (en az 1). */
  expectedPages: number;
}

export interface PlanUnsplittable {
  kind: 'UNSPLITTABLE_OVERSIZED';
  path: string;
  label: string;
  count: number;
}

export interface PartitionPlan {
  /** Toplanabilir yapraklar (hepsi <= LEAF_CAP). */
  leaves: PlanLeaf[];
  /** Bolunemeyen asiri buyuk dugumler — aylik tazeleme EKSIK isaretlenir. */
  unsplittable: PlanUnsplittable[];
  /** Bir dugumun iki kez islenmesini onleyen ziyaret kumesi (path bazli). */
  visitedPaths: string[];
}

export const PAGE_SIZE = 50;

export function expectedPagesFor(count: number, pageSize: number = PAGE_SIZE): number {
  if (count <= 0) return 1;
  return Math.max(1, Math.ceil(count / pageSize));
}

/**
 * Bir kaynak dugumu icin ozyinelemeli bolumleme plani uretir.
 *
 * `discover`: bir dugumun cocuklarini/ikincil bolumlerini kaynaktan getiren
 * (ya da fixture'dan okuyan) fonksiyon. Agac zaten dolu geldiyse dugumun
 * kendi `children`/`secondaryPartitions` alanlari kullanilir; degilse discover
 * cagrilir. Boylece hem tam-agac fixture testleri hem de canli tembel kesif
 * ayni planlayiciyi kullanir.
 */
export async function planPartition(
  root: SourceNode,
  discover?: (node: SourceNode) => Promise<Pick<SourceNode, 'children' | 'secondaryPartitions'>>,
): Promise<PartitionPlan> {
  const leaves: PlanLeaf[] = [];
  const unsplittable: PlanUnsplittable[] = [];
  const visited = new Set<string>();

  const visit = async (node: SourceNode): Promise<void> => {
    if (visited.has(node.path)) return; // ayni dugum iki kez islenmez
    visited.add(node.path);

    if (node.count <= LEAF_CAP) {
      leaves.push({
        kind: 'COLLECTABLE_LEAF',
        path: node.path,
        label: node.label,
        count: node.count,
        expectedPages: expectedPagesFor(node.count),
      });
      return;
    }

    // count > LEAF_CAP: bolme GEREKLI. Once gercek cocuk kategorileri.
    let children = node.children;
    let secondary = node.secondaryPartitions;
    if ((!children || children.length === 0) && discover) {
      const found = await discover(node);
      children = found.children;
      secondary = found.secondaryPartitions;
    }

    if (children && children.length > 0) {
      for (const child of children) await visit(child);
      return;
    }

    // Cocuk yok: kimligi koruyan ikincil bolum (orn. yil) TRUTHFUL varsa.
    if ((!secondary || secondary.length === 0) && discover) {
      const found = await discover(node);
      secondary = found.secondaryPartitions;
    }
    if (secondary && secondary.length > 0) {
      for (const part of secondary) await visit(part);
      return;
    }

    // Hicbir gercek bolum yok: SESSIZ KAYIP YASAK. Sert isaretle.
    unsplittable.push({
      kind: 'UNSPLITTABLE_OVERSIZED',
      path: node.path,
      label: node.label,
      count: node.count,
    });
  };

  await visit(root);
  return { leaves, unsplittable, visitedPaths: [...visited] };
}

/** Plan tamamlanmis mi: bolunemeyen dugum varsa aylik tazeleme EKSIKTIR. */
export function isPlanComplete(plan: PartitionPlan): boolean {
  return plan.unsplittable.length === 0;
}
