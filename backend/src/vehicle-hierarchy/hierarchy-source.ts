/**
 * AGAC KAYNAGI — MEVCUT VERIDEN TURETILIR, YENIDEN CEKILMEZ.
 *
 * Hiyerarsi zaten toplanmis durumda: her ilanin geldigi kategori sayfasinin
 * TAM adi `RawVehicleListing.sourceFile` icinde duruyor. Bu modul o alani
 * SALT OKUNUR sekilde tarar; kaynaga tek bir istek bile gitmez ve tek bir
 * kayit bile degistirilmez.
 *
 * Uretilen artefakt `backend/data/vehicle-hierarchy/` altina yazilir
 * (gitignore'lu, uretilen veri). Mevcut tablolara DOKUNULMAZ.
 */
import * as fs from 'fs';
import * as path from 'path';
import { categoryStringFromSourceFile } from './category-path';
import { auditHierarchy, AuditReport } from './hierarchy-audit';
import { buildHierarchy, HierarchyNode, HierarchyTree, ObservedCategory } from './hierarchy-tree';
import { NavChild, isStrictDescendantSlug, sahibindenSlug } from './nav-children';
import { PageClassification, classifyPage } from './page-classification';

// v2: dugumler artik `terminalConfirmed` tasiyor; v1 artefakti YUKLENMEZ
// (eski artefakt yaprak kararini kanitsiz veriyordu).
export const HIERARCHY_ARTIFACT_VERSION = 'vehicle-hierarchy-v2';

export interface HierarchyArtifact {
  version: string;
  builtAt: string;
  nodes: HierarchyNode[];
  rootIds: string[];
  unresolved: string[];
  audit: AuditReport;
}

/** Prisma'nin ihtiyac duyulan minik yuzeyi — test icin taklit edilebilir. */
export interface HierarchySourceClient {
  rawVehicleListing: {
    groupBy(args: any): Promise<Array<{ sourceFile: string; _count: { _all: number } }>>;
  };
  manufacturer: { findMany(args: any): Promise<Array<{ name: string }>> };
}

/**
 * Kategori sayfasi basina ilan sayisini SALT OKUNUR toplar.
 * groupBy kullanilir: 280k satir bellege cekilmez.
 */
export async function loadObservations(
  client: HierarchySourceClient,
): Promise<{ observations: ObservedCategory[]; knownMakes: string[]; skipped: number }> {
  const groups = await client.rawVehicleListing.groupBy({
    by: ['sourceFile'],
    _count: { _all: true },
  });

  const byCategory = new Map<string, ObservedCategory>();
  let skipped = 0;

  for (const group of groups) {
    const categoryString = categoryStringFromSourceFile(group.sourceFile);
    if (!categoryString) {
      skipped += 1;
      continue;
    }
    const existing = byCategory.get(categoryString);
    if (existing) {
      existing.listingCount += group._count._all;
      existing.sourceFiles.push(group.sourceFile);
    } else {
      byCategory.set(categoryString, {
        categoryString,
        listingCount: group._count._all,
        sourceFiles: [group.sourceFile],
      });
    }
  }

  /**
   * MARKA LISTESI IKI KAYNAKTAN BIRLESIR.
   *
   * `Manufacturer` tablosu katalog icin yeterli ama korpusu KAPSAMIYOR:
   * Geely, Lada, Lamborghini, Infiniti gibi markalar tabloda yok ve yalnizca
   * tabloya guvenildiginde bu markalarin TUM agaci sessizce disarida kaliyordu.
   *
   * Korpus ise markayi zaten GOZLENMIS bicimde tasiyor: kaydedilen dosyalar
   * marka klasorleri altinda duruyor ("...\\Geely\\Geely Echo 1.3 ....html").
   * Klasor adi bir tahmin degil, kaynagin kendi gruplamasidir.
   */
  /**
   * YAPI KANITI ICE AKTARIMDAN BAGIMSIZDIR.
   *
   * Agac bugune kadar YALNIZCA `RawVehicleListing.sourceFile` icinde gecen
   * dosyalari okuyordu. Ama korpusta ice aktarilmamis kategori sayfalari da
   * var (olculdu: 152 dosya, 20 marka — Audi A3 Sportback, A4, A5, A6, Seat,
   * Dacia...). Onlarin menusu hic okunmuyor ve ilan ettikleri alt kategoriler
   * agacta hic gorunmuyordu.
   *
   * KATEGORI YAPISI ile PIYASA VERISI ayri seylerdir: bu dosyalar YAPIYA
   * katilir (breadcrumb + menu), ilan sayilari 0 kalir. Fiyatlama yine
   * yalnizca veritabanindaki gercek satirlardan gelir.
   */
  for (const file of discoverCorpusFiles(groups.map((g) => g.sourceFile))) {
    const categoryString = categoryStringFromSourceFile(file);
    if (!categoryString) continue;
    const existing = byCategory.get(categoryString);
    if (existing) {
      if (!existing.sourceFiles.includes(file)) existing.sourceFiles.push(file);
    } else {
      byCategory.set(categoryString, { categoryString, listingCount: 0, sourceFiles: [file] });
    }
  }

  const makes = await client.manufacturer.findMany({ select: { name: true } });
  const knownMakes = new Set(makes.map((m) => m.name).filter(Boolean));
  for (const group of groups) {
    const folder = makeFolderOf(group.sourceFile);
    if (folder) knownMakes.add(folder);
  }

  return {
    observations: [...byCategory.values()],
    knownMakes: [...knownMakes],
    skipped,
  };
}

/**
 * Chrome'un "Web sayfasi, tamami" kaydinin yan kaynak klasoru.
 *
 * Icinde sayfanin resimleri, betikleri ve REKLAM CERCEVELERI durur; bunlarin
 * bir bolumu `.html` uzantilidir (`aframe.html`, `saved_resource.html`).
 * Korpusta 25 tane var ve HICBIRI kaydedilmis bir sayfa degildir. Dosya adi
 * kategori dizesi uretmeye calisilirsa "aframe" gibi uydurma dugumler dogar.
 *
 * Bu bir TAHMIN degil, Chrome'un kayit sozlesmesidir. Yine de KANITLANIR:
 * korpus dogrulayicisi bu dosyalari da okur ve hepsinin SAVED_ASSET oldugunu
 * gosterir (bkz. `validate-corpus.ts`).
 */
const ASSET_DIR_SUFFIX = '_files';

/**
 * Korpus kokunu BILINEN dosyalardan turetir ve altindaki TUM HTML'leri bulur.
 *
 * Yol hicbir yere sabit yazilmaz: veritabanindaki dosyalarin ortak ust
 * dizini kullanilir (marka klasorlerinin bir ustu). `VEHICLE_CORPUS_ROOT`
 * verilirse o kazanir.
 *
 * TARAMA OZYINELIDIR. Onceki hali yalnizca `<kok>/<Marka>/*.html` bakiyordu;
 * bir seviye daha derine kaydedilmis gercek bir sayfa SESSIZCE gorulmezdi.
 * Derinlik bir varsayim olmaktan cikarildi.
 */
export function discoverCorpusFiles(knownFiles: string[], rootOverride?: string): string[] {
  const root = rootOverride || corpusRoot(knownFiles);
  if (!root) return [];
  const known = new Set(knownFiles);
  const out: string[] = [];
  walkHtml(root, out, true);
  return out.filter((file) => !known.has(file));
}

/**
 * Ozyineli HTML taramasi. Yan kaynak klasorlerini atlamak TEK bir bayrakla
 * belirlenir; iki ayri yuruyucu yazmak, birinin digerinden sessizce
 * ayrilmasina davetiye olurdu.
 */
function walkHtml(dir: string, out: string[], skipAssetDirs: boolean): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipAssetDirs && entry.name.toLowerCase().endsWith(ASSET_DIR_SUFFIX)) continue;
      walkHtml(full, out, skipAssetDirs);
    } else if (entry.name.toLowerCase().endsWith('.html')) {
      out.push(full);
    }
  }
}

/**
 * Korpus kokunu disariya acar: dogrulayici da AYNI koku kullanmalidir, yoksa
 * "agacin okudugu" ile "denetimin okudugu" farkli kumeler olur ve denetim
 * kendi kendini onaylar.
 */
export function resolveCorpusRoot(knownFiles: string[]): string | null {
  return corpusRoot(knownFiles);
}

/**
 * Bir kok altindaki TUM `.html` dosyalari — yan kaynak klasorleri DAHIL.
 *
 * `discoverCorpusFiles` yan kaynaklari kasitli olarak eler; dogrulayici ise
 * ONLARI DA okur ve gercekten yan kaynak olduklarini KANITLAR. Bir iddiayi
 * ancak disladigi seyi de inceleyerek dogrulayabiliriz.
 */
export function listAllHtmlFiles(root: string): string[] {
  const out: string[] = [];
  walkHtml(root, out, false);
  return out;
}

function corpusRoot(knownFiles: string[]): string | null {
  const fromEnv = process.env.VEHICLE_CORPUS_ROOT;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  for (const file of knownFiles) {
    // ".../<korpus>/<Marka>/<dosya>.html" -> korpus koku
    const dir = path.dirname(path.dirname(file));
    if (dir && fs.existsSync(dir)) return dir;
  }
  return null;
}

/** Kaydedilen dosyanin bulundugu marka klasoru (yoksa null). */
export function makeFolderOf(sourceFile: string | null | undefined): string | null {
  const parts = String(sourceFile || '').split(/[\\/]/);
  if (parts.length < 2) return null;
  const folder = parts[parts.length - 2].trim();
  return folder || null;
}

/**
 * KAYDEDILEN SAYFALARDAN YAPRAK KANITI TOPLA — SALT OKUNUR.
 *
 * Her kategori icin TEK bir sayfa okunur: ayni kategorinin "- 2", "- 3" gibi
 * dosyalari ayni menuyu tasiyan sayfalamalardir, hepsini okumak 3.3 GB'i
 * bosuna taramak olurdu.
 *
 * Dosya okunamazsa `navChildLabels` NULL birakilir: "kanit yok" ile "cocuk
 * yok" ayni sey degildir ve karistirmak bizi bu hataya dusurmustu.
 */
export function attachNavEvidence(
  observations: ObservedCategory[],
  read: (file: string) => string | null = safeRead,
): {
  withEvidence: number;
  terminal: number;
  declaredChildren: number;
  unreadable: number;
  withPath: number;
  /** Ilk dosyasi kullanilamaz olup SONRAKI dosyasindan kanit alinan kategoriler. */
  recoveredFromLaterFile: number;
} {
  let withEvidence = 0;
  let terminal = 0;
  let declaredChildren = 0;
  let unreadable = 0;
  let withPath = 0;
  let recoveredFromLaterFile = 0;

  for (const observation of observations) {
    /**
     * AYNI KATEGORININ TUM DOSYALARI DENENIR — ILKI DEGIL.
     *
     * KOK NEDEN (olculdu): korpusta 16 kategori hem gercek sayfa hem de
     * giris duvari / 2 asamali dogrulama / erisim engeli sayfasi iceriyor
     * (orn. "Hyundai Accent Era 1.5 CRDi": 2 gercek sayfa, 6 duvar sayfasi).
     * Onceki hal YALNIZCA `sourceFiles[0]`'i okuyordu; o dosya duvar sayfasi
     * ise kategorinin breadcrumb'i ve menusu TAMAMEN kayboluyor, sonuc
     * "kanit yok" olarak sessizce sayiliyordu. Hangi dosyanin once geldigi
     * veritabani siralamasina bagliydi — yani veri kaybi RASTLANTIYA
     * birakilmisti.
     *
     * Artik kategori sayfasi BULUNANA KADAR ilerlenir. Ayni kategorinin
     * sayfalari ayni menuyu tasir, bu yuzden ilk KULLANILABILIR olan yeterlidir
     * ve 3.34 GB bosuna taranmaz.
     */
    let classified: PageClassification | null = null;
    let attempts = 0;
    for (const file of observation.sourceFiles) {
      const html = read(file);
      if (html === null) continue;
      attempts += 1;
      const page = classifyPage(html, file);
      if (page.status === 'CATEGORY_PAGE') {
        classified = page;
        break;
      }
      if (!classified) classified = page;
    }

    if (!classified || classified.status !== 'CATEGORY_PAGE') {
      observation.navChildLabels = null;
      unreadable += 1;
      continue;
    }
    if (attempts > 1) recoveredFromLaterFile += 1;

    /**
     * KESIN YOL: sayfanin kendi breadcrumb'i. Dosya adini bosluktan bolmek
     * yerine kaynagin verdigi zincir kullanilir.
     *
     * CATEGORY_PAGE olmasi zaten breadcrumb zincirinin VE menu blogunun
     * varligini garanti eder (bkz. `page-classification`); "bos menu terminal
     * kaniti degildir" kurali oraya tasindi ve tek bir yerde durur.
     */
    const chain = classified.breadcrumb as string[];
    observation.pathSegments = chain;
    withPath += 1;

    // Menude ustler ve kardesler de var; yalnizca BU dugumu uzatanlar cocuktur.
    const own = sahibindenSlug(chain);
    const direct = (classified.navChildren as NavChild[]).filter((c) =>
      isStrictDescendantSlug(own, c.slug),
    );
    observation.navChildLabels = direct.map((c) => c.label);
    withEvidence += 1;
    if (direct.length === 0) terminal += 1;
    declaredChildren += direct.length;
  }
  return {
    withEvidence,
    terminal,
    declaredChildren,
    unreadable,
    withPath,
    recoveredFromLaterFile,
  };
}

function safeRead(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

export function buildArtifact(
  observations: ObservedCategory[],
  knownMakes: string[],
): HierarchyArtifact {
  const tree = buildHierarchy(observations, { knownMakes });
  return {
    version: HIERARCHY_ARTIFACT_VERSION,
    builtAt: new Date().toISOString(),
    nodes: [...tree.nodes.values()],
    rootIds: tree.rootIds,
    unresolved: tree.unresolved,
    audit: auditHierarchy(tree),
  };
}

/**
 * Proje kokunu (package.json tasiyan dizin) yukari dogru yurur.
 *
 * `__dirname`'e sabit sayida ".." eklemek KIRILGANDIR: ts-node altinda yol
 * `backend/src/vehicle-hierarchy`, derlenmis halde `backend/dist/src/
 * vehicle-hierarchy` olur ve ayni ".." sayisi iki farkli yere cikar. Bu
 * yuzden artefakt derlenmis kosuda `dist/data/...` altinda aranip
 * bulunamiyordu.
 */
function findPackageRoot(startDir: string): string {
  let dir = startDir;
  for (let up = 0; up < 8; up += 1) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

export function resolveArtifactPath(): string {
  const fromEnv = process.env.VEHICLE_HIERARCHY_ARTIFACT;
  if (fromEnv && fromEnv.trim()) return path.resolve(fromEnv.trim());
  return path.join(findPackageRoot(__dirname), 'data', 'vehicle-hierarchy', 'hierarchy.json');
}

export function saveArtifact(artifact: HierarchyArtifact, filePath = resolveArtifactPath()): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(artifact), 'utf-8');
  fs.renameSync(tmp, filePath);
  return filePath;
}

export function loadArtifact(filePath = resolveArtifactPath()): HierarchyArtifact | null {
  if (!fs.existsSync(filePath)) return null;
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as HierarchyArtifact;
  if (parsed.version !== HIERARCHY_ARTIFACT_VERSION) return null;
  return parsed;
}

/** Artefakti bellek ici agaca cevirir. */
export function artifactToTree(artifact: HierarchyArtifact): HierarchyTree {
  return {
    nodes: new Map(artifact.nodes.map((n) => [n.id, n])),
    rootIds: artifact.rootIds,
    unresolved: artifact.unresolved,
  };
}
