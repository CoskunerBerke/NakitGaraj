/**
 * KAYDEDILEN HER DOSYAYI ISIMLENDIR — "BOS DONDU" BIR SONUC DEGILDIR.
 *
 * KOK NEDEN (kanitlanmis): ayristiricilar bugune kadar yalnizca VERI
 * donduruyor ya da dondurmuyordu. "Bu sayfa giris duvari" ile "bu sayfa
 * gercek kategori sayfasi ama okuyamadik" AYNI cikti veriyordu: bos. Korpusta
 * 21 gercek kategori sayfasi tam olarak bu sekilde aylarca sessizce
 * kaybolmustu — dosya diskteydi, veri icindeydi, hicbir sey hata vermiyordu.
 *
 * Bu modul her dosyaya bir DURUM verir. Durumlarin bir bolumu KASITLI olarak
 * "veri yok" demektir (giris duvari, 2 asamali dogrulama, erisim engeli,
 * Chrome'un yan kaynak dosyalari, kaynagin ACIK "bulunamadi" sayfasi); geri
 * kalani ise SORUN bildirir ve dogrulama kapisini dusurur:
 *
 *   SUSPICIOUS_EMPTY_PARSE  arac sayfasi isaretleri var, hicbir sey cikmadi
 *   UNKNOWN_DATA_FORMAT     kategori sayfasi ama beklenen yapi okunamadi
 *   UNKNOWN_HTML            hicbir bilinen imzaya uymuyor
 *
 * Yani: yeni bir kayit bicimi geldiginde pipeline SESSIZCE veri kaybetmez,
 * GURULTULU bicimde durur.
 *
 * TEK OKUMA YOLU: burada kendi regex'lerimiz yoktur; breadcrumb / menu / satir
 * cikarimi `nav-children` ve `listing-rows` icindeki AYNI ilkel islevlerden
 * gelir. Boylece agac kurulumu, ilan atamasi, kapsam manifestosu ve denetim
 * betikleri HTML'i ayni sekilde okur.
 */
import {
  BreadcrumbItem,
  NavChild,
  OTOMOBIL,
  extractBreadcrumb,
  extractBreadcrumbItems,
  extractNavChildren,
  extractOwnPath,
  normalizeHref,
} from './nav-children';
import { ListingRow, extractListingRows } from './listing-rows';

export type PageStatus =
  /** Arac kategorisi sayfasi: breadcrumb zinciri + kategori menusu var. */
  | 'CATEGORY_PAGE'
  /** Ilan satirlari var ama sayfa kendini bir arac kategorisi olarak tanimlamiyor. */
  | 'RESULT_PAGE'
  /** Sitenin kok vitrini: breadcrumb "Otomobil"de bitiyor, arac kimligi yok. */
  | 'SHOWCASE_OR_NON_CATEGORY_PAGE'
  /** Giris duvari — veri tasimaz. */
  | 'LOGIN_PAGE'
  /** 2 asamali dogrulama ekrani — veri tasimaz. */
  | 'TWO_FACTOR_PAGE'
  /** "Olagan disi erisim" engel sayfasi — veri tasimaz. */
  | 'ACCESS_RESTRICTION_PAGE'
  /** Chrome "Web sayfasi, tamami" kaydinin yan kaynagi (reklam cercevesi vb.). */
  | 'SAVED_ASSET'
  /**
   * Kaynagin ACIK "sayfa bulunamadi" ekrani — veri tasimaz. Ayristirici sayfayi
   * ANLADI (basarisizlik DEGIL); istenen hedef kaynakta YOK. "Anlasildi" ile
   * "hedef basarili" ayni sey degildir: toplayici bunu hedef kaybi olarak isler.
   */
  | 'NOT_FOUND_PAGE'
  /** Arac sayfasi gibi duruyor ama HICBIR yapi cikmadi. KAPIYI DUSURUR. */
  | 'SUSPICIOUS_EMPTY_PARSE'
  /** Kategori sayfasi ama beklenen yapi okunamadi. KAPIYI DUSURUR. */
  | 'UNKNOWN_DATA_FORMAT'
  /** Bilinen hicbir imzaya uymuyor. KAPIYI DUSURUR. */
  | 'UNKNOWN_HTML'
  /** Dosya okunamadi / ayristirma istisna atti. KAPIYI DUSURUR. */
  | 'PARSE_ERROR';

export interface PageClassification {
  status: PageStatus;
  /** Sayfanin `<title>` metni — teshis icin, kimlik icin DEGIL. */
  title: string;
  /** Arac zinciri (Otomobil'den sonrasi). Yoksa null. */
  breadcrumb: string[] | null;
  /** Menude ilan edilen baglantilar. `null` = menu blogu yok (KANIT YOK). */
  navChildren: NavChild[] | null;
  /**
   * Sayfanin KENDI kategori yolu: breadcrumb'in son href'i ("/audi-a3").
   * Kimlik ve dogrudan-cocuk suzgeci buna dayanir; etiketten turetilmez.
   */
  ownPath: string | null;
  /** Sayfadaki ilan satirlari. */
  rows: ListingRow[];
  /** Teshis icin: hangi imzalar goruldu. */
  markers: PageMarkers;
  /** Sorunlu durumlarda insan-okur aciklama. */
  detail?: string;
}

export interface PageMarkers {
  breadcrumbBlock: boolean;
  navContainer: boolean;
  listingRows: boolean;
  /** Chrome canli-DOM kaydi (mutlak baglanti + kucuk harf oznitelik + jsp sarmalayici). */
  domSave: boolean;
}

/** Kaydedilen sayfanin YANINDA olusan kaynak klasoru: "... _files". */
const ASSET_DIR = /_files[\\/]/i;

const LOGIN_FORM = 'id="loginForm"';
const TWO_FACTOR = /twoFactor|two-factor|loginPopupForm/i;
const TWO_FACTOR_TITLE = /2\s*A[şs]amal[ıi]\s*Do[ğg]rulama/i;
const ACCESS_BLOCK_FORM = 'informUsForm';

/**
 * KAYNAGIN ACIK "BULUNAMADI" SAYFASI — IMZALAR GERCEK KANITTAN OKUNDU.
 *
 * Canli yapi toplayicisinin karantinaya aldigi gercek sayfa (kosu
 * structure-2026-09, kalkmis bir alt kategori) su KAYNAK-SAHIPLI isaretleri
 * tasir:
 *   - hata kabugu           <div class="error-page-container">
 *   - makine-okur bildirim  gaPageViewTrackingJson / pageTrackData:
 *                           "route":"error" + "errorCode":404
 *   - bulunamadi ucu        /ajax/cs/login/info/NOT_FOUND (recaptcha action 'notFound')
 *   - hata alt bilgisi      <div id="errorFooter">
 *   - baslik                <h1>Aradığınız sayfaya <strong>ulaşılamadı.</strong></h1>
 *
 * DIKKAT: erisim engeli sayfasi AYNI kabugu ve AYNI <title>'i ("sahibinden.com
 * Hata Sayfası") tasir ama "route":"search", "errorCode":null ve informUsForm
 * ile gelir (korpusta 11 ornegi var). Bu yuzden kabuk ya da baslik TEK BASINA
 * imza DEGILDIR: makine-okur 404 bildirimi ZORUNLUDUR ve ustune en az bir
 * bulunamadi'ya ozgu isaret daha aranir. "404", "hata", "bulunamadı" gibi
 * genel sozcukler hicbir zaman imza sayilmaz; oyle bir sayfa UNKNOWN_HTML
 * kalir ve kapiyi dusurur.
 */
const NOT_FOUND_SHELL = 'error-page-container';
const NOT_FOUND_ROUTE = /route(?:&quot;|"):\s*(?:&quot;|")error(?:&quot;|")/;
const NOT_FOUND_CODE = /errorCode(?:&quot;|"):\s*404\b/;
const NOT_FOUND_ENDPOINT =
  /\/ajax\/cs\/login\/info\/NOT_FOUND|action:\s*['"]notFound['"]/;
const NOT_FOUND_FOOTER = 'id="errorFooter"';
const NOT_FOUND_HEADING =
  /Arad[ıi]ğ[ıi]n[ıi]z sayfaya[\s\S]{0,120}?ula[şs][ıi]lamad[ıi]/i;

/**
 * Kaynagin acik bulunamadi sayfasi mi? Gorulen imzalarin listesi (teshis
 * icin) ya da null. Kural: kabuk + makine-okur 404 bildirimi + en az bir
 * bulunamadi'ya ozgu ek isaret. Arac kaniti tasiyan sayfalar bu isleve hic
 * gelmez (once veri, sonra guvenlik ekranlari, en son bu).
 */
export function detectSourceNotFound(html: string): string[] | null {
  const signals: string[] = [];
  const shell = html.includes(NOT_FOUND_SHELL);
  const declared = NOT_FOUND_ROUTE.test(html) && NOT_FOUND_CODE.test(html);
  if (shell) signals.push('error-page-container');
  if (declared) signals.push('route:error+errorCode:404');
  if (NOT_FOUND_ENDPOINT.test(html)) signals.push('NOT_FOUND endpoint');
  if (html.includes(NOT_FOUND_FOOTER)) signals.push('errorFooter');
  if (NOT_FOUND_HEADING.test(html)) signals.push('h1 ulaşılamadı');
  const specific = signals.length - (shell ? 1 : 0) - (declared ? 1 : 0);
  return shell && declared && specific >= 1 ? signals : null;
}

/**
 * Bir dosyayi siniflandirir.
 *
 * @param filePath Yalnizca yan-kaynak klasorunu tanimak icin kullanilir;
 *   sayfanin KIMLIGI dosya adindan DEGIL, iceriginden okunur.
 */
export function classifyPage(html: string, filePath = ''): PageClassification {
  const title = readTitle(html);
  const markers: PageMarkers = {
    breadcrumbBlock: html.includes('search-result-bc'),
    navContainer: html.includes('searchCategoryContainer'),
    listingRows: html.includes('<tr data-id="'),
    domSave:
      html.includes('jspPane') || html.includes('data-categorybreadcrumbid'),
  };

  let breadcrumb: string[] | null = null;
  let breadcrumbItems: BreadcrumbItem[] | null = null;
  let navChildren: NavChild[] | null = null;
  let rows: ListingRow[] = [];
  let ownPath: string | null = null;
  try {
    breadcrumbItems = extractBreadcrumbItems(html);
    breadcrumb = extractBreadcrumb(html);
    navChildren = extractNavChildren(html);
    ownPath = extractOwnPath(html);
    rows = extractListingRows(html);
  } catch (err: any) {
    return {
      status: 'PARSE_ERROR',
      title,
      breadcrumb,
      navChildren,
      ownPath,
      rows,
      markers,
      detail: String(err?.message || err),
    };
  }

  /**
   * ARAC SAYFASI ONCE GELIR.
   *
   * Gercek kategori sayfalari da basliklarinda giris formu tasir; giris
   * imzasina once bakmak, 7000 gecerli sayfayi "giris duvari" ilan ederdi.
   * Once veri kaniti aranir, kimlik dogrulama ekranlari ANCAK veri yoksa
   * degerlendirilir.
   */
  const looksLikeVehiclePage =
    markers.breadcrumbBlock || markers.navContainer || markers.listingRows;

  if (looksLikeVehiclePage) {
    if (breadcrumb && breadcrumb.length > 0) {
      if (navChildren === null) {
        return {
          status: 'UNKNOWN_DATA_FORMAT',
          title,
          breadcrumb,
          navChildren,
          ownPath,
          rows,
          markers,
          detail:
            'breadcrumb okundu ama kategori menusu bulunamadi — yeni bir kayit bicimi olabilir',
        };
      }
      return {
        status: 'CATEGORY_PAGE',
        title,
        breadcrumb,
        navChildren,
        ownPath,
        rows,
        markers,
      };
    }

    /**
     * Breadcrumb var ama "Otomobil"den SONRA hicbir halka yok: sayfanin
     * kendisi kok vitrindir. Bu bir ayristirma hatasi DEGILDIR; sayfa gercekten
     * bir arac kategorisi tanimlamaz (satirlari tum markalarin karisimidir).
     */
    if (breadcrumbItems && breadcrumbItems.length > 0) {
      const last = normalizeHref(
        breadcrumbItems[breadcrumbItems.length - 1].href,
      );
      if (last === OTOMOBIL) {
        return {
          status: 'SHOWCASE_OR_NON_CATEGORY_PAGE',
          title,
          breadcrumb,
          navChildren,
          ownPath,
          rows,
          markers,
        };
      }
    }

    if (rows.length > 0) {
      return {
        status: 'RESULT_PAGE',
        title,
        breadcrumb,
        navChildren,
        ownPath,
        rows,
        markers,
      };
    }

    /**
     * Isaretler arac sayfasi diyor ama HICBIR sey cikmadi. Tam olarak
     * kaybettigimiz 21 dosyanin durumu buydu. Sessizce gecilmez.
     */
    return {
      status: 'SUSPICIOUS_EMPTY_PARSE',
      title,
      breadcrumb,
      navChildren,
      ownPath,
      rows,
      markers,
      detail: `arac sayfasi isaretleri var (${describe(markers)}) ama breadcrumb, menu ve satir bos`,
    };
  }

  // --- Veri tasimayan, BILINEN ekranlar -------------------------------------

  if (
    TWO_FACTOR_TITLE.test(title) ||
    (TWO_FACTOR.test(html) && !html.includes(LOGIN_FORM))
  ) {
    return {
      status: 'TWO_FACTOR_PAGE',
      title,
      breadcrumb,
      navChildren,
      ownPath,
      rows,
      markers,
    };
  }
  if (html.includes(LOGIN_FORM)) {
    return {
      status: 'LOGIN_PAGE',
      title,
      breadcrumb,
      navChildren,
      ownPath,
      rows,
      markers,
    };
  }
  if (html.includes(ACCESS_BLOCK_FORM)) {
    return {
      status: 'ACCESS_RESTRICTION_PAGE',
      title,
      breadcrumb,
      navChildren,
      ownPath,
      rows,
      markers,
    };
  }
  if (ASSET_DIR.test(filePath)) {
    return {
      status: 'SAVED_ASSET',
      title,
      breadcrumb,
      navChildren,
      ownPath,
      rows,
      markers,
    };
  }

  /**
   * KAYNAGIN ACIK "BULUNAMADI" SAYFASI. Arac kaniti ve guvenlik ekranlari
   * yukarida elendi; burada kalan sayfa kaynagin kendi hata kabugunu ve
   * makine-okur 404 bildirimini tasiyorsa bu bilinen, aciklanmis bir
   * bosluktur — ayristirici hatasi degil. Imzalarin eksigi UNKNOWN_HTML'e
   * duser (fail-closed).
   */
  const notFound = detectSourceNotFound(html);
  if (notFound) {
    return {
      status: 'NOT_FOUND_PAGE',
      title,
      breadcrumb,
      navChildren,
      ownPath,
      rows,
      markers,
      detail: `kaynak sayfanin bulunmadigini acikca bildiriyor (${notFound.join(' + ')})`,
    };
  }

  return {
    status: 'UNKNOWN_HTML',
    title,
    breadcrumb,
    navChildren,
    ownPath,
    rows,
    markers,
    detail: 'bilinen hicbir imza yok',
  };
}

/**
 * Bu durum GERCEK arac verisi tasir mi?
 *
 * Yapi (breadcrumb + menu) ve piyasa (satir) kanitlari yalnizca bu
 * sayfalardan alinir.
 */
export function carriesVehicleData(status: PageStatus): boolean {
  return status === 'CATEGORY_PAGE' || status === 'RESULT_PAGE';
}

/**
 * Bu durum bir SORUN mudur? Dogrulama kapisi bunlarin SIFIR olmasini bekler.
 *
 * Giris/2FA/engel/yan-kaynak sayfalari ve kaynagin ACIK "bulunamadi" sayfasi
 * burada YOKTUR: onlar bilinen ve aciklanmis bosluklardir, ayristirici hatasi
 * degil. (Bulunamadi sayfasi hedef icin yine de basarisizliktir; onu toplayici
 * ayri sayar — bkz. structure-session NOT_FOUND.)
 */
export function isFailure(status: PageStatus): boolean {
  return (
    status === 'SUSPICIOUS_EMPTY_PARSE' ||
    status === 'UNKNOWN_DATA_FORMAT' ||
    status === 'UNKNOWN_HTML' ||
    status === 'PARSE_ERROR'
  );
}

function describe(markers: PageMarkers): string {
  const on = Object.entries(markers)
    .filter(([, v]) => v)
    .map(([k]) => k);
  return on.length ? on.join('+') : 'yok';
}

function readTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}
