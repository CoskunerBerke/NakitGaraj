/**
 * HER DOSYA BIR ISIM ALIR — "BOS DONDU" BIR CEVAP DEGILDIR.
 *
 * Bu testler, korpusta GERCEKTEN bulunan durumlari sabitler. Onceki hatanin
 * ozu su idi: gecerli bir kategori sayfasi okunamadiginda ayristirici tam da
 * giris duvari gibi davraniyordu — ikisi de bos. Bu yuzden 21 gercek sayfa
 * aylarca sessizce kayboldu.
 *
 * Buradaki her senaryo, o ayrimin korunmasini bekler:
 *   - veri tasiyan sayfa   -> CATEGORY_PAGE / RESULT_PAGE
 *   - bilinen bosluk       -> LOGIN / TWO_FACTOR / ACCESS_RESTRICTION / SAVED_ASSET / NOT_FOUND_PAGE
 *   - ayristirici sorunu   -> SUSPICIOUS_EMPTY_PARSE / UNKNOWN_DATA_FORMAT / UNKNOWN_HTML
 */
import {
  classifyPage,
  carriesVehicleData,
  detectSourceNotFound,
  isFailure,
} from './page-classification';
import { extractNavChildren } from './nav-children';
import { attachNavEvidence } from './hierarchy-source';
import { ObservedCategory } from './hierarchy-tree';

function breadcrumb(absolute = false): string {
  const at = (p: string) => (absolute ? `https://www.sahibinden.com${p}` : p);
  return `
<div class="search-result-bc" data-search-type="category/category_breadcrumb">
  <ul>
    <li class="bc-item"><a href="${at('/')}"><span>Anasayfa</span></a></li>
    <li class="bc-item"><a href="${at('/kategori/vasita')}"><span>Vasıta</span></a></li>
    <li class="bc-item"><a href="${at('/kategori/otomobil')}"><span>Otomobil</span></a></li>
    <li class="bc-item"><a href="${at('/audi')}"><span>Audi</span></a></li>
    <li class="bc-item"><a href="${at('/audi-a3')}"><span>A3</span></a></li>
    <li class="bc-item"><a href="${at('/audi-a3-a3-sedan')}"><span>A3 Sedan</span></a></li>
  </ul>
</div>`;
}

/** Dogrudan <ul> tasiyan menu (ham sunucu HTML'i). */
const DIRECT_NAV = `
<div id="searchCategoryContainer" class="scroll-pane">
  <ul>
    <li class="cl5" data-categoryBreadcrumbId="1">
      <a href="/audi-a3-a3-sedan-30-tfsi" title="30 TFSI"><h2>30 TFSI</h2></a><span>(12)</span>
    </li>
    <li class="cl5" data-categoryBreadcrumbId="2">
      <a href="/audi-a3-a3-sedan-35-tfsi" title="35 TFSI"><h2>35 TFSI</h2></a><span>(578)</span>
    </li>
  </ul>
</div>`;

/**
 * IC ICE <ul> TASIYAN MENU.
 *
 * Kaynak, secili dalin altini ic liste olarak yazar. Blogu ILK `</ul>` ile
 * kesmek, o ic listeden sonraki KARDESLERI dusururdu; korpusta 4441 dosyanin
 * menusu bu sekle sahip. Denge sayaci bunu kaynagin yapisina baglar.
 */
const NESTED_NAV = `
<div id="searchCategoryContainer" class="scroll-pane jspScrollable">
 <div class="jspContainer"><div class="jspPane"><ul>
    <li class="cl4">
      <a href="/audi-a3-a3-sedan-30-tfsi" title="30 TFSI"><h2>30 TFSI</h2></a><span>(12)</span>
      <ul>
        <li class="cl5"><a href="/audi-a3-a3-sedan-30-tfsi-advanced" title="Advanced"><h2>Advanced</h2></a><span>(3)</span></li>
      </ul>
    </li>
    <li class="cl4">
      <a href="/audi-a3-a3-sedan-35-tfsi" title="35 TFSI"><h2>35 TFSI</h2></a><span>(578)</span>
    </li>
 </ul></div></div>
</div>`;

const ROW = `
<table><tbody>
<tr data-id="1320984119">
  <td class="searchResultsTagAttributeValue">A3 Sedan 35 TFSI</td>
  <td class="searchResultsPriceValue">1.450.000 TL</td>
</tr>
</tbody></table>`;

/** Gercek sayfalarin ust menusunde de giris formu durur. */
const HEADER_LOGIN = '<form id="loginForm" name="loginForm" action="https://secure.sahibinden.com/giris"></form>';

describe('VERI TASIYAN SAYFALAR', () => {
  it('breadcrumb + menu tasiyan sayfa KATEGORI sayfasidir', () => {
    const page = classifyPage(breadcrumb() + DIRECT_NAV + ROW, 'C:\\korpus\\Audi\\a.html');
    expect(page.status).toBe('CATEGORY_PAGE');
    expect(page.breadcrumb).toEqual(['Audi', 'A3', 'A3 Sedan']);
    expect(page.navChildren!.map((c) => c.label)).toEqual(['30 TFSI', '35 TFSI']);
    expect(page.rows).toHaveLength(1);
    expect(carriesVehicleData(page.status)).toBe(true);
    expect(isFailure(page.status)).toBe(false);
  });

  it('mutlak baglantili (Chrome canli-DOM) kayit ayni sonucu verir', () => {
    const page = classifyPage(breadcrumb(true) + NESTED_NAV, 'C:\\korpus\\Audi\\b.html');
    expect(page.status).toBe('CATEGORY_PAGE');
    expect(page.breadcrumb).toEqual(['Audi', 'A3', 'A3 Sedan']);
  });

  /**
   * ASIL REGRESYON: gercek sayfa da giris formu tasir. Once kimlik dogrulama
   * imzasina bakmak 7000 gecerli sayfayi "giris duvari" ilan ederdi.
   */
  it('ust menusunde giris formu olan gercek sayfa GIRIS sayfasi sayilmaz', () => {
    const page = classifyPage(HEADER_LOGIN + breadcrumb() + DIRECT_NAV, 'C:\\korpus\\Audi\\c.html');
    expect(page.status).toBe('CATEGORY_PAGE');
  });

  it('ic ice <ul> menude ILK kapanistan sonraki kardes DUSMEZ', () => {
    const children = extractNavChildren(NESTED_NAV)!;
    expect(children.map((c) => c.label)).toEqual(expect.arrayContaining(['30 TFSI', 'Advanced', '35 TFSI']));
  });

  it('breadcrumb "Otomobil"de bitiyorsa sayfa kok vitrindir, hata degil', () => {
    const rootBc = `
<div class="search-result-bc">
  <ul>
    <li class="bc-item"><a href="/"><span>Anasayfa</span></a></li>
    <li class="bc-item"><a href="/kategori/vasita"><span>Vasıta</span></a></li>
    <li class="bc-item"><a href="/kategori/otomobil"><span>Otomobil</span></a></li>
  </ul>
</div>`;
    const page = classifyPage(rootBc + DIRECT_NAV + ROW, 'C:\\korpus\\Peugeot\\root.html');
    expect(page.status).toBe('SHOWCASE_OR_NON_CATEGORY_PAGE');
    expect(isFailure(page.status)).toBe(false);
  });
});

describe('VERI TASIMAYAN, BILINEN EKRANLAR', () => {
  it('giris duvari', () => {
    const page = classifyPage(`<title>sahibinden.com Giriş</title>${HEADER_LOGIN}`, 'x.html');
    expect(page.status).toBe('LOGIN_PAGE');
    expect(isFailure(page.status)).toBe(false);
  });

  it('2 asamali dogrulama', () => {
    const html = '<title>2 Aşamalı Doğrulama</title><form id="loginPopupForm" name="loginPopupForm"></form>';
    expect(classifyPage(html, 'x.html').status).toBe('TWO_FACTOR_PAGE');
  });

  it('olagan disi erisim engeli', () => {
    const html = '<title>sahibinden.com Hata Sayfası</title><form id="informUsForm"></form>';
    expect(classifyPage(html, 'x.html').status).toBe('ACCESS_RESTRICTION_PAGE');
  });

  it('Chrome yan kaynak dosyasi', () => {
    const html = '<title>SafeFrame Container</title><iframe></iframe>';
    const file = "C:\\korpus\\Audi\\Audi A3 sahibinden.com'da_files\\container.html";
    expect(classifyPage(html, file).status).toBe('SAVED_ASSET');
  });
});

describe('AYRISTIRICI SORUNLARI GURULTULU OLMALI', () => {
  it('arac isaretleri var ama hicbir sey cikmiyorsa SUPHELI BOS', () => {
    const html = '<div class="search-result-bc"></div><div id="searchCategoryContainer"></div>';
    const page = classifyPage(html, 'x.html');
    expect(page.status).toBe('SUSPICIOUS_EMPTY_PARSE');
    expect(isFailure(page.status)).toBe(true);
  });

  it('breadcrumb okunup menu bulunamazsa BILINMEYEN BICIM', () => {
    const page = classifyPage(breadcrumb(), 'x.html');
    expect(page.status).toBe('UNKNOWN_DATA_FORMAT');
    expect(isFailure(page.status)).toBe(true);
  });

  it('hicbir imzaya uymayan HTML sessizce gecilmez', () => {
    const page = classifyPage('<html><body>merhaba</body></html>', 'x.html');
    expect(page.status).toBe('UNKNOWN_HTML');
    expect(isFailure(page.status)).toBe(true);
  });
});

describe('KANIT AYNI KATEGORININ SONRAKI DOSYASINDAN DA ALINIR', () => {
  /**
   * KOK NEDEN (olculdu): korpusta 16 kategori hem gercek sayfa hem duvar
   * sayfasi iceriyor. Yalnizca ILK dosyayi okumak, siralama sansina bagli
   * olarak kategorinin TUM yapisini dusuruyordu.
   */
  it('ilk dosya giris duvariysa ikinci dosyadan okunur', () => {
    const observation: ObservedCategory = {
      categoryString: 'Audi A3 A3 Sedan',
      listingCount: 3,
      sourceFiles: ['duvar.html', 'gercek.html'],
    };
    const files: Record<string, string> = {
      'duvar.html': `<title>sahibinden.com Giriş</title>${HEADER_LOGIN}`,
      'gercek.html': breadcrumb() + DIRECT_NAV,
    };

    const stats = attachNavEvidence([observation], (f) => files[f] ?? null);

    expect(observation.navChildLabels).toEqual(['30 TFSI', '35 TFSI']);
    expect(observation.pathSegments).toEqual(['Audi', 'A3', 'A3 Sedan']);
    expect(stats.withEvidence).toBe(1);
    expect(stats.declaredChildren).toBe(2);
    expect(stats.recoveredFromLaterFile).toBe(1);
  });

  it('hicbiri kategori sayfasi degilse KANIT YOK olarak kalir (terminal DEGIL)', () => {
    const observation: ObservedCategory = {
      categoryString: 'Audi A3 A3 Sedan',
      listingCount: 0,
      sourceFiles: ['a.html', 'b.html'],
    };
    const files: Record<string, string> = {
      'a.html': `<title>sahibinden.com Giriş</title>${HEADER_LOGIN}`,
      'b.html': '<title>sahibinden.com Hata Sayfası</title><form id="informUsForm"></form>',
    };

    const stats = attachNavEvidence([observation], (f) => files[f] ?? null);

    expect(observation.navChildLabels).toBeNull();
    expect(stats.withEvidence).toBe(0);
    expect(stats.unreadable).toBe(1);
    expect(stats.terminal).toBe(0);
  });
});

// ------------------------------------------- kaynagin ACIK "bulunamadi" sayfasi

/**
 * Canli toplayicinin karantinaya aldigi GERCEK sayfadan turetilmis asgari
 * isaretleme (kategori adi kurgusal). Kabuk ve baslik erisim engeli sayfasiyla
 * ORTAKTIR; ayirt edici olan makine-okur "route":"error" + "errorCode":404
 * bildirimi ile bulunamadi'ya ozgu ek isaretlerdir (errorFooter, NOT_FOUND ucu,
 * "Aradığınız sayfaya ulaşılamadı" basligi).
 */
const NOT_FOUND_SHELL = `
<title>sahibinden.com Hata Sayfası</title>
<div class="error-page-container">
  <a class="logo" href="https://www.sahibinden.com"></a>
  <h1>Aradığınız sayfaya <strong>ulaşılamadı.</strong></h1>
  <p class="description">Aşağıdaki bağlantılar aradığınız içeriğe ulaşmanızı sağlayabilir.</p>
  <ul id="categoryList"><li class="odd category-3517"><a href="/kategori/vasita">Vasıta</a></li></ul>
  <div id="errorFooter"><ul><li class="border"><a href="https://www.sahibinden.com/">Ana Sayfa</a></li></ul></div>
</div>`;
const NOT_FOUND_ENDPOINT = `
<script>grecaptcha.enterprise.execute(k, {action: 'notFound'}).then(function (t) { $.ajax({ url: '/ajax/cs/login/info/NOT_FOUND', type: 'POST' }); });</script>`;
const tracking = (route: string, code: string) =>
  `<div id="gaPageViewTrackingJson" data-json="{&quot;route&quot;:&quot;${route}&quot;,&quot;errorCode&quot;:${code}}"></div>` +
  `<script id="gaPageViewTrackingData">var pageTrackData = {"route":"${route}","errorCode":${code}};</script>`;
const NOT_FOUND_PAGE = NOT_FOUND_SHELL + NOT_FOUND_ENDPOINT + tracking('error', '404');

/** Erisim engeli (korpusta 11 ornek): AYNI kabuk, AYNI baslik; route "search", errorCode null, informUsForm. */
const ACCESS_BLOCK_REAL =
  `
<title>sahibinden.com Hata Sayfası</title>
<div class="error-page-container">
  <h1><strong>Olağan dışı erişim tespit ettik...</strong></h1>
  <form id="informUsForm" action="/bilgi"></form>
</div>` + tracking('search', 'null');

describe('KAYNAGIN ACIK "BULUNAMADI" SAYFASI', () => {
  it('gercek imzali bulunamadi sayfasi NOT_FOUND_PAGE: veri tasimaz, ayristirici hatasi DEGIL', () => {
    const page = classifyPage(NOT_FOUND_PAGE, 'zorlu-kartal-1.6.html');
    expect(page.status).toBe('NOT_FOUND_PAGE');
    expect(carriesVehicleData(page.status)).toBe(false);
    expect(isFailure(page.status)).toBe(false);
    expect(page.breadcrumb).toBeNull();
    expect(page.navChildren).toBeNull();
    expect(page.ownPath).toBeNull();
    expect(page.rows).toEqual([]);
    expect(page.detail).toContain('route:error+errorCode:404');
    expect(detectSourceNotFound(NOT_FOUND_PAGE)).toEqual([
      'error-page-container',
      'route:error+errorCode:404',
      'NOT_FOUND endpoint',
      'errorFooter',
      'h1 ulaşılamadı',
    ]);
  });

  it('makine-okur bildirimi HTML-kacisli (data-json) ya da ham (script) olsa da tanir', () => {
    const escapedOnly =
      NOT_FOUND_SHELL +
      '<div data-json="{&quot;route&quot;:&quot;error&quot;,&quot;errorCode&quot;:404}"></div>';
    const rawOnly =
      NOT_FOUND_SHELL + '<script>var pageTrackData = {"route":"error","errorCode":404};</script>';
    expect(classifyPage(escapedOnly, 'x.html').status).toBe('NOT_FOUND_PAGE');
    expect(classifyPage(rawOnly, 'x.html').status).toBe('NOT_FOUND_PAGE');
  });

  /** ARAC KANITI ONCE GELIR: ayni metin ve bildirim bir kategori sayfasinin icinde olsa bile. */
  it('arac kaniti tasiyan sayfa, icinde "bulunamadı"/404 metni ve hata bildirimi olsa da KATEGORI kalir', () => {
    const html =
      breadcrumb() +
      DIRECT_NAV +
      ROW +
      '<div class="footer">Sonuç bulunamadı. Aradığınız sayfaya ulaşılamadı.</div>' +
      NOT_FOUND_PAGE;
    const page = classifyPage(html, 'C:\\korpus\\Audi\\a.html');
    expect(page.status).toBe('CATEGORY_PAGE');
    expect(page.breadcrumb).toEqual(['Audi', 'A3', 'A3 Sedan']);
    expect(page.navChildren!.map((c) => c.label)).toEqual(['30 TFSI', '35 TFSI']);
  });

  it('ilan satirlari tasiyan sayfa bulunamadi sayilmaz (SONUC sayfasi kalir)', () => {
    expect(classifyPage(ROW + NOT_FOUND_PAGE, 'x.html').status).toBe('RESULT_PAGE');
  });

  it('AYNI kabugu ve basligi tasiyan erisim engeli sayfasi ERISIM ENGELI kalir', () => {
    const page = classifyPage(ACCESS_BLOCK_REAL, 'x.html');
    expect(page.status).toBe('ACCESS_RESTRICTION_PAGE');
    expect(detectSourceNotFound(ACCESS_BLOCK_REAL)).toBeNull();
  });

  it('giris duvari, 2 asamali dogrulama ve engel formu bulunamadi imzalarinin yaninda da ONCE gelir', () => {
    expect(classifyPage(`${HEADER_LOGIN}${NOT_FOUND_PAGE}`, 'x.html').status).toBe('LOGIN_PAGE');
    expect(
      classifyPage(
        `<title>2 Aşamalı Doğrulama</title><form id="loginPopupForm"></form>${NOT_FOUND_PAGE}`,
        'x.html',
      ).status,
    ).toBe('TWO_FACTOR_PAGE');
    expect(classifyPage(`<form id="informUsForm"></form>${NOT_FOUND_PAGE}`, 'x.html').status).toBe(
      'ACCESS_RESTRICTION_PAGE',
    );
  });

  it('genel "404 / hata / bulunamadı" sozcukleri TEK BASINA imza degildir: BILINMEYEN kalir', () => {
    const generic =
      '<title>404 Not Found</title><h1>Hata: sayfa bulunamadı</h1><p>Aradığınız sayfaya ulaşılamadı.</p>';
    const page = classifyPage(generic, 'x.html');
    expect(page.status).toBe('UNKNOWN_HTML');
    expect(isFailure(page.status)).toBe(true);
  });

  it('kabuk var ama makine-okur 404 bildirimi yoksa (orn. sunucu hatasi 500) BILINMEYEN kalir', () => {
    expect(classifyPage(NOT_FOUND_SHELL + tracking('error', '500'), 'x.html').status).toBe('UNKNOWN_HTML');
    expect(classifyPage(NOT_FOUND_SHELL + tracking('search', 'null'), 'x.html').status).toBe('UNKNOWN_HTML');
    expect(classifyPage(NOT_FOUND_SHELL, 'x.html').status).toBe('UNKNOWN_HTML');
  });

  it('makine-okur 404 bildirimi kabuksuz ya da baska bulunamadi isareti olmadan yetmez', () => {
    expect(classifyPage(tracking('error', '404'), 'x.html').status).toBe('UNKNOWN_HTML');
    expect(
      classifyPage('<div class="error-page-container"></div>' + tracking('error', '404'), 'x.html')
        .status,
    ).toBe('UNKNOWN_HTML');
  });

  it('durum sozlesmesi: UNKNOWN_HTML basarisizliktir, NOT_FOUND_PAGE degildir ve veri tasimaz', () => {
    expect(isFailure('UNKNOWN_HTML')).toBe(true);
    expect(isFailure('NOT_FOUND_PAGE')).toBe(false);
    expect(carriesVehicleData('NOT_FOUND_PAGE')).toBe(false);
  });
});
