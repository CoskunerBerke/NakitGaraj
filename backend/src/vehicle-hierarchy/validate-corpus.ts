/**
 * TUM KORPUSU UCTAN UCA DOGRULA — SALT OKUNUR, GURULTULU.
 *
 *   npm run corpus:validate
 *
 * Amac tek cumlede: DISKTE DURAN HICBIR GECERLI SAYFA SESSIZCE
 * KAYBOLMASIN. Bu betik hicbir sey toplamaz, hicbir sey yazmaz, kaynaga tek
 * istek gondermez; yalnizca zaten elimizde olan HTML'i okur ve su soruyu
 * cevaplar:
 *
 *   "Bu dosyanin icindeki bilgi, uretilen agacta gercekten duruyor mu?"
 *
 * Denetim AGACA SORMAZ. Kanit HTML'den YENIDEN okunur ve artefaktla
 * karsilastirilir; agacin kendi kendini onaylamasina izin verilmez.
 *
 * Kapi (exit 1) su durumlarda duser:
 *   - ayristirma hatasi / bilinmeyen bicim / supheli bos ayristirma
 *   - kaynagin ilan ettigi bir ebeveyn->cocuk kenari agacta yok
 *   - ya da yanlis ebeveynin altinda
 *   - veri tasidigi halde hicbir yerde kullanilmayan dosya
 */
import * as fs from 'fs';
import {
  BreadcrumbItem,
  extractBreadcrumbItems,
  isStrictDescendantSlug,
  sahibindenSlug,
} from './nav-children';
import {
  PageStatus,
  carriesVehicleData,
  classifyPage,
  isFailure,
} from './page-classification';
import {
  discoverCorpusFiles,
  listAllHtmlFiles,
  loadArtifact,
  resolveCorpusRoot,
} from './hierarchy-source';
import { HierarchyNode } from './hierarchy-tree';
import { loadAssignments } from './build-listing-assignments';
import { isExactEvidence } from './listing-resolver';

interface FormatFingerprint {
  /** Baglantilar mutlak mi (Chrome canli-DOM kaydi) yoksa goreli mi (ham sunucu HTML'i). */
  absoluteHrefs: boolean;
  /** Oznitelik adlari tarayici tarafindan kucultulmus mu. */
  lowercasedAttributes: boolean;
  /** Kategori menusu kaydirma sarmalayicilari icinde mi (jspContainer/jspPane). */
  wrappedNav: boolean;
}

/**
 * Kayit bicimini SAYFANIN KENDI KATEGORI BAGLANTILARINDAN okur.
 *
 * "Herhangi bir yerde mutlak baglanti var mi" diye sormak ise yaramaz: her
 * gercek sayfanin ust menusunde de mutlak baglantilar durur ve olcum 7048
 * dosyayi "mutlak" ilan eder. Ayristiriciyi kiran sey buydu DEGIL; kiran sey
 * KATEGORI baglantilarinin bicimiydi. Bu yuzden breadcrumb'in kendi href'ine
 * bakilir — ayristiricinin gercekten okudugu alan.
 */
function fingerprint(html: string, breadcrumbItems: BreadcrumbItem[] | null): FormatFingerprint {
  const categoryHrefs = (breadcrumbItems ?? []).map((i) => i.href);
  return {
    absoluteHrefs: categoryHrefs.some((h) => /^https?:\/\//i.test(h)),
    lowercasedAttributes:
      html.includes('data-categorybreadcrumbid') && !html.includes('data-categoryBreadcrumbId'),
    wrappedNav: html.includes('jspPane') || html.includes('jspContainer'),
  };
}

function formatKey(f: FormatFingerprint): string {
  return [
    f.absoluteHrefs ? 'absoluteHref' : 'relativeHref',
    f.lowercasedAttributes ? 'lowercasedAttrs' : 'sourceCaseAttrs',
    f.wrappedNav ? 'wrappedNav' : 'directNav',
  ].join(' + ');
}

/** Kaynagin kendi menusunde ilan ettigi bir ebeveyn->cocuk kenari. */
interface NavEdge {
  parentPath: string[];
  childLabel: string;
  file: string;
}

export interface CorpusReport {
  root: string;
  totalHtmlFiles: number;
  totalBytes: number;
  makeFolders: number;
  byStatus: Record<string, number>;
  formats: Record<string, number>;
  failures: Array<{ file: string; status: PageStatus; title: string; detail?: string }>;
  navEdges: number;
  navParents: number;
  matchedEdges: number;
  missingEdges: Array<{ parent: string; child: string; file: string }>;
  wrongParentEdges: Array<{ parent: string; child: string; foundUnder: string; file: string }>;
  ignoredUsefulFiles: string[];
  listingRowsSeen: number;
  uniqueListingIds: number;
  assignments: AssignmentAudit | null;
}

/**
 * PIYASA ATAMASI DEGISMEZLERI.
 *
 * Atama artefakti ilan kimligini ANAHTAR alan bir haritadir; bu yuzden bir
 * ilanin iki dugume atanmasi YAPISAL OLARAK imkansizdir. Burada dogrulanan
 * sey bu yapinin korundugu ve KESIN havuza yalnizca kesin kanitin girdigidir.
 */
export interface AssignmentAudit {
  total: number;
  exact: number;
  partial: number;
  unresolved: number;
  ambiguous: number;
  /** Kesin sayilip kaniti kesin OLMAYAN ilanlar — sizinti. SIFIR olmali. */
  leakedIntoExactPool: number;
  /** Agacta karsiligi olmayan dugume atanmis ilanlar. SIFIR olmali. */
  danglingNodeIds: number;
}

export function validateCorpus(root: string, nodes: Map<string, HierarchyNode> | null): CorpusReport {
  const files = listAllHtmlFiles(root);
  /**
   * Boru hattinin GERCEKTEN gordugu kume — kural burada TEKRAR YAZILMAZ,
   * uretimdeki kesif islevinin ta kendisi cagrilir. Kopyalanmis bir eleme
   * kurali, denetimin uretimden sessizce ayrilmasina izin verirdi.
   */
  const pipelineFiles = new Set(discoverCorpusFiles([], root));

  const byStatus: Record<string, number> = {};
  const formats: Record<string, number> = {};
  const failures: CorpusReport['failures'] = [];
  const edges: NavEdge[] = [];
  const parents = new Set<string>();
  const ignoredUsefulFiles: string[] = [];
  const listingIds = new Set<string>();
  let listingRowsSeen = 0;
  let totalBytes = 0;

  for (const file of files) {
    let html: string;
    try {
      totalBytes += fs.statSync(file).size;
      html = fs.readFileSync(file, 'utf-8');
    } catch (err: any) {
      byStatus.PARSE_ERROR = (byStatus.PARSE_ERROR || 0) + 1;
      failures.push({ file, status: 'PARSE_ERROR', title: '', detail: String(err?.message || err) });
      continue;
    }

    const page = classifyPage(html, file);
    byStatus[page.status] = (byStatus[page.status] || 0) + 1;

    if (isFailure(page.status)) {
      failures.push({ file, status: page.status, title: page.title, detail: page.detail });
      continue;
    }

    if (!carriesVehicleData(page.status)) continue;

    const key = formatKey(fingerprint(html, extractBreadcrumbItems(html)));
    formats[key] = (formats[key] || 0) + 1;

    listingRowsSeen += page.rows.length;
    for (const row of page.rows) listingIds.add(row.listingId);

    /**
     * VERI TASIYAN DOSYA BORU HATTINDA GORULUYOR MU?
     *
     * Diskte gecerli veri olup boru hattinin hic bakmadigi bir dosya, tam
     * olarak kacinmak istedigimiz sessiz kayiptir.
     */
    if (!pipelineFiles.has(file)) ignoredUsefulFiles.push(file);

    if (page.status !== 'CATEGORY_PAGE' || !page.breadcrumb || !page.navChildren) continue;

    const parentPath = page.breadcrumb;
    const own = sahibindenSlug(parentPath);
    const direct = page.navChildren.filter((c) => isStrictDescendantSlug(own, c.slug));
    if (direct.length === 0) continue;
    parents.add(parentPath.join(' / '));
    for (const child of direct) edges.push({ parentPath, childLabel: child.label, file });
  }

  const missingEdges: CorpusReport['missingEdges'] = [];
  const wrongParentEdges: CorpusReport['wrongParentEdges'] = [];
  let matchedEdges = 0;

  if (nodes) {
    /**
     * DUGUMLER TAM YOLA GORE ARANIR — SLUG'DAN URETILEN KIMLIGE GORE DEGIL.
     *
     * Slug kayiplidir: "206 +" ile "206" ayni dizeye iner. Agac bunu bilerek
     * ele alir ve cakisan dala kararli bir ek verir ("peugeot/206-2"). Kimligi
     * burada YENIDEN hesaplamak, "206 +" icin "206"yi sormak olurdu; denetim
     * o zaman 55 sahte "yanlis ebeveyn" uretir — nitekim uretti. Kaynagin
     * soyledigi sey bir YOLDUR; karsilastirma da yol uzerinden yapilir.
     */
    // Etiketlerde asla gecmeyen ayirici: ["A B","C"] ile ["A","B C"] karismasin.
    const SEP = '\u0000';
    const byPath = new Map<string, HierarchyNode>();
    for (const node of nodes.values()) byPath.set(node.pathSegments.join(SEP), node);

    for (const edge of edges) {
      const parent = byPath.get(edge.parentPath.join(SEP));
      const child = byPath.get([...edge.parentPath, edge.childLabel].join(SEP));
      if (!child) {
        missingEdges.push({
          parent: edge.parentPath.join(' / '),
          child: edge.childLabel,
          file: edge.file,
        });
        continue;
      }
      if (!parent || child.parentId !== parent.id) {
        wrongParentEdges.push({
          parent: edge.parentPath.join(' / '),
          child: edge.childLabel,
          foundUnder: String(child.parentId),
          file: edge.file,
        });
        continue;
      }
      matchedEdges += 1;
    }
  }

  let makeFolders = 0;
  try {
    makeFolders = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.toLowerCase().endsWith('_files')).length;
  } catch {
    makeFolders = 0;
  }

  return {
    root,
    assignments: auditAssignments(nodes),
    totalHtmlFiles: files.length,
    totalBytes,
    makeFolders,
    byStatus,
    formats,
    failures,
    navEdges: edges.length,
    navParents: parents.size,
    matchedEdges,
    missingEdges,
    wrongParentEdges,
    ignoredUsefulFiles,
    listingRowsSeen,
    uniqueListingIds: listingIds.size,
  };
}

/**
 * Atama artefaktini SALT OKUNUR denetler. Artefakt yoksa null doner ve kapi
 * bu basligi atlar — "dosya yok" ile "dosya bozuk" ayni sey degildir.
 */
function auditAssignments(nodes: Map<string, HierarchyNode> | null): AssignmentAudit | null {
  const artifact = loadAssignments();
  if (!artifact) return null;

  const audit: AssignmentAudit = {
    total: 0,
    exact: 0,
    partial: 0,
    unresolved: 0,
    ambiguous: 0,
    leakedIntoExactPool: 0,
    danglingNodeIds: 0,
  };

  for (const assignment of Object.values(artifact.assignments) as any[]) {
    audit.total += 1;
    const exact = isExactEvidence(assignment.evidence);
    if (exact) audit.exact += 1;
    if (assignment.evidence === 'PARTIAL') audit.partial += 1;
    if (assignment.evidence === 'UNRESOLVED') audit.unresolved += 1;
    if (assignment.evidence === 'AMBIGUOUS') audit.ambiguous += 1;
    // Kesin havuza yalnizca PAGE_EXACT / ROW_MODEL_EXACT girebilir.
    if (exact && assignment.evidence !== 'PAGE_EXACT' && assignment.evidence !== 'ROW_MODEL_EXACT') {
      audit.leakedIntoExactPool += 1;
    }
    if (nodes && exact && !nodes.has(assignment.nodeId)) audit.danglingNodeIds += 1;
  }
  return audit;
}

function line(label: string, value: unknown): void {
  console.log(`[corpus] ${label.padEnd(34)} ${String(value)}`);
}

export async function main(): Promise<void> {
  const root =
    process.env.VEHICLE_CORPUS_ROOT?.trim() ||
    (await knownRootFromDatabase()) ||
    '';
  if (!root || !fs.existsSync(root)) {
    console.error('[corpus] korpus koku bulunamadi. VEHICLE_CORPUS_ROOT tanimlayin.');
    process.exit(1);
  }

  const artifact = loadArtifact();
  const nodes = artifact ? new Map(artifact.nodes.map((n) => [n.id, n])) : null;
  if (!artifact) {
    console.log('[corpus] UYARI: artefakt yok — yapi karsilastirmasi atlaniyor.');
  }

  const report = validateCorpus(root, nodes);

  line('root', report.root);
  line('total HTML files', report.totalHtmlFiles);
  line('total GB', (report.totalBytes / 1024 ** 3).toFixed(2));
  line('make folders', report.makeFolders);
  console.log('[corpus] --- page classification ---');
  for (const [status, count] of Object.entries(report.byStatus).sort((a, b) => b[1] - a[1])) {
    line(`  ${status}`, count);
  }
  console.log('[corpus] --- save format fingerprints ---');
  for (const [key, count] of Object.entries(report.formats).sort((a, b) => b[1] - a[1])) {
    line(`  ${key}`, count);
  }
  console.log('[corpus] --- structure ---');
  line('nav parents', report.navParents);
  line('nav edges declared in HTML', report.navEdges);
  line('edges present in tree', report.matchedEdges);
  line('missing edges', report.missingEdges.length);
  line('wrong-parent edges', report.wrongParentEdges.length);
  console.log('[corpus] --- listings ---');
  line('listing rows read', report.listingRowsSeen);
  line('unique listing ids', report.uniqueListingIds);
  if (report.assignments) {
    const a = report.assignments;
    console.log('[corpus] --- market assignment ---');
    line('unique listings assigned', a.total);
    line('exact (priceable)', a.exact);
    line('partial', a.partial);
    line('unresolved', a.unresolved);
    line('ambiguous', a.ambiguous);
    line('leaked into exact pool', a.leakedIntoExactPool);
    line('assigned to unknown node', a.danglingNodeIds);
  }
  console.log('[corpus] --- loss audit ---');
  line('parser failures', report.failures.length);
  line('ignored useful HTML', report.ignoredUsefulFiles.length);

  for (const f of report.failures.slice(0, 20)) {
    console.log(`[corpus]   ${f.status}  ${f.title || '(no title)'}  ${f.file}`);
    if (f.detail) console.log(`[corpus]       ${f.detail}`);
  }
  for (const e of report.missingEdges.slice(0, 20)) {
    console.log(`[corpus]   MISSING  ${e.parent}  ->  ${e.child}`);
  }
  for (const e of report.wrongParentEdges.slice(0, 20)) {
    console.log(`[corpus]   WRONG PARENT  ${e.parent} -> ${e.child}  (found under ${e.foundUnder})`);
  }
  for (const f of report.ignoredUsefulFiles.slice(0, 20)) {
    console.log(`[corpus]   IGNORED USEFUL  ${f}`);
  }

  const gate =
    report.failures.length === 0 &&
    report.missingEdges.length === 0 &&
    report.wrongParentEdges.length === 0 &&
    report.ignoredUsefulFiles.length === 0 &&
    (report.assignments === null ||
      (report.assignments.leakedIntoExactPool === 0 && report.assignments.danglingNodeIds === 0));

  console.log(`[corpus] RELEASE GATE: ${gate ? 'PASS' : 'FAIL'}`);
  if (!gate) process.exit(1);
}

async function knownRootFromDatabase(): Promise<string | null> {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma: any = new PrismaClient();
    try {
      const rows = await prisma.rawVehicleListing.findMany({
        select: { sourceFile: true },
        take: 50,
      });
      return resolveCorpusRoot(rows.map((r: any) => r.sourceFile).filter(Boolean));
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    return null;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[corpus] failed:', err?.message || err);
    process.exit(1);
  });
}
