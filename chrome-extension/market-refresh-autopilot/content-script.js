/**
 * ICERIK BETIGI — YALNIZCA GOZLEM.
 *
 * Bu betik SAYFAYI OKUR. Karar vermez, kanoniklestirmez, sayi ayristirmaz;
 * gordugu metni oldugu gibi tasir. Fiyat/km/yil metinleri koprudeki test
 * edilmis ayristiricilara gider — boylece TEK bir ayristirma dogrusu olur.
 *
 * ERISIM KONTROLU ATLATILMAZ. Engel sayfasi TESPIT edilir ve rapor edilir;
 * "Devam Et" tiklanmaz, CAPTCHA cozulmez, hicbir gizleme uygulanmaz.
 *
 * Yeniden enjekte edilebilir: ayni cerceveye ikinci kez yuklenirse yalnizca
 * fonksiyonu tazeler.
 */
(() => {
  'use strict';

  /** Kanit olarak tasinacak azami metin. */
  const EVIDENCE_LIMIT = 200;

  // --------------------------------------------------------------- yardimcilar

  const text = (node) => (node && node.textContent ? node.textContent.replace(/\s+/g, ' ').trim() : '');

  /**
   * SAYI AYRISTIRMA BURADA YAPILMAZ.
   *
   * Eskiden bu betik metindeki ilk rakam dizisini sayim sayiyordu ve gercek
   * baslikta ('"Audi A3 ..." aramanizda 6.559 ilan bulundu.') "A3" icindeki
   * 3'u yakaliyordu; 6.559 ilanlik ebeveyn 3 ilanli bir yaprak sanildi.
   * Artik HAM METIN tasinir ve sayiyi koprudeki test edilmis, "ilan"
   * sozcugune bagli ayristirici cozer.
   */
  const COUNT_PATTERN = /\d[\d.]*\s*(?:adet\s*)?ilan\b/i;

  // ------------------------------------------------------------- erisim engeli

  /**
   * Gorunur erisim-kisitlama izleri. TESPIT amaclidir; hicbiri atlatilmaz.
   * Ilan yapisi (tr.searchResultsItem) VARSA sayfa mesrudur: normal liste
   * sayfalari da uyuyan bir login/recaptcha iskeleti tasiyabiliyor.
   */
  const CHALLENGE_MARKERS = [
    { pattern: /challenges\.cloudflare\.com\/turnstile|tarayıcınızı kontrol ediyoruz|\/cs\/tloading/i, kind: 'CAPTCHA' },
    { pattern: /press\s*&\s*hold|px-captcha|perimeterx|olağan dışı bir erişim/i, kind: 'CAPTCHA' },
    { pattern: /erişiminiz kısıtlandı|erişim engellendi|erişiminiz engellenmiştir/i, kind: 'HTTP_403' },
    { pattern: /çok fazla istek|too many requests/i, kind: 'HTTP_429' },
    { pattern: /oturumunuz sonlandı|güvenli çıkış yapıldı|lütfen giriş yapın|giriş yapmalısınız/i, kind: 'AUTH_REQUIRED' },
  ];

  function detectAccessRestriction() {
    if (document.querySelector('tr.searchResultsItem')) return null;

    const haystack = `${document.title}\n${document.body ? document.body.innerText : ''}`;
    for (const marker of CHALLENGE_MARKERS) {
      const hit = marker.pattern.exec(haystack);
      if (hit) {
        return {
          kind: marker.kind,
          evidence: haystack.slice(Math.max(0, hit.index - 40), hit.index + EVIDENCE_LIMIT).trim(),
        };
      }
    }
    if (document.querySelector('script[src*="challenges.cloudflare.com"]')) {
      return { kind: 'CAPTCHA', evidence: 'Cloudflare challenge script present with no listing rows' };
    }
    return null;
  }

  // ------------------------------------------------------------------- sayimlar

  /**
   * Sayimi TASIYAN ham metni bulur. Cozumleme koprude yapilir; burada tek is
   * dogru metni secmektir. Bulunamazsa null doner ve kopru dugumu
   * "bilinmeyen sayim" olarak isaretler — kucuk VARSAYILMAZ.
   */
  const COUNT_SELECTORS = [
    '.result-text',
    '#searchResultsSearchForm .result-text',
    '.searchResultsHeader .result-text',
    '.search-result-message',
    '.classified-count',
    '.resultCount',
  ];

  /** Sayim metni ADAY mi: "<sayi> ilan" kalibini tasiyan KISA bir metin. */
  function countCandidate(value) {
    return value && value.length <= 200 && COUNT_PATTERN.test(value);
  }

  function readResultCountText() {
    for (const selector of COUNT_SELECTORS) {
      const value = text(document.querySelector(selector));
      if (countCandidate(value)) return value;
    }
    // Son care: gorunur baslik/ozet alanlarinda "N ilan" kalibini ara.
    for (const node of document.querySelectorAll('h1, h2, h3, p, span, div, strong, b')) {
      const value = text(node);
      if (countCandidate(value)) return value;
    }
    return null;
  }

  // ------------------------------------------------------------- alt kategoriler

  const CATEGORY_CONTAINERS = [
    '#searchCategoryContainer',
    '.category-list',
    'ul.categoryList',
    '#searchCategories',
    '.search-categories',
    'nav[class*="categor"]',
    'div[class*="categor"]',
    'ul[class*="categor"]',
  ];

  /**
   * Taksonomi OLMAYAN bolgeler. Kirilim yolu, sayfalama, ust/alt menu ve
   * oneri baglantilari alt kategori DEGILDIR; koprudeki "kesin alt soy"
   * kurali cogunu zaten eler ama gurultuyu kaynaginda kesmek daha durusttur.
   */
  const NON_TAXONOMY_REGIONS = [
    'nav[class*="breadcrumb"]',
    '[class*="breadcrumb"]',
    '[class*="pagination"]',
    '[class*="prevNext"]',
    '[class*="promo"]',
    '[class*="banner"]',
    '[class*="recommend"]',
    'header',
    'footer',
  ].join(',');

  function insideNonTaxonomyRegion(element) {
    return Boolean(element.closest(NON_TAXONOMY_REGIONS));
  }

  /**
   * Kaynak UI'sinde GERCEKTEN gorunen alt kategoriler. Uydurma gizli filtre
   * URETILMEZ: yalnizca sayisi yazili, ayni kokene ait ve mevcut yoldan farkli
   * baglantilar cocuk sayilir.
   *
   * Ayrica YAPININ OKUNABILIRLIGI bildirilir:
   *   'READ'       kapsayici bulundu ve en az bir sayili alt kategori okundu
   *   'EMPTY'      kapsayici bulundu ama sayili alt kategori yok
   *   'UNREADABLE' kategori kapsayicisi hic bulunamadi
   *
   * Bu ayrim onemlidir: "cocuk yok" kaynagin cevabi olabilir, ama "kapsayici
   * bulunamadi" BIZIM secicimizin tutmadigi anlamina gelir. Ikisini ayni
   * saymak bir secici hatasini veri gercegine cevirirdi.
   */
  function readChildCategories() {
    const here = location.pathname.replace(/\/+$/, '');
    const seen = new Set();
    const children = [];

    const containers = [];
    for (const selector of CATEGORY_CONTAINERS) {
      document.querySelectorAll(selector).forEach((el) => containers.push(el));
    }
    if (containers.length === 0) return { children, structure: 'UNREADABLE' };

    for (const container of containers) {
      for (const anchor of container.querySelectorAll('a[href]')) {
        if (insideNonTaxonomyRegion(anchor)) continue;

        let url;
        try {
          url = new URL(anchor.getAttribute('href'), location.href);
        } catch {
          continue;
        }
        if (url.origin !== location.origin) continue;

        const label = text(anchor);
        if (!label) continue;

        const path = `${url.pathname.replace(/\/+$/, '')}${url.search}`;
        if (!path || path === here) continue;
        if (seen.has(path)) continue;

        /**
         * Sayim etiketin icinde ("A3 Sedan (3.132)") ya da AYRI bir elemanda
         * olabilir. Ikisi de HAM METIN olarak tasinir; sayiyi kopru cozer.
         * Sayi izi hic yoksa aday bile degildir: sayimsiz bir dal bolumleme
         * karari veremez.
         */
        const countNode = anchor.querySelector('[class*="count"], span, b, em');
        const countText = countNode ? text(countNode) : '';
        if (!/\d/.test(label) && !/\d/.test(countText)) continue;

        seen.add(path);
        children.push({ path, label, countText: countText || null });
      }
    }
    return { children, structure: children.length > 0 ? 'READ' : 'EMPTY' };
  }

  // ------------------------------------------------------------------- kartlar

  /**
   * Kanitlanmis kaynak yapisi:
   *   kart     tr.searchResultsItem[data-id]
   *   baslik   a.classifiedTitle
   *   nitelik  td.searchResultsAttributeValue -> [yil, km, renk]
   *   fiyat    .searchResultsPriceValue
   *   konum    .searchResultsLocationValue
   *   sonraki  a.prevNextBut[title="Sonraki"]
   */
  function readCards() {
    const rows = document.querySelectorAll('tr.searchResultsItem');
    const cards = [];
    let parseFailures = 0;

    for (const row of rows) {
      const sourceListingId = (row.getAttribute('data-id') || '').trim();
      if (!sourceListingId) {
        // Kimliksiz satir (reklam/promosyon) gozlem sayilmaz.
        parseFailures += 1;
        continue;
      }
      const link = row.querySelector('a.classifiedTitle');
      const attributes = row.querySelectorAll('td.searchResultsAttributeValue');

      cards.push({
        sourceListingId,
        href: link ? link.getAttribute('href') || '' : '',
        title: text(link),
        yearText: text(attributes[0]) || null,
        mileageText: text(attributes[1]) || null,
        priceText: text(row.querySelector('.searchResultsPriceValue')) || null,
        locationText: text(row.querySelector('.searchResultsLocationValue')) || null,
      });
    }

    return { cards, parseFailures };
  }

  function hasNextPage() {
    const next = document.querySelector('a.prevNextBut[title="Sonraki"]');
    if (!next) return false;
    if (next.classList.contains('disabled')) return false;
    return Boolean(next.getAttribute('href'));
  }

  // -------------------------------------------------------------------- giris

  /**
   * Koprunun verdigi TEK adimi uygular ve ham gozlemi dondurur.
   * Kopru disinda hicbir yere veri gitmez.
   */
  window.__ngAutopilotObserve = function observe(op) {
    const restriction = detectAccessRestriction();
    if (restriction) {
      return { ok: false, accessRestricted: restriction, url: location.href };
    }

    /**
     * KESIF ADIMI ILAN OKUMAZ.
     *
     * Sira sozlesmesi: once dugumun BUYUKLUGU okunur, sonra toplanip
     * toplanmayacagina karar verilir. Kesif yanitinda `cards` alani yoktur;
     * asiri buyuk bir ebeveynin DOM'unda kartlar dursa bile buradan hicbir
     * ilan cikmaz.
     */
    if (op && op.type === 'DISCOVER') {
      const discovered = readChildCategories();
      return {
        ok: true,
        url: location.href,
        countText: readResultCountText(),
        children: discovered.children,
        childStructure: discovered.structure,
        categoryText: text(document.querySelector('h1')),
      };
    }

    const { cards, parseFailures } = readCards();
    return {
      ok: true,
      url: location.href,
      categoryText: text(document.querySelector('h1')),
      cards,
      parseFailures,
      hasNextPage: hasNextPage(),
    };
  };
})();
