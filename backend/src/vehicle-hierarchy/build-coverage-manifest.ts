/**
 * KATEGORI SAYFASI KAPSAMA DENETIMI VE HEDEFLI TOPLAMA MANIFESTOSU.
 *
 *   npm run coverage:manifest
 *
 * TAMAMEN SALT OKUNUR: kaynaga istek gitmez, veritabanina yazilmaz, hicbir
 * HTML degistirilmez. Uretilen tek sey rapor/manifesto dosyalaridir.
 *
 * NEDEN: agac artik korpustaki TUM yapisal kaniti kullaniyor (breadcrumb +
 * menu + satir kimligi) ve menu kenar denetimi 0 eksik kenar veriyor. Yani
 * kalan bosluk ARTIK AYRISTIRMA DEGIL, TOPLAMA boslugudur.
 *
 * Somut ornek: "Audi / A3 / A3 Sedan" dugumu var ve 593 ilani kurtarildi,
 * ama KENDI kategori sayfasi hic kaydedilmemis. Sayfa olmadan o dugumun
 * cocuk kumesi BILINEMEZ — canlida 8+ motor varken bizde yalnizca satir
 * metninde gecen 3 tanesi gorunuyor. Tek bir sayfayi toplamak butun o
 * dali acar.
 *
 * Bu yuzden "piyasa verisi var mi" ile "kategori sayfasi var mi" AYRI
 * izlenir; ilki fiyatlamayi, ikincisi YAPI TAMLIGINI belirler.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  artifactToTree,
  loadArtifact,
  resolveArtifactPath,
} from './hierarchy-source';
import { loadAssignments } from './build-listing-assignments';
import { isExactEvidence } from './listing-resolver';
import {
  extractBreadcrumb,
  extractNavChildren,
  extractOwnPath,
  ownSlugOf,
  sahibindenSlug,
  splitNavChildren,
} from './nav-children';
import { HierarchyNode, HierarchyTree } from './hierarchy-tree';

/** Toplama onceligi. */
export type CoveragePriority = 'A' | 'B' | 'C' | 'D';

export interface MissingPage {
  make: string;
  fullPath: string[];
  /** Kaynagin KENDI menusunden gelen yol; yoksa slug'dan turetilir. */
  categoryUrl: string;
  urlSource: 'NAV_HREF' | 'DERIVED_FROM_PATH';
  reason: 'NAV_DECLARED_PAGE_MISSING' | 'ROW_DISCOVERED_NODE_PAGE_MISSING';
  priority: CoveragePriority;
  /** Bu dugume KESIN cozulmus, tekillestirilmis ilan sayisi. */
  recoveredMarketRows: number;
  /**
   * Bu dugum + tum alt agaci. Bir EBEVEYNIN kendi sayisi dogal olarak 0'dir
   * (ilanlar cocuklarina cozulur); dalin gercek agirligi budur.
   */
  subtreeMarketRows: number;
  /** Kaynagin menusunde yazan kategori sonuc sayisi (site metadatasi). */
  navResultCount: number | null;
  /** Satir kanitindan bildigimiz cocuk sayisi — kume EKSIK olabilir. */
  knownChildren: number;
}

export interface NodeCoverage {
  nodeId: string;
  fullPath: string;
  make: string;
  categoryUrl: string;
  /** OWN_PAGE_HREF: dugumun kendi kaydedilmis sayfasinin breadcrumb href'i (en guclu kanit). */
  urlSource: 'OWN_PAGE_HREF' | 'NAV_HREF' | 'DERIVED_FROM_PATH';
  pageSavedOnDisk: boolean;
  pageImportedInDb: boolean;
  navDeclaredByParent: boolean;
  rowDiscovered: boolean;
  marketListingCount: number;
  hasKnownChildren: boolean;
  terminalConfirmed: boolean;
  navResultCount: number | null;
  status:
    | 'PAGE_PRESENT_IMPORTED'
    | 'PAGE_PRESENT_NOT_IMPORTED'
    | 'PAGE_MISSING_NAV_DECLARED'
    | 'PAGE_MISSING_ROW_DISCOVERED'
    | 'PAGE_UNKNOWN';
}

interface NavFact {
  href: string;
  count: number | null;
}

interface SourceFacts {
  /** Turetilmis slug -> menu gercegi (eski arama; kayipli). */
  bySlug: Map<string, NavFact>;
  /** "<ebeveynin kendi slug'i>\u0000<tam etiket>" -> menu gercegi (kayipsiz). */
  byParentLabel: Map<string, NavFact>;
  /** Dugum kimligi -> sayfanin KENDI breadcrumb href'i (en guclu kanit). */
  ownPathByNode: Map<string, string>;
}

/**
 * Kaynak URL gercekleri — KAYIPSIZ anahtarlarla.
 *
 * Olculdu (gercek korpus): "AMG" ve "AMG+" iki ayri kaynak sayfasidir
 * (/…-amg ve /…-amg-plus), ama etiketten turetilen slug '+'yi atar ve iki
 * dugum AYNI menu gercegine cozulurdu; piyasa hedef anlik goruntusu bunu
 * AMBIGUOUS_SOURCE_PATH ile reddediyordu (9 cift). Kaynak onceligi:
 *   1) sayfanin kendi breadcrumb href'i (dugumun kaydedilmis sayfasi)
 *   2) ebeveyn menusundeki href, ebeveyn slug + TAM etiketle
 *   3) turetilmis slug (yalnizca yedek; tahmindir)
 */
function collectSourceFacts(
  tree: HierarchyTree,
  read: (file: string) => string | null,
): SourceFacts {
  const bySlug = new Map<string, NavFact>();
  const byParentLabel = new Map<string, NavFact>();
  const ownPathByNode = new Map<string, string>();
  const seenFiles = new Set<string>();
  for (const node of tree.nodes.values()) {
    for (const file of node.sourceFiles) {
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);
      const html = read(file);
      if (html === null) continue;
      /**
       * SAKLANAN DIZELER DUZLESTIRILIR. Ayristiricinin dondurdugu yol/etiket
       * V8'de sayfanin TAMAMINA bagli "dilim" dize olabilir; dugum basina bir
       * tane saklamak 8.7k x ~340 KB = 3 GB'i canli tutup yigini asirdi
       * (olculdu: coverage:manifest OOM). Kopya, sayfadan bagimsiz kisa dizedir.
       */
      const ownPath = flat(extractOwnPath(html));
      const crumbs = extractBreadcrumb(html);
      if (
        ownPath &&
        crumbs &&
        crumbs.length === node.pathSegments.length &&
        crumbs.every((label, index) => label === node.pathSegments[index]) &&
        !ownPathByNode.has(node.id)
      ) {
        ownPathByNode.set(node.id, ownPath);
      }
      const nav = extractNavChildren(html);
      if (!nav) continue;
      const own = flat(ownSlugOf(ownPath, node.pathSegments)) as string;
      /**
       * Href gercekleri alt soyun TAMAMINDAN alinir: kaynak bir ara seviyeyi
       * atlayip torunu listelediyse torunun href'i de gercektir. Yalnizca
       * "ebeveyn -> cocuk" YAPISI dogrudan cocuklarla sinirlidir; o karar
       * agac kurucusunda verilir, burada degil.
       */
      const split = splitNavChildren(nav, own, node.pathSegments.length);
      for (const child of [...split.direct, ...split.deeper]) {
        const slug = flat(child.slug) as string;
        const fact: NavFact = { href: `/${slug}`, count: child.count };
        if (!bySlug.has(slug)) bySlug.set(slug, fact);
        // Ayirici NUL kacisi: etiketler bosluk icerebilir; ebeveyn slug + etiket cifti kayipsiz kalsin.
        const key = flat(`${own}\u0000${String(child.label).trim()}`) as string;
        if (!byParentLabel.has(key)) byParentLabel.set(key, fact);
      }
    }
  }
  return { bySlug, byParentLabel, ownPathByNode };
}

/** Sayfa dizesinden bagimsiz, duz kopya (V8 dilim/birlesim dizelerini kirar). */
function flat(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return Buffer.from(String(value), 'utf8').toString('utf8');
}

/** Dugumun kaynak URL'i ve nereden bilindigi (yukaridaki oncelikle). */
function resolveSourceUrl(
  tree: HierarchyTree,
  node: HierarchyNode,
  facts: SourceFacts,
): { url: string; source: NodeCoverage['urlSource']; nav: NavFact | null } {
  const ownPath = facts.ownPathByNode.get(node.id);
  const parent = node.parentId ? tree.nodes.get(node.parentId) : undefined;
  const parentSlug = parent
    ? (facts.ownPathByNode.get(parent.id)?.replace(/^\//, '') ??
      sahibindenSlug(parent.pathSegments))
    : null;
  const byLabel =
    parentSlug !== null
      ? facts.byParentLabel.get(`${parentSlug}\u0000${node.name.trim()}`)
      : undefined;
  const nav = byLabel ?? facts.bySlug.get(sahibindenSlug(node.pathSegments)) ?? null;
  if (ownPath) return { url: ownPath, source: 'OWN_PAGE_HREF', nav };
  if (nav) return { url: nav.href, source: 'NAV_HREF', nav };
  return { url: `/${sahibindenSlug(node.pathSegments)}`, source: 'DERIVED_FROM_PATH', nav: null };
}

export interface CoverageReport {
  nodes: NodeCoverage[];
  missing: MissingPage[];
  totals: Record<string, number>;
  byMake: Array<{
    make: string;
    nodes: number;
    savedPages: number;
    missingPages: number;
    priorityA: number;
    noData: number;
  }>;
}

export function buildCoverage(
  tree: HierarchyTree,
  exactByNode: Map<string, number>,
  dbFiles: Set<string>,
  read: (file: string) => string | null,
): CoverageReport {
  const facts = collectSourceFacts(tree, read);

  /** Alt agac toplamlari (yapraktan koke dogru tek gecis). */
  const subtree = new Map<string, number>();
  const ordered = [...tree.nodes.values()].sort((a, b) => b.depth - a.depth);
  for (const node of ordered) {
    let total = exactByNode.get(node.id) ?? 0;
    for (const childId of node.childIds) total += subtree.get(childId) ?? 0;
    subtree.set(node.id, total);
  }
  const nodes: NodeCoverage[] = [];
  const missing: MissingPage[] = [];

  for (const node of tree.nodes.values()) {
    const resolved = resolveSourceUrl(tree, node, facts);
    const nav = resolved.nav;
    const pageSavedOnDisk = node.sourceFiles.length > 0;
    const pageImportedInDb = node.sourceFiles.some((f) => dbFiles.has(f));
    const market = exactByNode.get(node.id) ?? 0;
    const hasKnownChildren = node.childIds.length > 0;

    const coverage: NodeCoverage = {
      nodeId: node.id,
      fullPath: node.fullPath,
      make: node.pathSegments[0],
      categoryUrl: resolved.url,
      urlSource: resolved.source,
      pageSavedOnDisk,
      pageImportedInDb,
      navDeclaredByParent: Boolean(nav),
      rowDiscovered: !pageSavedOnDisk && !nav,
      marketListingCount: market,
      hasKnownChildren,
      terminalConfirmed: node.terminalConfirmed,
      navResultCount: nav ? nav.count : null,
      status: pageSavedOnDisk
        ? pageImportedInDb
          ? 'PAGE_PRESENT_IMPORTED'
          : 'PAGE_PRESENT_NOT_IMPORTED'
        : nav
          ? 'PAGE_MISSING_NAV_DECLARED'
          : 'PAGE_MISSING_ROW_DISCOVERED',
    };
    nodes.push(coverage);

    if (pageSavedOnDisk) continue;

    /**
     * ONCELIK.
     *
     * A: sayfasi yok AMA zaten cocugu oldugunu BILIYORUZ (satir kanitindan).
     *    Yani kesinlikle bir ebeveyn ve cocuk kumesi kesinlikle EKSIK —
     *    tek sayfa toplamak butun dali acar. En yuksek getiri budur.
     * B: sayfasi yok, hacim yuksek (menu sayimi ya da kurtarilmis satir).
     * C: sayfasi yok ve su an hic piyasa verisi yok (NO_DATA).
     * D: geri kalan uzun kuyruk.
     */
    const branch = subtree.get(node.id) ?? 0;
    let priority: CoveragePriority;
    if (hasKnownChildren) priority = 'A';
    else if ((nav?.count ?? 0) >= 100 || branch >= 100) priority = 'B';
    else if (branch === 0) priority = 'C';
    else priority = 'D';

    missing.push({
      make: node.pathSegments[0],
      fullPath: [...node.pathSegments],
      categoryUrl: coverage.categoryUrl,
      // Sayfasi olmayan dugumun kendi href'i olamaz: NAV ya da turetilmis.
      urlSource: coverage.urlSource === 'OWN_PAGE_HREF' ? 'NAV_HREF' : coverage.urlSource,
      reason: nav
        ? 'NAV_DECLARED_PAGE_MISSING'
        : 'ROW_DISCOVERED_NODE_PAGE_MISSING',
      priority,
      recoveredMarketRows: market,
      subtreeMarketRows: branch,
      navResultCount: nav ? nav.count : null,
      knownChildren: node.childIds.length,
    });
  }

  const totals: Record<string, number> = {
    hierarchyNodes: nodes.length,
    savedPages: nodes.filter((n) => n.pageSavedOnDisk).length,
    savedButNotImported: nodes.filter(
      (n) => n.status === 'PAGE_PRESENT_NOT_IMPORTED',
    ).length,
    missingPages: missing.length,
    navDeclaredMissing: missing.filter(
      (m) => m.reason === 'NAV_DECLARED_PAGE_MISSING',
    ).length,
    rowDiscoveredMissing: missing.filter(
      (m) => m.reason === 'ROW_DISCOVERED_NODE_PAGE_MISSING',
    ).length,
    structureBlocking: missing.filter((m) => m.priority === 'A').length,
    priorityA: missing.filter((m) => m.priority === 'A').length,
    priorityB: missing.filter((m) => m.priority === 'B').length,
    priorityC: missing.filter((m) => m.priority === 'C').length,
    priorityD: missing.filter((m) => m.priority === 'D').length,
    noDataNodes: nodes.filter(
      (n) => !n.hasKnownChildren && n.marketListingCount === 0,
    ).length,
    priceableNodes: nodes.filter(
      (n) => !n.hasKnownChildren && n.marketListingCount > 0,
    ).length,
  };

  const makes = new Map<
    string,
    {
      nodes: number;
      savedPages: number;
      missingPages: number;
      priorityA: number;
      noData: number;
    }
  >();
  for (const n of nodes) {
    const entry = makes.get(n.make) ?? {
      nodes: 0,
      savedPages: 0,
      missingPages: 0,
      priorityA: 0,
      noData: 0,
    };
    entry.nodes += 1;
    if (n.pageSavedOnDisk) entry.savedPages += 1;
    else entry.missingPages += 1;
    if (!n.hasKnownChildren && n.marketListingCount === 0) entry.noData += 1;
    makes.set(n.make, entry);
  }
  for (const m of missing) {
    if (m.priority !== 'A') continue;
    const entry = makes.get(m.make);
    if (entry) entry.priorityA += 1;
  }

  const byMake = [...makes.entries()]
    .map(([make, v]) => ({ make, ...v }))
    .sort((a, b) => b.missingPages - a.missingPages);

  return { nodes, missing, totals, byMake };
}

function safeRead(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

export async function main(): Promise<void> {
  const artifact = loadArtifact();
  if (!artifact)
    throw new Error('Hierarchy artifact yok. Once "npm run hierarchy:build".');
  const tree = artifactToTree(artifact);

  const assignments = loadAssignments();
  const exactByNode = new Map<string, number>();
  if (assignments) {
    for (const assignment of Object.values(assignments.assignments)) {
      if (!isExactEvidence(assignment.evidence)) continue;
      exactByNode.set(
        assignment.nodeId,
        (exactByNode.get(assignment.nodeId) ?? 0) + 1,
      );
    }
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  let dbFiles = new Set<string>();
  try {
    const groups = (await (prisma as any).rawVehicleListing.groupBy({
      by: ['sourceFile'],
      _count: { _all: true },
    })) as Array<{ sourceFile: string }>;
    dbFiles = new Set(groups.map((g) => g.sourceFile));
  } finally {
    await (prisma as any).$disconnect();
  }

  const report = buildCoverage(tree, exactByNode, dbFiles, safeRead);
  const t = report.totals;

  console.log('=== CATEGORY PAGE COVERAGE ===');
  console.log(`hierarchy nodes                 : ${t.hierarchyNodes}`);
  console.log(`nodes with a saved page         : ${t.savedPages}`);
  console.log(`  of which never imported to DB : ${t.savedButNotImported}`);
  console.log(`nodes WITHOUT a saved page      : ${t.missingPages}`);
  console.log(`  nav-declared, page missing    : ${t.navDeclaredMissing}`);
  console.log(`  row-discovered, page missing  : ${t.rowDiscoveredMissing}`);
  console.log(`structure-blocking (priority A) : ${t.structureBlocking}`);
  console.log('');
  console.log(
    `priority A / B / C / D          : ${t.priorityA} / ${t.priorityB} / ${t.priorityC} / ${t.priorityD}`,
  );
  console.log(`currently priceable nodes       : ${t.priceableNodes}`);
  console.log(`current NO_DATA nodes           : ${t.noDataNodes}`);

  const rank = (m: MissingPage) =>
    (m.navResultCount ?? 0) + m.subtreeMarketRows;
  const top = [...report.missing]
    .sort((a, b) =>
      a.priority === b.priority
        ? rank(b) - rank(a)
        : a.priority.localeCompare(b.priority),
    )
    .slice(0, 50);
  console.log('');
  console.log('=== TOP 50 MISSING PAGES ===');
  console.log(
    'pri | make | full path | url | ownRows | branchRows | navCount | knownChildren',
  );
  for (const m of top) {
    console.log(
      `${m.priority} | ${m.make} | ${m.fullPath.join(' / ')} | ${m.categoryUrl} | ` +
        `${m.recoveredMarketRows} | ${m.subtreeMarketRows} | ${m.navResultCount ?? '-'} | ${m.knownChildren}`,
    );
  }

  console.log('');
  console.log('=== MAKE COVERAGE (top 25 by missing) ===');
  console.log('make | nodes | saved | missing | priorityA | NO_DATA');
  for (const m of report.byMake.slice(0, 25)) {
    console.log(
      `${m.make} | ${m.nodes} | ${m.savedPages} | ${m.missingPages} | ${m.priorityA} | ${m.noData}`,
    );
  }

  const dir = path.dirname(resolveArtifactPath());
  fs.mkdirSync(dir, { recursive: true });
  const manifestPath = path.join(dir, 'missing-category-pages.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        totals: report.totals,
        byMake: report.byMake,
        missing: [...report.missing].sort((a, b) =>
          a.priority === b.priority
            ? rank(b) - rank(a)
            : a.priority.localeCompare(b.priority),
        ),
      },
      null,
      1,
    ),
    'utf-8',
  );
  const coveragePath = path.join(dir, 'page-coverage.json');
  fs.writeFileSync(coveragePath, JSON.stringify(report.nodes), 'utf-8');
  console.log('');
  console.log(`[coverage] manifest written : ${manifestPath}`);
  console.log(`[coverage] coverage graph   : ${coveragePath}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[coverage] failed:', err?.message || err);
    process.exit(1);
  });
}
