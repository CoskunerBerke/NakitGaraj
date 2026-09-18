/**
 * DEMO ARAC SECIMI — KATALOGDAN SURULUR, FIYATTAN DEGIL.
 *
 * Kategori yolu markadan markaya farkli derinliktedir ve seviyelerin ANLAMI
 * da sabit degildir:
 *
 *   Audi        > A3        > A3 Sedan > 1.5 TFSI  > Advanced   (kasa + motor + paket)
 *   Alfa Romeo  > 146       > 1.4      > TS                     (motor + paket)
 *   BMW         > i Serisi  > i4       > eDrive 40 > M Sport    (alt tip + motor + paket)
 *
 * SABITLENEN HATA: zincir eskiden FIYAT HAVUZLARINDAN turetiliyordu. Havuzlar
 * ise haftalik taramanin o ana kadar ziyaret ettigi hedeflerden gelir ve tarama
 * alfabetiktir. Dosya `opel/corsa/...` hedefinde kesilince Opel dropdown'i
 * Corsa-e'de bitiyor, marka listesi Opel'de duruyordu: Insignia (2.186 ilan),
 * Vectra (2.706), Peugeot, Renault, Toyota, Volkswagen, Volvo... hepsi SESSIZCE
 * kayboluyordu. Arac vardi, ilani vardi, hiyerarside vardi — sadece taramanin
 * sirasi oraya gelmemisti.
 *
 * Bu yuzden iki sey birbirinden AYRILDI:
 *
 *   KATALOG (`catalog`) — kaynak hiyerarsinin tamami. Neyin SECILEBILIR
 *                         oldugunu bu belirler.
 *   FIYAT   (`pools`)   — o ana kadarki emsal kaniti. Neyin FIYATLANABILIR
 *                         oldugunu bu belirler.
 *
 * Katalogda olup havuzu olmayan arac ekranda KALIR; fiyat yerine nedeni
 * gosterilir. Bir aracin gizlenmesi icin kaynakta hic var olmamasi gerekir.
 */

/**
 * [km1, km2, km3, fmv1, fmv2, fmv3, dogrudan, odunc, etkin,
 *  yayilim, motor guveni, manuel gerekce kodu]
 *
 * Ilk alti sayi motorun km egrisi ornegi. Sonraki uc sayi KANITI anlatir:
 * hedef yilin kendi ilanlari, komsu yildan indirgenenler ve agirlikli
 * toplam. Son uc sayi MOTORUN KARARIDIR: emsallerin yayilimi, motorun
 * kendi guven skoru ve manuel degerlendirme gerekcesi. Bir yilin veri
 * setinde OLMASI ile guvenle fiyatlanabilir OLMASI ayri seylerdir.
 */
export type YearRow = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** Yil satirini isimli alanlara acar; indis bilgisi TEK yerde durur. */
export interface YearEvidence {
  kmPoints: [number, number, number];
  fmvPoints: [number, number, number];
  directComparables: number;
  borrowedComparables: number;
  effectiveComparables: number;
  dispersion: number;
  engineConfidencePct: number;
  engineManualCode: number;
}

export const yearEvidenceOf = (row: YearRow): YearEvidence => ({
  kmPoints: [row[0], row[1], row[2]],
  fmvPoints: [row[3], row[4], row[5]],
  directComparables: row[6],
  borrowedComparables: row[7],
  effectiveComparables: row[8],
  dispersion: row[9],
  engineConfidencePct: row[10],
  engineManualCode: row[11],
});

/**
 * Bir secim seviyesinin ne oldugu. Kaynak veride seviye TIPI yazmaz; tip,
 * veri seti uretilirken etiketlerden cikarilir (build_demo_dataset.ts) ve
 * emin olunamayan seviye 'series' kalir.
 */
export type LevelKind = 'body' | 'engine' | 'package' | 'series';

/**
 * KATALOGUN TEL BICIMI: `[kimlik, etiket, ilan]`, cocuklu dugumlerde dorduncu
 * alanda cocuklar.
 *
 * KIMLIK TAM YAZILIR, EBEVEYNDEN TURETILMEZ. Ilk surumde yalnizca son segment
 * tasiniyor ve kimlik "ebeveyn + '/' + segment" diye kuruluyordu. Hiyerarside
 * 14 dugumde bu KURAL GECERSIZDIR: Sahibinden'de "206" ile "206 +" ayri
 * modellerdir ve ikisi de `peugeot/206` slug'ina duser; ikinciye `peugeot/206-2`
 * verilir ama COCUKLARI etiket slug'indan uretildigi icin `peugeot/206/1-4`
 * olarak kalir — yani cocugun kimligi ebeveyninin kimligiyle baslamaz.
 * Segmentten kimlik turetmek bu dugumleri yanlis dala baglayip 1.000 ilanlik
 * "206 1.4"i yetim birakiyordu (denetim yakaladi: 59 sessiz dusus).
 *
 * Kimlik burada ARTIK BIR YOL DEGIL, opak bir anahtardir: agac `parentId`
 * iliskisinden, gosterilen ad `etiket`ten, fiyat havuzu da bu anahtardan
 * cozulur. Uclu ayni dugumde durdugu icin birbirinden sapamaz.
 */
export type CatalogWire =
  | [string, string, number]
  | [string, string, number, CatalogWire[]];

export interface CatalogNode {
  /** Kaynak hiyerarsi kimligi — fiyat havuzu anahtari. Yol DEGILDIR. */
  id: string;
  label: string;
  /** Kaynak hiyerarsinin bu dalda saydigi ilan (fiyat havuzundan bagimsiz). */
  listings: number;
  children: CatalogNode[];
}

export interface Catalog {
  roots: CatalogNode[];
  byId: Map<string, CatalogNode>;
}

export interface DemoPool {
  n: number;
  km: number;
  years: Record<string, YearRow>;
}

export interface DemoData {
  generatedAt: string;
  hierarchyVersion: string;
  marketRelease?: string;
  catalogNodeCount: number;
  catalogLeafCount: number;
  poolCount: number;
  listingCount: number;
  yearRowCount: number;
  /** "audi/a3" -> ["body","engine","package"] (2. seviyeden itibaren) */
  levels: Record<string, LevelKind[]>;
  catalog: CatalogWire[];
  pools: Record<string, DemoPool>;
}

export interface ChainRow {
  depth: number;
  options: CatalogNode[];
  /** O seviyede secili dugumun kimligi, secilmediyse ''. */
  value: string;
}

/**
 * Bir secimin fiyat karsisindaki durumu.
 *
 *   INCOMPLETE     — zincir bitmedi, daha alt seviye var.
 *   PRICEABLE      — arac katalogda var ve fiyat havuzu var.
 *   NO_PRICE_DATA  — arac katalogda var, guncel emsal kaniti YOK.
 *
 * NO_PRICE_DATA bir hata degildir: ya tarama o hedefe henuz gelmemistir, ya da
 * dalda gecerli ilan yoktur. Her iki halde de arac secilebilir kalir.
 */
export type SelectionAvailability = 'INCOMPLETE' | 'PRICEABLE' | 'NO_PRICE_DATA';

export const LEVEL_HEADING: Record<LevelKind, string> = {
  body: 'Kasa / Gövde',
  engine: 'Motor',
  package: 'Paket / Donanım',
  series: 'Seri / Tip',
};

const byTr = (a: CatalogNode, b: CatalogNode) =>
  a.label.localeCompare(b.label, 'tr');

/** Tel bicimini gezilebilir agaca acar ve her dugumu kimligiyle indeksler. */
export function buildCatalog(data: DemoData): Catalog {
  const byId = new Map<string, CatalogNode>();

  const expand = (wire: CatalogWire): CatalogNode => {
    const [id, label, listings] = wire;
    const node: CatalogNode = {
      id,
      label,
      listings,
      children: (wire[3] ?? []).map(expand),
    };
    node.children.sort(byTr);
    byId.set(id, node);
    return node;
  };

  const roots = (data.catalog ?? []).map(expand);
  roots.sort(byTr);
  return { roots, byId };
}

/**
 * Secimin `depth` seviyesindeki dugumu. Secim kimlikleri dogrudan tasidigi
 * icin arama yapilmaz; kimligin yol gibi birlestirilmesi 14 dugumde yanlis
 * dala duserdi (bkz. CatalogWire).
 */
export function nodeAt(
  catalog: Catalog,
  selection: string[],
  depth: number,
): CatalogNode | null {
  if (depth <= 0 || selection.length < depth) return null;
  const id = selection[depth - 1];
  return id ? catalog.byId.get(id) ?? null : null;
}

/** Verilen onekin o derinlikteki secenekleri. */
export function optionsAt(
  catalog: Catalog,
  selection: string[],
  depth: number,
): CatalogNode[] {
  if (depth === 0) return catalog.roots;
  const parent = nodeAt(catalog, selection, depth);
  return parent ? parent.children : [];
}

/**
 * Gosterilecek dropdown'lar. Bir dalin alti yoksa zincir ORADA biter
 * ("A3 Cabrio > 1.8 TFSI" altinda paket seviyesi yoktur) ve dogrudan yila
 * gecilir; secim sayisi hicbir yerde sabitlenmez.
 */
export function buildChain(catalog: Catalog, selection: string[]): ChainRow[] {
  const rows: ChainRow[] = [];
  for (let depth = 0; ; depth++) {
    const options = optionsAt(catalog, selection, depth);
    if (options.length === 0) break;
    rows.push({ depth, options, value: selection[depth] ?? '' });
    if (!selection[depth]) break;
  }
  return rows;
}

/**
 * FIYAT HAVUZU TAM KIMLIKTEN COZULUR.
 *
 * Secim segment kimligi tasidigi icin havuz dogrudan okunur; etikete gore
 * arama yapilmaz, dolayisiyla ayni etiketi paylasan iki dal birbirine
 * karisamaz.
 */
export function resolvePool(
  data: DemoData,
  selection: string[],
): DemoPool | null {
  const id = selection[selection.length - 1];
  return id ? data.pools[id] ?? null : null;
}

/** Secimin ekranda gorunen yolu: ["Opel","Insignia","1.6 CDTI"]. */
export function labelPathOf(catalog: Catalog, selection: string[]): string[] {
  const labels: string[] = [];
  for (let depth = 1; depth <= selection.length; depth++) {
    const node = nodeAt(catalog, selection, depth);
    if (!node) break;
    labels.push(node.label);
  }
  return labels;
}

/**
 * SECILEBILIRLIK ile FIYATLANABILIRLIK AYRI SORULARDIR.
 *
 * Zincirin sonuna gelinmisse arac secilmis demektir. Fiyat havuzunun olup
 * olmadigi bunu DEGISTIRMEZ; yalnizca ekranda sayi mi yoksa gerekce mi
 * gosterilecegini belirler.
 */
export function availabilityOf(
  catalog: Catalog,
  data: DemoData,
  selection: string[],
): SelectionAvailability {
  const node = nodeAt(catalog, selection, selection.length);
  if (!node || node.children.length > 0) return 'INCOMPLETE';
  const pool = data.pools[node.id];
  return pool && Object.keys(pool.years).length > 0
    ? 'PRICEABLE'
    : 'NO_PRICE_DATA';
}

/** Seviye basligi: ilk ikisi sabit, gerisi veri setinin sinifllandirmasindan. */
export function headingFor(
  data: DemoData,
  selection: string[],
  depth: number,
): string {
  if (depth === 0) return 'Marka';
  if (depth === 1) return 'Model';
  // Dal anahtari MODEL DUGUMUNUN KIMLIGIDIR; marka/model'i kimlikten kesmek
  // "206 +" gibi dugumlerde baska bir dalin siniflandirmasini okurdu.
  const branch = selection[1];
  const kinds = branch ? data.levels[branch] : undefined;
  return LEVEL_HEADING[kinds?.[depth - 2] ?? 'series'];
}

/**
 * Bir seviye degisince alt seviyeler KOR RESETLENMEZ: hala gecerli olan secim
 * korunur (Sedan -> Sportback gecisinde "1.6 TDI" iki dalda da varsa
 * kullanici onu yeniden secmek zorunda kalmaz). Gecersiz olan ilk seviyede ve
 * altinda zincir kesilir.
 */
export function applyChoice(
  catalog: Catalog,
  selection: string[],
  depth: number,
  value: string,
): string[] {
  const next = selection.slice(0, depth);
  if (!value) return next;
  next[depth] = value;

  // Korunan secim ETIKETE gore tasinir: "1.6 TDI" Sedan'da ve Sportback'te
  // AYRI dugumlerdir, kimlikleri esit degildir. Kimlige gore eslemek kasa
  // degistiren kullaniciya ayni motoru bastan sectirirdi.
  for (let i = depth + 1; i < selection.length; i++) {
    const keptLabel = catalog.byId.get(selection[i])?.label;
    if (!keptLabel) break;
    const match = optionsAt(catalog, next, i).find(
      (option) => option.label === keptLabel,
    );
    if (!match) break;
    next[i] = match.id;
  }
  return next;
}

/** Havuzun yillari, yeniden eskiye. */
export function yearsOf(pool: DemoPool | null): number[] {
  if (!pool) return [];
  return Object.keys(pool.years)
    .map(Number)
    .sort((a, b) => b - a);
}
