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
 * KATEGORI YOLU DEGISKEN DERINLIKTEDIR — KIRPILMAZ. Havuz kimligi
 * "audi/a3/a3-sedan/1-5-tfsi/advanced" gibi 2-5 segmentlidir ve segmentlerin
 * ANLAMI markadan markaya degisir: Audi'de 3. segment kasadir (A3 Sedan),
 * Alfa Romeo'da motordur (1.4), BMW'de alt modeldir (i4). Bu yuzden veri seti
 * yolu oldugu gibi tasir ve seviyelerin ne anlama geldigini her marka/model
 * dali icin KANITTAN sinifllandirir (asagida `classifyBranchLevels`).
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
  /** Sahibinden'in kendi etiketleri: ["Audi","A3","A3 Sedan","1.5 TFSI","Advanced"] */
  requestedTargetPath?: string[];
}

/**
 * Bir secim seviyesinin ne oldugu. Kaynakta seviye TIPI YAZMAZ; bu yuzden
 * etiketlerin kendisinden cikarilir ve emin olunamayan seviye 'series' kalir.
 */
type LevelKind = 'body' | 'engine' | 'package' | 'series';

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
  return Math.min(0.03, Math.max(0.006, per10k));
}

/**
 * Motor adlarinda gecen yakit/aktarma imzalari. Sondaki rakamlar imzaya
 * BITISIK yazilabildigi icin (BMW "xDrive40") kelime siniri sonda aranmaz.
 */
const ENGINE_TOKEN =
  /\b(tfsi|tdi|tsi|cdi|dci|crdi|hdi|jtd|jtdm|fsi|mpi|cdti|tce|thp|vti|multijet|bluehdi|ecoboost|skyactiv|vvt|hybrid|edrive|sdrive|xdrive|quattro|4matic|bluetec|cgi|kompressor)\d*\b/i;
/** "1.4", "2.0" gibi hacim. */
const ENGINE_DISPLACEMENT = /\d+[.,]\d/;
/**
 * "118i", "650Ci", "30 TDI", "M50", "C 180" gibi motor kodu. Basta en cok
 * iki harf olabilir; "i4"/"MG4" gibi alt model adlari elenir cunku iki-uc
 * basamak ister.
 */
const ENGINE_CODE = /^[a-z]{0,2}\s?\d{2,3}\s?[a-z]{0,4}$/i;

function looksLikeEngine(label: string): boolean {
  if (!/\d/.test(label)) return false;
  return (
    ENGINE_DISPLACEMENT.test(label) ||
    ENGINE_TOKEN.test(label) ||
    ENGINE_CODE.test(label.trim())
  );
}

const startsWithModel = (label: string, model: string): boolean =>
  label === model || label.startsWith(model + ' ');

/**
 * SEVIYELERIN ANLAMI KANITTAN CIKARILIR.
 *
 * Kaynak veride seviye tipi yoktur ve konum sabit degildir; "3. segment
 * motordur" demek tam da bu hatanin kaynagiydi (Audi'de kasa, BMW'de alt
 * model). Bu yuzden her marka/model dalinda o seviyedeki ETIKETLERE bakilir:
 *
 *   - etiketler model adiyla basliyorsa (A3 -> "A3 Sedan") kasa seviyesidir;
 *     altinda baska seviye yoksa kasa degil, seri/tip ayrimidir (RS -> "RS 7").
 *   - hacim/motor imzasi tasiyorsa ("1.5 TFSI", "eDrive 40") motor seviyesidir.
 *   - daldaki EN DERIN seviye ise paket/donanimdir ("Advanced", "M Sport").
 *   - hicbiri degilse seri/tip olarak birakilir (BMW "i Serisi" -> "i4"):
 *     yanlis bir ad vermektense notr kalmak dogrudur.
 */
function classifyBranchLevels(paths: string[][], model: string): LevelKind[] {
  const maxDepth = Math.max(...paths.map((p) => p.length));
  const kinds: LevelKind[] = [];

  for (let i = 2; i < maxDepth; i++) {
    const labels = [...new Set(paths.filter((p) => p.length > i).map((p) => p[i]))];
    if (labels.length === 0) {
      kinds.push('series');
      continue;
    }

    const isDeepest = i === maxDepth - 1;
    const modelPrefixed =
      labels.filter((l) => startsWithModel(l, model)).length / labels.length > 0.5;
    const engineish = labels.filter(looksLikeEngine).length / labels.length > 0.5;

    if (modelPrefixed) kinds.push(isDeepest ? 'series' : 'body');
    else if (engineish) kinds.push('engine');
    else if (isDeepest) kinds.push('package');
    else kinds.push('series');
  }

  return kinds;
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

  const pools: Record<
    string,
    { path: string[]; n: number; km: number; years: Record<string, number[]> }
  > = {};
  /** marka/model dali -> o dalda gorulmus tum etiket yollari */
  const branchPaths = new Map<string, string[][]>();

  let listingTotal = 0;
  let yearRows = 0;
  let skipped = 0;
  let noLabelPath = 0;
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

    /**
     * ETIKETLER KAYNAKTAN GELIR, SLUG'DAN DEGIL.
     *
     * Havuz kimligi slug'dir ve noktalama kaybeder: "1-5-tfsi". Slug'i
     * guzellestirmek "1 5 Tfsi" gibi UYDURMA bir ad uretir. Yayin dosyasi her
     * ilanla birlikte Sahibinden'in KENDI etiket yolunu tasir; gosterilen ad
     * odur. Yol uzunlugu havuz kimliginin segment sayisiyla birebir ortusur
     * (3557/3557 olculdu); ortusmezse havuz alinmaz, tahmin edilmez.
     */
    const labelPath = observations.find((o) =>
      Array.isArray(o.requestedTargetPath),
    )?.requestedTargetPath;
    if (!labelPath || labelPath.length !== node.split('/').length) {
      noLabelPath += 1;
      skipped += 1;
      continue;
    }

    // Motor icin emsal listesi: fiyatlar HAM, yil normalizasyonu motorun isi.
    // Hesap yil/km/fiyat uzerinden yurur; kimlik alanlari yalnizca tasiyicidir.
    const listings = observations.map((o) => ({
      make: labelPath[0],
      model: labelPath[1] || '',
      variant: labelPath[2] || '',
      trim: labelPath[labelPath.length - 1] || '',
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
      const at = (q: number) =>
        kms[Math.min(kms.length - 1, Math.floor(kms.length * q))];
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
      path: labelPath,
      n: observations.length,
      km: Math.round(learnKmDecayPer10k(observations) * 10_000) / 10_000,
      years,
    };
    listingTotal += observations.length;

    const branchKey = node.split('/').slice(0, 2).join('/');
    if (!branchPaths.has(branchKey)) branchPaths.set(branchKey, []);
    branchPaths.get(branchKey)!.push(labelPath);
  }

  const levels: Record<string, LevelKind[]> = {};
  for (const [branchKey, paths] of branchPaths) {
    const kinds = classifyBranchLevels(paths, paths[0][1] || '');
    if (kinds.length > 0) levels[branchKey] = kinds;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    hierarchyVersion: pointer.hierarchyVersion,
    source: 'sahibinden',
    poolCount: Object.keys(pools).length,
    listingCount: listingTotal,
    yearRowCount: yearRows,
    levels,
    pools,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload), 'utf-8');
  const bytes = fs.statSync(outPath).size;

  const kindCount: Record<string, number> = {};
  for (const kinds of Object.values(levels)) {
    for (const k of kinds) kindCount[k] = (kindCount[k] || 0) + 1;
  }

  process.stdout.write('\nDEMO VERI SETI HAZIR\n');
  process.stdout.write(`  dosya        : ${outPath}\n`);
  process.stdout.write(`  boyut        : ${(bytes / 1048576).toFixed(2)} MB\n`);
  process.stdout.write(`  havuz        : ${payload.poolCount}\n`);
  process.stdout.write(`  yil satiri   : ${payload.yearRowCount}\n`);
  process.stdout.write(`  temsil ilan  : ${payload.listingCount}\n`);
  process.stdout.write(`  marka/model  : ${Object.keys(levels).length} dal\n`);
  process.stdout.write(`  seviye tipi  : ${JSON.stringify(kindCount)}\n`);
  process.stdout.write(
    `  atlanan havuz: ${skipped} (etiket yolu yok: ${noLabelPath})\n`,
  );
}

main();
