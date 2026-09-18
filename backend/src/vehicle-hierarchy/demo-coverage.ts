/**
 * KAYNAK -> DEMO KAPSAMA KARSILASTIRMASI.
 *
 * Tek is yapar: yetkili kaynagi (yayinlanan hiyerarsi) demo veri setiyle
 * karsilastirip NEYIN KAYBOLDUGUNU sayar. Yazdirmaz, cikmaz, dosya okumaz —
 * boylece hem CLI denetimi hem de test ayni kodu calistirir ve ikisi
 * birbirinden sapamaz.
 *
 * TERSINDEN CALISIR. Onceki denetim demo dosyasinda ZATEN OLAN havuzlari
 * inceliyordu; orada olmayan bir arac hakkinda hicbir sey soyleyemez. Bu
 * yuzden karsilastirma kaynaktan baslar.
 */
import type { CatalogWire } from '../../../frontend/src/lib/demo-selection';
import {
  categoryStringFromSourceFile,
  isNonCategoryPage,
  nodeIdFromPath,
} from './category-path';

export interface CoverageSourceNode {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  pathSegments: string[];
  totalListingCount: number;
}

export interface CoverageDemo {
  hierarchyVersion?: string;
  marketRelease?: string;
  catalog: CatalogWire[];
  pools: Record<string, { n: number; years: Record<string, unknown> }>;
}

export interface FlatNode {
  id: string;
  label: string;
  depth: number;
  labelPath: string[];
  listings: number;
  isStructuralLeaf: boolean;
}

export interface CoverageReport {
  sourceBrands: number;
  sourceModels: number;
  sourceLeaves: number;
  sourceNodes: number;
  demoBrands: number;
  demoModels: number;
  demoLeaves: number;
  demoNodes: number;
  missingBrands: string[];
  missingModels: string[];
  missingLeaves: string[];
  /** Kaynagin HERHANGI bir dugumu demoda yoksa sessiz dusustur. */
  silentDrops: string[];
  /** Demoda olup kaynakta olmayan dugum: uydurulmus dal. */
  orphanCatalogNodes: string[];
  /** Katalogda karsiligi olmayan fiyat havuzu: gosterilemez fiyat. */
  orphanPools: string[];
  /** Ayni etiket yolunu paylasan FARKLI kimlikler: ekranda ayirt edilemezler. */
  identityCollisions: string[];
  duplicateIds: string[];
  /** Kaynaktaki yazimla ortusmeyen etiket yolu. */
  labelMismatches: string[];
  /**
   * Kimligi ebeveyninden TURETILEMEYEN dugumler. Kaynagin bir ozelligidir
   * ("206" ve "206 +" ayni slug'a duser), hata degildir — ama kimligi yol
   * sanip kesen her kod burada bozulur, o yuzden sayilir.
   */
  nonPathShapedIds: string[];
  priceableLeaves: number;
  /** Katalogda gorunen ama guncel emsali olmayan yapraklar. */
  unpricedLeaves: string[];
  unpricedLeavesWithListings: string[];
}

/**
 * KAYNAK -> HIYERARSI asamasi.
 *
 * Hiyerarsi artefakti YETKILI OLDUGU ICIN degil, YETKILI OLDUGU DOGRULANDIGI
 * icin katalogun kaynagidir. Artefakt uretilen veridir ve korpus ondan sonra
 * buyumus olabilir; o halde "hiyerarsiye gore sessiz dusus 0" cumlesi bayat
 * bir olcute gore verilmis olur. Bu yuzden zincirin ILK halkasi da olculur:
 *
 *   korpus/DB  ->  hiyerarsi  ->  katalog  ->  arayuz
 *
 * OLCUT SAYFADIR, ETIKET DEGIL. Bir kategori sayfasi hiyerarside bir dugume
 * karsilik gelir; DB'deki her satir da geldigi sayfayi tasir. "DB'de satir
 * uretmis ama hiyerarsinin tanimadigi sayfa" varsa kaynakta olup hiyerarside
 * olmayan bir kimlik var demektir. Etiketten (canonicalModel) gitmek yaniltir:
 * DB "A3 A3 Sedan" gibi birlestirilmis etiketler tasir, hiyerarside ayni sey
 * "Audi > A3 > A3 Sedan" diye UC seviyededir.
 */
export interface UpstreamInput {
  /** Korpustaki tum HTML dosyalarinin mutlak yollari. */
  corpusFiles: string[];
  /** RawVehicleListing.sourceFile'in tekil kumesi. */
  dbSourceFiles: string[];
  /** RawVehicleListing.canonicalMake'in tekil kumesi. */
  dbBrands: string[];
  dbListingCount: number;
  /** Korpusta gorulup DB'ye girmeyen gercek ilan kimlikleri (varsa). */
  corpusListingIdsMissingFromDb?: number;
}

export interface UpstreamReport {
  corpusFiles: number;
  hierarchyFiles: number;
  dbSourceFiles: number;
  dbListingCount: number;
  dbBrands: number;
  hierarchyBrands: number;
  hierarchyModels: number;
  /** DB kanitinin dokundugu marka/model dallari. */
  dbTouchedModels: number;
  /** HATA: DB'de satir uretmis ama hiyerarsinin tanimadigi sayfa. */
  dbSourceFilesMissingFromHierarchy: string[];
  /** HATA: DB'de ilani olan ama hiyerarside olmayan marka. */
  dbBrandsMissingFromHierarchy: string[];
  /**
   * HATA: korpusta KATEGORI sayfasi olarak duran ama hiyerarsinin tanimadigi
   * dosya. Hiyerarsi kurulduktan SONRA kaydedilmis bir sayfa tam olarak boyle
   * gorunur; bayatligin en dogrudan isareti budur.
   */
  unknownCategoryPages: string[];
  /**
   * BILGI: tarayicinin kaydettigi yan kaynaklar (`*_files/`) ve hicbir arac
   * kategorisi tasimayan vitrin sayfalari. Hiyerarsi bunlari KASITLI eler.
   */
  ignoredNonCategoryFiles: number;
  /** HATA: hiyerarsinin dayandigi ama korpusta artik bulunmayan dosya. */
  hierarchyFilesMissingFromCorpus: string[];
  corpusListingIdsMissingFromDb: number;
}

const normalizePath = (file: string): string =>
  file.replace(/\\/g, '/').toLowerCase();

export function compareUpstreamToHierarchy(
  nodes: CoverageSourceNode[],
  sourceFilesOf: (node: CoverageSourceNode) => string[],
  input: UpstreamInput,
): UpstreamReport {
  const hierarchyFiles = new Map<string, CoverageSourceNode>();
  for (const node of nodes) {
    for (const file of sourceFilesOf(node)) {
      const key = normalizePath(file);
      const prior = hierarchyFiles.get(key);
      // En DERIN dugum kazanir: bir sayfayi birden cok ata da anabilir.
      if (!prior || node.depth > prior.depth) hierarchyFiles.set(key, node);
    }
  }

  const corpus = new Set(input.corpusFiles.map(normalizePath));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  /**
   * Marka eslesmesi SLUG uzerinden yapilir, gorunen ad uzerinden degil.
   * Hiyerarsi "Tofaş" yazar, DB "Tofas"; ada bakan bir karsilastirma bunu
   * "hiyerarside olmayan marka" diye raporlardi. Slug fonksiyonu hiyerarsi
   * kimliklerini ureten fonksiyonun TA KENDISIDIR.
   */
  const brandIds = new Set(
    nodes.filter((n) => n.depth === 0).map((n) => n.id),
  );

  const unknown = input.corpusFiles.filter(
    (f) => !hierarchyFiles.has(normalizePath(f)),
  );
  /** Yan kaynak klasoru (`*_files/`) veya arac kategorisi tasimayan sayfa. */
  const isIgnorable = (file: string): boolean =>
    /_files[\\/]/i.test(file) ||
    isNonCategoryPage(categoryStringFromSourceFile(file));

  const touchedModels = new Set<string>();
  for (const file of input.dbSourceFiles) {
    const node = hierarchyFiles.get(normalizePath(file));
    if (!node) continue;
    // Dugumun depth-1 atasi ZINCIRDEN bulunur: kimlik yol degildir, '/' ile
    // kesmek "206" ile "206 +" dallarini birbirine karistirirdi.
    let current: CoverageSourceNode | undefined = node;
    while (current && current.depth > 1) {
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    if (current && current.depth === 1) touchedModels.add(current.id);
  }

  return {
    corpusFiles: input.corpusFiles.length,
    hierarchyFiles: hierarchyFiles.size,
    dbSourceFiles: input.dbSourceFiles.length,
    dbListingCount: input.dbListingCount,
    dbBrands: input.dbBrands.length,
    hierarchyBrands: nodes.filter((n) => n.depth === 0).length,
    hierarchyModels: nodes.filter((n) => n.depth === 1).length,
    dbTouchedModels: touchedModels.size,

    dbSourceFilesMissingFromHierarchy: input.dbSourceFiles.filter(
      (f) => !hierarchyFiles.has(normalizePath(f)),
    ),
    dbBrandsMissingFromHierarchy: input.dbBrands.filter(
      (b) => !brandIds.has(nodeIdFromPath([b])),
    ),
    unknownCategoryPages: unknown.filter((f) => !isIgnorable(f)),
    ignoredNonCategoryFiles: unknown.filter(isIgnorable).length,
    hierarchyFilesMissingFromCorpus: [...hierarchyFiles.keys()].filter(
      (f) => !corpus.has(f),
    ),
    corpusListingIdsMissingFromDb: input.corpusListingIdsMissingFromDb ?? 0,
  };
}

/** Kaynak -> hiyerarsi asamasinda HATA sayilan bulgular. */
export function upstreamFailures(report: UpstreamReport): string[] {
  const failures: string[] = [];
  if (report.dbSourceFilesMissingFromHierarchy.length > 0) {
    failures.push(
      `${report.dbSourceFilesMissingFromHierarchy.length} DB sayfasi hiyerarside yok`,
    );
  }
  if (report.dbBrandsMissingFromHierarchy.length > 0) {
    failures.push(
      `${report.dbBrandsMissingFromHierarchy.length} DB markasi hiyerarside yok`,
    );
  }
  if (report.hierarchyFilesMissingFromCorpus.length > 0) {
    failures.push(
      `${report.hierarchyFilesMissingFromCorpus.length} hiyerarsi sayfasi korpusta yok`,
    );
  }
  if (report.unknownCategoryPages.length > 0) {
    failures.push(
      `${report.unknownCategoryPages.length} kategori sayfasi hiyerarsiden sonra eklenmis` +
        ' (hierarchy:build + listings:build + coverage:manifest gerekli)',
    );
  }
  if (report.corpusListingIdsMissingFromDb > 0) {
    failures.push(
      `${report.corpusListingIdsMissingFromDb} korpus ilani DB'ye girmemis`,
    );
  }
  return failures;
}

const SEPARATOR = String.fromCharCode(0);

/**
 * Demo katalogunu duz listeye acar. Etiket yolu AGACTAN kurulur, kimlikten
 * degil; kimlik opak bir anahtardir (bkz. demo-selection.ts > CatalogWire).
 */
export function flattenCatalog(wire: CatalogWire[]): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (list: CatalogWire[], parentLabels: string[]): void => {
    for (const entry of list) {
      const [id, label, listings] = entry;
      const labelPath = [...parentLabels, label];
      const kids = entry[3] ?? [];
      out.push({
        id,
        label,
        depth: labelPath.length - 1,
        labelPath,
        listings,
        isStructuralLeaf: kids.length === 0,
      });
      if (kids.length > 0) walk(kids, labelPath);
    }
  };
  walk(wire, []);
  return out;
}

/**
 * Hiyerarsi artefaktinin ayni duz bicimi.
 *
 * YAPRAK YAPISAL TANIMLANIR: cocugu olmayan dugum yapraktir. `isLeaf` bayragi
 * "kaynak terminal oldugunu DOGRULADI" demektir ve 887 dugumde false oldugu
 * halde cocuk tasimaz; bayraga bakmak bu dallari agacin ortasinda birakip
 * sayilari uyusmaz hale getirirdi.
 */
export function flattenHierarchy(nodes: CoverageSourceNode[]): FlatNode[] {
  const parents = new Set(
    nodes.filter((n) => n.parentId).map((n) => n.parentId as string),
  );
  return nodes.map((n) => ({
    id: n.id,
    label: n.name,
    depth: n.depth,
    labelPath: n.pathSegments,
    listings: n.totalListingCount,
    isStructuralLeaf: !parents.has(n.id),
  }));
}

function identityCollisionsOf(nodes: FlatNode[]): string[] {
  const byLabelPath = new Map<string, string[]>();
  for (const node of nodes) {
    const key = node.labelPath.join(SEPARATOR);
    if (!byLabelPath.has(key)) byLabelPath.set(key, []);
    byLabelPath.get(key)!.push(node.id);
  }
  const out: string[] = [];
  for (const [key, ids] of byLabelPath) {
    if (ids.length > 1) {
      out.push(`${key.split(SEPARATOR).join(' > ')}  <- ${ids.join(' , ')}`);
    }
  }
  return out;
}

export function compareSourceToDemo(
  sourceNodes: CoverageSourceNode[],
  demo: CoverageDemo,
): CoverageReport {
  const source = flattenHierarchy(sourceNodes);
  const target = flattenCatalog(demo.catalog ?? []);
  const targetById = new Map(target.map((n) => [n.id, n]));
  const sourceById = new Map(source.map((n) => [n.id, n]));
  const parentOf = new Map(sourceNodes.map((n) => [n.id, n.parentId] as const));

  const at = (nodes: FlatNode[], depth: number) =>
    nodes.filter((n) => n.depth === depth);
  const leavesOf = (nodes: FlatNode[]) => nodes.filter((n) => n.isStructuralLeaf);
  const describe = (n: FlatNode) => `${n.id} (${n.listings} ilan)`;

  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];
  for (const node of target) {
    if (seenIds.has(node.id)) duplicateIds.push(node.id);
    seenIds.add(node.id);
  }

  const demoLeaves = leavesOf(target);
  const priced = new Set(
    demoLeaves
      .filter((n) => {
        const pool = demo.pools?.[n.id];
        return pool && Object.keys(pool.years).length > 0;
      })
      .map((n) => n.id),
  );
  const unpricedLeaves = demoLeaves.filter((n) => !priced.has(n.id));

  return {
    sourceBrands: at(source, 0).length,
    sourceModels: at(source, 1).length,
    sourceLeaves: leavesOf(source).length,
    sourceNodes: source.length,
    demoBrands: at(target, 0).length,
    demoModels: at(target, 1).length,
    demoLeaves: demoLeaves.length,
    demoNodes: target.length,

    missingBrands: at(source, 0)
      .filter((n) => !targetById.has(n.id))
      .map(describe),
    missingModels: at(source, 1)
      .filter((n) => !targetById.has(n.id))
      .map(describe),
    missingLeaves: leavesOf(source)
      .filter((n) => !targetById.has(n.id))
      .map(describe),
    silentDrops: source.filter((n) => !targetById.has(n.id)).map(describe),

    orphanCatalogNodes: target
      .filter((n) => !sourceById.has(n.id))
      .map((n) => n.id),
    orphanPools: Object.keys(demo.pools ?? {}).filter(
      (key) => !targetById.has(key),
    ),

    identityCollisions: identityCollisionsOf(target),
    duplicateIds,
    labelMismatches: target
      .filter((n) => {
        const origin = sourceById.get(n.id);
        return (
          origin &&
          (origin.labelPath.length !== n.labelPath.length ||
            origin.labelPath.some((segment, i) => segment !== n.labelPath[i]))
        );
      })
      .map((n) => n.id),
    nonPathShapedIds: source
      .filter((n) => {
        const parent = parentOf.get(n.id);
        return parent && !n.id.startsWith(`${parent}/`);
      })
      .map((n) => n.id),

    priceableLeaves: priced.size,
    unpricedLeaves: unpricedLeaves.map((n) => n.id),
    unpricedLeavesWithListings: unpricedLeaves
      .filter((n) => n.listings > 0)
      .map((n) => n.id),
  };
}

/** Kapsama raporundaki HATA sayilan bulgular; bos dizi "gecti" demektir. */
export function coverageFailures(report: CoverageReport): string[] {
  const failures: string[] = [];
  if (report.silentDrops.length > 0)
    failures.push(`${report.silentDrops.length} sessiz dusus`);
  if (report.orphanCatalogNodes.length > 0)
    failures.push(`${report.orphanCatalogNodes.length} yetim katalog dugumu`);
  if (report.orphanPools.length > 0)
    failures.push(`${report.orphanPools.length} yetim fiyat havuzu`);
  if (report.identityCollisions.length > 0)
    failures.push(`${report.identityCollisions.length} kimlik cakismasi`);
  if (report.duplicateIds.length > 0)
    failures.push(`${report.duplicateIds.length} tekrarlanan kimlik`);
  if (report.labelMismatches.length > 0)
    failures.push(`${report.labelMismatches.length} etiket sapmasi`);
  return failures;
}
