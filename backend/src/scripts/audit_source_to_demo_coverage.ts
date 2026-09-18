/**
 * KAYNAK -> DEMO KAPSAMA DENETIMI.
 *
 * NEDEN VAR: onceki denetim (`audit_demo_pools.ts`) demo veri setinde ZATEN
 * OLAN havuzlari inceliyordu. Orada olmayan bir arac hakkinda hicbir sey
 * soyleyemez; dolayisiyla "tum havuzlar dogrulandi" derken Opel Insignia'nin
 * (2.008 ilan), Vectra'nin (2.548), Peugeot'nun, Renault'nun, Toyota'nin ve
 * Volkswagen'in demoda hic gorunmedigini fark edemedi. Bir kumeyi kendisiyle
 * karsilastirmak kapsama olcmez.
 *
 * Bu script bu yuzden TERSINDEN calisir: yetkili kaynaktan (yayinlanan
 * hiyerarsi artefakti) baslar ve her dalin demoda ne oldugunu sorar. Bir dal
 * demoda yoksa bu bir SESSIZ DUSUS'tur ve script hata koduyla biter.
 *
 * FIYATI OLMAMAK DUSUS DEGILDIR. Katalogda gorunen ama guncel emsali olmayan
 * arac "fiyatsiz ama secilebilir" olarak sayilir; bu beklenen ve saglikli
 * durumdur (haftalik tarama o hedefe henuz gelmemis olabilir).
 *
 * Karsilastirmanin kendisi `vehicle-hierarchy/demo-coverage.ts` icindedir ve
 * ayni kodu regresyon testi de calistirir.
 *
 * Kullanim:
 *   npx ts-node --transpile-only src/scripts/audit_source_to_demo_coverage.ts [demo-market.json]
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  loadArtifact,
  resolveArtifactPath,
} from '../vehicle-hierarchy/hierarchy-source';
import {
  compareSourceToDemo,
  compareUpstreamToHierarchy,
  coverageFailures,
  upstreamFailures,
  type CoverageDemo,
  type CoverageSourceNode,
} from '../vehicle-hierarchy/demo-coverage';
import { resolveCorpusRoot, listAllHtmlFiles } from '../vehicle-hierarchy/hierarchy-source';

/**
 * Korpus ve veritabani bu makinede varsa okur; yoksa null doner.
 *
 * `better-sqlite3` SALT OKUNUR acilir: denetim veriyi degistirmez. Prisma
 * yerine dogrudan sqlite kullanilir cunku denetimin calismak icin uygulamanin
 * ayaga kalkmasina ihtiyaci olmamali.
 */
function readUpstream(
  backendRoot: string,
  nodes: CoverageSourceNode[],
): ReturnType<typeof compareUpstreamToHierarchy> | null {
  const sourceFilesOf = (node: CoverageSourceNode): string[] =>
    ((node as unknown as { sourceFiles?: string[] }).sourceFiles ?? []);

  const knownFiles = nodes.flatMap(sourceFilesOf).slice(0, 50);
  const corpusRoot = resolveCorpusRoot(knownFiles);
  const dbPath = path.join(backendRoot, 'prisma/dev.db');
  if (!corpusRoot || !fs.existsSync(corpusRoot) || !fs.existsSync(dbPath)) {
    return null;
  }

  let db: {
    prepare: (sql: string) => { all: () => Array<Record<string, unknown>> };
    close: () => void;
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3');
    db = new Database(dbPath, { readonly: true });
  } catch {
    return null;
  }

  try {
    const dbSourceFiles = db
      .prepare('SELECT DISTINCT sourceFile AS f FROM RawVehicleListing')
      .all()
      .map((r) => String(r.f));
    const dbBrands = db
      .prepare('SELECT DISTINCT canonicalMake AS m FROM RawVehicleListing')
      .all()
      .map((r) => String(r.m));
    const dbListingCount = Number(
      db.prepare('SELECT COUNT(*) AS c FROM RawVehicleListing').all()[0].c,
    );

    return compareUpstreamToHierarchy(nodes, sourceFilesOf, {
      corpusFiles: listAllHtmlFiles(corpusRoot),
      dbSourceFiles,
      dbBrands,
      dbListingCount,
    });
  } finally {
    db.close();
  }
}

function sample(values: string[], limit = 15): string {
  if (values.length === 0) return '';
  const shown = values.slice(0, limit).join('\n      ');
  const rest =
    values.length > limit ? `\n      ... (+${values.length - limit})` : '';
  return `\n      ${shown}${rest}`;
}

function main(): void {
  const backendRoot = path.resolve(__dirname, '../..');
  const demoPath =
    process.argv[2] ||
    path.resolve(backendRoot, '../frontend/public/demo-market.json');

  const hierarchyPath = resolveArtifactPath();
  const artifact = loadArtifact(hierarchyPath);
  if (!artifact) throw new Error(`Hiyerarsi okunamadi: ${hierarchyPath}`);
  const pointer = JSON.parse(
    fs.readFileSync(
      path.join(backendRoot, 'data/vehicle-hierarchy/current.json'),
      'utf-8',
    ),
  ) as { hierarchyVersion: string };

  const demo = JSON.parse(fs.readFileSync(demoPath, 'utf-8')) as CoverageDemo;
  const nodes = artifact.nodes as unknown as CoverageSourceNode[];
  const report = compareSourceToDemo(nodes, demo);

  const out = process.stdout;
  out.write('\nSOURCE_TO_DEMO_COVERAGE\n');
  out.write(`  kaynak hiyerarsi : ${hierarchyPath}\n`);
  out.write(`  hiyerarsi kurulum: ${artifact.builtAt}\n`);
  out.write(`  demo veri seti   : ${demoPath}\n`);
  out.write(`  piyasa yayini    : ${demo.marketRelease ?? '(bilinmiyor)'}\n`);

  /**
   * ASAMA 0 — KORPUS/DB -> HIYERARSI.
   *
   * Hiyerarsi artefakti uretilen veridir; korpus ondan sonra buyumus olabilir.
   * O yuzden "hiyerarsiye gore sessiz dusus 0" tek basina yetmez: once
   * hiyerarsinin KENDISININ taze oldugu gosterilir. Korpus veya DB yoksa bu
   * asama ATLANIR ve atlandigi acikca yazilir — sessizce "gecti" demez.
   */
  const upstream = readUpstream(backendRoot, nodes);
  out.write('\n  ASAMA 0 — korpus/DB -> hiyerarsi\n');
  if (!upstream) {
    out.write('    ATLANDI: korpus veya veritabani bu makinede yok.\n');
    out.write(
      '    Bu durumda denetim hiyerarsiyi YETKILI VARSAYAR; tazeligi\n' +
        '    dogrulanmaz. Yayin oncesi korpusun bulundugu makinede kosun.\n',
    );
  } else {
    out.write(
      `    korpus HTML        : ${upstream.corpusFiles}` +
        ` (hiyerarsinin tanidigi: ${upstream.hierarchyFiles})\n`,
    );
    out.write(
      `    DB ilan / sayfa    : ${upstream.dbListingCount} / ${upstream.dbSourceFiles}\n`,
    );
    out.write(
      `    marka  DB/hiyerarsi: ${upstream.dbBrands} / ${upstream.hierarchyBrands}\n`,
    );
    out.write(
      `    model  DB/hiyerarsi: ${upstream.dbTouchedModels} / ${upstream.hierarchyModels}` +
        ' (DB kanitinin dokundugu dal / toplam)\n',
    );
    out.write(
      `    DB sayfasi hiyerarside YOK : ${upstream.dbSourceFilesMissingFromHierarchy.length}` +
        `${sample(upstream.dbSourceFilesMissingFromHierarchy, 5)}\n`,
    );
    out.write(
      `    DB markasi hiyerarside YOK : ${upstream.dbBrandsMissingFromHierarchy.length}` +
        `${sample(upstream.dbBrandsMissingFromHierarchy, 5)}\n`,
    );
    out.write(
      `    hiyerarsi sayfasi korpusta YOK: ${upstream.hierarchyFilesMissingFromCorpus.length}` +
        `${sample(upstream.hierarchyFilesMissingFromCorpus, 3)}\n`,
    );
    out.write(
      `    hiyerarsiden SONRA eklenmis kategori sayfasi: ` +
        `${upstream.unknownCategoryPages.length}` +
        `${sample(
          upstream.unknownCategoryPages.map((f) =>
            f.split(/[\\/]/).slice(-2).join('/'),
          ),
          5,
        )}\n`,
    );
    out.write(
      `    elenen yan kaynak / vitrin sayfasi: ${upstream.ignoredNonCategoryFiles}\n`,
    );
  }
  out.write('\n  ASAMA 1 — hiyerarsi -> katalog -> arayuz\n');

  out.write(
    `  brands source/demo : ${report.sourceBrands} / ${report.demoBrands}\n`,
  );
  out.write(
    `  models source/demo : ${report.sourceModels} / ${report.demoModels}\n`,
  );
  out.write(
    `  leaves source/demo : ${report.sourceLeaves} / ${report.demoLeaves}\n`,
  );
  out.write(
    `  nodes  source/demo : ${report.sourceNodes} / ${report.demoNodes}\n\n`,
  );

  out.write(
    `  missing brands     : ${report.missingBrands.length}${sample(report.missingBrands)}\n`,
  );
  out.write(
    `  missing models     : ${report.missingModels.length}${sample(report.missingModels)}\n`,
  );
  out.write(
    `  missing leaves     : ${report.missingLeaves.length}${sample(report.missingLeaves)}\n`,
  );
  out.write(
    `  identity collisions: ${report.identityCollisions.length}${sample(report.identityCollisions)}\n`,
  );
  out.write(
    `  duplicate ids      : ${report.duplicateIds.length}${sample(report.duplicateIds)}\n`,
  );
  out.write(
    `  non-path-shaped ids: ${report.nonPathShapedIds.length}` +
      ` (kaynak ozelligi, hata degil)${sample(report.nonPathShapedIds, 4)}\n`,
  );
  out.write(
    `  label mismatches   : ${report.labelMismatches.length}${sample(report.labelMismatches)}\n`,
  );
  out.write(
    `  orphan catalog     : ${report.orphanCatalogNodes.length}${sample(report.orphanCatalogNodes)}\n`,
  );
  out.write(
    `  orphan pools       : ${report.orphanPools.length}${sample(report.orphanPools)}\n\n`,
  );

  out.write(`  priceable leaves   : ${report.priceableLeaves}\n`);
  out.write(
    `  pricing-unavailable-but-selectable : ${report.unpricedLeaves.length}` +
      ` (kaynakta ilani olan: ${report.unpricedLeavesWithListings.length})\n\n`,
  );
  out.write(
    `  silent drops       : ${report.silentDrops.length}${sample(report.silentDrops)}\n`,
  );

  const failures = coverageFailures(report);
  if (upstream) failures.unshift(...upstreamFailures(upstream));
  if (demo.hierarchyVersion !== pointer.hierarchyVersion) {
    failures.unshift(
      `hiyerarsi surumu ortusmuyor: demo=${demo.hierarchyVersion} ` +
        `hiyerarsi=${pointer.hierarchyVersion}`,
    );
  }

  if (failures.length > 0) {
    out.write(`\nSOURCE_TO_DEMO_COVERAGE_FAILED — ${failures.join('; ')}\n`);
    process.exitCode = 1;
    return;
  }
  out.write('\nSOURCE_TO_DEMO_COVERAGE_OK\n');
}

main();
