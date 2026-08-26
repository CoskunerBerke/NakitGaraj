/**
 * KATEGORI AGACI — GOZLENEN ONEK ILISKILERINDEN TURETILIR.
 *
 * SORUN: kaynak, kategori yolunu tek bir dizede bosluklarla birlestirir:
 *
 *   "Audi A3 A3 Sportback 35 TFSI Advanced"
 *
 * Bu dizeyi tek basina gorup nereden bolecegini bilmek IMKANSIZDIR:
 * "A3 Sportback 35" mi, "A3" + "Sportback 35 TFSI" mi? Iste sabit alanli
 * normalizasyonun ara seviyeleri yok etmesinin sebebi tam olarak budur.
 *
 * COZUM: tek dizeye degil, GOZLENEN DIZELERIN KUMESINE bak. Kaynakta bir
 * yaprak sayfasina ancak ustundeki dugumlerden gecerek varilir; bu yuzden
 * ust seviyeler de ayri sayfalar olarak gozlenmistir:
 *
 *   "Audi A3"                                  (gozlendi)
 *   "Audi A3 A3 Sportback"                     (gozlendi)
 *   "Audi A3 A3 Sportback 35 TFSI"             (gozlendi)
 *   "Audi A3 A3 Sportback 35 TFSI Advanced"    (gozlendi)
 *
 * Bir dizenin EBEVEYNI, kumedeki EN UZUN gercek onegidir; kendi ETIKETI de
 * geri kalan parcadir. Boylece sinirlar TAHMIN EDILMEZ, kaynagin kendi
 * gezinme yapisindan OKUNUR.
 *
 * DERINLIK SABIT DEGILDIR. Gercek veride 1'den 7'ye kadar degisir; bu modul
 * hicbir yerde seviye sayisi varsaymaz.
 */
import { fullPathLabel, nodeIdFromPath, splitMakeAndRest } from './category-path';

export interface ObservedCategory {
  /** Kaynak kategori dizesi, orn. "Audi A3 A3 Sportback 35 TFSI Advanced". */
  categoryString: string;
  /** Bu kategori sayfasindan gozlenen ilan sayisi. */
  listingCount: number;
  /** Bu kategoriye ait kaynak dosyalari — ilan eslesmesi bunlarla yapilir. */
  sourceFiles: string[];
}

export interface HierarchyNode {
  /** Kararli kimlik: TAM yoldan turetilir, son isim tek basina degil. */
  id: string;
  /** Kaynagin kendi etiketi, orn. "A3 Sportback" ya da "35 TFSI". */
  name: string;
  parentId: string | null;
  /** Kok = 0. */
  depth: number;
  /** Kokten buraya etiketler: ["Audi","A3","A3 Sportback","35 TFSI","Advanced"]. */
  pathSegments: string[];
  /** "Audi / A3 / A3 Sportback / 35 TFSI / Advanced" */
  fullPath: string;
  /** Bu dugumun kaynaktaki birlesik kategori dizesi (varsa). */
  categoryString: string | null;
  /**
   * Kategori COCUGU var mi. YAPRAK TANIMI BUDUR — ilan sayisi DEGIL.
   * 800 ilanli bir dugumun altinda paketler olabilir; o dugum yaprak degildir.
   */
  hasChildren: boolean;
  isLeaf: boolean;
  childIds: string[];
  /** Yalnizca bu dugumde (alt agac haric) gozlenen ilan sayisi. */
  ownListingCount: number;
  /** Bu dugum + tum alt agac. */
  totalListingCount: number;
  /** Ilan eslesmesi icin: bu dugume ait kaynak dosyalari. */
  sourceFiles: string[];
  /**
   * true ise dugum kaynakta AYRI bir sayfa olarak gozlenmedi; varligi
   * cocuklarinin ortak onekinden TURETILDI. Denetimde ayrica raporlanir.
   */
  derived: boolean;
}

export interface HierarchyTree {
  nodes: Map<string, HierarchyNode>;
  rootIds: string[];
  /** Marka olarak cozulemeyen ve agaca ALINMAYAN dizeler. */
  unresolved: string[];
}

/** Sozcuk sinirina saygili gercek onek mi. */
function isWordPrefix(prefix: string, value: string): boolean {
  return value.length > prefix.length && value.startsWith(`${prefix} `);
}

/** X'in kumedeki EN UZUN gercek onegi (sozcuk sinirinda). */
function longestObservedPrefix(value: string, observed: Set<string>): string | null {
  const words = value.split(' ');
  for (let n = words.length - 1; n >= 1; n -= 1) {
    const candidate = words.slice(0, n).join(' ');
    if (observed.has(candidate)) return candidate;
  }
  return null;
}

/**
 * KARDES ORTAK ONEKINDEN ARA SEVIYE TURET.
 *
 * Ayni ebeveyn altinda "35 TFSI Advanced" ve "35 TFSI Dynamic" varsa,
 * kaynakta bu ikisine ancak "35 TFSI" dugumunden gecilerek varilir — yani
 * o ara seviye KESINLIKLE vardir, sadece kendi sayfasi kaydedilmemistir.
 * Bunu turetmek tahmin degildir; kaydedilmemis bir sayfayi yok saymak ise
 * ARA SEVIYE ATLAMAK olurdu.
 *
 * En az IKI kardes paylasmadikca hicbir sey turetilmez.
 *
 * TEKRAR TUZAGI: kaynak, govde etiketinin icinde seri adini TEKRAR eder
 * ("A3" serisinin cocuklari "A3 Hatchback" ve "A3 Sportback"). Bunlarin ortak
 * onegi "A3"tir ve EBEVEYNIN KENDI ADIDIR — yeni bir seviye degil, yalnizca
 * adlandirma tekrari. Bu yuzden ebeveynin adina esit ortak onek REDDEDILIR;
 * aksi halde agaca "Audi / A3 / A3" gibi sahte bir seviye eklenirdi.
 */
function deriveSharedPrefixes(labels: string[], parentName: string): string[] {
  const derived = new Set<string>();
  const parentKey = String(parentName || '').trim().toLocaleLowerCase('tr');

  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      const a = labels[i].split(' ');
      const b = labels[j].split(' ');
      let shared = 0;
      while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared += 1;
      // Ortak onek, iki etiketin de TAMAMI olmamali (o zaman zaten ayni dugum).
      if (shared > 0 && shared < a.length && shared < b.length) {
        const candidate = a.slice(0, shared).join(' ');
        if (candidate.trim().toLocaleLowerCase('tr') !== parentKey) derived.add(candidate);
      }
    }
  }
  return [...derived];
}

export interface BuildOptions {
  /** Cok sozcuklu markalarin dogru ayrilmasi icin bilinen marka adlari. */
  knownMakes: string[];
  /**
   * Kardes ortak onekinden ara seviye turetilsin mi. Kapatilirsa yalnizca
   * kaynakta AYRI sayfa olarak gozlenmis dugumler kullanilir.
   */
  deriveIntermediates?: boolean;
}

export function buildHierarchy(
  observations: ObservedCategory[],
  options: BuildOptions,
): HierarchyTree {
  const deriveIntermediates = options.deriveIntermediates !== false;

  // 1) Marka koku + geri kalan yol. Marka cozulemezse dize agaca ALINMAZ.
  const unresolved: string[] = [];
  const byString = new Map<string, ObservedCategory>();
  const makesSeen = new Set<string>();

  for (const observation of observations) {
    const split = splitMakeAndRest(observation.categoryString, options.knownMakes);
    if (!split) {
      unresolved.push(observation.categoryString);
      continue;
    }
    makesSeen.add(split.make);
    const canonical = split.rest ? `${split.make} ${split.rest}` : split.make;
    const existing = byString.get(canonical);
    if (existing) {
      existing.listingCount += observation.listingCount;
      existing.sourceFiles.push(...observation.sourceFiles);
    } else {
      byString.set(canonical, {
        categoryString: canonical,
        listingCount: observation.listingCount,
        sourceFiles: [...observation.sourceFiles],
      });
    }
  }

  // 2) Marka kokleri her zaman vardir (kendi sayfasi kaydedilmemis olsa da).
  const observed = new Set(byString.keys());
  for (const make of makesSeen) observed.add(make);

  // 3) Ara seviyeleri kardes ortak onekinden tamamla (yakinsayana kadar).
  if (deriveIntermediates) {
    for (let pass = 0; pass < 8; pass += 1) {
      const byParent = new Map<string, { parentName: string; labels: string[] }>();
      for (const value of observed) {
        const parent = longestObservedPrefix(value, observed);
        if (!parent) continue;
        const label = value.slice(parent.length).trim();
        if (!label.includes(' ')) continue; // tek sozcuklu etiket bolunemez
        const parentPrefix = longestObservedPrefix(parent, observed);
        const parentName = parentPrefix ? parent.slice(parentPrefix.length).trim() : parent;
        const bucket = byParent.get(parent) || { parentName, labels: [] };
        bucket.labels.push(label);
        byParent.set(parent, bucket);
      }

      let added = 0;
      for (const [parent, bucket] of byParent) {
        if (bucket.labels.length < 2) continue;
        for (const shared of deriveSharedPrefixes(bucket.labels, bucket.parentName)) {
          const candidate = `${parent} ${shared}`;
          if (!observed.has(candidate)) {
            observed.add(candidate);
            added += 1;
          }
        }
      }
      if (added === 0) break;
    }
  }

  // 4) Dugumleri kur.
  const nodes = new Map<string, HierarchyNode>();
  const rootIds: string[] = [];
  const sorted = [...observed].sort((a, b) => a.split(' ').length - b.split(' ').length);

  for (const value of sorted) {
    const parentString = longestObservedPrefix(value, observed);
    const label = parentString ? value.slice(parentString.length).trim() : value;
    const parentId = parentString ? nodeIdFromPath(segmentsOf(parentString, nodes, observed)) : null;
    const parentNode = parentId ? nodes.get(parentId) : null;
    const pathSegments = parentNode ? [...parentNode.pathSegments, label] : [label];
    const id = nodeIdFromPath(pathSegments);
    if (nodes.has(id)) continue;

    const source = byString.get(value);
    nodes.set(id, {
      id,
      name: label,
      parentId: parentNode ? parentNode.id : null,
      depth: parentNode ? parentNode.depth + 1 : 0,
      pathSegments,
      fullPath: fullPathLabel(pathSegments),
      categoryString: source ? value : null,
      hasChildren: false,
      isLeaf: true,
      childIds: [],
      ownListingCount: source ? source.listingCount : 0,
      totalListingCount: 0,
      sourceFiles: source ? [...new Set(source.sourceFiles)] : [],
      derived: !source,
    });

    if (parentNode) {
      parentNode.childIds.push(id);
      parentNode.hasChildren = true;
      parentNode.isLeaf = false;
    } else {
      rootIds.push(id);
    }
  }

  // 5) Alt agac toplamlari (yapraktan koke).
  const byDepthDesc = [...nodes.values()].sort((a, b) => b.depth - a.depth);
  for (const node of byDepthDesc) {
    node.totalListingCount =
      node.ownListingCount +
      node.childIds.reduce((sum, id) => sum + (nodes.get(id)?.totalListingCount ?? 0), 0);
  }

  for (const node of nodes.values()) node.childIds.sort();
  rootIds.sort();

  return { nodes, rootIds, unresolved };
}

/** Bir kategori dizesinin segmentlerini, kurulmus dugumlerden geri okur. */
function segmentsOf(
  value: string,
  nodes: Map<string, HierarchyNode>,
  observed: Set<string>,
): string[] {
  const parentString = longestObservedPrefix(value, observed);
  if (!parentString) return [value];
  const parentSegments = segmentsOf(parentString, nodes, observed);
  return [...parentSegments, value.slice(parentString.length).trim()];
}

/** Kokten yaprağa tum yollari sayar (denetim ve test icin). */
export function enumerateLeafPaths(tree: HierarchyTree): string[][] {
  const out: string[][] = [];
  const walk = (id: string) => {
    const node = tree.nodes.get(id);
    if (!node) return;
    if (node.isLeaf) {
      out.push(node.pathSegments);
      return;
    }
    for (const childId of node.childIds) walk(childId);
  };
  for (const rootId of tree.rootIds) walk(rootId);
  return out;
}

/** Tam yola gore dugum bulur — son isme gore DEGIL. */
export function findByPath(tree: HierarchyTree, segments: string[]): HierarchyNode | null {
  return tree.nodes.get(nodeIdFromPath(segments)) ?? null;
}
