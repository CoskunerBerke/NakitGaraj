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
 * kategori menusunu icerir ve orada dugumun DOGRUDAN cocuklari link olarak
 * listelenir:
 *
 *   <div id="searchCategoryContainer">
 *     <li class="cl5"><a href="/audi-a3-a3-hatchback-1.4-tfsi?..." title="1.4 TFSI">…</a>
 *     <span>(64)</span></li>
 *
 * Dogrulandi: gercek bir yaprağin sayfasi ("1.6 TDI Attraction") bu kapsayicida
 * kendi slug'ini uzatan HICBIR link tasimaz; ebeveyn sayfasi ise TAM OLARAK
 * dogrudan cocuklarini tasir (torun yok). Yani bu blok, "terminal mi" sorusunun
 * DIS kaynakli cevabidir — uretilen agacin kendisiyle dogrulanmasi degil.
 */

/** Kaynagin kendi menusunde ilan edilmis DOGRUDAN alt kategori. */
export interface NavChild {
  /** Sahibinden yol slug'i, orn. "audi-a3-a3-hatchback-1.4-tfsi". */
  slug: string;
  /** Gosterim etiketi, orn. "1.4 TFSI". */
  label: string;
  /** Menude yazan ilan sayisi. Yaprak kararini BELIRLEMEZ. */
  count: number | null;
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
  const at = html.indexOf(BREADCRUMB);
  const items = extractBreadcrumbItems(html);
  if (items === null) return null;
  /**
   * Arac zinciri "Otomobil" kategorisinden SONRA baslar; oncesi site
   * gezintisidir (Anasayfa / Vasıta / Otomobil) ve arac kimligi tasimaz.
   */
  // Baglanti mutlak da olabilir; karsilastirma once TEK BICIME indirgenir.
  const start = items.findIndex((i) => normalizeHref(i.href) === OTOMOBIL);
  if (start < 0) return null;
  const chain = items.slice(start + 1).map((i) => i.label).filter(Boolean);
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
   * Kaynak, secili dalin altini IC ICE `<ul>` olarak yazar; korpusta menu
   * blogunun ilk `</ul>`'ine kadarki parcasi 4441 dosyada birden fazla `<ul>`
   * aciyor. Ilk kapanista kesmek, o ic listeden SONRA gelen kardesleri
   * disarida birakir. Bugunku korpusta bu kayip olculdu ve SIFIR cikti
   * (kesilen kisim yalnizca ust/kardes baglantilari tasiyor, dogrudan cocuk
   * degil); yine de kural yerine RASTLANTI olurdu. Denge sayaci bunu kaynagin
   * kendi ic ice yapisina baglar.
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

const LINK =
  /<a\b[^>]*href="(?:https?:\/\/[^/"]+)?\/([a-z0-9][a-z0-9._-]*)(?:\?[^"]*)?"[^>]*title="([^"]*)"/gi;

/**
 * Sayfanin ilan ettigi DOGRUDAN alt kategoriler.
 *
 * @returns `null` -> menu blogu bulunamadi (KANIT YOK, yaprak degil)
 *          `[]`   -> blok var ama alt kategori yok (TERMINAL kategori kaniti)
 */
export function extractNavChildren(html: string): NavChild[] | null {
  const block = sliceContainer(html);
  if (block === null) return null;

  const out: NavChild[] = [];
  const seen = new Set<string>();
  LINK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK.exec(block)) !== null) {
    const slug = m[1];
    const label = decodeEntities(m[2]).trim();
    if (!slug || !label || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, label, count: countAfter(block, LINK.lastIndex) });
  }
  return out;
}

/** Linkten hemen sonraki "(1.234)" sayaci. */
function countAfter(block: string, from: number): number | null {
  const m = /<span>\s*\(([\d.,\s]+)\)\s*<\/span>/.exec(block.slice(from, from + 400));
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
 * Bir dugumun cocugu olarak SAYILMASI icin linkin, o dugumun slug'ini
 * gercekten UZATMASI gerekir. Menude ustler ve kardesler de bulunur; yalnizca
 * onek olmak yetmez, sinir "-" olmalidir.
 */
export function isStrictDescendantSlug(parentSlug: string, candidate: string): boolean {
  return candidate.length > parentSlug.length + 1 && candidate.startsWith(`${parentSlug}-`);
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
