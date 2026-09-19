/**
 * DEMO VERI SETI URETICI — Vercel'e gidecek KUCUK dosya.
 *
 * KATALOG ile FIYAT AYRI KAYNAKTAN GELIR.
 *
 * Eskiden bu script yalnizca YAYINLANAN PIYASA DOSYASINI okuyordu ve secim
 * agacini da oradan turetiyordu. Yayin dosyasi ise haftalik taramanin O ANA
 * KADAR ZIYARET ETTIGI hedeflerden olusur; tarama alfabetik ilerledigi icin
 * dosya `opel/corsa/1-3-cdti/enjoy-111` hedefinde kesiliyordu. Sonuc: Opel
 * yalnizca Corsa-e'ye kadar, marka listesi de Opel'e kadar gorunuyordu —
 * Insignia (2.186 ilan), Vectra (2.706), Peugeot, Renault, Toyota,
 * Volkswagen, Volvo... hepsi dropdown'dan SESSIZCE dusuyordu. Arac var,
 * ilani var, hiyerarside var; sadece taramanin sirasi oraya gelmemisti.
 *
 * Secim agaci taramanin nerede oldugunu YANSITMAMALIDIR. Bu yuzden:
 *
 *   KATALOG  <- yayinlanan HIYERARSI artefakti (kaynak kanitinin tamami)
 *   FIYAT    <- yayinlanan PIYASA dosyasi (o ana kadarki emsal kaniti)
 *
 * Katalogda olup fiyati olmayan bir arac EKRANDA KALIR; fiyat yerine neden
 * gosterilemedigi soylenir. Arac gizlenmez.
 *
 * NEDEN KUCUK DOSYA: yayinlanan piyasa artefakti 151 MB'dir (184.000 ilan).
 * Vercel'e konamaz. Ama demoda kisiler KENDI araclarini deneyecek, yani
 * elimizde tum havuzlar bulunmali.
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
import {
  MANUAL_REVIEW_CODES,
  MANUAL_REVIEW_REASONS,
  PRICING_LIMITS,
} from '../evaluation/pricing-config';
import { RobustPricingCalculator } from '../evaluation/robust-pricing-calculator';
import { fmvAtMileage } from '../../../frontend/src/lib/demo-pricing';
import type { CatalogWire } from '../../../frontend/src/lib/demo-selection';
import {
  buildYearCurve,
  learnAnnualDepreciation,
  selectYearEvidence,
} from '../evaluation/year-evidence';
import {
  loadArtifact,
  resolveArtifactPath,
} from '../vehicle-hierarchy/hierarchy-source';
import { activeHierarchyReleaseDir } from '../vehicle-hierarchy/artifact-release';

import {
  loadDemoEvidence,
  type EvidenceResult,
  type Observation,
  type ReleaseArtifact,
} from '../vehicle-hierarchy/demo-evidence';

/**
 * VARLIK ile FIYATLANABILIRLIK AYRI SEYLERDIR.
 *
 * Eskiden bir yil, kendi ilan sayisi 3 in altindaysa veri setine HIC
 * yazilmiyordu; havuz da 5 ilanin altindaysa tamamen dusuyordu. Boylece
 * gercekten var olan model yillari (Audi A3 Sedan 1.5 TFSI Sport Line 2017,
 * 2 ilan) ekranda hic gorunmuyor, kullanici o araci hic secemiyordu.
 *
 * Artik ilani olan her havuz ve her yil veri setine girer. Az kanitli bir
 * yil GORUNUR; fiyatin uretilip uretilmeyecegine ve ne kadar guvenle
 * sunulacagina fiyat katmani karar verir.
 *
 * Bu esik yalnizca FIYAT HAVUZUNU baglar. Aracin SECILEBILIR olmasi
 * katalogdan gelir ve bu esikten etkilenmez.
 */
const MIN_LISTINGS_PER_POOL = 1;

/**
 * Uretilen fiyatin, hedef yilin KENDI gozlemlerinden ayrilabilecegi en
 * buyuk oran. Olculen: >=5 dogrudan ilani olan satirlarda sapma medyani
 * %2,0 / p90 %8,1 / p99 %19,6. Bu esik normal degiskenligin disindadir.
 */
const MAX_EVIDENCE_GAP = 0.35;

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
 * Model adi oneki atilmis etiket: "CLK 200" -> "200", "A3 Sedan" -> "Sedan".
 *
 * Onek tek basina seviyenin ne oldugunu SOYLEMEZ. Audi kasayi model adiyla
 * yazar (A3 Sedan), Mercedes ise motoru (CLK 200). Ayirt eden sey onekten
 * SONRA kalan kisimdir.
 */
function withoutModelPrefix(label: string, model: string): string {
  if (!startsWithModel(label, model)) return label;
  return label.slice(model.length).trim();
}

/**
 * SEVIYELERIN ANLAMI KANITTAN CIKARILIR.
 *
 * Kaynak veride seviye tipi yoktur ve konum sabit degildir; "3. segment
 * motordur" demek tam da bu hatanin kaynagiydi (Audi'de kasa, BMW'de alt
 * model). Her marka/model dalinda o seviyedeki ETIKETLERE bakilir:
 *
 *   - model onekli VE onekten sonrasi motor imzasi tasimiyorsa kasa
 *     (A3 -> "A3 Sedan"); altinda baska seviye yoksa kasa degil, seri/tip
 *     ayrimidir (RS -> "RS 7", 300 -> "300 CE").
 *   - hacim/motor imzasi tasiyorsa motor seviyesidir ("1.5 TFSI",
 *     "eDrive 40"); model oneki de olsa bu gecerlidir (CLK -> "CLK 200").
 *   - daldaki EN DERIN seviye ve etiketler cogunlukla RAKAMSIZ ise
 *     paket/donanimdir ("Advanced", "M Sport", "TS").
 *   - hicbiri belirgin cogunluk degilse seri/tip olarak birakilir
 *     (BMW "M Serisi" -> "M3 | M4 | M5"; Jaguar XJ'de paket ve motor ayni
 *     seviyede karisir). Yanlis bir ad vermektense notr kalmak dogrudur.
 */
function classifyBranchLevels(paths: string[][], model: string): LevelKind[] {
  const maxDepth = Math.max(...paths.map((p) => p.length));
  const kinds: LevelKind[] = [];
  /** Belirgin cogunluk esigi; altinda kalan seviye adlandirilmaz. */
  const MAJORITY = 0.6;

  for (let i = 2; i < maxDepth; i++) {
    const labels = [
      ...new Set(paths.filter((p) => p.length > i).map((p) => p[i])),
    ];
    if (labels.length === 0) {
      kinds.push('series');
      continue;
    }

    const isDeepest = i === maxDepth - 1;
    const share = (predicate: (label: string) => boolean) =>
      labels.filter(predicate).length / labels.length;

    const engineShare = share(
      (l) =>
        looksLikeEngine(l) || looksLikeEngine(withoutModelPrefix(l, model)),
    );
    const bodyShare = share(
      (l) =>
        startsWithModel(l, model) &&
        !looksLikeEngine(withoutModelPrefix(l, model)),
    );
    const digitShare = share((l) => /\d/.test(l));

    if (bodyShare > MAJORITY) {
      kinds.push(isDeepest ? 'series' : 'body');
    } else if (engineShare > MAJORITY) {
      kinds.push('engine');
    } else if (isDeepest && digitShare <= 0.5) {
      kinds.push('package');
    } else {
      kinds.push('series');
    }
  }

  return kinds;
}

interface CatalogSourceNode {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  pathSegments: string[];
  totalListingCount: number;
}

/**
 * KATALOG — hiyerarsinin TAMAMI, kirpilmadan.
 *
 * Fiyat havuzu olup olmadigina BAKILMAZ. Bir dal kaynakta varsa demoda da
 * vardir; Opel Manta'nin (kaynakta 0 ilan) secilebilir olmasi ile Opel
 * Insignia'nin (2.008 ilan) secilebilir olmasi ayni kuraldan gelir.
 *
 * KIMLIK TAM YAZILIR. Ilk surumde yalnizca son segment tasiniyor, kimlik
 * "ebeveyn + '/' + segment" diye kuruluyordu. Hiyerarside 14 dugumde bu kural
 * gecersizdir: "206" ve "206 +" ayri modellerdir, ikisi de `peugeot/206`
 * slug'ina duser, ikincisi `peugeot/206-2` olur ama COCUKLARI etiket
 * slug'indan uretildigi icin `peugeot/206/1-4` olarak kalir. Kimlik bu yuzden
 * BIR YOL DEGIL, opak anahtardir; agac `parentId`den kurulur.
 */
function buildCatalogWire(nodes: CatalogSourceNode[]): {
  wire: CatalogWire[];
  labelPathsByBranch: Map<string, string[][]>;
  leafCount: number;
} {
  const childrenOf = new Map<string | null, CatalogSourceNode[]>();
  for (const node of nodes) {
    const key = node.parentId ?? null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(node);
  }
  for (const group of childrenOf.values()) {
    group.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }

  /** model dugumunun KIMLIGI -> o daldaki tum YAPRAK etiket yollari */
  const labelPathsByBranch = new Map<string, string[][]>();
  let leafCount = 0;

  /** `branchId` daldaki DEPTH-1 atanin kimligi; kimlikten kesilerek bulunamaz. */
  const emit = (node: CatalogSourceNode, branchId: string): CatalogWire => {
    const kids = childrenOf.get(node.id) ?? [];
    const branch = node.depth === 1 ? node.id : branchId;
    if (kids.length === 0) {
      leafCount += 1;
      if (node.depth >= 2 && branch) {
        if (!labelPathsByBranch.has(branch)) labelPathsByBranch.set(branch, []);
        labelPathsByBranch.get(branch)!.push(node.pathSegments);
      }
      return [node.id, node.name, node.totalListingCount];
    }
    return [
      node.id,
      node.name,
      node.totalListingCount,
      kids.map((kid) => emit(kid, branch)),
    ];
  };

  const wire = (childrenOf.get(null) ?? []).map((root) => emit(root, ''));
  return { wire, labelPathsByBranch, leafCount };
}

/** Kanit: hiyerarsi atamalari (korpus/DB) + haftalik yayin, motorun onceligiyle. */
function collectEvidence(
  backendRoot: string,
  nodes: CatalogSourceNode[],
): EvidenceResult {
  return loadDemoEvidence(
    {
      fs,
      path,
      hierarchyReleaseDir: activeHierarchyReleaseDir(backendRoot),
      backendRoot,
    },
    nodes,
    { required: true, minListingsPerPool: MIN_LISTINGS_PER_POOL },
  ) as EvidenceResult;
}

function countCatalog(wire: CatalogWire[]): { nodes: number; leaves: number } {
  let nodes = 0;
  let leaves = 0;
  const walk = (list: CatalogWire[]): void => {
    for (const entry of list) {
      nodes += 1;
      const kids = entry[3];
      if (kids && kids.length > 0) walk(kids);
      else leaves += 1;
    }
  };
  walk(wire);
  return { nodes, leaves };
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

  /**
   * KATALOG KAYNAGI: YAYINLANAN HIYERARSI.
   *
   * `resolveArtifactPath()` isaretciyi okur; kokteki eski `hierarchy.json`
   * degil, yayinlanan surum alinir.
   */
  const hierarchyPath = resolveArtifactPath();
  const artifact = loadArtifact(hierarchyPath);
  if (!artifact) {
    throw new Error(`Hiyerarsi artefakti okunamadi: ${hierarchyPath}`);
  }
  const hierarchyPointer = JSON.parse(
    fs.readFileSync(
      path.join(backendRoot, 'data/vehicle-hierarchy/current.json'),
      'utf-8',
    ),
  ) as { hierarchyVersion: string };

  /**
   * TAZELIK KAPISI. Piyasa dosyasi hangi hiyerarsi surumune gore toplandiysa
   * katalog da O surumden gelmelidir; yoksa havuz kimlikleri katalogda
   * bulunmayan dugumlere isaret eder ve sessizce yetim kalirlar.
   */
  if (hierarchyPointer.hierarchyVersion !== pointer.hierarchyVersion) {
    throw new Error(
      'Hiyerarsi surumu piyasa yayiniyla ortusmuyor:\n' +
        `  piyasa   : ${pointer.hierarchyVersion}\n` +
        `  hiyerarsi: ${hierarchyPointer.hierarchyVersion}\n` +
        'Once hiyerarsiyi yeniden yayinlayin (hierarchy:build).',
    );
  }

  const catalog = buildCatalogWire(artifact.nodes as CatalogSourceNode[]);
  const catalogPaths = new Map(
    artifact.nodes.map((n) => [n.id, n.pathSegments] as const),
  );
  process.stdout.write(
    `Katalog: ${artifact.nodes.length} dugum, ${catalog.leafCount} yaprak ` +
      `(${hierarchyPath})\n`,
  );
  process.stdout.write(`Yayin dosyasi okunuyor: ${pointer.release}\n`);
  const release = JSON.parse(
    fs.readFileSync(
      path.join(publishedDir, 'versions', pointer.release),
      'utf-8',
    ),
  ) as ReleaseArtifact;

  const evidence = collectEvidence(backendRoot, artifact.nodes as CatalogSourceNode[]);
  const poolNames = [...evidence.byNode.keys()].sort();
  process.stdout.write(
    `Kanit: ${poolNames.length} yaprak ` +
      `(yayin ${evidence.fromRelease}, korpus/DB ${evidence.fromDatabase}, ` +
      `ikisi birden ${evidence.fromBoth})\n`,
  );

  const pools: Record<
    string,
    { n: number; km: number; years: Record<string, number[]> }
  > = {};

  let listingTotal = 0;
  let yearRows = 0;
  let skipped = 0;
  let orphanPools = 0;
  let done = 0;

  for (const node of poolNames) {
    done += 1;
    if (done % 250 === 0) {
      process.stdout.write(
        `  ${done}/${poolNames.length} havuz islendi, ${yearRows} yil satiri\n`,
      );
    }

    const observations: Observation[] = evidence.byNode.get(node) ?? [];

    if (observations.length < MIN_LISTINGS_PER_POOL) {
      skipped += 1;
      continue;
    }

    /**
     * ETIKET KATALOGDAN GELIR — HAVUZ ONU TASIMAZ.
     *
     * Eskiden gosterilen ad her havuza kopyalaniyordu (`pool.path`). Ayni
     * bilginin iki kopyasi zamanla birbirinden sapabilir; ustelik katalog
     * zaten kaynagin kendi yazimini tasir ve olculdu: 3577/3577 havuzda iki
     * kopya birebir ayniydi. Bu yuzden kimlik TEK yerde durur: katalog.
     *
     * Katalogda karsiligi olmayan bir havuz YETIMDIR — gosterilemez. Bu
     * normalde imkansizdir (havuz kimlikleri hiyerarsi yapraklaridir) ve
     * olursa gurultusuzce yutulmaz, sayilir ve rapor edilir.
     */
    const labelPath = catalogPaths.get(node);
    if (!labelPath) {
      orphanPools += 1;
      skipped += 1;
      continue;
    }

    /**
     * SEYREK YIL: KANIT YOK SAYILMAZ, ODUNC ALINIR.
     *
     * Havuzun kendi yil egrisi ve ogrenilen orani bir kez cikarilir; her
     * hedef yil icin +-2 yil icindeki ilanlar bu egriyle hedef yila
     * indirgenir ve yil uzakligina gore daha dusuk agirlik alir. Kural
     * canli motorun kullandigi kuralin AYNISIDIR (year-evidence.ts);
     * demoya ozel ikinci bir fiyat mantigi YOKTUR.
     */
    const { rate } = learnAnnualDepreciation(
      observations.map((o) => ({ year: o.year, price: o.price })),
    );
    const yearCurve = buildYearCurve(
      observations.map((o) => ({ year: o.year, price: o.price })),
    );

    const byYear = new Map<number, Observation[]>();
    for (const o of observations) {
      if (!byYear.has(o.year)) byYear.set(o.year, []);
      byYear.get(o.year)!.push(o);
    }

    const years: Record<string, number[]> = {};
    for (const [year, group] of [...byYear.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      /**
       * Kanit secimi CANLI MOTORLA AYNI kuraldan gelir (year-evidence.ts):
       * once yilin kendi ilanlari, yetmezse +-1, sonra +-2 yil.
       */
      const evidence = selectYearEvidence(observations, year, {
        rate,
        curve: yearCurve,
        minCount: PRICING_LIMITS.minCompCountForPricing,
      });
      if (evidence.length === 0) continue;

      const directCount = group.length;
      const borrowedCount = evidence.length - directCount;
      /**
       * ETKIN KANIT: agirliklarin toplami. Odunc alinan ilan sayilir ama
       * dogrudan gozlemle ESIT sayilmaz; guven skoru bu sayidan turer,
       * ham ilan adedinden degil.
       */
      const effectiveCount =
        Math.round(evidence.reduce((sum, e) => sum + e.weight, 0) * 100) / 100;

      // Fiyatlar hedef yila indirgendi; kimlik alanlari yalnizca tasiyicidir.
      const listings = evidence.map((e) => ({
        make: labelPath[0],
        model: labelPath[1] || '',
        variant: labelPath[2] || '',
        trim: labelPath[labelPath.length - 1] || '',
        year,
        mileageKm: e.observation.mileage,
        price: e.price,
        listingDate: e.observation.listingDate,
      }));
      const listingWeights = evidence.map((e) => e.weight);

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
      const kms = evidence
        .map((e) => e.observation.mileage)
        .sort((a, b) => a - b);
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
        const runs = points.map((mileage) =>
          RobustPricingCalculator.computeValuation({
            cleanListings: listings,
            userYear: year,
            userMileage: mileage,
            matchedLevel: 1,
            baseConfidenceScore: 0.9,
            listingWeights,
          }),
        );
        const fmvs = runs.map((r) => Math.round(r.fairMarketValue));
        if (fmvs.some((v) => !v || v <= 0)) continue;

        /**
         * YAYILIM: emsallerin ceyrekler acikligi / medyan.
         *
         * Motor bu sayiyi zaten uretir ve guven skorunu onunla dusurur.
         * Demo tasimadigi icin, 4,75 ile 13,5 milyon arasina dagilmis dort
         * ilandan cikan sayiyi 40 ilanlik bir havuz kadar emin gosteriyordu.
         * Medyan km noktasindaki deger saklanir.
         */
        const verdict = runs[1];
        const audit = verdict.pricingAudit as
          { dispersion?: number } | undefined;
        const dispersion = Number((audit?.dispersion ?? 0).toFixed(3));

        /**
         * MOTORUN KARARI DA TASINIR — yalnizca sayisi degil.
         *
         * Eskiden yalnizca `fairMarketValue` saklaniyor, guven skoru ve
         * manuel onay karari tarayicida ilan sayisindan YENIDEN
         * uretiliyordu. Sonuc: motorun "bu araci otomatik fiyatlayamam"
         * dedigi satirlar demoda kesin bir fiyat olarak gorunuyordu
         * (olculen: 1.126 satir). Karar motorundur.
         */
        const confidence = Math.round(verdict.confidenceScore ?? 0);
        let manualCode = 0;
        if (verdict.requiresManualApproval) {
          const index = MANUAL_REVIEW_CODES.findIndex(
            (key) =>
              MANUAL_REVIEW_REASONS[key] === verdict.manualApprovalReason,
          );
          if (index < 0) {
            throw new Error(
              'Bilinmeyen manuel degerlendirme gerekcesi: ' +
                String(verdict.manualApprovalReason),
            );
          }
          manualCode = index + 1;
        }

        /**
         * HEDEF YILIN KENDI GOZLEMIYLE UZLASMA KONTROLU.
         *
         * Komsu yillardan kanit odunc almak sayiyi iyilestirir, ama tek bir
         * dogrudan gozlemi tamamen ezebilir: 2011 Aston Martin DB9 icin
         * kayitli TEK ilan 6.367 km / 13.500.000 TL iken komsu yillardan
         * gelen emsaller fiyati 6.795.000 TL gosteriyordu. Sayi savunulamaz
         * degil ama KESIN de degildir.
         *
         * Karsilastirma AYNI kilometrede yapilir: motor, yilin kendi
         * ilanlarinin medyan kilometresinde calistirilip o yilin gozlenen
         * medyan fiyatiyla olculur. Olculen: >=5 dogrudan ilani olan
         * satirlarda sapma p99 %19,6 -- yani %35 esigi normal degiskenligin
         * cok uzaginda kalir ve yalnizca uzlasmayan satirlari isaretler.
         */
        if (manualCode === 0 && group.length > 0) {
          const directKm = median(group.map((o) => o.mileage));
          const directPrice = median(group.map((o) => o.price));
          // EKRANIN gosterecegi sayi ile olculur: tarayici km egrisini
          // log-interpolasyonla okur ve +-%35 ile kirpar. Motoru ayrica
          // calistirmak, kullanicinin hic gormedigi bir sayiyi olcerdi.
          const atDirectKm = fmvAtMileage(
            [points[0], points[1], points[2]],
            [fmvs[0], fmvs[1], fmvs[2]],
            directKm,
          );

          const gap =
            directPrice > 0
              ? Math.abs(atDirectKm - directPrice) / directPrice
              : 0;
          if (gap > MAX_EVIDENCE_GAP) {
            manualCode = MANUAL_REVIEW_CODES.indexOf('EVIDENCE_CONFLICT') + 1;
          }
        }
        // [km1, km2, km3, fmv1, fmv2, fmv3, dogrudan, odunc, etkin,
        //  yayilim, motor guveni, manuel gerekce kodu]
        years[String(year)] = [
          Math.round(points[0]),
          Math.round(points[1]),
          Math.round(points[2]),
          fmvs[0],
          fmvs[1],
          fmvs[2],
          directCount,
          borrowedCount,
          effectiveCount,
          dispersion,
          confidence,
          manualCode,
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
      n: observations.length,
      km: Math.round(learnKmDecayPer10k(observations) * 10_000) / 10_000,
      years,
    };
    listingTotal += observations.length;
  }

  /**
   * SEVIYE ADLARI KATALOGDAN CIKAR — HAVUZLARDAN DEGIL.
   *
   * Eskiden yalnizca fiyat havuzu olan dallar siniflandiriliyordu; havuzu
   * olmayan dalin dropdown basligi "Seri / Tip" diye notr kaliyordu. Katalog
   * tum dallari tasidigi icin siniflandirma da tum dallari kapsar.
   */
  const levels: Record<string, LevelKind[]> = {};
  for (const [branchKey, paths] of catalog.labelPathsByBranch) {
    const kinds = classifyBranchLevels(paths, paths[0][1] || '');
    if (kinds.length > 0) levels[branchKey] = kinds;
  }

  const counted = countCatalog(catalog.wire);
  const payload = {
    generatedAt: new Date().toISOString(),
    hierarchyVersion: pointer.hierarchyVersion,
    marketRelease: pointer.release,
    source: 'sahibinden',
    catalogNodeCount: counted.nodes,
    catalogLeafCount: counted.leaves,
    poolCount: Object.keys(pools).length,
    listingCount: listingTotal,
    yearRowCount: yearRows,
    levels,
    catalog: catalog.wire,
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
  process.stdout.write(
    `  katalog      : ${payload.catalogNodeCount} dugum, ` +
      `${payload.catalogLeafCount} yaprak\n`,
  );
  process.stdout.write(
    `  fiyat havuzu : ${payload.poolCount} ` +
      `(katalog yapraklarinin %${(
        (payload.poolCount / Math.max(1, payload.catalogLeafCount)) *
        100
      ).toFixed(1)}'i)\n`,
  );
  process.stdout.write(`  yil satiri   : ${payload.yearRowCount}\n`);
  process.stdout.write(`  temsil ilan  : ${payload.listingCount}\n`);
  process.stdout.write(`  marka/model  : ${Object.keys(levels).length} dal\n`);
  process.stdout.write(`  seviye tipi  : ${JSON.stringify(kindCount)}\n`);
  process.stdout.write(
    `  fiyatsiz havuz: ${skipped} (katalog disi: ${orphanPools})\n`,
  );
  if (orphanPools > 0) {
    throw new Error(
      `${orphanPools} fiyat havuzu katalogda yok — hiyerarsi ile piyasa ` +
        'yayini ayni surumden gelmiyor.',
    );
  }
}

main();
