/**
 * DEMO HAVUZ DENETIMI — TUM KORPUS, HER YIL.
 *
 * `verify_demo_dataset.ts` saklanan sayinin motorla ortustugunu, bu script
 * ise EKRANIN o sayiya ulasabildigini ve ulastiginda dogru olani gosterdigini
 * sinar. Korpus elle buyudugu icin tekrar calistirilabilir olmasi gerekir.
 *
 * Uc soru sorulur:
 *
 *   1) YAPI  — her havuz secilebiliyor mu, tam yoluyla tek bir havuza mi
 *      cozuluyor, iki havuz ayni secim kimligine dusuyor mu?
 *   2) KANIT — kaynakta ilani olan her yil ekranda var mi, odunc alinan
 *      kanit havuzun ve +-2 yil penceresinin disina tasiyor mu?
 *   3) FIYAT — uretilen sayi gercek ilanlarla tutarli mi, siralama
 *      invariantlari her satirda saglaniyor mu?
 *
 * Kullanim:
 *   npx ts-node --transpile-only src/scripts/audit_demo_pools.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { YEAR_BORROW_SPAN } from '../evaluation/year-evidence';
import {
  hasEnoughEvidence,
  quote,
} from '../../../frontend/src/lib/demo-pricing';
import { loadArtifact, resolveArtifactPath } from '../vehicle-hierarchy/hierarchy-source';
import { activeHierarchyReleaseDir } from '../vehicle-hierarchy/artifact-release';
import {
  loadDemoEvidence,
  type EvidenceResult,
  type Observation,
} from '../vehicle-hierarchy/demo-evidence';
import {
  availabilityOf,
  buildCatalog,
  buildChain,
  headingFor,
  labelPathOf,
  optionsAt,
  resolvePool,
  yearEvidenceOf,
  yearsOf,
  type Catalog,
  type CatalogNode,
  type DemoData,
} from '../../../frontend/src/lib/demo-selection';

/** Etiketleri birlestirirken kullanilan ayirac; etiket metninde gecemez. */
const SEPARATOR = String.fromCharCode(1);

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

function main(): void {
  const backendRoot = path.resolve(__dirname, '../..');
  const data = JSON.parse(
    fs.readFileSync(
      path.resolve(backendRoot, '../frontend/public/demo-market.json'),
      'utf-8',
    ),
  ) as DemoData;

  const publishedDir = path.join(
    backendRoot,
    'data/market-refresh/weekly/published',
  );
  const pointer = JSON.parse(
    fs.readFileSync(path.join(publishedDir, 'current.json'), 'utf-8'),
  ) as { release: string };

  /**
   * KAYNAK KANITI URETICININ KANITIDIR — yalnizca haftalik yayin DEGIL.
   *
   * Bu script eskiden kaynagi sadece yayin dosyasindan kuruyordu. Uretici iki
   * kaynagi birlestirmeye baslayinca (korpus/DB + yayin) ayni sayiyi olcmez
   * oldular: korpustan fiyatlanan her havuz burada "kaynakta yok" gorunurdu.
   * Ayni fonksiyon cagrilir ki denetim uretilen seyi olcsun.
   */
  const artifact = loadArtifact(resolveArtifactPath());
  if (!artifact) throw new Error('Hiyerarsi artefakti okunamadi.');
  const sourceEvidence = loadDemoEvidence(
    {
      fs,
      path,
      hierarchyReleaseDir: activeHierarchyReleaseDir(backendRoot),
      backendRoot,
    },
    artifact.nodes,
    { required: true },
  ) as EvidenceResult;

  /** Kaynak: havuz -> yil -> ilanlar. */
  const sourceYears = new Map<string, Map<number, Observation[]>>();
  for (const [node, observations] of sourceEvidence.byNode) {
    const years = new Map<number, Observation[]>();
    for (const o of observations) {
      if (!years.has(o.year)) years.set(o.year, []);
      years.get(o.year)!.push(o);
    }
    sourceYears.set(node, years);
  }

  const catalog: Catalog = buildCatalog(data);

  /**
   * Her dugumun KOKTEN kendisine kadarki secim zinciri. Kimlikler yol
   * degildir (bkz. demo-selection.ts > CatalogWire), bu yuzden zincir
   * agactan cikarilir, kimlik kesilerek degil.
   */
  const chainOf = new Map<string, string[]>();
  const collect = (node: CatalogNode, prefix: string[]): void => {
    const chain = [...prefix, node.id];
    chainOf.set(node.id, chain);
    for (const child of node.children) collect(child, chain);
  };
  for (const root of catalog.roots) collect(root, []);

  // Ayni onek icin secenekler bir kez hesaplanir; fonksiyon GERCEK olanidir.
  const optionCache = new Map<string, Set<string>>();
  const optionsFor = (prefix: string[]): Set<string> => {
    const key = prefix.join(SEPARATOR);
    let hit = optionCache.get(key);
    if (!hit) {
      hit = new Set(
        optionsAt(catalog, prefix, prefix.length).map((o) => o.id),
      );
      optionCache.set(key, hit);
    }
    return hit;
  };

  const unreachable: string[] = [];
  const unresolvable: string[] = [];
  const identityCollisions: string[] = [];
  const prefixShadowed: string[] = [];
  const hiddenYears: string[] = [];
  const orphanYears: string[] = [];
  const directMismatch: string[] = [];
  const borrowLeaks: string[] = [];
  const chainMismatch: string[] = [];
  const invariantViolations: string[] = [];
  const quoteFailures: string[] = [];
  const outsideEvidence: string[] = [];
  const depthHistogram: Record<number, number> = {};
  const identitySeen = new Map<string, string>();

  let yearRows = 0;
  let quoted = 0;
  let manualReview = 0;

  for (const [key, pool] of Object.entries(data.pools)) {
    const path_ = chainOf.get(key);
    if (!path_) {
      unreachable.push(`${key}: katalogda yok`);
      continue;
    }
    depthHistogram[path_.length] = (depthHistogram[path_.length] ?? 0) + 1;

    for (let d = 0; d < path_.length; d += 1) {
      if (!optionsFor(path_.slice(0, d)).has(path_[d])) {
        unreachable.push(`${key} @${d} "${path_[d]}"`);
        break;
      }
    }

    const identity = labelPathOf(catalog, path_).join(SEPARATOR);
    const seen = identitySeen.get(identity);
    if (seen) identityCollisions.push(`${seen} == ${key}`);
    else identitySeen.set(identity, key);

    const resolved = resolvePool(data, path_);
    if (resolved !== pool) {
      unresolvable.push(`${key} -> ${resolved ? 'baska havuz' : 'null'}`);
    }
    if (availabilityOf(catalog, data, path_) !== 'PRICEABLE') {
      unresolvable.push(`${key}: fiyatli havuz PRICEABLE saymiyor`);
    }

    // Bir havuzun yolu baska bir havuzun oneki olamaz: kisa olan secildiginde
    // zincir devam eder ve hangi havuzun gosterildigi belirsizlesir.
    if (optionsFor(path_).size > 0) {
      prefixShadowed.push(`${key} (derinlik ${path_.length})`);
    }

    const chain = buildChain(catalog, path_);
    if (chain.length < path_.length) {
      chainMismatch.push(
        `${key}: zincir ${chain.length} < yol ${path_.length}`,
      );
    }
    for (let d = 0; d < path_.length; d += 1) {
      if (!headingFor(data, path_, d)) {
        chainMismatch.push(`${key} @${d}: baslik yok`);
      }
    }

    const src = sourceYears.get(key) ?? new Map<number, Observation[]>();
    const shown = new Set(yearsOf(pool));
    for (const [year, rows] of src) {
      if (rows.length >= 1 && !shown.has(year)) {
        hiddenYears.push(`${key} ${year} (${rows.length} ilan)`);
      }
    }
    for (const year of shown) {
      if (!src.has(year)) orphanYears.push(`${key} ${year} (kaynakta yok)`);
    }

    for (const [yearKey, row] of Object.entries(pool.years)) {
      yearRows += 1;
      const year = Number(yearKey);
      const id = `${key} ${yearKey}`;
      const evidence = yearEvidenceOf(row);
      const directRows = src.get(year) ?? [];
      const direct = directRows.map((o) => o.price);

      if (evidence.directComparables !== direct.length) {
        directMismatch.push(
          `${id}: dogrudan=${evidence.directComparables} kaynak=${direct.length}`,
        );
      }

      const total = evidence.directComparables + evidence.borrowedComparables;
      if (total > pool.n) {
        borrowLeaks.push(`${id}: ${total} emsal > havuz ${pool.n}`);
      }
      let within = 0;
      for (const [y, rows] of src) {
        if (Math.abs(y - year) <= YEAR_BORROW_SPAN) within += rows.length;
      }
      if (total > within) {
        borrowLeaks.push(
          `${id}: ${total} > +-${YEAR_BORROW_SPAN} yil icindeki ${within}`,
        );
      }
      if (
        evidence.effectiveComparables > total + 1e-9 ||
        evidence.effectiveComparables < evidence.directComparables - 1e-9
      ) {
        borrowLeaks.push(
          `${id}: etkin kanit ${evidence.effectiveComparables} tutarsiz`,
        );
      }

      if (
        !hasEnoughEvidence(
          evidence.directComparables,
          evidence.borrowedComparables,
        )
      ) {
        quoteFailures.push(`${id}: kanit yok`);
        continue;
      }

      let result;
      try {
        result = quote({
          kmPoints: evidence.kmPoints,
          fmvPoints: evidence.fmvPoints,
          mileageKm: evidence.kmPoints[1],
          directComparables: evidence.directComparables,
          borrowedComparables: evidence.borrowedComparables,
          effectiveComparables: evidence.effectiveComparables,
          engineConfidencePct: evidence.engineConfidencePct,
          dispersion: evidence.dispersion,
          engineManualCode: evidence.engineManualCode,
        });
      } catch (error) {
        quoteFailures.push(`${id}: ${(error as Error).message}`);
        continue;
      }

      quoted += 1;
      if (result.requiresManualApproval) manualReview += 1;

      if (!(
        result.cashOffer > 0 &&
        result.cashOffer < result.customerConsignmentNet &&
        result.customerConsignmentNet <= result.expectedSalePrice &&
        result.consignmentListingPrice >= result.expectedSalePrice
      )) {
        invariantViolations.push(id);
      }

      /**
       * FIYAT, O YILIN KENDI ILANLARIYLA CELISMEMELI.
       *
       * Karsilastirma AYNI kilometrede yapilir: ham fiyat araligi ile
       * km-normalize edilmis bir tahmini karsilastirmak anlamsizdir.
       * Veri seti uretilirken ayni olcut uygulanip celisen satirlar manuel
       * degerlendirmeye isaretlenir; burada aranan sey, KESIN gosterilen
       * hicbir satirda boyle bir celiskinin kalmamasidir.
       */
      if (direct.length > 0 && !result.requiresManualApproval) {
        const directKm = median(directRows.map((o) => o.mileage));
        const directPrice = median(direct);
        const atDirectKm = quote({
          kmPoints: evidence.kmPoints,
          fmvPoints: evidence.fmvPoints,
          mileageKm: directKm,
          directComparables: evidence.directComparables,
          borrowedComparables: evidence.borrowedComparables,
          effectiveComparables: evidence.effectiveComparables,
          engineConfidencePct: evidence.engineConfidencePct,
          dispersion: evidence.dispersion,
          engineManualCode: evidence.engineManualCode,
        }).fairMarketValue;

        const gap =
          directPrice > 0
            ? Math.abs(atDirectKm - directPrice) / directPrice
            : 0;
        if (gap > 0.35) {
          outsideEvidence.push(
            `${id}: ${directKm} km icin ${atDirectKm}, gozlenen medyan ${directPrice}` +
              ` (%${Math.round(gap * 100)}, dogrudan=${evidence.directComparables})`,
          );
        }
      }
    }
  }

  const report = (name: string, rows: string[], limit = 6) => {
    process.stdout.write(`  ${name.padEnd(32)}: ${rows.length}\n`);
    for (const row of rows.slice(0, limit))
      process.stdout.write(`      ${row}\n`);
    if (rows.length > limit) {
      process.stdout.write(`      … +${rows.length - limit}\n`);
    }
  };

  process.stdout.write('\nDEMO HAVUZ DENETIMI\n');
  process.stdout.write(
    `  yayin                           : ${pointer.release}\n`,
  );
  process.stdout.write(
    `  katalog dugumu                  : ${catalog.byId.size}\n`,
  );
  process.stdout.write(
    `  fiyat havuzu                    : ${Object.keys(data.pools).length}\n`,
  );
  process.stdout.write(`  yil satiri                      : ${yearRows}\n`);
  process.stdout.write(`  fiyat uretilen                  : ${quoted}\n`);
  process.stdout.write(`  manuel degerlendirme            : ${manualReview}\n`);
  process.stdout.write(
    `  derinlik dagilimi               : ${JSON.stringify(depthHistogram)}\n\n`,
  );

  report('ULASILAMAYAN havuz', unreachable);
  report('COZULEMEYEN havuz', unresolvable);
  report('KIMLIK CAKISMASI', identityCollisions);
  report('ONEK GOLGELEMESI', prefixShadowed);
  report('ZINCIR UYUSMAZLIGI', chainMismatch);
  report('GIZLENEN GERCEK YIL', hiddenYears);
  report('ORPHAN YIL', orphanYears);
  report('DOGRUDAN SAYI UYUSMAZLIGI', directMismatch);
  report('ODUNC KANIT SIZINTISI', borrowLeaks);
  report('FIYAT URETILEMEYEN', quoteFailures);
  report('INVARIANT IHLALI', invariantViolations);
  report('KANITLA CELISEN KESIN FIYAT', outsideEvidence);

  const failures =
    unreachable.length +
    unresolvable.length +
    identityCollisions.length +
    prefixShadowed.length +
    chainMismatch.length +
    hiddenYears.length +
    orphanYears.length +
    directMismatch.length +
    borrowLeaks.length +
    quoteFailures.length +
    invariantViolations.length +
    outsideEvidence.length;

  process.stdout.write('\n');
  if (failures > 0) {
    process.stdout.write(`  SONUC: ${failures} bulgu var.\n\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    '  SONUC: her havuz secilebilir, cozulur ve tutarli fiyatlanir.\n\n',
  );
}

main();
