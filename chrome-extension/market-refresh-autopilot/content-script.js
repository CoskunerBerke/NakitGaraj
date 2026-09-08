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

  /**
   * Adres tabanli oturum duvari — METINDEN ONCE.
   *
   * Arka plan calisani bu sayfalara enjekte ETMEZ; bu kontrol, gezinme
   * ENJEKSIYONDAN SONRA gerceklesirse (yonlendirme) ikinci savunmadir.
   * Ilan satiri kontrolunden ONCE gelir: dogrulama sayfasi ilan sayfasi
   * degildir ve icerik olarak ayristirilmamalidir.
   */
  const AUTH_URL_MARKERS = [
    { pattern: /^\/giris\/iki-asamali-dogrulama/i, kind: 'TWO_FACTOR_REQUIRED' },
    { pattern: /^\/giris\/(sms|dogrulama|two-factor)/i, kind: 'TWO_FACTOR_REQUIRED' },
    { pattern: /^\/giris(\/|$|\?)/i, kind: 'LOGIN_REQUIRED' },
    { pattern: /^\/login(\/|$|\?)/i, kind: 'LOGIN_REQUIRED' },
  ];

  function detectAuthUrlRestriction() {
    let url;
    try {
      url = new URL(location.href);
    } catch (err) {
      return null;
    }
    for (const marker of AUTH_URL_MARKERS) {
      if (marker.pattern.test(url.pathname)) {
        return { kind: marker.kind, evidence: `${url.hostname}${url.pathname}`.slice(0, EVIDENCE_LIMIT) };
      }
    }
    if (url.hostname.toLowerCase() === 'secure.sahibinden.com') {
      return { kind: 'LOGIN_REQUIRED', evidence: `${url.hostname}${url.pathname}`.slice(0, EVIDENCE_LIMIT) };
    }
    return null;
  }

  function detectAccessRestriction() {
    const byUrl = detectAuthUrlRestriction();
    if (byUrl) return byUrl;

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
  /**
   * KIMLIKSIZ SATIR SINIFLANDIRMASI — KANITA DAYALI, FAIL CLOSED.
   *
   * Kaynak her sonuc sayfasina, ilan satirlarinin arasina KENDI reklam
   * yuvasini koyuyor. O satir `tr.searchResultsItem` sinifini tasir ama
   * `data-id` TASIMAZ; korpusu okuyan sertlestirilmis ayristirici de
   * (`extractListingRows`, `<tr data-id="` ile boler) onu zaten gormez.
   * Uzanti ise bunu "ayristirma hatasi" sayiyordu ve kopru sayfayi
   * PARSE_ERROR ile reddediyordu — yani neredeyse HER piyasa sayfasi.
   *
   * OLCUM (2026-09-07, korpusun TAMAMI): 13.654 dosya, sonuc satiri tasiyan
   * 13.411 sayfa, 13.411 kimliksiz satir — sayfa basina tam olarak bir tane.
   * Sinif imzasi TEK: "searchResultsItem nativeAd classicNativeAd".
   * Bu satirlarin HICBIRINDE baslik, /ilan/ baglantisi, rakamli fiyat,
   * tarih, nitelik ya da herhangi bir metin YOK (hepsi 0/13.411).
   *
   * Bu yuzden kural DAR tutulur ve iki kosula birden baglanir:
   *
   *   A) kaynak-kanitli reklam imzasi VAR *ve* ilan kaniti YOK
   *      -> ilan degildir, ayristirma hatasi da degildir: sayilir, atlanir
   *   B) ilan kaniti VAR (baslik+/ilan/ baglantisi, rakamli fiyat, tarih,
   *      rakamli nitelik) -> gercek bir ilani sessizce dusurme riski:
   *      FAIL CLOSED (parseFailures++)
   *   C) ne imza ne de kanit (bilinmeyen kimliksiz satir) -> FAIL CLOSED
   *
   * "Kimliksiz her satiri yok say" YAPILMAZ: o, kaynak bir gun kimligi
   * baska bir alana tasidiginda tum sayfayi sessizce bosaltirdi.
   */
  const DIAGNOSTIC_TEXT_LIMIT = 500;

  /** Kaynak-kanitli reklam yuvasi sinif isaretleri (yukaridaki olcum). */
  const NATIVE_AD_CLASS_MARKERS = ['nativeAd', 'classicNativeAd'];

  /** Gercek ilan baglantisi: kaynagin ilan yolu. */
  const LISTING_HREF = /\/ilan\//i;

  /** Kaynagin gorece tarih etiketleri; rakam tasimasalar da tarihtir. */
  const RELATIVE_DATE = /\b(bugün|dün)\b/i;

  function classNamesOf(row) {
    return String(row.className || '')
      .split(/\s+/)
      .filter(Boolean);
  }

  /** Satirin tasidigi KANITLI reklam isaretleri (yoksa bos dizi). */
  function nativeAdMarkers(row) {
    const names = classNamesOf(row);
    return NATIVE_AD_CLASS_MARKERS.filter((marker) => names.indexOf(marker) >= 0);
  }

  /**
   * GERCEK ILAN KANITI. Herhangi biri varsa satir ilan OLABILIR ve reklam
   * imzasi tasisa bile atlanmaz — fail closed. Serbest metin (promosyon
   * yazisi, model hucresi) KANIT DEGILDIR: reklam da metin tasiyabilir.
   */
  function listingEvidence(row) {
    const reasons = [];
    const link = row.querySelector('a.classifiedTitle');
    const href = link ? link.getAttribute('href') || '' : '';
    if (link && LISTING_HREF.test(href)) reasons.push('CLASSIFIED_TITLE_HREF');
    if (/\d/.test(text(row.querySelector('.searchResultsPriceValue')))) {
      reasons.push('PRICE_WITH_DIGITS');
    }
    const date = text(
      row.querySelector('td.searchResultsDateValue, .searchResultsDateValue'),
    );
    if (/\d/.test(date) || RELATIVE_DATE.test(date)) reasons.push('LISTING_DATE');
    for (const cell of row.querySelectorAll('td.searchResultsAttributeValue')) {
      if (/\d/.test(text(cell))) {
        reasons.push('ATTRIBUTE_WITH_DIGITS');
        break;
      }
    }
    return reasons;
  }

  function describeIgnoredRow(row, index) {
    const link = row.querySelector('a.classifiedTitle');
    /**
     * `innerText` YALNIZCA gorunen metni verir; gizli bir promosyon satirinda
     * bos donebilir. Teshiste icerigi kaybetmemek icin bos ise `textContent`e
     * dusulur (test ortaminda `innerText` hic tanimli olmayabilir).
     */
    const raw =
      (typeof row.innerText === 'string' && row.innerText) || row.textContent || '';
    return {
      index,
      className: row.className || '',
      classifiedTitleText: text(link),
      classifiedTitleHref: link ? link.getAttribute('href') || '' : '',
      priceText: text(row.querySelector('.searchResultsPriceValue')),
      listingDateText: text(
        row.querySelector('td.searchResultsDateValue, .searchResultsDateValue'),
      ),
      innerTextSample: raw.replace(/\s+/g, ' ').trim().slice(0, DIAGNOSTIC_TEXT_LIMIT),
    };
  }

  function readCards() {
    const rows = document.querySelectorAll('tr.searchResultsItem');
    const cards = [];
    /** FAIL CLOSED olan satirlar (B ve C): kopru sayfayi reddedecek. */
    const ignoredOrFailedRows = [];
    /** Kanitli reklam yuvalari (A): denetlenebilir kayit, hata DEGIL. */
    const ignoredNonListingRows = [];
    let parseFailures = 0;
    let ignoredNativeAds = 0;
    let index = -1;

    for (const row of rows) {
      index += 1;
      const sourceListingId = (row.getAttribute('data-id') || '').trim();
      if (!sourceListingId) {
        const record = describeIgnoredRow(row, index);
        record.nativeAdMarkers = nativeAdMarkers(row);
        record.listingEvidence = listingEvidence(row);

        // A) KANITLI REKLAM YUVASI: ilan degil, ayristirma hatasi da degil.
        if (record.nativeAdMarkers.length > 0 && record.listingEvidence.length === 0) {
          ignoredNativeAds += 1;
          ignoredNonListingRows.push(record);
          continue;
        }
        // B) ilan kaniti var, C) bilinmeyen satir: ikisi de FAIL CLOSED.
        ignoredOrFailedRows.push(record);
        parseFailures += 1;
        continue;
      }
      const link = row.querySelector('a.classifiedTitle');
      const attributes = row.querySelectorAll('td.searchResultsAttributeValue');
      const modelCells = Array.from(
        row.querySelectorAll('td.searchResultsTagAttributeValue'),
      ).map((cell) => text(cell)).filter(Boolean);

      cards.push({
        sourceListingId,
        href: link ? link.getAttribute('href') || '' : '',
        title: text(link),
        yearText: text(attributes[0]) || null,
        mileageText: text(attributes[1]) || null,
        priceText: text(row.querySelector('.searchResultsPriceValue')) || null,
        locationText: text(row.querySelector('.searchResultsLocationValue')) || null,
        modelCells,
        listingDateText:
          text(row.querySelector('td.searchResultsDateValue, .searchResultsDateValue')) || null,
      });
    }

    return {
      cards,
      parseFailures,
      ignoredOrFailedRows,
      ignoredNonListingRows,
      ignoredNativeAds,
    };
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
     * YAPI MODU: HAM HTML, AYRISTIRMA YOK.
     *
     * Sayfanin canli DOM'u oldugu gibi seri hale getirilir ve kopruye
     * verilir. Breadcrumb, kategori menusu ve ilan satirlari BURADA OKUNMAZ;
     * kopru, elle kaydedilmis korpusu okuyan AYNI ayristiriciyi kullanir.
     * Boylece toplayici ile agac kurucusu iki farkli sey "goremez".
     */
    if (op && op.type === 'CAPTURE_PAGE') {
      const doctype = document.doctype ? `<!DOCTYPE ${document.doctype.name}>` : '';
      return {
        ok: true,
        url: location.href,
        title: document.title,
        html: `${doctype}\n${document.documentElement.outerHTML}`,
      };
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

    const {
      cards,
      parseFailures,
      ignoredOrFailedRows,
      ignoredNonListingRows,
      ignoredNativeAds,
    } = readCards();
    return {
      ok: true,
      url: location.href,
      categoryText: text(document.querySelector('h1')),
      cards,
      parseFailures,
      /**
       * TESHIS ALANLARI: kopruye GITMEZ (yuk sozlesmesi degismedi), uzanti
       * gunlugunde basilir. Ilan sayimi, yeni-ilan sayaci, kesin atama,
       * sinir karari, filigran ve tekillestirme bunlardan ETKILENMEZ.
       */
      ignoredOrFailedRows,
      ignoredNonListingRows,
      ignoredNativeAds,
      hasNextPage: hasNextPage(),
      ...(op && op.captureRawHtml
        ? {
            pageTitle: document.title,
            rawHtml: `${document.doctype ? `<!DOCTYPE ${document.doctype.name}>\n` : ''}${document.documentElement.outerHTML}`,
          }
        : {}),
    };
  };
})();
