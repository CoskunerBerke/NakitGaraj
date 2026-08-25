/**
 * KOSU KAPSAM KORUMASI — ILK CANLI DUMAN TESTI ICIN.
 *
 * NEDEN: ilk gercek kosu, iki kaynak secici grubunu (sonuc sayisi ve alt
 * kategori) dogrulamak icindir. Bu dogrulama sirasinda gezinmenin hedef
 * disina TASMAMASI gerekir; aksi halde bir secici hatasi 78 markalik bir
 * gezintiye donusur.
 *
 * TASARIM: kapsam KOPRUYE (CLI bayraklariyla) verilir, uzantiya DEGIL.
 * Uzanti guvenilmez bir istemcidir; kapsami genisletebilseydi koruma
 * koruma olmazdi. Uzanti yalnizca START'a basar.
 *
 * MARKA/SERI UYGULAMADA SABIT DEGILDIR: burasi genel bir kapsam sozlesmesidir,
 * Audi/A3 yalnizca bir yapilandirma degeridir.
 *
 * ICERME KURALI (iki bagimsiz sinyal VE'lenir — en dar olan):
 *   1) yol, kok yolun ALTINDA olmali (segment sinirina saygili)
 *   2) yol, hedef marka VE seri slug'ini tasimali
 * Boylece /audi-a4 (seri yok) ve /bmw-3-serisi (ikisi de yok) reddedilir;
 * /audi-a3-sportback ve /audi-a3?a5_min=2015 kabul edilir.
 */

export interface AutopilotScope {
  /** Gezinmenin cikamayacagi kok yol, orn. "/audi-a3". */
  rootPath: string;
  /** Hedef marka etiketi, orn. "Audi". Slug'i yolda aranir. */
  make: string;
  /** Hedef seri/model etiketi, orn. "A3". Slug'i yolda aranir. */
  series: string;
  /** Yaprak basina azami sonuc sayfasi. Kaynak tavanini (20) asamaz. */
  maxResultPages: number;
  /** Alt kategori yapisi okunamadiysa DUR (secici dogrulama modu). */
  requireChildStructure: boolean;
  /** Sonuc sayisi okunamadiysa DUR. */
  stopOnUnknown: boolean;
}

export type ScopeRejection =
  | 'OUTSIDE_ROOT'
  | 'MAKE_MISMATCH'
  | 'SERIES_MISMATCH';

export interface ScopeDecision {
  allowed: boolean;
  reason: ScopeRejection | null;
}

/** Kaynak yol slug'lariyla karsilastirilabilir sade bicim. */
export function slugify(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Yol, kok yolun altinda mi. SEGMENT SINIRINA saygilidir: "/audi-a3" koku
 * "/audi-a30" yolunu KAPSAMAZ (kok bittikten sonra "-", "/" ya da "?" gelmeli).
 */
export function isUnderRoot(nodePath: string, rootPath: string): boolean {
  const path = String(nodePath || '');
  const root = String(rootPath || '').replace(/\/+$/, '');
  if (!root) return false;
  if (path === root) return true;
  if (!path.startsWith(root)) return false;
  const boundary = path.charAt(root.length);
  return boundary === '-' || boundary === '/' || boundary === '?';
}

/** Slug, yolda kendi basina bir parca olarak geciyor mu ("a3" != "a30"). */
function pathCarriesSlug(nodePath: string, slug: string): boolean {
  if (!slug) return false;
  const tokens = String(nodePath || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const wanted = slug.split('-').filter(Boolean);
  if (wanted.length === 0) return false;
  // Cok parcali slug ("3-serisi") ardisik gecmeli.
  for (let i = 0; i + wanted.length <= tokens.length; i += 1) {
    if (wanted.every((part, j) => tokens[i + j] === part)) return true;
  }
  return false;
}

/**
 * KAPSAM KOKUNU NORMALLESTIR — SESSIZ BOZULMAYA KARSI.
 *
 * Olculen tuzak: Git Bash (MSYS) "/audi-a3" bicimindeki bir argumani bir POSIX
 * yolu sanip "C:/Program Files/Git/audi-a3" haline getiriyor. Boyle bir kok
 * hicbir kaynak yoluna uymaz; koruma "hepsini reddet" moduna duser ve kullanici
 * neden hicbir sey toplanmadigini anlayamaz.
 *
 * Bu yuzden kok SESSIZCE kabul edilmez:
 *   - tam URL verilebilir (kaynak kokeninde) -> yol + sorgu alinir
 *   - "/audi-a3" ya da "audi-a3" verilebilir -> "/audi-a3"
 *   - Windows mutlak yolu / yabanci koken -> ACIK HATA ve MSYS ipucu
 */
export function normalizeScopeRoot(raw: string, baseUrl: string): string {
  const value = String(raw || '').trim();
  if (!value) throw new Error('--scope-root is empty');

  if (/^[a-zA-Z]:[\\/]/.test(value) || value.includes('\\')) {
    throw new Error(
      `--scope-root "${value}" looks like a Windows path, not a source path. ` +
        'Git Bash rewrites a leading "/" argument into a Windows path; run the ' +
        'bridge from PowerShell, prefix the command with MSYS_NO_PATHCONV=1, or ' +
        'pass the full listing URL instead.',
    );
  }

  if (/^https?:\/\//i.test(value)) {
    const base = new URL(baseUrl);
    const url = new URL(value);
    if (url.origin !== base.origin) {
      throw new Error(`--scope-root "${value}" is not on the source origin ${base.origin}`);
    }
    return `${url.pathname.replace(/\/+$/, '')}${url.search}` || '/';
  }

  const path = value.startsWith('/') ? value : `/${value}`;
  return path.replace(/\/+$/, '') || '/';
}

export class ScopeGuard {
  constructor(private readonly scope: AutopilotScope) {}

  get config(): AutopilotScope {
    return this.scope;
  }

  /** Bu yaprak icin izin verilen azami sayfa. */
  get maxResultPages(): number {
    return this.scope.maxResultPages;
  }

  describe(): string {
    return (
      `${this.scope.make} / ${this.scope.series} under ${this.scope.rootPath}, ` +
      `max ${this.scope.maxResultPages} page(s)/leaf`
    );
  }

  /** Bir dugum kapsam icinde mi. Reddedilirse SEBEP tasinir (sessiz atlama yok). */
  evaluate(nodePath: string): ScopeDecision {
    if (!isUnderRoot(nodePath, this.scope.rootPath)) {
      return { allowed: false, reason: 'OUTSIDE_ROOT' };
    }
    if (!pathCarriesSlug(nodePath, slugify(this.scope.make))) {
      return { allowed: false, reason: 'MAKE_MISMATCH' };
    }
    if (!pathCarriesSlug(nodePath, slugify(this.scope.series))) {
      return { allowed: false, reason: 'SERIES_MISMATCH' };
    }
    return { allowed: true, reason: null };
  }
}

/** Iki kapsamin ayni olup olmadigi — devam ederken kapsam GENISLETILEMEZ. */
export function sameScope(a: AutopilotScope | null, b: AutopilotScope | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return (
    a.rootPath === b.rootPath &&
    a.make === b.make &&
    a.series === b.series &&
    a.maxResultPages === b.maxResultPages &&
    a.requireChildStructure === b.requireChildStructure &&
    a.stopOnUnknown === b.stopOnUnknown
  );
}
