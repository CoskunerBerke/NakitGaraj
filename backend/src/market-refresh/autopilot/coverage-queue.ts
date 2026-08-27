/**
 * HEDEFLI KAPSAMA KUYRUGU — YALNIZCA EKSIK KATEGORI SAYFALARI.
 *
 * Tam bir yeniden tarama DEGILDIR. Kuyruk, kapsama manifestosundan gelir
 * (`missing-category-pages.json`) ve yalnizca korpusta GERCEKTEN olmayan
 * kategori sayfalarini hedefler.
 *
 * NEDEN YAPISAL: bir kategorinin kendi sayfasi yoksa cocuk kumesi BILINEMEZ.
 * Ornek: "Audi / A3 / A3 Sedan" dugumunun 593 ilani satirlardan kurtarildi,
 * ama sayfasi olmadigi icin yalnizca 3 motoru gorunuyor; kaynagin kendi
 * menusu o kategoride 3125 ilan oldugunu soyluyor. Tek sayfa butun dali acar.
 *
 * KOK LISTESI UZANTIDAN DEGIL BURADAN GELIR. Uzanti guvenilmez bir
 * istemcidir; hedefleri o secebilseydi "yalnizca eksikler" garantisi
 * garanti olmazdi. Ayni gerekce kapsam korumasinda da gecerli.
 *
 * TEKRAR CALISTIRILABILIR: her hedef, o an diskte olup olmadigina gore
 * yeniden suzulur. Bir sayfa toplandiktan sonra agac yeniden kuruldugunda
 * dugumun `sourceFiles` alani dolar ve hedef kendiliginden kuyruktan duser.
 */
import * as fs from 'fs';

/** Manifestodaki tek kayit (yalnizca ihtiyac duyulan alanlar). */
export interface CoverageTarget {
  make: string;
  fullPath: string[];
  categoryUrl: string;
  urlSource: 'NAV_HREF' | 'DERIVED_FROM_PATH';
  priority: 'A' | 'B' | 'C' | 'D';
  recoveredMarketRows: number;
  subtreeMarketRows: number;
  navResultCount: number | null;
  knownChildren: number;
}

export interface CoverageQueueOptions {
  /** Yalnizca bu oncelikler. Varsayilan: sadece A. */
  priorities?: Array<'A' | 'B' | 'C' | 'D'>;
  /**
   * Kaynagin KENDI yayinladigi href olmayan hedefleri kuyruga alma.
   *
   * `DERIVED_FROM_PATH` bir tahmindir; kor bir istek gondermek yerine
   * inceleme kuyrugunda birakilir.
   */
  requireNavHref?: boolean;
  /** Duman kosusu icin ilk N hedef. */
  limit?: number;
  /** Zaten toplanmis kategori yollari ("Audi / A3 / A3 Sedan"). */
  alreadyPresent?: Set<string>;
  /** Daha once basariyla tamamlanmis hedef URL'leri (checkpoint). */
  completed?: Set<string>;
}

export interface CoverageQueue {
  /** Kopruye verilecek kok listesi. */
  roots: Array<{ path: string; label: string }>;
  /** Kuyruga alinan hedefler (rapor icin). */
  targets: CoverageTarget[];
  /** Href'i olmadigi icin ayrilan hedefler — kor istek GONDERILMEZ. */
  needsReview: CoverageTarget[];
  skippedAlreadyPresent: number;
  skippedCompleted: number;
  skippedOtherPriority: number;
}

/** Kategori yolunun kararli anahtari. */
export function pathKey(fullPath: string[]): string {
  return fullPath.join(' / ');
}

export function loadManifest(file: string): CoverageTarget[] {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as { missing?: CoverageTarget[] };
  if (!parsed || !Array.isArray(parsed.missing)) {
    throw new Error(`Coverage manifest is malformed: ${file}`);
  }
  return parsed.missing;
}

/**
 * Manifestodan kuyruk kurar.
 *
 * SIRA MANIFESTODAN KORUNUR: manifest zaten oncelik ve degere gore
 * siralanmistir, burada yeniden siralanmaz — boylece duman kosusunun ilk N
 * hedefi deterministiktir ve tekrar calistirildiginda ayni cikar.
 */
export function buildCoverageQueue(
  manifest: CoverageTarget[],
  options: CoverageQueueOptions = {},
): CoverageQueue {
  const priorities = new Set(options.priorities ?? ['A']);
  const requireNavHref = options.requireNavHref !== false;
  const present = options.alreadyPresent ?? new Set<string>();
  const completed = options.completed ?? new Set<string>();

  const targets: CoverageTarget[] = [];
  const needsReview: CoverageTarget[] = [];
  let skippedAlreadyPresent = 0;
  let skippedCompleted = 0;
  let skippedOtherPriority = 0;

  for (const target of manifest) {
    if (!priorities.has(target.priority)) {
      skippedOtherPriority += 1;
      continue;
    }
    /**
     * Bir ust sayfanin toplanmasi manifestoyu degistirebilir; bu yuzden
     * "hala eksik mi" sorusu HER kosuda yeniden sorulur.
     */
    if (present.has(pathKey(target.fullPath))) {
      skippedAlreadyPresent += 1;
      continue;
    }
    if (completed.has(target.categoryUrl)) {
      skippedCompleted += 1;
      continue;
    }
    if (requireNavHref && target.urlSource !== 'NAV_HREF') {
      needsReview.push(target);
      continue;
    }
    targets.push(target);
    if (options.limit && targets.length >= options.limit) break;
  }

  return {
    roots: targets.map((t) => ({ path: t.categoryUrl, label: t.fullPath[t.fullPath.length - 1] })),
    targets,
    needsReview,
    skippedAlreadyPresent,
    skippedCompleted,
    skippedOtherPriority,
  };
}

/**
 * Toplanan sayfanin GERCEKTEN hedef kategori oldugunu dogrular.
 *
 * Kaynak, bilinmeyen bir kategoriyi ustune yonlendirebilir; "/audi-a3-a3-sedan"
 * isteyip "Audi / A3" sayfasini kaydetmek, olmayan bir kaniti varmis gibi
 * gostermek olurdu. Breadcrumb zinciri hedefle BIREBIR ayni olmalidir.
 */
export function breadcrumbMatchesTarget(
  breadcrumb: string[] | null,
  target: CoverageTarget,
): { ok: boolean; reason: 'OK' | 'NO_BREADCRUMB' | 'REDIRECT_MISMATCH' } {
  if (!breadcrumb || breadcrumb.length === 0) return { ok: false, reason: 'NO_BREADCRUMB' };
  const got = breadcrumb.map((s) => s.trim()).join(' / ');
  const want = pathKey(target.fullPath);
  return got === want ? { ok: true, reason: 'OK' } : { ok: false, reason: 'REDIRECT_MISMATCH' };
}

/** Toplama sonucu — hicbir basarisizlik "tamamlandi" sayilmaz. */
export type CoverageOutcome =
  | 'SUCCESS'
  | 'ALREADY_PRESENT'
  | 'REDIRECT_MISMATCH'
  | 'CAPTCHA'
  | 'LOGIN_REQUIRED'
  | 'ACCESS_RESTRICTED'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'UNKNOWN_PAGE';

export function isSuccessful(outcome: CoverageOutcome): boolean {
  return outcome === 'SUCCESS' || outcome === 'ALREADY_PRESENT';
}
