/**
 * YAPI TOPLAYICISI TEST SAYFALARI — GERCEK KAYIT BICIMINDEN TURETILMIS ASGARI HTML.
 *
 * Marka ve modeller KURGUSALDIR ("Zorlu / Kartal / 1.6 / GL"): toplayicinin
 * hicbir gercek markaya bagli olmadigini kanitlamak icin. Isaretleme, korpustaki
 * gercek sayfalarin ayristiricinin okudugu kisimlariyla (breadcrumb blogu,
 * kategori menusu, ilan satirlari, giris formu, engel formu) birebir aynidir.
 */

export interface Crumb {
  label: string;
  slug: string;
}

export interface NavEntry {
  label: string;
  slug: string;
  count?: number | null;
}

export interface CategoryPageOptions {
  /** Otomobil'den SONRAKI zincir. Bos dizi = site koku (vitrin). */
  chain: Crumb[];
  /** Menude gorunen baglantilar (ustler/kardesler dahil olabilir). */
  nav?: NavEntry[];
  /** Menu kapsayicisi hic yazilmasin (UNKNOWN_DATA_FORMAT uretir). */
  omitNav?: boolean;
  rows?: Array<{
    id: string;
    model: string;
    price?: string;
    date?: string;
    year?: string;
    mileage?: string;
    location?: string;
  }>;
  nextPage?: boolean;
  /** Chrome canli-DOM bicimi: mutlak href + kucuk oznitelik + jsp sarmalayici. */
  domSave?: boolean;
  title?: string;
}

const ORIGIN = 'https://www.sahibinden.com';

export function categoryPage(options: CategoryPageOptions): string {
  const abs = options.domSave === true;
  const at = (p: string) => (abs ? `${ORIGIN}${p}` : p);
  const crumbs: Crumb[] = [
    { label: 'Anasayfa', slug: '' },
    { label: 'Vasıta', slug: 'kategori/vasita' },
    { label: 'Otomobil', slug: 'kategori/otomobil' },
    ...options.chain,
  ];
  const title =
    options.title ??
    (options.chain.length > 0
      ? `${options.chain.map((c) => c.label).join(' ')} Fiyatları &amp; Modelleri sahibinden.com'da`
      : "2.El Arabalar ve Satılık Sıfır Km Otomobil Fiyatları sahibinden.com'da");

  const breadcrumb = `
<div class="search-result-bc" data-search-type="category/category_breadcrumb">
  <ul>
${crumbs
  .map(
    (c) =>
      `    <li class="bc-item"><a href="${at(`/${c.slug}`)}"><span>${c.label}</span></a></li>`,
  )
  .join('\n')}
  </ul>
</div>`;

  const navItems = (options.nav ?? [])
    .map(
      (n) =>
        `    <li class="cl5" ${abs ? 'data-categorybreadcrumbid' : 'data-categoryBreadcrumbId'}="1">
      <a ${abs ? 'data-isyepyfilter' : 'data-isYepyFilter'}="false" href="${at(`/${n.slug}`)}?sorting=price_desc" title="${n.label}"><h2>${n.label}</h2></a>
      ${n.count === null || n.count === undefined ? '' : `<span>(${formatCount(n.count)})</span>`}
    </li>`,
    )
    .join('\n');
  const nav = options.omitNav
    ? ''
    : abs
      ? `
<div id="searchCategoryContainer" class="scroll-pane lazy-scroll jspScrollable" tabindex="0" style="overflow: hidden;">
  <div class="jspContainer" style="width: 180px;"><div class="jspPane" style="padding: 0px;"><ul>
${navItems}
  </ul></div></div>
</div>`
      : `
<div id="searchCategoryContainer" class="scroll-pane lazy-scroll">
  <ul>
${navItems}
  </ul>
</div>`;

  const rows = (options.rows ?? [])
    .map(
      (r) => `
<tr data-id="${r.id}" class="searchResultsItem">
  <td class="searchResultsTagAttributeValue">${r.model}</td>
  <td><a class="classifiedTitle" href="/ilan/${r.id}/detay">${r.model} ilan</a></td>
  <td class="searchResultsAttributeValue">${r.year ?? '2022'}</td>
  <td class="searchResultsAttributeValue">${r.mileage ?? '10.000 km'}</td>
  <td class="searchResultsPriceValue">${r.price ?? '1.000.000 TL'}</td>
  <td class="searchResultsDateValue">${r.date ?? '4 Eylül 2026'}</td>
  <td class="searchResultsLocationValue">${r.location ?? 'İstanbul'}</td>
</tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"><title>${title}</title></head>
<body>
<form id="loginForm" name="loginForm" action="https://secure.sahibinden.com/giris"></form>
${breadcrumb}
${nav}
<table id="searchResultsTable"><tbody>${rows}</tbody></table>
${options.nextPage ? '<a class="prevNextBut" title="Sonraki" href="?pagingOffset=50">Sonraki</a>' : ''}
</body></html>`;
}

function formatCount(n: number): string {
  return n.toLocaleString('tr-TR');
}

/** Giris duvari: veri yok, yalnizca giris formu. */
export function loginPage(): string {
  return `<!DOCTYPE html><html><head><title>Giriş Yap - sahibinden.com</title></head><body>
<form id="loginForm" name="loginForm" action="https://secure.sahibinden.com/giris"><input name="username"></form>
</body></html>`;
}

/** 2 asamali dogrulama ekrani. */
export function twoFactorPage(): string {
  return `<!DOCTYPE html><html><head><title>2 Aşamalı Doğrulama - sahibinden.com</title></head><body>
<div class="twoFactor"><form id="loginPopupForm"></form></div>
</body></html>`;
}

/** "Olagan disi erisim" engel sayfasi. */
export function accessBlockPage(): string {
  return `<!DOCTYPE html><html><head><title>sahibinden.com</title></head><body>
<h1>Olağan dışı bir erişim tespit ettik</h1>
<form id="informUsForm" action="/bilgi"></form>
</body></html>`;
}

/** Hicbir bilinen imza tasimayan sayfa. */
export function unknownPage(): string {
  return `<!DOCTYPE html><html><head><title>Bakım</title></head><body><p>Sitemiz bakımdadır.</p></body></html>`;
}
