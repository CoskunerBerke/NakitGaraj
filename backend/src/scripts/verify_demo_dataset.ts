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
import { RobustPricingCalculator } from '../evaluation/robust-pricing-calculator';

interface Observation {
  year: number;
  mileage: number;
  price: number;
  listingDate?: string;
}

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
      { path: string[]; n: number; km: number; years: Record<string, number[]> }
    >;
  };

  const publishedDir = path.join(backendRoot, 'data/market-refresh/weekly/published');
  const pointer = JSON.parse(
    fs.readFileSync(path.join(publishedDir, 'current.json'), 'utf-8'),
  ) as { release: string };
  const release = JSON.parse(
    fs.readFileSync(path.join(publishedDir, 'versions', pointer.release), 'utf-8'),
  ) as {
    pools: Record<string, string[]>;
    assignments: Record<string, { sourceObservation?: Observation }>;
  };

  const poolNames = Object.keys(demo.pools);
  // Deterministik ornek: veri setine yayilmis 60 havuz.
  const step = Math.max(1, Math.floor(poolNames.length / 60));
  const sample = poolNames.filter((_, i) => i % step === 0).slice(0, 60);

  const atMedian: number[] = [];
  const offMedian: number[] = [];
  let checked = 0;

  for (const node of sample) {
    const observations: Observation[] = (release.pools[node] || [])
      .map((id) => release.assignments[id]?.sourceObservation)
      .filter((o): o is Observation => Boolean(o))
      .filter((o) => o.year > 1980 && o.price > 0 && o.mileage != null);
    if (observations.length < 5) continue;

    const listings = observations.map((o) => ({
      make: 'x',
      model: 'y',
      year: o.year,
      mileageKm: o.mileage,
      price: o.price,
      listingDate: o.listingDate,
    }));

    const pool = demo.pools[node];
    for (const [yearKey, row] of Object.entries(pool.years)) {
      const [k1, k2, k3, f1, f2, f3] = row;
      const demoFmv = f2;
      const medianKm = k2;
      const year = Number(yearKey);

      // 1) Medyan kilometrede: birebir ayni cagri olmali.
      const engineAtMedian = RobustPricingCalculator.computeValuation({
        cleanListings: listings as never,
        userYear: year,
        userMileage: medianKm,
        matchedLevel: 1,
        baseConfidenceScore: 0.9,
      } as never);
      atMedian.push(
        (100 * (demoFmv - engineAtMedian.fairMarketValue)) /
          engineAtMedian.fairMarketValue,
      );

      // 2) Medyandan uzak bir kilometrede: demo, duzeltmeyi FMV'ye uygular.
      const testKm = Math.max(5_000, Math.round(medianKm * 1.5));
      // Tarayicinin yaptigi ISIN AYNISI: uc noktali egriden log-interpolasyon.
      const logAt = (a: number, b: number, fa: number, fb: number, x: number) =>
        b === a
          ? Math.log(fa)
          : Math.log(fa) * (1 - (x - a) / (b - a)) + Math.log(fb) * ((x - a) / (b - a));
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
        cleanListings: listings as never,
        userYear: year,
        userMileage: testKm,
        matchedLevel: 1,
        baseConfidenceScore: 0.9,
      } as never);
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
  process.stdout.write('1) Yilin MEDYAN kilometresinde (birebir ayni olmali):\n');
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
