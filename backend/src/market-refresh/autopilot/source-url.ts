/**
 * KAYNAK URL SEMANTIGI — 50 SONUC/SAYFA VE SAYFALAMA.
 *
 * Kaynagin liste gorunumu sayfa boyutunu ve ofseti sorgu dizesinden alir:
 *   pagingSize=50            -> sayfa basina 50 sonuc (azami)
 *   pagingOffset=(page-1)*50 -> sayfalama
 *
 * 50/sayfa TIKLAMAYLA DEGIL URL ile secilir: tiklama DOM'a bagimlidir ve
 * sessizce 20'de kalabilir; bu da 20 sayfa x 20 = 400 ilanla "tamamlandi"
 * yanilgisi uretir. URL parametresi deterministiktir ve test edilebilir.
 *
 * Var olan sorgu parametreleri KORUNUR: ikincil bolumler (orn. yil araligi)
 * kaynagin kendi filtre parametreleriyle gelir ve ezilmemelidir.
 */
import { LEAF_CAP } from '../source-partition';

export const AUTOPILOT_PAGE_SIZE = 50;

/** 50 x 20 = 1000: kaynagin gosterebildigi azami sayfa sayisi. */
export const MAX_PAGES_PER_LEAF = Math.ceil(LEAF_CAP / AUTOPILOT_PAGE_SIZE);

/**
 * Bir sayfada kabul edilen azami kart. Kaynak, 50 organik sonucun yanina
 * kucuk sayida "vitrin" satiri enjekte edebilir; bunlar gercek ilanlardir ve
 * kuresel tekillestirme tarafindan zaten tekillestirilir. Bu tavan, sayfa
 * boyutu parametresinin YOK SAYILDIGI durumu (yuzlerce kart) yakalar.
 */
export const MAX_CARDS_PER_PAGE = 60;

export const PAGING_SIZE_PARAM = 'pagingSize';
export const PAGING_OFFSET_PARAM = 'pagingOffset';
export const SORTING_PARAM = 'sorting';
export const NEWEST_FIRST_SORT = 'date_desc';

/**
 * Dugum yolunu mutlak URL'e cevirir. Yol goreli ("/audi-a3", "audi-a3") ya da
 * sorgu tasiyan ("/audi-a3?a5_max=2015") olabilir; ikisi de kabul edilir.
 * Baska kokene (host) ait mutlak URL REDDEDILIR — uzanti yalnizca kaynak
 * sitesinde gezinmelidir.
 */
export function resolveNodeUrl(baseUrl: string, nodePath: string): URL {
  const base = new URL(baseUrl);
  const raw = String(nodePath || '').trim();
  if (!raw) throw new Error('resolveNodeUrl: nodePath is empty');

  const url = new URL(raw, base);
  if (url.origin !== base.origin) {
    throw new Error(
      `resolveNodeUrl: refusing off-origin navigation "${url.origin}" (base "${base.origin}")`,
    );
  }
  return url;
}

/** Kesif URL'i: sayim ve gorunur alt kategoriler icin sade kategori sayfasi. */
export function buildCategoryUrl(baseUrl: string, nodePath: string): string {
  return resolveNodeUrl(baseUrl, nodePath).toString();
}

/**
 * Yaprak sayfa URL'i: 50/sayfa + dogru ofset.
 * @param page 1 tabanli.
 */
export function buildLeafPageUrl(baseUrl: string, nodePath: string, page: number): string {
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`buildLeafPageUrl: page must be a positive integer, got ${page}`);
  }
  if (page > MAX_PAGES_PER_LEAF) {
    throw new Error(
      `buildLeafPageUrl: page ${page} exceeds source maximum ${MAX_PAGES_PER_LEAF} ` +
        `(${AUTOPILOT_PAGE_SIZE}/page x ${MAX_PAGES_PER_LEAF} pages = ${LEAF_CAP})`,
    );
  }
  const url = resolveNodeUrl(baseUrl, nodePath);
  url.searchParams.set(PAGING_SIZE_PARAM, String(AUTOPILOT_PAGE_SIZE));
  url.searchParams.set(PAGING_OFFSET_PARAM, String((page - 1) * AUTOPILOT_PAGE_SIZE));
  return url.toString();
}

/** Weekly exact-target page: deterministic 50/page and newest -> oldest. */
export function buildIncrementalPageUrl(baseUrl: string, nodePath: string, page: number): string {
  const url = new URL(buildLeafPageUrl(baseUrl, nodePath, page));
  url.searchParams.set(SORTING_PARAM, NEWEST_FIRST_SORT);
  return url.toString();
}

/** Redirect guard: ignore only paging/sort mechanics, preserve category filters. */
export function sameCategoryUrl(baseUrl: string, expected: string, actual: string): boolean {
  try {
    const normalize = (raw: string): string => {
      const url = resolveNodeUrl(baseUrl, raw);
      url.searchParams.delete(PAGING_SIZE_PARAM);
      url.searchParams.delete(PAGING_OFFSET_PARAM);
      url.searchParams.delete(SORTING_PARAM);
      url.searchParams.sort();
      return `${url.pathname.replace(/\/+$/, '') || '/'}?${url.searchParams.toString()}`;
    };
    return normalize(expected) === normalize(actual);
  } catch {
    return false;
  }
}

/** Kimlik anahtari: ayni dugum iki kez kuyruga girmesin diye normalize edilir. */
export function normalizeNodePath(baseUrl: string, nodePath: string): string {
  const url = resolveNodeUrl(baseUrl, nodePath);
  // Sayfalama parametreleri KIMLIGIN parcasi degildir.
  url.searchParams.delete(PAGING_SIZE_PARAM);
  url.searchParams.delete(PAGING_OFFSET_PARAM);
  url.searchParams.delete(SORTING_PARAM);
  url.hash = '';
  url.searchParams.sort();
  const query = url.searchParams.toString();
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  return query ? `${pathname}?${query}` : pathname;
}
