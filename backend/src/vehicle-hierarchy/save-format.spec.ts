/**
 * KORPUSTAKI IKI KAYIT BICIMI DE OKUNMALI.
 *
 * Kullanicinin elle kaydettigi dosyalarin cogu ham sunucu HTML'idir ve
 * baglantilari GORELIDIR. Bir bolumu ise Chrome'un "Web sayfasi, tamami"
 * secenegiyle CANLI DOM'dan kaydedilmistir; orada:
 *
 *   - baglantilar MUTLAK olur   (https://www.sahibinden.com/... )
 *   - oznitelik adlari KUCULUR  (data-categoryBreadcrumbId -> ...breadcrumbid)
 *   - menuye kaydirma kutuphanesi <div> katmanlari eklenir (jspContainer)
 *
 * Yalnizca goreli bicimi taniyan kalip bu dosyalari SESSIZCE bos donduruyordu:
 * yani kullanicinin zaten elinde olan veri hic kullanilmiyordu. Olculdu: 21
 * dosya, tamami gercek kategori sayfasi — biri "Audi / A3 / A3 Sedan" ve tek
 * basina 9 alt kategori ilan ediyor.
 */
import {
  extractBreadcrumb,
  extractNavChildren,
  normalizeHref,
} from './nav-children';

/** Goreli bicim (korpusun cogunlugu). */
const RELATIVE = `
<div class="search-result-bc" data-search-type="category/category_breadcrumb">
  <ul>
    <li class="bc-item"><a href="/"><span>Anasayfa</span></a><meta content="1"/></li>
    <li class="bc-item"><a href="/kategori/vasita"><span>Vasıta</span></a></li>
    <li class="bc-item"><a href="/kategori/otomobil"><span>Otomobil</span></a></li>
    <li class="bc-item"><a href="/audi"><span>Audi</span></a></li>
    <li class="bc-item"><a href="/audi-a3"><span>A3</span></a></li>
    <li class="bc-item"><a href="/audi-a3-a3-sedan"><span>A3 Sedan</span></a></li>
  </ul>
</div>
<div id="searchCategoryContainer" class="scroll-pane lazy-scroll">
  <ul>
    <li class="cl5" data-categoryBreadcrumbId="1">
      <a data-isYepyFilter="false" href="/audi-a3-a3-sedan-35-tfsi?sorting=price_desc" title="35 TFSI"><h2>35 TFSI</h2></a>
      <span>(1.180)</span>
    </li>
  </ul>
</div>`;

/** "Web sayfasi, tamami" bicimi: mutlak URL + kucuk oznitelik + jsp katmanlari. */
const COMPLETE = `
<div class="search-result-bc" data-search-type="category/category_breadcrumb">
  <ul>
    <li class="bc-item"><a href="https://www.sahibinden.com/"><span>Anasayfa</span></a><meta content="1"></li>
    <li class="bc-item"><a href="https://www.sahibinden.com/kategori/vasita"><span>Vasıta</span></a></li>
    <li class="bc-item"><a href="https://www.sahibinden.com/kategori/otomobil"><span>Otomobil</span></a></li>
    <li class="bc-item"><a href="https://www.sahibinden.com/audi"><span>Audi</span></a></li>
    <li class="bc-item"><a href="https://www.sahibinden.com/audi-a3"><span>A3</span></a></li>
    <li class="bc-item"><a href="https://www.sahibinden.com/audi-a3-a3-sedan"><span>A3 Sedan</span></a></li>
  </ul>
</div>
<div id="searchCategoryContainer" class="scroll-pane lazy-scroll jspScrollable" tabindex="0" style="overflow: hidden;">
  <div class="jspContainer" style="width: 180px;"><div class="jspPane" style="padding: 0px;"><ul>
    <li class="cl5" data-categorybreadcrumbid="1">
      <a data-isyepyfilter="false" href="https://www.sahibinden.com/audi-a3-a3-sedan-35-tfsi?sorting=price_desc" title="35 TFSI"><h2>35 TFSI</h2></a>
      <span>(1.180)</span>
    </li>
  </ul></div></div>
</div>`;

describe('BAGLANTI BICIMI TEK BICIME INDIRGENIR', () => {
  it('mutlak ve goreli baglanti ayni yolu verir', () => {
    expect(normalizeHref('https://www.sahibinden.com/audi-a3')).toBe(
      '/audi-a3',
    );
    expect(normalizeHref('http://sahibinden.com/audi-a3')).toBe('/audi-a3');
    expect(normalizeHref('/audi-a3')).toBe('/audi-a3');
  });

  it('bos deger bosluk uretmez', () => {
    expect(normalizeHref('')).toBe('');
  });
});

describe('IKI KAYIT BICIMI DE AYNI SONUCU VERIR', () => {
  it('breadcrumb her iki bicimde de okunur', () => {
    expect(extractBreadcrumb(RELATIVE)).toEqual(['Audi', 'A3', 'A3 Sedan']);
    expect(extractBreadcrumb(COMPLETE)).toEqual(['Audi', 'A3', 'A3 Sedan']);
  });

  it('kategori menusu her iki bicimde de okunur', () => {
    const rel = extractNavChildren(RELATIVE);
    const cmp = extractNavChildren(COMPLETE);
    expect(rel).toEqual([
      {
        slug: 'audi-a3-a3-sedan-35-tfsi',
        label: '35 TFSI',
        count: 1180,
        level: 5,
      },
    ]);
    expect(cmp).toEqual(rel);
  });

  /** Asil regresyon: mutlak URL'li sayfa BOS donmemeli. */
  it('mutlak URL tasiyan sayfa sessizce BOS donmez', () => {
    const cmp = extractNavChildren(COMPLETE);
    expect(cmp).not.toBeNull();
    expect(cmp!.length).toBeGreaterThan(0);
    expect(extractBreadcrumb(COMPLETE)).not.toBeNull();
  });
});
