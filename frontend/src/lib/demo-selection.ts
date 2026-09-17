/**
 * DEMO ARAC SECIMI — DEGISKEN DERINLIKTE ZINCIR.
 *
 * Kategori yolu markadan markaya farkli derinliktedir ve seviyelerin ANLAMI
 * da sabit degildir:
 *
 *   Audi        > A3        > A3 Sedan > 1.5 TFSI  > Advanced   (kasa + motor + paket)
 *   Alfa Romeo  > 146       > 1.4      > TS                     (motor + paket)
 *   BMW         > i Serisi  > i4       > eDrive 40 > M Sport    (alt tip + motor + paket)
 *
 * Demo eskiden yolu ilk DORT segmente kirpiyordu; bes seviyeli markalarda bu,
 * kasayi "Motor", motoru "Paket" diye gosteriyor ve paket seviyesini tamamen
 * dusuruyordu. Ayni gorunen yolu paylasan farkli paketler (Advanced / Sport
 * Line) tek bir havuza indirgeniyor, kullaniciya yalnizca ilk havuzun yillari
 * gosteriliyordu.
 *
 * Bu yuzden zincir burada VERIDEN turer: her seviyenin secenekleri o ana
 * kadarki secimle eslesen havuzlardan gelir, havuz ise yolun TAMAMI birebir
 * eslestiginde cozulur. Fiyat kimligi hicbir yerde kirpilmaz.
 */

/**
 * [km1, km2, km3, fmv1, fmv2, fmv3, dogrudan, odunc, etkin]
 *
 * Ilk alti sayi motorun km egrisi ornegi. Son uc sayi KANITI anlatir:
 * hedef yilin kendi ilanlari, komsu yildan indirgenenler ve agirlikli
 * toplam. Bir yilin veri setinde OLMASI ile tek basina fiyatlanabilir
 * OLMASI ayri seylerdir; bu sayilar ikincisini anlatir.
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
];

/** Yil satirini isimli alanlara acar; indis bilgisi TEK yerde durur. */
export interface YearEvidence {
  kmPoints: [number, number, number];
  fmvPoints: [number, number, number];
  directComparables: number;
  borrowedComparables: number;
  effectiveComparables: number;
}

export const yearEvidenceOf = (row: YearRow): YearEvidence => ({
  kmPoints: [row[0], row[1], row[2]],
  fmvPoints: [row[3], row[4], row[5]],
  directComparables: row[6],
  borrowedComparables: row[7],
  effectiveComparables: row[8],
});

/**
 * Bir secim seviyesinin ne oldugu. Kaynak veride seviye TIPI yazmaz; tip,
 * veri seti uretilirken etiketlerden cikarilir (build_demo_dataset.ts) ve
 * emin olunamayan seviye 'series' kalir.
 */
export type LevelKind = 'body' | 'engine' | 'package' | 'series';

export interface DemoPool {
  /** Sahibinden'in kendi etiketleri: ["Audi","A3","A3 Sedan","1.5 TFSI","Advanced"] */
  path: string[];
  n: number;
  km: number;
  years: Record<string, YearRow>;
}

export interface DemoData {
  generatedAt: string;
  hierarchyVersion: string;
  poolCount: number;
  listingCount: number;
  yearRowCount: number;
  /** "audi/a3" -> ["body","engine","package"] (2. seviyeden itibaren) */
  levels: Record<string, LevelKind[]>;
  pools: Record<string, DemoPool>;
}

export interface PoolEntry {
  key: string;
  pool: DemoPool;
}

export interface ChainRow {
  depth: number;
  options: string[];
  value: string;
}

export const LEVEL_HEADING: Record<LevelKind, string> = {
  body: 'Kasa / Gövde',
  engine: 'Motor',
  package: 'Paket / Donanım',
  series: 'Seri / Tip',
};

/** Marka/model dallarini eslestirmek icin etiket cifti. */
const BRANCH_SEPARATOR = String.fromCharCode(0);

const byTr = (a: string, b: string) => a.localeCompare(b, 'tr');

export const poolEntries = (data: DemoData): PoolEntry[] =>
  Object.entries(data.pools).map(([key, pool]) => ({ key, pool }));

/** Marka+model ETIKETI -> veri setindeki "audi/a3" dal anahtari. */
export function branchKeyIndex(entries: PoolEntry[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const { key, pool } of entries) {
    if (pool.path.length < 2) continue;
    const label = pool.path[0] + BRANCH_SEPARATOR + pool.path[1];
    if (!index.has(label)) index.set(label, key.split('/').slice(0, 2).join('/'));
  }
  return index;
}

/** Verilen onekle eslesen havuzlarin o derinlikteki secenekleri. */
export function optionsAt(
  entries: PoolEntry[],
  depth: number,
  prefix: string[],
): string[] {
  const seen = new Set<string>();
  for (const { pool } of entries) {
    const path = pool.path;
    if (path.length <= depth) continue;
    let matches = true;
    for (let i = 0; i < depth; i++) {
      if (path[i] !== prefix[i]) {
        matches = false;
        break;
      }
    }
    if (matches) seen.add(path[depth]);
  }
  return [...seen].sort(byTr);
}

/**
 * Gosterilecek dropdown'lar. Bir seviyede secenek kalmadiysa dal ORADA biter
 * ("A3 Cabrio > 1.8 TFSI" altinda paket seviyesi yoktur) ve dogrudan yila
 * gecilir; secim sayisi hicbir yerde sabitlenmez.
 */
export function buildChain(entries: PoolEntry[], selection: string[]): ChainRow[] {
  const rows: ChainRow[] = [];
  const maxDepth = entries.reduce((m, e) => Math.max(m, e.pool.path.length), 0);

  for (let depth = 0; depth < maxDepth; depth++) {
    const options = optionsAt(entries, depth, selection);
    if (options.length === 0) break;
    rows.push({ depth, options, value: selection[depth] ?? '' });
    if (!selection[depth]) break;
  }
  return rows;
}

/**
 * FIYAT HAVUZU TAM YOLDAN COZULUR.
 *
 * Eskiden anahtar secimden yeniden slug'lastirilip bulunamayinca ETIKETE gore
 * ilk eslesen havuz aliniyordu; ayni dort etiketi paylasan paketlerde hep ilki
 * donuyordu. Artik yol birebir esitlenir: her paket kendi havuzudur.
 */
export function resolvePool(
  entries: PoolEntry[],
  selection: string[],
): PoolEntry | null {
  if (selection.length === 0) return null;
  return (
    entries.find(
      ({ pool }) =>
        pool.path.length === selection.length &&
        pool.path.every((segment, i) => segment === selection[i]),
    ) ?? null
  );
}

/** Seviye basligi: ilk ikisi sabit, gerisi veri setinin sinifllandirmasindan. */
export function headingFor(
  data: DemoData,
  branchKeys: Map<string, string>,
  selection: string[],
  depth: number,
): string {
  if (depth === 0) return 'Marka';
  if (depth === 1) return 'Model';
  if (selection.length < 2) return LEVEL_HEADING.series;

  const branch = branchKeys.get(selection[0] + BRANCH_SEPARATOR + selection[1]);
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
  entries: PoolEntry[],
  selection: string[],
  depth: number,
  value: string,
): string[] {
  const next = selection.slice(0, depth);
  if (!value) return next;
  next[depth] = value;

  for (let i = depth + 1; i < selection.length; i++) {
    const kept = selection[i];
    if (!kept || !optionsAt(entries, i, next).includes(kept)) break;
    next[i] = kept;
  }
  return next;
}

/** Havuzun yillari, yeniden eskiye. */
export function yearsOf(entry: PoolEntry | null): number[] {
  if (!entry) return [];
  return Object.keys(entry.pool.years)
    .map(Number)
    .sort((a, b) => b - a);
}
