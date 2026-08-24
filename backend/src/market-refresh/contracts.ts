/**
 * MARKET REFRESH — TOPLAYICI SOZLESMELERI (V1)
 *
 * SINIR KURALI:
 *   Bu modul FIYAT MOTORUNU, ADMIN'I veya FRONTEND'I ITHAL ETMEZ; onlar da bu
 *   modulu ithal ETMEZ. Toplayici yalnizca GOZLER. Yorumlama (kanoniklestirme,
 *   emsal secimi, fiyatlama) mevcut parser/normalizer katmanina aittir.
 *
 * KIMLIK KURALI:
 *   Tarayici cikarimi sirasinda arac kimligi KANONIKLESTIRILMEZ. Kaynakta ne
 *   yaziyorsa o tasinir (sourceMake/sourceModel). Uydurma kimlik yerine ham
 *   gozlem tercih edilir.
 */

export const COLLECTOR_VERSION = 'v1';

/** Tarayicidan cikan HAM gozlem. Kanonik alan ICERMEZ. */
export interface RawObservedListing {
  source: string;
  sourceListingId: string;
  sourceUrl: string;
  title: string;
  /** Kaynakta GORUNDUGU gibi — kanoniklestirilmemis. */
  sourceMake: string;
  /** Kaynakta GORUNDUGU gibi — kanoniklestirilmemis. */
  sourceModel: string;
  year: number | null;
  mileage: number | null;
  price: number | null;
  currency: string | null;
  location: string | null;
  capturedAt: string;
  runId: string;
  jobId: string;
  page: number;
}

export type JobStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED' | 'BLOCKED';

export interface JobCursor {
  /** Bir sonraki islenecek sayfa (1 tabanli). */
  page: number;
  exhausted: boolean;
}

/**
 * Toplama isi. GRANULARITE: genis kaynak kategorisi (marka/aile).
 * Sihirbazin 46.932 yaprak ucu icin IS URETILMEZ — bkz. job-queue guard.
 */
export interface CollectionJob {
  id: string;
  source: string;
  make: string;
  family: string;
  status: JobStatus;
  cursor: JobCursor;
  attempts: number;
  startedAt: string | null;
  updatedAt: string | null;
  lastError: string | null;
  observedCount: number;
}

export interface PageResult {
  listings: RawObservedListing[];
  hasNextPage: boolean;
  /** Sayfanin kendisi basariyla alinip ayristirilabildi mi. */
  pageOk: boolean;
  /** Sayfa icinde ayristirilamayan ilan blogu sayisi. */
  parseFailures: number;
}

export type AccessChallengeKind = 'HTTP_403' | 'HTTP_429' | 'CAPTCHA' | 'AUTH_REQUIRED';

/**
 * Erisim engeli. BYPASS YOK: stealth, parmak izi sahteciligi, proxy rotasyonu
 * veya hesap rotasyonu UYGULANMAZ. Tek dogru davranis guvenli durmaktir.
 */
export class AccessChallengeError extends Error {
  constructor(
    public readonly kind: AccessChallengeKind,
    public readonly jobId: string,
    public readonly page: number,
    message?: string,
  ) {
    super(message || `Access challenge (${kind}) on job ${jobId} page ${page}`);
    this.name = 'AccessChallengeError';
  }
}

/** Checkpoint bozulmasi SESSIZCE sifirlanmaz — calisma durur. */
export class CheckpointCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckpointCorruptError';
  }
}

/** Snapshot V1'de SALT OKUNUR. Mutasyon denemesi hata firlatir. */
export class SnapshotMutationForbiddenError extends Error {
  constructor(operation: string) {
    super(`Snapshot is read-only in ${COLLECTOR_VERSION}; refused operation: ${operation}`);
    this.name = 'SnapshotMutationForbiddenError';
  }
}

export type RunOutcome =
  | 'QUEUE_EXHAUSTED'
  | 'DEADLINE_REACHED'
  | 'ACCESS_CHALLENGE'
  | 'ABORTED';
