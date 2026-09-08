/**
 * BIR HEDEFIN BASARISIZLIGI KOSUYU BITIRMEZ — AMA HANGISI OLDUGU ONEMLIDIR.
 *
 * KOK NEDEN (olculdu): `failItem` KOSU durumunu 'INCOMPLETE' yapiyor,
 * `nextDirective` ise 'RUNNING' degilse HALT donuyordu. Bu ikisi birlesince
 * TEK bir hedefin hatasi kuyrugu kapatiyor, geri kalan hedefler hic
 * denenmiyordu. `finishIfDone` de her tamamlamada cagrildigi ve "herhangi bir
 * item INCOMPLETE ise kosu INCOMPLETE" dedigi icin ayni kapanmayi uretiyordu.
 *
 * AYRIM: bazi engeller GERCEKTEN kuresel. Giris duvari ya da 2FA gorulduyse
 * sonraki hedef de ayni duvara carpar; orada devam etmek bos yere kaynaga
 * yuklenmek olur. Buna karsilik "bu kategori bulunamadi" ya da "sayfa
 * ayristirilamadi" yalnizca O hedefi ilgilendirir.
 *
 * DURUSTLUK: kapsam, hatayi YUMUSATMAK icin degil dogru yerde tutmak icindir.
 * Hicbir sinif basarisiz bir hedefi COMPLETE yapmaz; filigran her durumda
 * HELD kalir.
 */

/** Kosuyu tumden durduran engeller: sonraki hedefte de ayni sonuc beklenir. */
const RUN_FATAL = new Set([
  'LOGIN_REQUIRED',
  'TWO_FACTOR_REQUIRED',
  'ACCESS_RESTRICTED',
]);

/**
 * Yeniden denemenin ANLAMLI oldugu hatalar.
 *
 * "Bulunamadi" ve "yanlis sayfaya yonlendirildi" yeniden denemekle degismez;
 * kaynak yapisi degismis demektir ve yapi tarafinda ele alinmalidir.
 * Ayristirma/dogrulama hatalari ise sayfa varyantindan kaynaklanabilir ve
 * sonraki kosuda duzelebilir.
 */
const NOT_RETRYABLE = new Set(['TARGET_NOT_FOUND', 'REDIRECT_MISMATCH']);

export type FailureScope = 'TARGET' | 'RUN';

export interface FailureClassification {
  /** Mesajin basindaki kod, orn. "REDIRECT_MISMATCH". Yoksa 'UNKNOWN_ERROR'. */
  code: string;
  scope: FailureScope;
  retryable: boolean;
}

/**
 * Hata mesajindan kodu okur.
 *
 * Kod, projenin mevcut sozlesmesi geregi mesajin ILK sozcugudur
 * ("REDIRECT_MISMATCH breadcrumb [...] != [...]"). Yeni bir kod sozlugu
 * uydurmak yerine bu yerlesik bicim kullanilir; boylece siniflandirma
 * mesajlarla birlikte evrilir.
 */
export function classifyFailure(message: string): FailureClassification {
  const text = String(message || '').trim();
  const first = text.split(/\s+/)[0] || '';
  const code = /^[A-Z][A-Z0-9_]{2,}$/.test(first) ? first : 'UNKNOWN_ERROR';
  return {
    code,
    scope: RUN_FATAL.has(code) ? 'RUN' : 'TARGET',
    retryable: !NOT_RETRYABLE.has(code),
  };
}

/** Kalici, makine-okur basarisizlik kaydi (yigin izi TASIMAZ). */
export interface TargetFailureDetail {
  runId: string;
  targetId: string;
  /** Kararli kimlik: tam yol. Etiket tek basina kimlik DEGILDIR. */
  exactPath: string;
  hierarchyVersion: string;
  /** Hedefin deterministik siradaki yeri (0 tabanli). */
  ordinal: number;
  status: 'INCOMPLETE';
  /** Hangi asamada kirildi. */
  stage: 'PAGE_SUBMIT' | 'ACCESS_REPORT' | 'MANUAL_STOP';
  code: string;
  scope: FailureScope;
  retryable: boolean;
  message: string;
  at: string;
  pagesRead: number;
  rawEvidenceWritten: boolean;
  stagedObservations: number;
  watermarkAdvanced: false;
}
