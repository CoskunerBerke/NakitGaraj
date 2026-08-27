/**
 * KATEGORI AGACI — SINIRLAR KAYNAKTAN OKUNUR, TAHMIN EDILMEZ.
 *
 * Kaynak, kategori yolunu dosya adinda tek bir dizede birlestirir:
 *
 *   "Audi A3 A3 Sportback 35 TFSI Advanced"
 *
 * Bu dizeye bakip nereden bolecegini bilmek IMKANSIZDIR. Uzun sure onek
 * cikarimiyla tahmin edildi ve iki kronik hata uretti:
 *   - kardesi cocuk yapmak: "1.6" gozlendigi icin "1.6 FSI" onun ALTINA
 *     takiliyordu; oysa ikisi de ayni ebeveynin cocugudur;
 *   - tek etiketi ikiye bolmek: "LS Plus" -> "LS" + "Plus".
 *
 * DOGRU KAYNAK: kaydedilen sayfanin KENDI breadcrumb'i tam zinciri verir
 *   ("Audi > A3 > A3 Sportback > 1.6 TDI > Attraction"),
 * ve sayfanin kategori menusu DOGRUDAN cocuklarini ilan eder. Ikisi de
 * `nav-children` icinde okunur; burada yalnizca KULLANILIR.
 *
 * YAPRAK TANIMI (en kritik nokta): bir dugum, cocugu olmadigi icin yaprak
 * SAYILMAZ. Cocugunu hic toplamamis olabiliriz. Yaprak olmak icin terminal
 * oldugu sayfanin kendi menusunden DOGRULANMALIDIR. Bu ayrim yokken korpusta
 * 1875 yaprağin 588'i aslinda ebeveyndi (71 marka, 43'u dogrudan marka koku)
 * ve karisik havuzlariyla fiyatlaniyordu.
 *
 * Onek cikarimi asagida KORUNUR: yalnizca breadcrumb bulunmayan (sentetik
 * test) girdiler icin calisir.
 */
import { fullPathLabel, nodeIdFromPath, splitMakeAndRest } from './category-path';

export interface ObservedCategory {
  /** Kaynak kategori dizesi, orn. "Audi A3 A3 Sportback 35 TFSI Advanced". */
  categoryString: string;
  /** Bu kategori sayfasindan gozlenen ilan sayisi. */
  listingCount: number;
  /** Bu kategoriye ait kaynak dosyalari — ilan eslesmesi bunlarla yapilir. */
  sourceFiles: string[];
  /**
   * Sayfanin KENDI menusunde ilan ettigi dogrudan alt kategori etiketleri.
   *
   *   null -> sayfa okunmadi/menu bulunamadi. KANIT YOK; terminal SAYILMAZ.
   *   []   -> menu var, alt kategori yok. TERMINAL kaniti.
   *   [..] -> bu etiketler dogrudan cocuklardir (kaydedilmemis olsalar bile).
   */
  navChildLabels?: string[] | null;
  /**
   * Kaynagin KENDI breadcrumb'indan gelen KESIN segmentler.
   *
   * Verildiginde sinirlar TAHMIN EDILMEZ. Onek cikarimi yalnizca bu bilgi
   * yokken (sentetik testler, breadcrumb'siz eski sayfa) devreye girer.
   */
  pathSegments?: string[];
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
   * Kategori COCUGU var mi. Ilan sayisi DEGIL.
   * 800 ilanli bir dugumun altinda paketler olabilir; o dugum yaprak degildir.
   */
  hasChildren: boolean;
  /**
   * Sayfasi okundu ve menusunde ALT KATEGORI YOK: gercekten terminal.
   *
   * Cocugu olmamak TEK BASINA yeterli DEGILDIR — cocuklarini hic toplamamis
   * olabiliriz. Bu ayrimin yoklugu, 588 ebeveyni yaprak gosterip yanlis
   * fiyatlamaya yol aciyordu.
   */
  terminalConfirmed: boolean;
  /**
   * YAPRAK = cocugu yok VE terminal oldugu KAYNAKTAN dogrulandi.
   * Ikisi birden saglanmiyorsa dugum BILINMEYENDIR; degerleme acilmaz.
   */
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

  /**
   * 0) MENUDE ILAN EDILEN COCUKLARI GOZLEM OLARAK EKLE.
   *
   * Kaynak sayfasi kaydedilmemis bir alt kategori de GERCEKTEN VARDIR; kanit
   * ebeveynin kendi menusudur. Bunlari eklemek uydurmak degildir — tersine,
   * eklememek ebeveyni yaprak gosterip onun karisik havuzunu tek bir aracin
   * fiyati gibi sunmak olurdu.
   *
   * Ilan sayilari 0'dir ve kaynak dosyalari yoktur: yani secilebilirler ama
   * FIYATLANAMAZLAR (veri toplanmamis). Fail-closed davranis budur.
   */
  const expanded: ObservedCategory[] = [...observations];
  const already = new Set(observations.map((o) => o.categoryString));
  const terminalByString = new Map<string, boolean>();
  /**
   * Kanit sistemi DEVREDE MI.
   *
   *   undefined -> kanit hic toplanmadi (sentetik testler): yapisal kural
   *                gecerlidir, cocugu olmayan dugum yapraktir.
   *   null      -> kanit TOPLANMAYA CALISILDI ama yok: terminal SAYILMAZ.
   *
   * Uretimde her gozlem ya dizi ya null tasir, yani yapisal kurala DUSULMEZ.
   */
  const evidenceInUse = observations.some((o) => o.navChildLabels !== undefined);
  for (const observation of observations) {
    const labels = observation.navChildLabels;
    if (labels === undefined || labels === null) continue;
    terminalByString.set(observation.categoryString, labels.length === 0);
    for (const label of labels) {
      const clean = String(label).trim();
      if (!clean) continue;
      const child = `${observation.categoryString} ${clean}`.replace(/\s+/g, ' ').trim();
      if (already.has(child)) continue;
      already.add(child);
      expanded.push({
        categoryString: child,
        listingCount: 0,
        sourceFiles: [],
        // Cocugun yolu da KESINDIR: ebeveynin kesin yolu + menudeki etiket.
        pathSegments: observation.pathSegments
          ? [...observation.pathSegments, clean]
          : undefined,
      });
    }
  }

  /**
   * A) KESIN YOLLU GOZLEMLER (breadcrumb). Sinir tahmini YOK.
   *
   * Her ata da acikca kaydedilir: breadcrumb zinciri zaten tum ust seviyeleri
   * ismiyle verir, dolayisiyla ara seviye "turetmeye" gerek kalmaz.
   */
  const explicit = expanded.filter((o) => Array.isArray(o.pathSegments) && o.pathSegments.length > 0);
  if (explicit.length > 0) {
    /**
     * Breadcrumb'siz kalan gozlem SESSIZCE DUSURULMEZ — bu, duzeltmeye
     * calistigimiz hatanin ta kendisi olurdu. Marka siniri bilinen marka
     * listesinden okunur; markadan SONRASI tek parca birakilir, cunku ic
     * sinirlarini bilmiyoruz ve TAHMIN ETMEYIZ.
     */
    const rescued: ObservedCategory[] = [];
    const unresolvedHere: string[] = [];
    for (const o of expanded) {
      if (Array.isArray(o.pathSegments) && o.pathSegments.length > 0) continue;
      const split = splitMakeAndRest(o.categoryString, options.knownMakes);
      if (!split) {
        unresolvedHere.push(o.categoryString);
        continue;
      }
      rescued.push({ ...o, pathSegments: split.rest ? [split.make, split.rest] : [split.make] });
    }
    const tree = buildFromExplicitPaths([...explicit, ...rescued], terminalByString, evidenceInUse);
    tree.unresolved.push(...unresolvedHere);
    return tree;
  }

  // 1) Marka koku + geri kalan yol. Marka cozulemezse dize agaca ALINMAZ.
  const unresolved: string[] = [];
  const byString = new Map<string, ObservedCategory>();
  const makesSeen = new Set<string>();

  for (const observation of expanded) {
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
  /**
   * Gozlenen dize -> ATANMIS dugum kimligi.
   *
   * Ebeveyn kimligi yeniden HESAPLANMAZ, buradan OKUNUR. Yeniden hesaplamak,
   * asagidaki cakisma ayrimini gorunmez kilardi: ebeveyn ayri bir kimlik
   * aldiysa cocuklari yine eski (cakisan) kimlige baglanirdi.
   *
   * Dizeler sozcuk sayisina gore artan sirada islendigi ve bir dizenin
   * ebeveyni daima DAHA AZ sozcuklu oldugu icin ebeveyn her zaman onceden
   * atanmis olur.
   */
  const idByString = new Map<string, string>();
  const sorted = [...observed].sort((a, b) => a.split(' ').length - b.split(' ').length);

  for (const value of sorted) {
    const parentString = longestObservedPrefix(value, observed);
    const label = parentString ? value.slice(parentString.length).trim() : value;
    const parentId = parentString ? idByString.get(parentString) ?? null : null;
    const parentNode = parentId ? nodes.get(parentId) : null;
    const pathSegments = parentNode ? [...parentNode.pathSegments, label] : [label];
    const id = uniqueNodeId(pathSegments, nodes);
    if (!id) continue; // birebir ayni yol: gercekten ayni dugum.
    idByString.set(value, id);

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
      /**
       * Terminal kaniti YALNIZCA sayfanin kendi menusunden gelir. Sayfasi
       * olmayan (turetilmis ya da menuden gelen) dugum icin kanit yoktur.
       */
      terminalConfirmed: terminalByString.get(value) === true,
      isLeaf: false,
      childIds: [],
      ownListingCount: source ? source.listingCount : 0,
      totalListingCount: 0,
      sourceFiles: source ? [...new Set(source.sourceFiles)] : [],
      derived: !source,
    });

    if (parentNode) {
      parentNode.childIds.push(id);
      parentNode.hasChildren = true;
    } else {
      rootIds.push(id);
    }
  }

  /**
   * YAPRAK KARARI — IKI KOSUL BIRDEN.
   *
   * Cocugu olmamak yetmez; terminal oldugu kaynagin kendi menusunden
   * dogrulanmis olmali. Aksi halde dugum BILINMEYENDIR ve degerleme acilmaz.
   */
  for (const node of nodes.values()) {
    if (!evidenceInUse) node.terminalConfirmed = !node.hasChildren;
    node.isLeaf = !node.hasChildren && node.terminalConfirmed;
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

/**
 * KESIN YOLLARDAN AGAC — TAHMIN YOK.
 *
 * Her gozlem kendi segmentlerini kaynagin breadcrumb'indan getirir; ebeveyn
 * iliskisi yolun ONEKIDIR, metin benzerligi degil. Bu, onek cikariminin iki
 * kronik hatasini birden ortadan kaldirir: kardesi cocuk yapmak ("1.6" ->
 * "1.6 FSI") ve tek etiketi ikiye bolmek ("LS Plus" -> "LS" + "Plus").
 */
function buildFromExplicitPaths(
  observations: ObservedCategory[],
  terminalByString: Map<string, boolean>,
  evidenceInUse: boolean,
): HierarchyTree {
  const nodes = new Map<string, HierarchyNode>();
  const rootIds: string[] = [];
  const idByPath = new Map<string, string>();
  const keyOf = (segments: string[]) => segments.join(' ');

  /** Yolu (ve tum atalarini) kaydeder, en alttaki dugumu dondurur. */
  const ensure = (segments: string[]): HierarchyNode => {
    const key = keyOf(segments);
    const known = idByPath.get(key);
    if (known) return nodes.get(known)!;

    const parent = segments.length > 1 ? ensure(segments.slice(0, -1)) : null;
    const id = uniqueNodeId(segments, nodes) ?? nodeIdFromPath(segments);
    const node: HierarchyNode = {
      id,
      name: segments[segments.length - 1],
      parentId: parent ? parent.id : null,
      depth: segments.length - 1,
      pathSegments: [...segments],
      fullPath: fullPathLabel(segments),
      categoryString: null,
      hasChildren: false,
      terminalConfirmed: false,
      isLeaf: false,
      childIds: [],
      ownListingCount: 0,
      totalListingCount: 0,
      sourceFiles: [],
      derived: true,
    };
    nodes.set(id, node);
    idByPath.set(key, id);
    if (parent) {
      parent.childIds.push(id);
      parent.hasChildren = true;
    } else {
      rootIds.push(id);
    }
    return node;
  };

  for (const observation of observations) {
    const node = ensure(observation.pathSegments!);
    node.ownListingCount += observation.listingCount;
    if (observation.sourceFiles.length > 0) {
      node.sourceFiles = [...new Set([...node.sourceFiles, ...observation.sourceFiles])];
      node.categoryString = observation.categoryString;
      // Kaydedilmis sayfasi var: artik "turetilmis" degil, GOZLENMIS dugum.
      node.derived = false;
    }
    /**
     * TERMINAL KANITI YALNIZCA KENDI SAYFASINDAN GELIR.
     *
     * Anahtar kategori dizesidir ve iki farkli gozlem ayni dizeyi
     * uretebilir: kaydedilen bir dosyanin adi "Renault Symbol 1.0 TCe Joy"
     * iken breadcrumb'i "Renault > Symbol > 1.0 TCe"dir; satirlardan
     * kesfedilen "…/1.0 TCe/Joy" dugumu ayni dizeye denk gelip o sayfanin
     * terminal kanitini HAKSIZ YERE devraliyordu. Sayfasi olmayan dugum
     * terminal ILAN EDILEMEZ.
     */
    if (observation.sourceFiles.length > 0 && terminalByString.get(observation.categoryString) === true) {
      node.terminalConfirmed = true;
    }
  }

  for (const node of nodes.values()) {
    if (!evidenceInUse) node.terminalConfirmed = !node.hasChildren;
    node.isLeaf = !node.hasChildren && node.terminalConfirmed;
    node.childIds.sort();
  }
  const byDepthDesc = [...nodes.values()].sort((a, b) => b.depth - a.depth);
  for (const node of byDepthDesc) {
    node.totalListingCount =
      node.ownListingCount +
      node.childIds.reduce((sum, id) => sum + (nodes.get(id)?.totalListingCount ?? 0), 0);
  }
  rootIds.sort();
  return { nodes, rootIds, unresolved: [] };
}

/**
 * CAKISMAYAN DUGUM KIMLIGI.
 *
 * Slug uretimi harf/rakam disindaki karakterleri atar; bu yuzden GERCEKTEN
 * FARKLI iki etiket ayni kimlige dusebilir. Korpusta gozlenen ornek:
 * "Peugeot 206" (kardeslerden turetilmis ara seviye) ile "Peugeot 206 +"
 * (kaynakta AYRI bir model sayfasi) — ikisi de "peugeot/206" uretiyordu.
 *
 * Onceki davranis ikinciyi SESSIZCE DUSURUYORDU: kullanicinin elle topladigi
 * 413 ilan agacta hic gorunmuyordu. Iki yanlis secenek daha var ve ikisi de
 * reddedildi:
 *   - ilanlari mevcut dugume katmak -> "206 +" ilanlarini "206" havuzuna
 *     karistirmak, yani KARDES SIZINTISI ve yanlis fiyat;
 *   - kimligi kisaltmak -> tum agacin kimlikleri degisir.
 *
 * Bunun yerine cakisan dugum KARARLI bir ek alir ("peugeot/206-2"). Kimlik
 * yalnizca cakisan dal icin degisir; diger tum kimlikler aynen korunur.
 *
 * Yol segmentleri birebir ayni ise bu gercekten AYNI dugumdur; null doner
 * ve cagiran atlar.
 */
function uniqueNodeId(
  pathSegments: string[],
  nodes: Map<string, HierarchyNode>,
): string | null {
  const base = nodeIdFromPath(pathSegments);
  const existing = nodes.get(base);
  if (!existing) return base;
  if (samePath(existing.pathSegments, pathSegments)) return null;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    const taken = nodes.get(candidate);
    if (!taken) return candidate;
    if (samePath(taken.pathSegments, pathSegments)) return null;
  }
  return null;
}

function samePath(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
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

/**
 * Tam yola gore dugum bulur — son isme gore DEGIL.
 *
 * Slug'dan gelen kimlik bir BASLANGIC tahminidir, kanit degildir: cakisma
 * yuzunden ayri kimlik almis dugumler ("peugeot/206-2") ayni slug'i uretir.
 * Bu yuzden bulunan dugumun segmentleri BIREBIR dogrulanir; tutmazsa tam
 * segment esitligiyle aranir. Dogrulamasiz donmek, "206 +" isteyen cagiriya
 * "206" dugumunu vermek olurdu.
 */
export function findByPath(tree: HierarchyTree, segments: string[]): HierarchyNode | null {
  const direct = tree.nodes.get(nodeIdFromPath(segments));
  if (direct && samePath(direct.pathSegments, segments)) return direct;
  for (const node of tree.nodes.values()) {
    if (samePath(node.pathSegments, segments)) return node;
  }
  return null;
}
