/**
 * DEMO DOGRULAMA — demo veri seti + tarayici matematigi, GERCEK motorla ayni mi?
 *
 * Demo, FMV'yi onceden hesaplanmis bir tablodan okuyup kilometre duzeltmesini
 * ve fiyat formullerini tarayicida uygular. Bu script, ayni araclar icin
 * backend motorunu TAM emsal listesiyle calistirir ve iki sonucu karsilastirir.
 *
 * Beklenen: yilin medyan kilometresinde FMV BIREBIR ayni (ayni cagri), farkli
 * kilometrelerde ise kucuk bir sapma (demo duzeltmeyi FMV'ye, motor ise yuzdelik
 * boru hattinin icine uygular). Sapma buyukse demo YANILTICIDIR.
 *
 * Kullanim: npx ts-node src/scripts/verify_demo_dataset.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { PRICING_LIMITS } from '../evaluation/pricing-config';
import { loadArtifact, resolveArtifactPath } from '../vehicle-hierarchy/hierarchy-source';
import { activeHierarchyReleaseDir } from '../vehicle-hierarchy/artifact-release';
import {
  loadDemoEvidence,
  type EvidenceResult,
  type Observation,
} from '../vehicle-hierarchy/demo-evidence';
import { RobustPricingCalculator } from '../evaluation/robust-pricing-calculator';
import {
  buildYearCurve,
  learnAnnualDepreciation,
  selectYearEvidence,
} from '../evaluation/year-evidence';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function main(): void {
  const backendRoot = path.resolve(__dirname, '../..');
  const demo = JSON.parse(
    fs.readFileSync(
      path.resolve(backendRoot, '../frontend/public/demo-market.json'),
      'utf-8',
    ),
  ) as {
    pools: Record<
      string,
      { n: number; km: number; years: Record<string, number[]> }
    >;
  };

  const publishedDir = path.join(
    backendRoot,
    'data/market-refresh/weekly/published',
  );
  const pointer = JSON.parse(
    fs.readFileSync(path.join(publishedDir, 'current.json'), 'utf-8'),
  ) as { release: string };

  /**
   * Kanit URETICININ kanitidir: hiyerarsi atamalari (korpus/DB) + haftalik
   * yayin. Yalnizca yayini okumak, korpustan fiyatlanan her havuzu bu
   * dogrulamanin disinda birakirdi — yani tam da duzeltilen hatanin
   * dogrulanmadan gecmesi anlamina gelirdi.
   */
  const artifact = loadArtifact(resolveArtifactPath());
  if (!artifact) throw new Error('Hiyerarsi artefakti okunamadi.');
  const evidenceByNode = (
    loadDemoEvidence(
      {
        fs,
        path,
        hierarchyReleaseDir: activeHierarchyReleaseDir(backendRoot),
        backendRoot,
      },
      artifact.nodes,
      { required: true },
    ) as EvidenceResult
  ).byNode;

  const poolNames = Object.keys(demo.pools);
  // Deterministik ornek: veri setine yayilmis 60 havuz.
  const step = Math.max(1, Math.floor(poolNames.length / 60));
  const sample = poolNames.filter((_, i) => i % step === 0).slice(0, 60);

  const atMedian: number[] = [];
  const offMedian: number[] = [];
  let checked = 0;

  for (const node of sample) {
    const observations: Observation[] = evidenceByNode.get(node) ?? [];
    if (observations.length === 0) continue;

    // Kanit secimi veri setiyle AYNI kaynaktan gelir; dogrulama, saklanan
    // sayinin taze bir motor cagrisiyla ortusup ortusmedigini sinar.
    const points = observations.map((o) => ({ year: o.year, price: o.price }));
    const { rate } = learnAnnualDepreciation(points);
    const curve = buildYearCurve(points);

    const pool = demo.pools[node];
    for (const [yearKey, row] of Object.entries(pool.years)) {
      const [k1, k2, k3, f1, f2, f3] = row;
      const demoFmv = f2;
      const medianKm = k2;
      const year = Number(yearKey);

      const evidence = selectYearEvidence(observations, year, {
        rate,
        curve,
        minCount: PRICING_LIMITS.minCompCountForPricing,
      });
      if (evidence.length === 0) continue;

      const listings = evidence.map((e) => ({
        make: 'x',
        model: 'y',
        year,
        mileageKm: e.observation.mileage,
        price: e.price,
        listingDate: e.observation.listingDate,
      }));
      const listingWeights = evidence.map((e) => e.weight);

      // 1) Medyan kilometrede: birebir ayni cagri olmali.
      const engineAtMedian = RobustPricingCalculator.computeValuation({
        cleanListings: listings,
        userYear: year,
        userMileage: medianKm,
        matchedLevel: 1,
        baseConfidenceScore: 0.9,
        listingWeights,
      });
      atMedian.push(
        (100 * (demoFmv - engineAtMedian.fairMarketValue)) /
          engineAtMedian.fairMarketValue,
      );

      // 2) Medyandan uzak bir kilometrede: demo, duzeltmeyi FMV'ye uygular.
      const testKm = Math.max(5_000, Math.round(medianKm * 1.5));
      // Tarayicinin yaptigi ISIN AYNISI: uc noktali egriden log-interpolasyon.
      const logAt = (
        a: number,
        b: number,
        fa: number,
        fb: number,
        x: number,
      ) =>
        b === a
          ? Math.log(fa)
          : Math.log(fa) * (1 - (x - a) / (b - a)) +
            Math.log(fb) * ((x - a) / (b - a));
      const DAMP = 0.6;
      let logValue: number;
      if (testKm <= k1) {
        const slope = k2 === k1 ? 0 : (Math.log(f2) - Math.log(f1)) / (k2 - k1);
        logValue = Math.log(f1) + slope * (testKm - k1) * DAMP;
      } else if (testKm <= k2) {
        logValue = logAt(k1, k2, f1, f2, testKm);
      } else if (testKm <= k3) {
        logValue = logAt(k2, k3, f2, f3, testKm);
      } else {
        const slope = k3 === k2 ? 0 : (Math.log(f3) - Math.log(f2)) / (k3 - k2);
        logValue = Math.log(f3) + slope * (testKm - k3) * DAMP;
      }
      const demoAdjusted = Math.round(
        clamp(Math.exp(logValue), f2 * 0.65, f2 * 1.35),
      );
      const engineAtKm = RobustPricingCalculator.computeValuation({
        cleanListings: listings,
        userYear: year,
        userMileage: testKm,
        matchedLevel: 1,
        baseConfidenceScore: 0.9,
        listingWeights,
      });
      if (engineAtKm.fairMarketValue > 0) {
        offMedian.push(
          (100 * (demoAdjusted - engineAtKm.fairMarketValue)) /
            engineAtKm.fairMarketValue,
        );
      }
      checked += 1;
    }
  }

  const quantile = (values: number[], q: number): number => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * q)] ?? 0;
  };
  const absolute = (values: number[]) => values.map(Math.abs);

  process.stdout.write(`DEMO DOGRULAMA — ${checked} (havuz, yil) noktasi\n\n`);
  process.stdout.write(
    '1) Yilin MEDYAN kilometresinde (birebir ayni olmali):\n',
  );
  process.stdout.write(
    `   |sapma| medyan %${quantile(absolute(atMedian), 0.5).toFixed(3)}   ` +
      `p99 %${quantile(absolute(atMedian), 0.99).toFixed(3)}   ` +
      `en kotu %${Math.max(...absolute(atMedian)).toFixed(3)}\n`,
  );
  process.stdout.write(
    `   tam eslesme: ${absolute(atMedian).filter((d) => d < 0.0001).length}/${atMedian.length}\n\n`,
  );
  process.stdout.write('2) Medyanin %50 uzagindaki kilometrede:\n');
  process.stdout.write(
    `   sapma medyan %${quantile(offMedian, 0.5).toFixed(2)}   ` +
      `|sapma| medyan %${quantile(absolute(offMedian), 0.5).toFixed(2)}   ` +
      `p90 %${quantile(absolute(offMedian), 0.9).toFixed(2)}   ` +
      `p99 %${quantile(absolute(offMedian), 0.99).toFixed(2)}\n`,
  );
  process.stdout.write(
    `   |sapma| <= %2 olanlar: %${(
      (100 * absolute(offMedian).filter((d) => d <= 2).length) /
      offMedian.length
    ).toFixed(0)}\n`,
  );
}

main();
