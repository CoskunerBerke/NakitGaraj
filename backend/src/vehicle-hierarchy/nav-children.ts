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
  if (at < 0) return null;
  const end = html.indexOf('</ul>', at);
  if (end < 0) return null;
  const block = html.slice(at, end);

  const items: Array<{ href: string; label: string }> = [];
  for (const m of block.matchAll(/<li class="bc-item">([\s\S]*?)<\/li>/g)) {
    const a = /<a[^>]*href="([^"]*)"[^>]*>\s*<span>([^<]*)<\/span>/.exec(m[1]);
    if (a) items.push({ href: a[1], label: decodeEntities(a[2]).trim() });
  }
  /**
   * Arac zinciri "Otomobil" kategorisinden SONRA baslar; oncesi site
   * gezintisidir (Anasayfa / Vasıta / Otomobil) ve arac kimligi tasimaz.
   */
  const start = items.findIndex((i) => i.href === '/kategori/otomobil');
  if (start < 0) return null;
  const chain = items.slice(start + 1).map((i) => i.label).filter(Boolean);
  return chain.length > 0 ? chain : null;
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
  // Kapsayici uzun degil; sonraki </div> yerine guvenli bir pencere alinir ve
  // ayristirma zaten yalnizca <a href=... title=...> ciftlerine bakar.
  const start = html.indexOf('<ul', at);
  if (start < 0) return null;
  const end = html.indexOf('</ul>', start);
  return html.slice(start, end < 0 ? Math.min(html.length, start + 200_000) : end);
}

const LINK = /<a\b[^>]*href="\/([a-z0-9][a-z0-9._-]*)(?:\?[^"]*)?"[^>]*title="([^"]*)"/gi;

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
