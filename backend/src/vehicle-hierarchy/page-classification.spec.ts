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
 *   - bilinen bosluk       -> LOGIN / TWO_FACTOR / ACCESS_RESTRICTION / SAVED_ASSET
 *   - ayristirici sorunu   -> SUSPICIOUS_EMPTY_PARSE / UNKNOWN_DATA_FORMAT / UNKNOWN_HTML
 */
import { classifyPage, carriesVehicleData, isFailure } from './page-classification';
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
