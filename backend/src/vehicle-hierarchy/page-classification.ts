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
 * Chrome'un yan kaynak dosyalari); geri kalani ise SORUN bildirir ve dogrulama
 * kapisini dusurur:
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
 * Giris/2FA/engel/yan-kaynak sayfalari burada YOKTUR: onlar bilinen ve
 * aciklanmis bosluklardir, ayristirici hatasi degil.
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
