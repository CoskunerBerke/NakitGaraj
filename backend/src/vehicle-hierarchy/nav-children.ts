/**
 * KAYDEDILEN SAYFANIN KENDI KATEGORI NAVIGASYONU — YAPRAK KANITI.
 *
 * KOK NEDEN (kanitlanmis): agac bugune kadar YALNIZCA "hangi sayfalar
 * kaydedilmis" bilgisinden kuruluyordu. Bir kategorinin cocuklari, altinda
 * DAHA DERIN bir sayfa kaydedilmis olmasindan cikariliyordu. Bu yuzden
 *
 *     "cocugu yok"        (gercek terminal kategori)
 * ile "cocugunu toplamadik" (sadece ust sayfayi kaydetmisiz)
 *
 * birbirinden AYIRT EDILEMIYORDU ve ikincisi de YAPRAK sayiliyordu. Olculdu:
 * 1875 yapraktan 588'i (71 markada) aslinda ebeveyn; 43'u dogrudan MARKA
 * kokuydu. Ornek: "Audi / A3 / A3 Hatchback" yaprak sayiliyor ve 370 ilanla
 * fiyatlaniyordu — oysa o 370 satir TUM motorlarin karisimi (175.000–1.450.000 TL,
 * motor alani BOS) ve sayfanin kendisi 9 alt kategori ilan ediyor.
 *
 * COZUM: kanit zaten korpusta. Kaydedilen HTML, Sahibinden'in kendi sol
 * kategori menusunu icerir ve orada dugumun cocuklari link olarak listelenir:
 *
 *   <div id="searchCategoryContainer">
 *     <li class="cl5"><a href="/audi-a3-a3-hatchback-1.4-tfsi?..." title="1.4 TFSI">…</a>
 *     <span>(64)</span></li>
 *
 * SEVIYE ISARETI (kanitlanmis, 8036 dosya): her menu baglantisi kaynagin
 * kendi `li.clN` sinifini tasir ve N = kategori derinligi + 1'dir
 * (Otomobil = 0, marka = 1 -> cl2, seri -> cl3, ...). Ham sunucu kayitlarinda
 * (7048 dosya) menu YALNIZCA dogrudan cocuklari listeler. Canli DOM'dan
 * yakalanan sayfalarda ise kaynak, tek cocuklu bir ara seviyeyi ATLAYIP
 * torunlari listeleyebiliyor (36 sayfa): "Cupra / Leon" menusunde
 * "1.5 eTSI" yoktur, cl5 sinifli "Impulse, Standart, ..." vardir ve href'leri
 * atlanan seviyeyi tasir (/cupra-leon-1.5-etsi-impulse). Slug'in uzatmasi tek
 * basina DOGRUDAN COCUK kaniti degildir; seviye isareti de gerekir
 * (bkz. `splitNavChildren`).
 */

/** Kaynagin kendi menusunde ilan edilmis alt kategori baglantisi. */
export interface NavChild {
  /** Sahibinden yol slug'i, orn. "audi-a3-a3-hatchback-1.4-tfsi". */
  slug: string;
  /** Gosterim etiketi, orn. "1.4 TFSI". */
  label: string;
  /** Menude yazan ilan sayisi. Yaprak kararini BELIRLEMEZ. */
  count: number | null;
  /**
   * Kaynagin `li.clN` seviye isareti (N = derinlik + 1). Isaret yoksa null;
   * korpusta olculen 19.994 baglantinin hepsi isaret tasiyor.
   */
  level: number | null;
}

/**
 * SAYFANIN KENDI KATEGORI YOLU (BREADCRUMB) — SEGMENT SINIRLARININ KANITI.
 *
 * Kaydedilen sayfa, bulundugu kategorinin TAM zincirini kendi icinde tasir:
 *
 *   Anasayfa > Vasıta > Otomobil > Audi > A3 > A3 Sportback > 1.6 TDI > Attraction
 *
 * Bu, dosya adini bosluktan bolmeye calismaktan KAT KAT saglamdir; sinirlar
 * TAHMIN EDILMEZ, kaynagin kendisi soyler. Olculdu: korpustaki 2136
 * kategorinin 2135'i breadcrumb tasiyor.
 *
 * Onek tahmini bunu yapamiyordu; ornekler:
 *   - "1.6" ile "1.6 FSI" kardestir, ama onek kurali ikincisini birincinin
 *     ALTINA takiyordu;
 *   - "Chevrolet > Cruze > 1.6 > LS Plus" tek bir donanim adiyken
 *     "LS" + "Plus" diye ikiye bolunuyordu.
 */
export function extractBreadcrumb(html: string): string[] | null {
  const items = extractBreadcrumbItems(html);
  if (items === null) return null;
  /**
   * Arac zinciri "Otomobil" kategorisinden SONRA baslar; oncesi site
   * gezintisidir (Anasayfa / Vasıta / Otomobil) ve arac kimligi tasimaz.
   */
  // Baglanti mutlak da olabilir; karsilastirma once TEK BICIME indirgenir.
  const start = items.findIndex((i) => normalizeHref(i.href) === OTOMOBIL);
  if (start < 0) return null;
  const chain = items
    .slice(start + 1)
    .map((i) => i.label)
    .filter(Boolean);
  return chain.length > 0 ? chain : null;
}

/** Arac zincirinin basladigi kok kategori. */
export const OTOMOBIL = '/kategori/otomobil';

/** Breadcrumb ogesi: kaynagin yazdigi baglanti ve etiket. */
export interface BreadcrumbItem {
  href: string;
  label: string;
}

/**
 * Breadcrumb satirini HAM haliyle verir (kirpma yok).
 *
 * `extractBreadcrumb` bundan turer. Ayri durmasinin nedeni SINIFLANDIRMA:
 * "breadcrumb yok" ile "breadcrumb var ama Otomobil'de bitiyor" AYNI SEY
 * DEGILDIR. Ikincisi sitenin kok vitrin sayfasidir (kendisi bir arac
 * kategorisi degildir); onu "ayristirilamadi" saymak, gercek bir ayristirma
 * hatasini gizleyen sahte bir kayit uretirdi.
 */
export function extractBreadcrumbItems(html: string): BreadcrumbItem[] | null {
  const at = html.indexOf(BREADCRUMB);
  if (at < 0) return null;
  const end = html.indexOf('</ul>', at);
  if (end < 0) return null;
  const block = html.slice(at, end);

  const items: BreadcrumbItem[] = [];
  for (const m of block.matchAll(/<li class="bc-item">([\s\S]*?)<\/li>/g)) {
    const a = /<a[^>]*href="([^"]*)"[^>]*>\s*<span>([^<]*)<\/span>/.exec(m[1]);
    if (a) items.push({ href: a[1], label: decodeEntities(a[2]).trim() });
  }
  return items;
}

/**
 * ARAC ZINCIRININ BREADCRUMB OGELERI — ETIKET + KAYNAGIN KENDI HREF'I.
 *
 * `extractBreadcrumb` yalnizca etiketleri verir. Toplayici, atlanan ara
 * seviyelerin URL'ini ETIKETTEN TURETMEZ; kaynagin breadcrumb'ta yazdigi
 * href'i kullanir. Her oge icin yol sorgusuz/normalize edilmis verilir
 * (orn. "/cupra-leon-1.5-etsi"). Otomobil'den sonra hicbir halka yoksa null.
 */
export function extractBreadcrumbChain(
  html: string,
): Array<{ label: string; path: string }> | null {
  const items = extractBreadcrumbItems(html);
  if (items === null) return null;
  const start = items.findIndex((i) => normalizeHref(i.href) === OTOMOBIL);
  if (start < 0) return null;
  const chain = items
    .slice(start + 1)
    .filter((i) => Boolean(i.label))
    .map((i) => ({ label: i.label, path: cleanPath(normalizeHref(i.href)) }));
  return chain.length > 0 ? chain : null;
}

/**
 * Sayfanin KENDI kategori yolu: breadcrumb'in son baglantisi ("/audi-a3").
 * Etiketten slug turetmek yerine kaynagin YAZDIGI href okunur; kimlik
 * kontrolu ve dogrudan-cocuk suzgeci buna dayanir. Breadcrumb yoksa null.
 */
export function extractOwnPath(html: string): string | null {
  const items = extractBreadcrumbItems(html);
  if (!items || items.length === 0) return null;
  const last = normalizeHref(items[items.length - 1].href);
  if (!last) return null;
  const clean = cleanPath(last);
  return clean || null;
}

function cleanPath(pathname: string): string {
  return pathname.split('?')[0].replace(/\/+$/, '');
}

const BREADCRUMB = 'search-result-bc';

/** Kategori menusunu tasiyan kapsayici. */
const CONTAINER = 'searchCategoryContainer';

/**
 * Menu blogunu kesip cikarir. Blok yoksa `null` doner — bu "cocuk yok"
 * DEMEK DEGILDIR, "kanit yok" demektir; ikisini karistirmak bizi bu hataya
 * dusurmustu.
 */
function sliceContainer(html: string): string | null {
  const at = html.indexOf(CONTAINER);
  if (at < 0) return null;
  const start = html.indexOf('<ul', at);
  if (start < 0) return null;

  /**
   * LISTE DENGELI KAPANISLA BITER — ILK `</ul>` ILE DEGIL.
   *
   * Kaynak, secili dalin altini IC ICE `<ul>` olarak yazabilir; korpusta menu
   * blogunun ilk `</ul>`'ine kadarki parcasi 4441 dosyada birden fazla `<ul>`
   * aciyor. Ilk kapanista kesmek, o ic listeden SONRA gelen kardesleri
   * disarida birakir. Denge sayaci bunu kaynagin kendi ic ice yapisina baglar.
   */
  const re = /<ul\b|<\/ul>/gi;
  re.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[0][1] === '/') {
      depth -= 1;
      if (depth <= 0) return html.slice(start, m.index);
    } else {
      depth += 1;
    }
  }
  // Kapanis hic gelmiyorsa (bozuk/kirpik kayit) guvenli bir pencere ile yetin.
  return html.slice(start, Math.min(html.length, start + 200_000));
}

/**
 * KORPUSTA IKI KAYIT BICIMI VAR.
 *
 * Sayfalarin cogu ham sunucu HTML'i olarak kaydedilmis ve baglantilari
 * GORELIDIR (`href="/audi-a3"`). Bir bolumu ise Chrome'un "Web sayfasi,
 * tamami" secenegiyle CANLI DOM'dan kaydedilmis; orada baglantilar MUTLAK
 * olur (`href="https://www.sahibinden.com/audi-a3"`).
 *
 * Yalnizca goreli bicimi kabul eden kalip, ikinci gruptaki sayfalari sessizce
 * bos dondurur — yani kullanicinin ELINDEKI veri hic kullanilmaz. Olculdu:
 * korpusta 21 dosya bu durumda ve tamami gercek kategori sayfasi.
 */
const ORIGIN = /^https?:\/\/[^/]+/i;

/** Mutlak ya da goreli baglantiyi tek bicime indirger: "/yol". */
export function normalizeHref(href: string): string {
  const value = String(href || '').trim();
  if (!value) return '';
  const withoutOrigin = value.replace(ORIGIN, '');
  return withoutOrigin.startsWith('/') ? withoutOrigin : `/${withoutOrigin}`;
}

/**
 * Menu blogu iki tur belirtec tasir: `<li ...>` (seviye sinifi) ve kategori
 * baglantisi (`href` + `title`). Baglanti, kendisinden ONCE gelen son `<li>`
 * icindedir; seviye oradan okunur.
 */
const NAV_TOKEN =
  /<li\b([^>]*)>|<a\b[^>]*href="(?:https?:\/\/[^/"]+)?\/([a-z0-9][a-z0-9._-]*)(?:\?[^"]*)?"[^>]*title="([^"]*)"/gi;
const LEVEL_CLASS = /\bcl(\d+)\b/i;
const CLASS_ATTR = /class="([^"]*)"/i;

/**
 * Sayfanin menusunde ilan ettigi kategori baglantilari (ustler/kardesler
 * dahil). Neyin DOGRUDAN cocuk oldugu `splitNavChildren` ile ayrilir.
 *
 * @returns `null` -> menu blogu bulunamadi (KANIT YOK, yaprak degil)
 *          `[]`   -> blok var ama baglanti yok (TERMINAL kategori kaniti)
 */
export function extractNavChildren(html: string): NavChild[] | null {
  const block = sliceContainer(html);
  if (block === null) return null;

  const out: NavChild[] = [];
  const seen = new Set<string>();
  let level: number | null = null;
  NAV_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NAV_TOKEN.exec(block)) !== null) {
    if (m[1] !== undefined) {
      const cls = CLASS_ATTR.exec(m[1]);
      const lv = cls ? LEVEL_CLASS.exec(cls[1]) : null;
      level = lv ? Number(lv[1]) : null;
      continue;
    }
    const slug = m[2];
    const label = decodeEntities(m[3]).trim();
    if (!slug || !label || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      slug,
      label,
      count: countAfter(block, NAV_TOKEN.lastIndex),
      level,
    });
  }
  return out;
}

/** Linkten hemen sonraki "(1.234)" sayaci. */
function countAfter(block: string, from: number): number | null {
  const m = /<span>\s*\(([\d.,\s]+)\)\s*<\/span>/.exec(
    block.slice(from, from + 400),
  );
  if (!m) return null;
  const n = Number(m[1].replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/**
 * Bir dugumun ALT SOYU sayilmasi icin linkin, o dugumun slug'ini gercekten
 * UZATMASI gerekir. Menude ustler ve kardesler de bulunur; yalnizca onek
 * olmak yetmez, sinir "-" olmalidir. Bu tek basina "dogrudan cocuk" DEMEK
 * DEGILDIR — torun da uzatir; bkz. `splitNavChildren`.
 */
export function isStrictDescendantSlug(
  parentSlug: string,
  candidate: string,
): boolean {
  return (
    candidate.length > parentSlug.length + 1 &&
    candidate.startsWith(`${parentSlug}-`)
  );
}

/** Menu baglantilarinin, sayfanin kendi derinligine gore siniflanmasi. */
export interface NavSplit {
  /** Kaynagin bu sayfanin DOGRUDAN cocugu olarak isaretledigi baglantilar. */
  direct: NavChild[];
  /**
   * Bu sayfanin alt soyu ama dogrudan cocugu DEGIL (torun ve otesi). Kaynak,
   * tek cocuklu bir ara seviyeyi atlayinca bunlari listeler; ara seviyenin
   * etiketi bu sayfadan OKUNAMAZ, yalnizca cocuk sayfanin breadcrumb'indan.
   */
  deeper: NavChild[];
  /** Slug alt soy diyor, seviye isareti ust/kardes diyor: celiskili kanit. */
  inconsistent: NavChild[];
  /** Seviye isareti tasimayan alt soy baglantilari (dogrudan sayilir, olculdu: 0). */
  unleveled: number;
}

/**
 * DOGRUDAN COCUK = ALT SOY SLUG'I + DOGRU SEVIYE ISARETI.
 *
 * `ownDepth`: sayfanin Otomobil'den sonraki halka sayisi (marka = 1). Site
 * koku icin `ownSlug` bos dizedir; o zaman menudeki her baglanti adaydir.
 * Dogrudan cocugun seviyesi `ownDepth + 2`dir (cl = derinlik + 1).
 *
 * Seviye isareti olmayan bir baglanti (eski/bilinmeyen kayit bicimi) geri
 * uyumluluk icin dogrudan sayilir ve `unleveled` ile raporlanir.
 */
export function splitNavChildren(
  nav: NavChild[],
  ownSlug: string,
  ownDepth: number,
): NavSplit {
  const descendants =
    ownSlug === ''
      ? nav
      : nav.filter((c) => isStrictDescendantSlug(ownSlug, c.slug));
  const expected = ownDepth + 2;
  const split: NavSplit = {
    direct: [],
    deeper: [],
    inconsistent: [],
    unleveled: 0,
  };
  for (const child of descendants) {
    if (child.level === null || child.level === undefined) {
      split.direct.push(child);
      split.unleveled += 1;
    } else if (child.level === expected) {
      split.direct.push(child);
    } else if (child.level > expected) {
      split.deeper.push(child);
    } else {
      split.inconsistent.push(child);
    }
  }
  return split;
}

/**
 * Sayfanin kendi slug'i: once breadcrumb'in KENDI href'i, o yoksa etiketten
 * turetilmis slug. Etiket turetimi kayiplidir ("AMG+" -> "amg", kaynak
 * "amg-plus" yazar); korpusta 69 sayfada ikisi ayrisiyor.
 */
export function ownSlugOf(
  ownPath: string | null | undefined,
  chain: string[],
): string {
  if (ownPath && ownPath !== OTOMOBIL) return ownPath.replace(/^\//, '');
  return sahibindenSlug(chain);
}

/**
 * Sahibinden bicimli slug. Kendi dugum kimligimizden FARKLIDIR: burada nokta
 * KORUNUR ("1.4-tfsi"), cunku kaynagin URL bicimi budur ve menu linkleriyle
 * ancak boyle eslesir.
 */
export function sahibindenSlug(segments: string[]): string {
  return segments
    .map((segment) =>
      String(segment)
        .toLocaleLowerCase('tr')
        .replace(/ç/g, 'c')
        .replace(/ğ/g, 'g')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ş/g, 's')
        .replace(/ü/g, 'u')
        .replace(/é/g, 'e')
        .replace(/[^a-z0-9.]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
    .join('-');
}
