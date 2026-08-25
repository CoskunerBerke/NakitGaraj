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
  | 'ERROR';

/** Kopru -> uzanti: bir sonraki TEK adim. Uzanti kendi basina karar vermez. */
export type DirectiveType = 'DISCOVER' | 'COLLECT_PAGE' | 'HALT';

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
}

/** Durma: sebep durumda tasinir; uzanti kendiliginden yeniden denemez. */
export interface HaltDirective {
  type: 'HALT';
  runId: string;
  state: AutopilotState;
  reason: string;
}

export type AutopilotDirective = DiscoverDirective | CollectPageDirective | HaltDirective;

/** Uzantidan gelen HAM kart. Sayisal alanlar METINDIR — ayristirma koprude. */
export interface ObservedCard {
  sourceListingId: string;
  href: string;
  title: string;
  priceText: string | null;
  mileageText: string | null;
  yearText: string | null;
  locationText: string | null;
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

export type AccessRestrictionKind = 'CAPTCHA' | 'AUTH_REQUIRED' | 'HTTP_403' | 'HTTP_429';

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
