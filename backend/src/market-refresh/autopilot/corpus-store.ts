/**
 * KORPUS DEPOSU — VAR OLANI OKU, YENIYI EKLE, HICBIR SEYI EZME.
 *
 * Yapi toplayicisi iki soruya buradan cevap alir:
 *
 *   1) "Bu kategori sayfasi zaten elimizde mi?"
 *      Kimlik DOSYA ADINDAN DEGIL, sayfanin kendi breadcrumb'indan gelir.
 *      Agac artefakti (hierarchy.json) her dugum icin breadcrumb-turevli yol
 *      segmentlerini ve kaynak dosyalarini tasir; dosya ancak AYNI hardened
 *      ayristirici onu CATEGORY_PAGE olarak okuyabiliyorsa "mevcut" sayilir.
 *      Giris duvari / 2FA / engel sayfasi mevcut sayfa DEGILDIR.
 *
 *   2) "Yeni sayfayi nereye, hangi adla yazayim?"
 *      Mevcut korpus duzeni korunur: <kok>/<Marka klasoru>/<Zincir> Fiyatları &
 *      Modelleri sahibinden.com'da.html. Marka klasoru, o markanin ZATEN var
 *      olan dosyalarindan turetilir (orn. "Mercedes-Benz" etiketi -> "Mercedes"
 *      klasoru); yoksa etiketten olusturulur. Var olan dosya ASLA ezilmez;
 *      cakisma Chrome'un yaptigi gibi " - 2", " - 3" ekiyle cozulur.
 *
 * Ham HTML degistirilmeden yazilir: dosya, sonradan agac/atama/dogrulama
 * betiklerinin okuyacagi DEGISMEZ kanittir.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  artifactToTree,
  discoverCorpusFiles,
  loadArtifact,
  makeFolderOf,
  resolveCorpusRoot,
} from '../../vehicle-hierarchy/hierarchy-source';
import { categoryStringFromSourceFile } from '../../vehicle-hierarchy/category-path';
import {
  HierarchyNode,
  HierarchyTree,
} from '../../vehicle-hierarchy/hierarchy-tree';
import { OTOMOBIL, sahibindenSlug } from '../../vehicle-hierarchy/nav-children';
import {
  PageClassification,
  classifyPage,
} from '../../vehicle-hierarchy/page-classification';

/** Korpusta bulunan ve AYRISTIRICININ OKUYABILDIGI kategori sayfasi. */
export interface CorpusEvidence {
  file: string;
  page: PageClassification;
}

export interface PresenceQuery {
  /** Sahibinden yol slug'i, orn. "audi-a3-a3-sedan". */
  slug: string;
  /** Beklenen breadcrumb zinciri (biliniyorsa) — kesin arama bununla yapilir. */
  expectedPath: string[] | null;
}

/** Yapi oturumunun ihtiyac duydugu korpus yuzeyi (testte taklit edilebilir). */
export interface CorpusStore {
  /** Kategori zaten okunabilir halde mi. */
  present(query: PresenceQuery): CorpusEvidence | null;
  /** Slug'in agacta bilinen breadcrumb yolu (kok hedeflerin beklentisi icin). */
  knownPath(slug: string): string[] | null;
  /** Yeni sayfayi korpusa yazar, tam yolu dondurur. */
  save(breadcrumb: string[], html: string): string;
  /** Onceki kosuda yazilmis dosyayi (devam ederken) mevcut say. */
  noteSaved(breadcrumb: string[], file: string): void;
  /** Yeni kurulan artefakti yeniden yukler (yeniden kurma sonrasi). */
  reload(): void;
  /** Kok dizin (rapor icin). */
  readonly root: string | null;
}

const SEP = String.fromCharCode(0);

/** Windows'un dosya adinda kabul etmedigi karakterler + kontrol karakterleri. */
// eslint-disable-next-line no-control-regex
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

/** Kaydedilen dosya adinin kuyrugu — korpustaki manuel kayitlarla AYNI kalip. */
export const CORPUS_FILE_SUFFIX = "Fiyatları & Modelleri sahibinden.com'da";

/**
 * Breadcrumb zincirinden dosya adi. `category-path.categoryStringFromSourceFile`
 * bu kuyrugu tanir ve geriye "Audi A3 A3 Sedan 1.6 TDI" birakir; boylece yeni
 * dosya, agac kurucusunun gozunde manuel kayitlardan farksizdir.
 */
export function corpusFileName(breadcrumb: string[]): string {
  const chain = breadcrumb
    .map((s) =>
      String(s)
        .replace(ILLEGAL_FILENAME_CHARS, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join(' ');
  if (!chain) throw new Error('corpusFileName: breadcrumb is empty');
  return `${chain} ${CORPUS_FILE_SUFFIX}.html`;
}

/** Marka etiketinden klasor adi (yalnizca mevcut klasor bulunamazsa). */
export function makeFolderName(make: string): string {
  const clean = String(make || '')
    .replace(ILLEGAL_FILENAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  if (!clean) throw new Error('makeFolderName: make label is empty');
  return clean;
}

/**
 * ASLA EZME: hedef ad doluysa " - 2", " - 3" ... ile ilk bos ad secilir.
 * Yazim gecici dosya + rename ile yapilir; yarim dosya gorunmez.
 */
export function writeNewCorpusFile(
  dir: string,
  fileName: string,
  html: string,
): string {
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - ext.length);

  for (let n = 1; n < 10_000; n += 1) {
    const candidate = n === 1 ? fileName : `${stem} - ${n}${ext}`;
    const target = path.join(dir, candidate);
    if (fs.existsSync(target)) continue;

    const tmp = path.join(
      dir,
      `.${stem.slice(0, 80)}.tmp-${process.pid}-${Date.now()}`,
    );
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, html, 'utf-8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    // Son bir kez daha bak: bu surecte baska bir yazim olmus olabilir.
    if (fs.existsSync(target)) {
      fs.unlinkSync(tmp);
      continue;
    }
    fs.renameSync(tmp, target);
    return target;
  }
  throw new Error(
    `writeNewCorpusFile: could not find a free name for "${fileName}" in ${dir}`,
  );
}

export interface CorpusIndexOptions {
  /** Artefakti yukler; testte taklit edilir. */
  loadTree?: () => HierarchyTree | null;
  read?: (file: string) => string | null;
  /** VEHICLE_CORPUS_ROOT ya da artefakttan turetilen kok; testte verilir. */
  rootOverride?: string | null;
}

/**
 * Agac artefaktina dayali mevcudiyet dizini.
 *
 * Kanit TEMBEL okunur: yalnizca sorulan dugumun dosyalari acilir, ilk
 * CATEGORY_PAGE bulununca durulur ve sonuc onbellege alinir. Boylece 3.3 GB
 * korpus baslangicta taranmaz; bir kosu boyunca en fazla ziyaret edilen
 * dugum kadar dosya okunur.
 */
export class CorpusIndex implements CorpusStore {
  private bySlug = new Map<string, HierarchyNode>();
  private byPath = new Map<string, HierarchyNode>();
  private evidence = new Map<string, CorpusEvidence | null>();
  /**
   * Bu kosuda yazilan dosyalar: artefakt yeniden kurulana kadar da "mevcut"
   * sayilir. Sayfa TEMBEL okunur (devam ederken binlerce dosya acilmasin).
   */
  private savedThisRun = new Map<
    string,
    { file: string; page: PageClassification | null }
  >();
  private folderByMake = new Map<string, string>();
  private tree: HierarchyTree | null = null;
  private corpusRoot: string | null = null;
  /** undefined = henuz aranmadi; null = korpusta vitrin sayfasi yok. */
  private siteRoot: CorpusEvidence | null | undefined = undefined;
  private readonly loadTree: () => HierarchyTree | null;
  private readonly read: (file: string) => string | null;
  private readonly rootOverride: string | null;

  constructor(options: CorpusIndexOptions = {}) {
    this.loadTree =
      options.loadTree ||
      (() => {
        const artifact = loadArtifact();
        return artifact ? artifactToTree(artifact) : null;
      });
    this.read = options.read || safeRead;
    this.rootOverride = options.rootOverride ?? null;
    this.reload();
  }

  get root(): string | null {
    return this.corpusRoot;
  }

  get nodeCount(): number {
    return this.tree ? this.tree.nodes.size : 0;
  }

  reload(): void {
    this.tree = this.loadTree();
    this.bySlug.clear();
    this.byPath.clear();
    this.evidence.clear();
    this.folderByMake.clear();
    this.siteRoot = undefined;
    if (this.tree) {
      for (const node of this.tree.nodes.values()) {
        this.byPath.set(node.pathSegments.join(SEP), node);
        const slug = sahibindenSlug(node.pathSegments);
        // Ilk kazanir: cakisan slug'larda ("206" / "206 +") yol aramasi kesin olandir.
        if (!this.bySlug.has(slug)) this.bySlug.set(slug, node);
      }
    }
    this.corpusRoot = this.resolveRoot();
  }

  /** Artefakttaki dugumu bulur (kesin yol once, slug sonra). */
  lookup(query: PresenceQuery): HierarchyNode | null {
    if (query.expectedPath && query.expectedPath.length > 0) {
      const exact = this.byPath.get(query.expectedPath.join(SEP));
      if (exact) return exact;
    }
    return this.bySlug.get(query.slug) ?? null;
  }

  knownPath(slug: string): string[] | null {
    const node = this.bySlug.get(slug);
    return node ? [...node.pathSegments] : null;
  }

  present(query: PresenceQuery): CorpusEvidence | null {
    // Site koku agacta bir dugum degildir; kaydedilmis vitrin sayfasi aranir.
    if (`/${query.slug}` === OTOMOBIL) return this.siteRootEvidence();

    if (query.expectedPath && query.expectedPath.length > 0) {
      const saved = this.savedThisRun.get(query.expectedPath.join(SEP));
      if (saved) {
        if (!saved.page) {
          const html = this.read(saved.file);
          saved.page = html === null ? null : classifyPage(html, saved.file);
        }
        if (saved.page && saved.page.status === 'CATEGORY_PAGE') {
          return { file: saved.file, page: saved.page };
        }
      }
    }
    const node = this.lookup(query);
    if (!node) return null;
    /**
     * Kesin yol biliniyorsa ve slug ile bulunan dugumun yolu FARKLIYSA bu
     * baska bir dugumdur (slug kayipli). "Mevcut" demek yanlis olurdu.
     */
    if (
      query.expectedPath &&
      query.expectedPath.length > 0 &&
      !samePath(node.pathSegments, query.expectedPath)
    ) {
      return null;
    }
    return this.evidenceFor(node);
  }

  /**
   * SITE KOKU (vitrin) KANITI.
   *
   * Kok sayfa arac kategorisi degildir ve agacta dugumu yoktur; ama kaydedilmis
   * bir kopyasi varsa markalarin KAYNAK href'lerini tasir. Aday dosyalar
   * kategori dizesi uretmeyen adlardir (agac kurucusunun atladigi ayni kume);
   * kanit yine ayristiricidan gelir: SHOWCASE sinifi + dolu menu.
   */
  siteRootEvidence(): CorpusEvidence | null {
    if (this.siteRoot !== undefined) return this.siteRoot;
    this.siteRoot = null;
    if (this.corpusRoot) {
      for (const file of discoverCorpusFiles([], this.corpusRoot)) {
        if (categoryStringFromSourceFile(file) !== '') continue;
        const html = this.read(file);
        if (html === null) continue;
        const page = classifyPage(html, file);
        if (
          page.status === 'SHOWCASE_OR_NON_CATEGORY_PAGE' &&
          page.navChildren &&
          page.navChildren.length > 0
        ) {
          this.siteRoot = { file, page };
          break;
        }
      }
    }
    return this.siteRoot;
  }

  /** Dugumun dosyalari arasinda ayristiricinin okuyabildigi ILK kategori sayfasi. */
  evidenceFor(node: HierarchyNode): CorpusEvidence | null {
    if (this.evidence.has(node.id)) return this.evidence.get(node.id)!;
    let found: CorpusEvidence | null = null;
    for (const file of node.sourceFiles) {
      const html = this.read(file);
      if (html === null) continue;
      const page = classifyPage(html, file);
      if (
        page.status === 'CATEGORY_PAGE' &&
        page.breadcrumb &&
        samePath(page.breadcrumb, node.pathSegments)
      ) {
        found = { file, page };
        break;
      }
    }
    this.evidence.set(node.id, found);
    return found;
  }

  /**
   * Marka klasoru: o markanin ZATEN var olan dosyalarindan. Etiket ile klasor
   * adi ayrisabilir ("Mercedes-Benz" -> "Mercedes"); yeni dosya, kullanicinin
   * kendi duzenine uyar, yanina ikinci bir marka klasoru acilmaz.
   */
  makeFolderFor(make: string): string {
    const cached = this.folderByMake.get(make);
    if (cached) return cached;
    let folder: string | null = null;
    if (this.tree) {
      const root = this.tree.rootIds
        .map((id) => this.tree!.nodes.get(id))
        .find((n) => n && n.pathSegments[0] === make);
      if (root) {
        const stack = [root];
        while (stack.length > 0 && !folder) {
          const node = stack.pop()!;
          for (const file of node.sourceFiles) {
            const candidate = makeFolderOf(file);
            if (candidate) {
              folder = candidate;
              break;
            }
          }
          for (const childId of node.childIds) {
            const child = this.tree.nodes.get(childId);
            if (child) stack.push(child);
          }
        }
      }
    }
    const resolved = folder || makeFolderName(make);
    this.folderByMake.set(make, resolved);
    return resolved;
  }

  save(breadcrumb: string[], html: string): string {
    if (!this.corpusRoot) {
      throw new Error(
        'Corpus root is unknown: set VEHICLE_CORPUS_ROOT or build the hierarchy artifact first.',
      );
    }
    const make = breadcrumb[0];
    const dir = path.join(this.corpusRoot, this.makeFolderFor(make));
    const file = writeNewCorpusFile(dir, corpusFileName(breadcrumb), html);
    this.savedThisRun.set(breadcrumb.join(SEP), {
      file,
      page: classifyPage(html, file),
    });
    return file;
  }

  /** Devam ederken: onceki kosuda yazilan dosyalar yeniden "mevcut" sayilir. */
  noteSaved(breadcrumb: string[], file: string): void {
    const key = breadcrumb.join(SEP);
    if (this.savedThisRun.has(key)) return;
    this.savedThisRun.set(key, { file, page: null });
  }

  private resolveRoot(): string | null {
    if (this.rootOverride) return this.rootOverride;
    const known: string[] = [];
    if (this.tree) {
      for (const node of this.tree.nodes.values()) {
        for (const file of node.sourceFiles) {
          known.push(file);
          if (known.length >= 50) break;
        }
        if (known.length >= 50) break;
      }
    }
    return resolveCorpusRoot(known);
  }
}

function samePath(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

function safeRead(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}
