/**
 * ILAN -> EN DERIN KANITLANMIS DUGUM (GENERIC).
 *
 * Model hucresi metni BOSLUKTAN BOLUNMEZ. Metin, AGACIN KENDI ETIKET
 * SOZLUGUNE karsi cozulur: her adimda yalnizca mevcut dugumun GERCEK
 * cocuklarindan biri eslesebilir.
 *
 *   sayfa baglami : Audi / A3
 *   hucre metni   : "A3 Sedan 35 TFSI"
 *   A3'un cocuklari: A3 Cabrio | A3 Hatchback | A3 Sedan | A3 Sportback
 *     -> "A3 Sedan" eslesir, tuketilir
 *   A3 Sedan'in cocuklari: ... | 35 TFSI | ...
 *     -> "35 TFSI" eslesir, tuketilir
 *   sonuc: Audi / A3 / A3 Sedan / 35 TFSI   (metin TAMAMEN tukendi)
 *
 * EN UZUN ESLESME KAZANIR. Ayni oneki paylasan kardesler bu yuzden
 * karismaz: "1.6", "1.6 FSI", "1.6 TDI" birlikte varken "1.6 TDI Attraction"
 * metni "1.6"ya degil "1.6 TDI"ye iner. Cok sozcuklu etiketler ("LS Plus",
 * "35 TFSI", "A3 Sportback") tek parca kalir.
 *
 * FUZZY ESLESME YOKTUR: substring, Levenshtein, "en yakin" arama yok. Sinir
 * daima SOZCUK sinirindadir. Eslesme belirsizse durulur.
 *
 * SAHTE HASSASIYET YOK: metin tam tukenmediyse dugum "en derin KANITLANMIS
 * ata"dir, terminal degil (bkz. PARTIAL). Ilan basligi ("HATASIZ S LINE...")
 * serbest metindir ve kategori kimligi icin HIC kullanilmaz.
 */
import { HierarchyNode, HierarchyTree } from './hierarchy-tree';

export type ListingEvidence =
  /** Sayfa zaten terminal kategori; satir ek kimlik tasimiyor. */
  | 'PAGE_EXACT'
  /** Satirin model metni agacta TAMAMEN cozuldu. */
  | 'ROW_MODEL_EXACT'
  /** Metnin bir kismi cozuldu; daha derini bilinmiyor. Fiyatlamaya GIRMEZ. */
  | 'PARTIAL'
  /** Ayni derinlikte birden fazla dugum esit derecede eslesti. GIRMEZ. */
  | 'AMBIGUOUS'
  /** Hicbir sey cozulemedi. GIRMEZ. */
  | 'UNRESOLVED';

export interface ListingResolution {
  nodeId: string;
  /** Kokten itibaren kac seviye (1 = yalnizca marka). */
  depth: number;
  evidence: ListingEvidence;
  /** Cozulemeyen artik metin (PARTIAL teshisi icin). */
  remainder: string;
}

/** Sozcuk sinirina saygili onek karsilastirmasi (buyuk/kucuk harf duyarsiz). */
function consumeLabel(text: string, label: string): string | null {
  if (!label) return null;
  const lowerText = text.toLocaleLowerCase('tr');
  const lowerLabel = label.toLocaleLowerCase('tr');
  if (lowerText === lowerLabel) return '';
  if (lowerText.startsWith(`${lowerLabel} `)) return text.slice(label.length).trim();
  return null;
}

/**
 * `start` dugumunden baslayarak metni AGAC uzerinde yurur.
 *
 * @param selfPrefix Sayfanin kendi adini tekrar eden hucreler icin: metin
 *   dugumun KENDI adiyla basliyorsa bir kez tuketilir. Kaynak bunu gercekten
 *   yapiyor ("Audi A3 A3 Sportback" sayfasinda hucre "A3 Sportback 1.4 TFSI").
 */
export function resolveListing(
  tree: HierarchyTree,
  start: HierarchyNode,
  modelText: string,
): ListingResolution {
  let node = start;
  let text = String(modelText || '').replace(/\s+/g, ' ').trim();

  if (!text) {
    return {
      nodeId: node.id,
      depth: node.depth + 1,
      evidence: 'PAGE_EXACT',
      remainder: '',
    };
  }

  let selfPrefixStripped = false;
  let descended = false;
  while (text) {
    const children = node.childIds
      .map((id) => tree.nodes.get(id))
      .filter((n): n is HierarchyNode => Boolean(n));

    /**
     * EN UZUN GECERLI COCUK. Kisa olani secmek "1.6 TDI"yi "1.6" havuzuna
     * atardi; bu tam olarak kacinmak istedigimiz kardes sizintisidir.
     */
    let best: { child: HierarchyNode; rest: string } | null = null;
    let bestTie = false;
    for (const child of children) {
      const rest = consumeLabel(text, child.name);
      if (rest === null) continue;
      if (!best || child.name.length > best.child.name.length) {
        best = { child, rest };
        bestTie = false;
      } else if (child.name.length === best.child.name.length && child.id !== best.child.id) {
        bestTie = true;
      }
    }

    /**
     * COCUKLAR ONCE DENENIR, KENDI ADI SONRA.
     *
     * Hucre ustteki seviyeyi tekrar edebilir ("A3 Sportback 1.4 TFSI" sayfasi
     * "A3 Sportback"). Ama kendi adini ONCE atmak felakete yol aciyordu:
     * "A3" dugumunde "A3 Sedan 35 TFSI" metninden "A3" silinince geriye
     * "Sedan 35 TFSI" kaliyor ve "A3 Sedan" cocugu ARTIK ESLESMIYOR — 600
     * gercek ilan bu yuzden cozulemiyordu. Cocuk etiketi kaynagin kesin
     * bilgisidir; onceligi o alir.
     */
    if (!best && !selfPrefixStripped) {
      const withoutSelf = consumeLabel(text, node.name);
      if (withoutSelf !== null) {
        selfPrefixStripped = true;
        text = withoutSelf;
        continue;
      }
    }

    if (!best) break;
    if (bestTie) {
      // Esit uzunlukta iki farkli cocuk: KARAR VERILEMEZ, fiyatlamaya girmez.
      return { nodeId: node.id, depth: node.depth + 1, evidence: 'AMBIGUOUS', remainder: text };
    }

    node = best.child;
    text = best.rest;
    descended = true;
  }

  if (!descended) {
    /**
     * Metin vardi ama hicbir cocuga inilemedi. Sayfa terminalse bu normaldir
     * (hucre yalnizca kendini tekrar etmistir); degilse cozulememistir.
     */
    if (!text) {
      return { nodeId: node.id, depth: node.depth + 1, evidence: 'PAGE_EXACT', remainder: '' };
    }
    return { nodeId: node.id, depth: node.depth + 1, evidence: 'UNRESOLVED', remainder: text };
  }

  return {
    nodeId: node.id,
    depth: node.depth + 1,
    evidence: text ? 'PARTIAL' : 'ROW_MODEL_EXACT',
    remainder: text,
  };
}

/** Fiyatlamaya yalnizca KESIN kanit girer. */
export function isExactEvidence(evidence: ListingEvidence): boolean {
  return evidence === 'PAGE_EXACT' || evidence === 'ROW_MODEL_EXACT';
}
