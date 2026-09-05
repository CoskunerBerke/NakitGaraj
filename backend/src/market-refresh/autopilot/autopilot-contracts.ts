/**
 * CHROME AUTOPILOT — SOZLESMELER (V1)
 *
 * MIMARI SINIR:
 *   Uzanti (extension) yalnizca GEZINME + YAKALAMA on yuzudur. Dayanikli durum,
 *   checkpoint, staging, tekillestirme, siniflama ve kalite kararlari KOPRUDE
 *   (bridge/collector) yasar. Toplayici mantigi uzantida TEKRARLANMAZ.
 *
 * ERISIM KURALI:
 *   Erisim kontrolu ASLA atlatilmaz. CAPTCHA cozme, parmak izi sahteciligi,
 *   stealth eklenti, proxy/hesap rotasyonu YOKTUR. Engel gorulurse tek dogru
 *   davranis: guvenle dur, checkpoint yaz, kullaniciyi manuel mudahaleye cagir.
 *
 * KIMLIK KURALI:
 *   Uzanti kanoniklestirme YAPMAZ. Kartta ne yaziyorsa HAM METIN olarak gelir;
 *   sayisal ayristirma (fiyat/km/yil) koprudeki test edilmis yardimcilarla
 *   yapilir. Boylece tek bir ayristirma dogrusu vardir.
 */

/** Uzanti kabugunun ve kosunun paylastigi durum makinesi. */
export type AutopilotState =
  | 'IDLE'
  | 'RUNNING'
  | 'PAUSED'
  | 'ACCESS_RESTRICTED'
  | 'DEADLINE_REACHED'
  /** Kuyruk bitti VE her sey gercekten tamam. Baska hicbir durumda kullanilmaz. */
  | 'COMPLETE'
  /** Kuyruk bitti ama kosu EKSIK: bolunemeyen/bloke/guvenilmez dugum var. */
  | 'INCOMPLETE'
  /** Kuyruk bitti; tek eksiklik duman testinin kasitli sayfa kirpmasi. */
  | 'SMOKE_LIMIT_REACHED'
  /**
   * Yapi toplayicisi: toplama DURDU, agac/atama artefaktlari yeniden
   * kuruluyor ve dogrulama kapisi kosuyor. Uzanti bu sirada yalnizca bekler.
   */
  | 'REBUILDING'
  | 'ERROR';

/** Kopru -> uzanti: bir sonraki TEK adim. Uzanti kendi basina karar vermez. */
export type DirectiveType =
  'DISCOVER' | 'COLLECT_PAGE' | 'CAPTURE_PAGE' | 'WAIT' | 'HALT';

/**
 * YAPI TOPLAYICISI: kategori sayfasini HAM HTML olarak yakala.
 *
 * Uzanti bu adimda HICBIR SEY AYRISTIRMAZ: sayfaya gider, yuklenmesini bekler,
 * `document.documentElement.outerHTML`'i oldugu gibi kopruye verir. Breadcrumb,
 * menu ve satir okuma KOPRUDE, korpusu okuyan AYNI ayristiriciyla yapilir
 * (`vehicle-hierarchy/page-classification`). Boylece "toplayicinin okudugu"
 * ile "agacin okudugu" hicbir zaman ayrisamaz.
 */
export interface CapturePageDirective {
  type: 'CAPTURE_PAGE';
  runId: string;
  /** Hedef kimligi: normalize kategori yolu, orn. "/audi-a3-a3-sedan". */
  targetKey: string;
  url: string;
  label: string;
  /** Beklenen breadcrumb zinciri (Otomobil'den sonrasi). Bilinmiyorsa null. */
  expectedPath: string[] | null;
  /** Uzantinin bu adimdan SONRA bekleyecegi sure — koprude jitter'li hesaplanir. */
  delayMs: number;
}

/** Kopru mesgul (yeniden kurma, korpus taramasi): uzanti bekler ve tekrar sorar. */
export interface WaitDirective {
  type: 'WAIT';
  runId: string;
  delayMs: number;
  reason: string;
}

/** Uzantidan gelen ham sayfa yakalamasi. HTML DEGISTIRILMEDEN tasinir. */
export interface PageCapture {
  runId: string;
  targetKey: string;
  /** Tarayicinin gezinme SONUNDA bulundugu adres (yonlendirme kaniti). */
  finalUrl: string;
  /** document.title — teshis icin; kimlik breadcrumb'dan okunur. */
  title: string;
  html: string;
}

/**
 * Yakalama sonucu. YALNIZCA `SAVED` ve `ALREADY_PRESENT` hedefi tamamlar.
 *
 *   SAVED                 gecerli kategori sayfasi, breadcrumb hedefle ayni, korpusa yazildi
 *   ALREADY_PRESENT       ayni kategori korpusta zaten okunabilir halde; istek GONDERILMEDI
 *   REDIRECT_MISMATCH     kaynak baska bir kategoriye yonlendirdi; sayfa korpusa YAZILMADI
 *   NO_BREADCRUMB         sayfa kimligini soylemiyor; kanit sayilmaz
 *   NON_CATEGORY_PAGE     kok vitrin gibi arac kategorisi olmayan sayfa (kok hedef haric)
 *   NOT_FOUND             kaynak hedefin VAR OLMADIGINI acikca bildirdi (bilinen bulunamadi
 *                         sayfasi): kanit tutuldu, korpusa YAZILMADI, cocuk acilmadi, kosu SURER
 *   LOGIN_REQUIRED / TWO_FACTOR_REQUIRED / ACCESS_RESTRICTED
 *                         guvenlik/erisim duvari: kosu DURUR, kullanici elle duzeltir
 *   UNKNOWN_FORMAT        ayristirici sayfayi anlamadi: kosu DURUR, once ayristirici duzeltilir
 *   PARSE_ERROR           ayristirici istisna atti: kosu DURUR
 */
export type CaptureOutcome =
  | 'SAVED'
  | 'ALREADY_PRESENT'
  | 'REDIRECT_MISMATCH'
  | 'NO_BREADCRUMB'
  | 'NON_CATEGORY_PAGE'
  | 'NOT_FOUND'
  | 'LOGIN_REQUIRED'
  | 'TWO_FACTOR_REQUIRED'
  | 'ACCESS_RESTRICTED'
  | 'UNKNOWN_FORMAT'
  | 'PARSE_ERROR';

export interface PageCaptureResult {
  outcome: CaptureOutcome;
  /** Ayristiricinin sayfa sinifi (page-classification.PageStatus). */
  pageStatus: string;
  breadcrumb: string[] | null;
  savedFile: string | null;
  /** Sayfanin menusunde ilan edilen DOGRUDAN cocuk sayisi. */
  childrenDeclared: number;
  childrenEnqueued: number;
  /** Cocuklardan zaten kuyrukta/tamamlanmis olanlar (tekrar YOK). */
  childrenAlreadyKnown: number;
  /** Menu okundu ve alt kategori yok: kaynaktan dogrulanmis terminal. */
  terminal: boolean;
  /** Bu yakalama kosuyu durdurdu mu (guvenlik/bilinmeyen bicim). */
  paused: boolean;
  pauseReason: string | null;
}

/** Yapi toplayicisinin canli durumu (panel + CLI). */
export interface StructureStatus {
  runId: string;
  mode: 'STRUCTURE';
  state: AutopilotState;
  source: string;
  completed: number;
  queued: number;
  remaining: number;
  failed: number;
  blocked: number;
  attempted: number;
  pagesSaved: number;
  alreadyPresent: number;
  redirectMismatch: number;
  securityBlocks: number;
  parseFailures: number;
  /** Bu kosuda kaynaktan KESFEDILEN (korpusta olmayan) kategori sayisi. */
  newNodesDiscovered: number;
  newTerminalNodes: number;
  duplicatesSkipped: number;
  /** Breadcrumb'i beklentiden derin cikip ayni dalda kabul edilen sayfalar. */
  refinedPaths?: number;
  /** Torun breadcrumb'indan URL'iyle kazanilan, menude listelenmemis ara seviyeler. */
  intermediatesRecovered?: number;
  /** Devam ederken yeniden acilan eski sahte REDIRECT_MISMATCH hedefleri. */
  legacyRetried?: number;
  /** Kaynagin acikca "yok" dedigi hedefler: kanit tutuldu, korpusa yazilmadi. */
  notFound?: number;
  currentKey: string | null;
  currentPath: string[] | null;
  currentMake: string | null;
  currentUrl: string | null;
  lastSuccessKey: string | null;
  lastSuccessAt: string | null;
  lastSavedFile: string | null;
  pauseReason: string | null;
  lastError: string | null;
  maxPages: number | null;
  rebuildEvery: number;
  rebuilds: number;
  sinceRebuild: number;
  lastGate: 'PASS' | 'FAIL' | null;
  runComplete: boolean;
  deadlineAt: string | null;
  startedAt: string;
  updatedAt: string;
  /** Panel uyumu (piyasa modu alanlariyla ayni adlar). */
  currentTrail: string[];
  doneJobs: number;
  pendingJobs: number;
  blockedJobs: number;
  scopeLimited: boolean;
  scope: string | null;
}

/** Sayimi/cocuklari okunacak kaynak dugumu (henuz toplanmaz). */
export interface DiscoverDirective {
  type: 'DISCOVER';
  runId: string;
  nodePath: string;
  label: string;
  url: string;
}

/** <=1000'lik toplanabilir yapragin TEK sayfasi (50/sayfa). */
export interface CollectPageDirective {
  type: 'COLLECT_PAGE';
  runId: string;
  nodePath: string;
  label: string;
  url: string;
  page: number;
  expectedPages: number;
  /** Weekly mode: frozen exact hierarchy identity (extension does not interpret it). */
  targetId?: string;
  hierarchyVersion?: string;
  /** Weekly mode asks for raw live DOM; legacy market mode leaves this unset. */
  captureRawHtml?: boolean;
}

/** Durma: sebep durumda tasinir; uzanti kendiliginden yeniden denemez. */
export interface HaltDirective {
  type: 'HALT';
  runId: string;
  state: AutopilotState;
  reason: string;
}

export type AutopilotDirective =
  | DiscoverDirective
  | CollectPageDirective
  | CapturePageDirective
  | WaitDirective
  | HaltDirective;

/** Uzantidan gelen HAM kart. Sayisal alanlar METINDIR — ayristirma koprude. */
export interface ObservedCard {
  sourceListingId: string;
  href: string;
  title: string;
  priceText: string | null;
  mileageText: string | null;
  yearText: string | null;
  locationText: string | null;
  /** Source's structured Model cells, in DOM order. Never whitespace-split. */
  modelCells?: string[];
  /** Raw source calendar date text. Weekly mode rejects missing/unknown dates. */
  listingDateText?: string | null;
}

/** Uzantidan gelen tek sayfalik yakalama paketi. */
export interface PageBatch {
  runId: string;
  nodePath: string;
  page: number;
  /** Kaynagin kendi h1 kategori metni (kanoniklestirilmemis). */
  categoryText: string;
  pageUrl: string;
  cards: ObservedCard[];
  hasNextPage: boolean;
  parseFailures: number;
  /** Weekly mode only: untouched documentElement.outerHTML for hardened parsing. */
  rawHtml?: string;
  pageTitle?: string;
}

/**
 * Kaynakta GORULEN alt kategori ADAYI.
 *
 * Bunlar HAM adaylardir: neyin gercek cocuk sayilacagina kopru karar verir
 * (kesin alt soy olmali). Sayim `countText`ten koprude cozulur.
 */
export interface ObservedChildNode {
  path: string;
  label: string;
  /** Sayimi tasiyan ham metin; verilirse sayisal `count`u ezer. */
  countText?: string | null;
  count?: number | null;
}

/**
 * Alt kategori yapisinin OKUNABILIRLIGI.
 *
 * 'READ'       kategori kapsayicisi bulundu ve sayili baglantilar okundu
 * 'EMPTY'      kapsayici bulundu, sayili alt kategori yok (gercek yaprak olabilir)
 * 'UNREADABLE' kategori kapsayicisi hic bulunamadi — secici TUTMUYOR olabilir
 *
 * 'EMPTY' ile 'UNREADABLE' ayrimi onemlidir: ilki kaynagin dogru cevabi,
 * ikincisi BIZIM secicimizin basarisizligi olabilir. Duman testinde ikisi de
 * durdurulur; normal kosuda yalnizca >1000 dugumde onem tasir.
 */
export type ChildStructureSignal = 'READ' | 'EMPTY' | 'UNREADABLE';

/** Uzantidan gelen kesif raporu: sayim + gercekten gorunen cocuklar. */
export interface DiscoveryReport {
  runId: string;
  nodePath: string;
  /**
   * Onceden cozulmus sayim. `countText` verildiginde YOK SAYILIR; sayimi
   * koprudeki test edilmis ayristirici cozer. Ikisi de yoksa sayim
   * BILINMIYOR demektir ve dugum "kucuk" VARSAYILMAZ.
   */
  count?: number | null;
  /**
   * Sayimi tasiyan HAM metin (orn. '"Audi A3 ..." aramanizda 6.559 ilan bulundu.').
   * Verildiginde sayim BURADAN, koprudeki test edilmis ayristiriciyla cozulur ve
   * sayisal `count` alanini EZER. Uzanti sayi ayristirmaz.
   */
  countText?: string | null;
  children: ObservedChildNode[];
  /** Alt kategori seciciler tuttu mu. Verilmezse 'READ' varsayilir (geriye donuk). */
  childStructure?: ChildStructureSignal;
  /** Kimligi koruyan ikincil bolumler (orn. yil araligi), kaynak destekliyorsa. */
  secondaryPartitions?: ObservedChildNode[];
}

export type AccessRestrictionKind =
  'CAPTCHA' | 'AUTH_REQUIRED' | 'HTTP_403' | 'HTTP_429';

export interface AccessRestrictionReport {
  runId: string;
  nodePath: string | null;
  kind: AccessRestrictionKind;
  /** Kullaniciya gosterilecek gorunur kanit metni (kisa). */
  evidence?: string;
}

/** Sayfa paketi sonucu — uzanti bunu sadece GOSTERIR, karar vermez. */
export interface PageBatchResult {
  accepted: number;
  duplicates: number;
  newCount: number;
  changedCount: number;
  unchangedCount: number;
  /** BILINEN-DEGISMEMIS icin acilan detay sayfasi sayisi. HER ZAMAN 0. */
  detailFetches: number;
  invalid: number;
  leafComplete: boolean;
  /** Sayfalama dongusu tespit edildi mi (ayni ID kumesi tekrarlandi). */
  paginationLoopStopped: boolean;
  /**
   * Bildirilen sayim kaynagin gerceginle celisti mi. true ise bu sayfadan
   * HICBIR SEY staging'e yazilmadi ve dugum toplanmadi.
   */
  countMismatch: boolean;
}

export interface WorkItemView {
  kind: 'DISCOVER' | 'LEAF';
  /** SPLIT_REQUIRED / COLLECTABLE_LEAF / ... — buyukluk kararinin kaydi. */
  nodeState: string;
  path: string;
  label: string;
  parentPath: string | null;
  trail: string[];
  count: number | null;
  expectedPages: number | null;
  pagesDone: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'BLOCKED' | 'FAILED';
  observedCount: number;
  depth: number;
}

export interface AutopilotStatus {
  runId: string;
  state: AutopilotState;
  source: string;
  currentPath: string | null;
  currentLabel: string | null;
  /** Kokten mevcut dugume kaynak etiket izi: [marka, seri, alt kategori...]. */
  currentTrail: string[];
  currentPage: number | null;
  doneJobs: number;
  pendingJobs: number;
  blockedJobs: number;
  listingsObserved: number;
  newCount: number;
  changedCount: number;
  unchangedCount: number;
  duplicateCount: number;
  unsplittable: Array<{ path: string; label: string; count: number | null }>;
  /**
   * Kapsam korumasi aktif mi (duman/test kosusu). Aktifse kosu tanimi geregi
   * KISMIDIR: aylik tazeleme olarak TAMAMLANMIS sayilamaz.
   */
  scopeLimited: boolean;
  /** Kapsam ozeti (aktif degilse null). */
  scope: string | null;
  /** Kapsam disinda kaldigi icin kuyruga ALINMAYAN dugumler. */
  outOfScope: Array<{ path: string; label: string; reason: string }>;
  /** Aylik kosu SOZLESMESI: yalnizca her sey tamamsa true. */
  runComplete: boolean;
  deadlineAt: string | null;
  lastError: string | null;
  startedAt: string;
  updatedAt: string;
}

/** Gecersiz istemci istegi — koprude 400 olur, kosuyu BOZMAZ. */
export class AutopilotProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AutopilotProtocolError';
  }
}
