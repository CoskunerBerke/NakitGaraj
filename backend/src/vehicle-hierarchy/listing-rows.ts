/**
 * ILAN SATIRI — SAYFANIN ICINDEKI KENDI KIMLIGI.
 *
 * KOK NEDEN (kanitlanmis): bugune kadar bir ilanin kimligi GELDIGI DOSYANIN
 * kategorisi sayildi. Oysa ust kategori sayfasindaki satirlar dosya adindan
 * DAHA DERIN kimlik tasir. Ornek, "Audi A3 ...html" sayfasindaki tek satir:
 *
 *   data-id="1320984119"   Model hucresi: "A3 Sedan 35 TFSI"
 *
 * Bu ilan "Audi / A3" havuzuna degil, "Audi / A3 / A3 Sedan / 35 TFSI"
 * dalina aittir. Ayni sayfada "A3 Sportback 35 TFSI" ve "A3 Sedan 1.5 TFSI"
 * de bulunur; hepsini tek havuza atmak farkli araclari karistirmaktir.
 *
 * SUTUN SAYISI SABIT DEGILDIR. Sayfanin derinligine gore Model hucresi bir
 * ya da birkac olabilir ve bazen ustteki seviyeyi TEKRAR eder:
 *
 *   Audi (marka)            -> ["A6", "A6 Sedan 45 TFSI"]
 *   Audi A3 (seri)          -> ["A3 Sportback 35 TFSI"]
 *   Audi A3 A3 Sportback    -> ["A3 Sportback 1.4 TFSI"]   (kendini tekrar)
 *   Ferrari (marka)         -> ["458", "Spider"]
 *
 * Bu yuzden hucreler BIRLESTIRILIR ve cozumleme agacin kendi etiketleriyle
 * yapilir (bkz. listing-resolver). Burada TAHMIN YOKTUR; yalnizca okuma var.
 *
 * NOT: veritabanindaki `canonicalTrim` bu hucrelerin duzlestirilmis halidir
 * ve KAYIPLIDIR — ["Aston Martin","Vanquish","V12"] tek dizeye "Vanquish V12"
 * diye eziliyor, seviye siniri kayboluyor. Bu yuzden kaynak HTML okunur.
 */

export interface ListingRow {
  /** Kaynagin kendi ilan kimligi (tr[data-id]) — sayfalar arasi KARARLI. */
  listingId: string;
  /** Model hucreleri, sayfadaki SIRASIYLA. Bosluklar temizlenmis. */
  cells: string[];
  /** Ilan basligi — SERBEST METIN. Kategori kimligi icin kullanilmaz. */
  title: string;
}

const ROW_SPLIT = '<tr data-id="';
const CELL = /<td class="searchResultsTagAttributeValue">([\s\S]*?)<\/td>/g;
const TITLE = /<a class="\s*classifiedTitle\s*"[^>]*>([\s\S]*?)<\/a>/;

function text(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sayfadaki tum ilan satirlarini cikarir.
 *
 * Satir sinirlari `</tr>` ile kapatilir; boylece bir satirin hucreleri
 * komsusuna TASMAZ (ilk denemede tasmisti ve marka hucresi model sanilmisti).
 */
export function extractListingRows(html: string): ListingRow[] {
  const chunks = html.split(ROW_SPLIT);
  if (chunks.length < 2) return [];

  const rows: ListingRow[] = [];
  for (let i = 1; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const quote = chunk.indexOf('"');
    if (quote < 0) continue;
    const listingId = chunk.slice(0, quote).trim();
    if (!/^\d+$/.test(listingId)) continue;

    const body = chunk.split('</tr>')[0] ?? '';
    const cells: string[] = [];
    CELL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CELL.exec(body)) !== null) {
      const value = text(m[1]);
      if (value) cells.push(value);
    }
    const titleMatch = TITLE.exec(body);
    rows.push({ listingId, cells, title: titleMatch ? text(titleMatch[1]) : '' });
  }
  return rows;
}
