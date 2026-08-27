/**
 * ILAN SATIRLARINDAN ALT KATEGORI KESFI — SON KANIT KAYNAGI.
 *
 * Bir kategorinin kendi sayfasi hic kaydedilmemisse cocuklarini menuden
 * ogrenemeyiz. Ama UST sayfadaki satirlar o dala ait kimligi zaten tasir:
 *
 *   sayfa "Audi / A3", satir Model hucresi "A3 Sedan 35 TFSI"
 *   -> "A3 Sedan"e inilir, geriye "35 TFSI" kalir
 *
 * Bu artik metin UYDURMA DEGILDIR: kaynagin kendi YAPISAL Model alanindan
 * gelir (ilan basligi gibi serbest metin degildir). Onu atmak, gercekten
 * elimizde olan ilanlari "veri toplanmadi" diye gostermek olurdu.
 *
 * KESIN SINIR: bu kesif YALNIZCA cocugu HIC BILINMEYEN dugumler icin
 * yapilir. Menusu okunmus bir dugumun cocuk listesi KAYNAKTAN kesindir;
 * oraya satir metniyle yeni dal EKLENMEZ. (Olculdu: artik metin ureten 700
 * dugumun tamaminin agacta cocugu yok.)
 *
 * BILINEN SINIRLAMA: artik metin birden fazla seviye tasiyabilir
 * ("1.6 Impressive" = motor + donanim). Ic siniri bilmedigimiz icin TEK
 * dugum olarak birakilir — tahmin etmeyiz. Bu, fiyatlama acisindan
 * GUVENLIDIR: havuz yine tek bir gercek araca aittir, yalnizca arayuzde iki
 * soru yerine tek soru sorulur.
 */
import { HierarchyNode, HierarchyTree, ObservedCategory } from './hierarchy-tree';
import { extractListingRows } from './listing-rows';
import { resolveListing } from './listing-resolver';

export interface DiscoveryResult {
  /** Agaca eklenecek yeni gozlemler (ilan sayisi 0, kaynak dosyasi yok). */
  observations: ObservedCategory[];
  filesScanned: number;
  nodesExtended: number;
  labelsDiscovered: number;
}

/**
 * Tum kaydedilmis sayfalarin satirlarini tarar ve cocugu bilinmeyen
 * dugumler icin alt kategori etiketleri toplar.
 */
export function discoverChildrenFromListings(
  tree: HierarchyTree,
  read: (file: string) => string | null,
): DiscoveryResult {
  const pageNode = new Map<string, HierarchyNode>();
  for (const node of tree.nodes.values()) {
    for (const file of node.sourceFiles) pageNode.set(file, node);
  }

  /** nodeId -> kesfedilen etiketler */
  const found = new Map<string, Set<string>>();
  let filesScanned = 0;

  for (const [file, node] of pageNode) {
    const html = read(file);
    if (html === null) continue;
    filesScanned += 1;

    for (const row of extractListingRows(html)) {
      const text = row.cells.join(' ').trim();
      if (!text) continue;
      const resolved = resolveListing(tree, node, text);
      /**
       * PARTIAL: kismen inildi, artik metin kaldi.
       * UNRESOLVED: hic inilemedi — cocugu HIC BILINMEYEN bir dugumde bu da
       *   ayni seydir, metnin TAMAMI alt kategori etiketidir. Bunu atlamak,
       *   sayfasi kaydedilmis bir yaprağin ("Renault / Symbol / 1.0 TCe")
       *   ilanlarinin hicbir havuza girmemesine yol aciyordu.
       */
      if (resolved.evidence !== 'PARTIAL' && resolved.evidence !== 'UNRESOLVED') continue;
      if (!resolved.remainder) continue;

      const target = tree.nodes.get(resolved.nodeId);
      /**
       * Cocuklari KAYNAKTAN bilinen dugume dokunma. Oradaki artik metin,
       * menude ilan edilmemis bir sey demektir; uydurmak yerine PARTIAL
       * kalmasi (ve fiyatlanmamasi) dogrudur.
       */
      if (!target || target.childIds.length > 0) continue;

      let labels = found.get(target.id);
      if (!labels) {
        labels = new Set<string>();
        found.set(target.id, labels);
      }
      labels.add(resolved.remainder);
    }
  }

  const observations: ObservedCategory[] = [];
  let labelsDiscovered = 0;
  for (const [nodeId, labels] of found) {
    const node = tree.nodes.get(nodeId);
    if (!node) continue;
    for (const label of labels) {
      labelsDiscovered += 1;
      observations.push({
        categoryString: `${node.pathSegments.join(' ')} ${label}`,
        listingCount: 0,
        sourceFiles: [],
        pathSegments: [...node.pathSegments, label],
      });
    }
  }

  return { observations, filesScanned, nodesExtended: found.size, labelsDiscovered };
}
