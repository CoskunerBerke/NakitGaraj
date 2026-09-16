/**
 * DEMO VERI SETI URETICI — Vercel'e gidecek KUCUK dosya.
 *
 * NEDEN: yayinlanan piyasa artefakti 151 MB'dir (184.000 ilan). Vercel'e
 * konamaz. Ama demoda kisiler KENDI araclarini deneyecek, yani elimizde tum
 * havuzlar bulunmali.
 *
 * COZUM: ilanlarin kendisi degil, FIYATIN TURETILEBILMESI icin gereken en az
 * bilgi tasinir. Her havuz icin, ilanlari olan her yila ait GERCEK motor
 * ciktisi (FMV) bir kez hesaplanir ve o yilin medyan kilometresiyle birlikte
 * saklanir. Tarayici yalnizca kilometre duzeltmesini ve fiyat formullerini
 * uygular; emsal dagilimini tasimasi gerekmez.
 *
 * Boylece demo GERCEK motorun sayilarini gosterir — yaklasik bir taklidini
 * degil.
 *
 * Kullanim:
 *   npx ts-node src/scripts/build_demo_dataset.ts [cikis-yolu]
 */
import * as fs from 'fs';
import * as path from 'path';
import { RobustPricingCalculator } from '../evaluation/robust-pricing-calculator';

/** Bir yilin egriye/veri setine girmesi icin gereken en az ilan sayisi. */
const MIN_LISTINGS_PER_YEAR = 3;
/** Bir havuzun veri setine girmesi icin gereken en az ilan sayisi. */
const MIN_LISTINGS_PER_POOL = 5;

interface Observation {
  year: number;
  mileage: number;
  price: number;
  listingDate?: string;
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Havuzun km egimi: log-fiyat ~ km dogrusal uyumu (10.000 km basina oran). */
function learnKmDecayPer10k(rows: Observation[]): number {
  const usable = rows.filter((r) => r.mileage > 0 && r.price > 0);
  if (usable.length < 10) return 0.015;
  const n = usable.length;
  const meanX = usable.reduce((s, r) => s + r.mileage, 0) / n;
  const meanY = usable.reduce((s, r) => s + Math.log(r.price), 0) / n;
  let num = 0;
  let den = 0;
  for (const r of usable) {
    num += (r.mileage - meanX) * (Math.log(r.price) - meanY);
    den += (r.mileage - meanX) ** 2;
  }
  if (den <= 0) return 0.015;
  const per10k = -(num / den) * 10_000;
  return Math.min(0.030, Math.max(0.006, per10k));
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((part) =>
      /^\d/.test(part) || part.length <= 2
        ? part.toLocaleUpperCase('tr')
        : part.charAt(0).toLocaleUpperCase('tr') + part.slice(1),
    )
    .join(' ');
}

function main(): void {
  const backendRoot = path.resolve(__dirname, '../..');
  const publishedDir = path.join(
    backendRoot,
    'data/market-refresh/weekly/published',
  );
  const outPath =
    process.argv[2] ||
    path.resolve(backendRoot, '../frontend/public/demo-market.json');

  const pointer = JSON.parse(
    fs.readFileSync(path.join(publishedDir, 'current.json'), 'utf-8'),
  ) as { release: string; hierarchyVersion: string };
  process.stdout.write(`Yayin dosyasi okunuyor: ${pointer.release}\n`);
  const release = JSON.parse(
    fs.readFileSync(path.join(publishedDir, 'versions', pointer.release), 'utf-8'),
  ) as {
    pools: Record<string, string[]>;
    assignments: Record<string, { sourceObservation?: Observation }>;
  };

  const poolNames = Object.keys(release.pools).sort();
  process.stdout.write(`${poolNames.length} havuz bulundu\n`);

  /** marka -> model -> varyant -> paket listesi (secim agaci) */
  const tree: Record<string, Record<string, Record<string, string[]>>> = {};
  const pools: Record<
    string,
    { label: string; n: number; km: number; years: Record<string, number[]> }
  > = {};

  let listingTotal = 0;
  let yearRows = 0;
  let skipped = 0;
  let done = 0;

  for (const node of poolNames) {
    done += 1;
    if (done % 250 === 0) {
      process.stdout.write(
        `  ${done}/${poolNames.length} havuz islendi, ${yearRows} yil satiri\n`,
      );
    }

    const observations: Observation[] = (release.pools[node] || [])
      .map((id) => release.assignments[id]?.sourceObservation)
      .filter((o): o is Observation => Boolean(o))
      .filter((o) => o.year > 1980 && o.price > 0 && o.mileage != null);

    if (observations.length < MIN_LISTINGS_PER_POOL) {
      skipped += 1;
      continue;
    }

    const segments = node.split('/');
    const [makeSlug, modelSlug, variantSlug, trimSlug] = segments;
    const make = titleCase(makeSlug);
    const model = titleCase(modelSlug || '');
    const variant = titleCase(variantSlug || '-');
    const trim = titleCase(trimSlug || '-');

    // Motor icin emsal listesi: fiyatlar HAM, yil normalizasyonu motorun isi.
    const listings = observations.map((o) => ({
      make,
      model,
      variant,
      trim,
      year: o.year,
      mileageKm: o.mileage,
      price: o.price,
      listingDate: o.listingDate,
    }));

    const byYear = new Map<number, Observation[]>();
    for (const o of observations) {
      if (!byYear.has(o.year)) byYear.set(o.year, []);
      byYear.get(o.year)!.push(o);
    }

    const years: Record<string, number[]> = {};
    for (const [year, group] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
      if (group.length < MIN_LISTINGS_PER_YEAR) continue;

      /**
       * MOTORUN KILOMETRE TEPKISI ORNEKLENIR — TEK NOKTA YETMEZ.
       *
       * Ilk surumde yalnizca medyan km'deki FMV saklaniyor, tarayici km
       * duzeltmesini kendisi uyguluyordu. Olculen: medyan km'de sapma SIFIR,
       * ama medyanin %50 uzagindaki kilometrede p90 sapma %16,3'e cikiyordu.
       * Sebep: motor km duzeltmesini yuzdelik boru hattinin ICINDE uygular,
       * sonimleme ve egim guveni de devrededir; sonradan FMV'ye carpmak ayni
       * sey degildir.
       *
       * Bu yuzden motor UC kilometre noktasinda calistirilir ve tarayici
       * aradaki degerleri interpole eder. Demoda herkes KENDI kilometresini
       * girecegi icin bu dogruluk sarttir.
       */
      const kms = group.map((o) => o.mileage).sort((a, b) => a - b);
      const at = (q: number) => kms[Math.min(kms.length - 1, Math.floor(kms.length * q))];
      const medianKm = median(kms);
      const lowKm = Math.max(0, Math.min(at(0.15), medianKm));
      const highKm = Math.max(at(0.85), medianKm);
      // Nokta cakisirsa interpolasyon anlamsiz olur: yapay ama makul bir yayilim.
      const spread = highKm - lowKm < 20_000 ? 30_000 : 0;
      const points = [
        Math.max(0, lowKm - spread / 2),
        medianKm,
        highKm + spread / 2,
      ];

      try {
        const fmvs = points.map((mileage) => {
          const r = RobustPricingCalculator.computeValuation({
            cleanListings: listings as never,
            userYear: year,
            userMileage: mileage,
            matchedLevel: 1,
            baseConfidenceScore: 0.9,
          } as never);
          return Math.round(r.fairMarketValue);
        });
        if (fmvs.some((v) => !v || v <= 0)) continue;
        // [km1, km2, km3, fmv1, fmv2, fmv3, ilan sayisi]
        years[String(year)] = [
          Math.round(points[0]),
          Math.round(points[1]),
          Math.round(points[2]),
          fmvs[0],
          fmvs[1],
          fmvs[2],
          group.length,
        ];
        yearRows += 1;
      } catch {
        // Tek bir yilin hesaplanamamasi havuzu dusurmez.
      }
    }

    if (Object.keys(years).length === 0) {
      skipped += 1;
      continue;
    }

    pools[node] = {
      label: [make, model, variant, trim].filter((p) => p && p !== '-').join(' / '),
      n: observations.length,
      km: Math.round(learnKmDecayPer10k(observations) * 10_000) / 10_000,
      years,
    };
    listingTotal += observations.length;

    if (!tree[make]) tree[make] = {};
    if (!tree[make][model]) tree[make][model] = {};
    const variantKey = variant || '-';
    if (!tree[make][model][variantKey]) tree[make][model][variantKey] = [];
    if (!tree[make][model][variantKey].includes(trim)) {
      tree[make][model][variantKey].push(trim);
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    hierarchyVersion: pointer.hierarchyVersion,
    source: 'sahibinden',
    poolCount: Object.keys(pools).length,
    listingCount: listingTotal,
    yearRowCount: yearRows,
    tree,
    pools,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload), 'utf-8');
  const bytes = fs.statSync(outPath).size;

  process.stdout.write('\nDEMO VERI SETI HAZIR\n');
  process.stdout.write(`  dosya        : ${outPath}\n`);
  process.stdout.write(`  boyut        : ${(bytes / 1048576).toFixed(2)} MB\n`);
  process.stdout.write(`  havuz        : ${payload.poolCount}\n`);
  process.stdout.write(`  yil satiri   : ${payload.yearRowCount}\n`);
  process.stdout.write(`  temsil ilan  : ${payload.listingCount}\n`);
  process.stdout.write(`  marka        : ${Object.keys(tree).length}\n`);
  process.stdout.write(`  atlanan havuz: ${skipped}\n`);
}

main();
