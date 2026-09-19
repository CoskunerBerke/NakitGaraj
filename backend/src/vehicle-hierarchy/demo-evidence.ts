/**
 * DEMO FIYAT KANITI — CANLI MOTORLA AYNI IKI KAYNAKTAN, AYNI ONCELIKLE.
 *
 * SABITLENEN HATA: demo fiyati YALNIZCA yayinlanan piyasa dosyasindan
 * uretiyordu. O dosya haftalik taramanin o ana kadar ziyaret ettigi
 * hedeflerden olusur; tarama alfabetiktir ve `opel/corsa/1-3-cdti/enjoy-111`
 * hedefinde durmustu. Sonuc: `opel/corsa/1-5-td/eco` — korpusta 20 gecerli
 * ilani olan, katalogda gorunen bir arac — yil alani kapali halde "yeterli
 * guncel emsal bulunamadi" diyordu. Ilan vardi; onu okuyan kimse yoktu.
 *
 * Canli motor bu hatayi YAPMAZ, cunku havuzu iki kaynaktan kurar
 * (`vehicle-hierarchy.service.ts` > `pools()`):
 *
 *   TABAN  : hiyerarsi `listing-assignments` — korpustan/DB'den KESIN olarak
 *            bu dugume cozulmus ilanlar
 *   USTUNE : yayinlanan haftalik piyasa dosyasi — ayni ilan kimligi icin TAZE
 *            gozlem eskisini EZER
 *
 * Demo artik ayni birlesimi kullanir. Eklenen tek sey KAYNAK; fiyat matematigi
 * (yil kaniti, tahminci, guven, manuel onay) hic degismedi.
 *
 * DAL SIZINTISI YOKTUR: atamalar dugum kimligine baglidir, yani kanit yalnizca
 * TAM O yapragin kendi ilanlarindan gelir. Kardes paket/motor/kasa dallarindan
 * odunc alinmaz; yil odunclemesi de havuzun kendi icinde kalir.
 *
 * Bu modul hem veri setini ureten script hem de denetim tarafindan kullanilir:
 * "neyin fiyatlanabilir oldugu" ile "neyin fiyatlandigi" ayni tanimdan
 * olcusun diye. Iki ayri kopya olsaydi denetim kendi kendini onaylardi.
 */
import { PRICING_LIMITS } from '../evaluation/pricing-config';
import { hasStrongDamageSignal } from '../evaluation/listing-attributes';
import { isExactEvidence, type ListingEvidence } from './listing-resolver';

export interface Observation {
  year: number;
  mileage: number;
  price: number;
  listingDate?: string;
  requestedTargetPath?: string[];
}

/** RawVehicleListing'in fiyatlama icin gereken en kucuk yuzeyi. */
export interface EvidenceRow {
  id: string;
  title: string | null;
  damaged: number | boolean | null;
  year: number;
  mileage: number | null;
  price: number;
  scrapedAt?: number | string | Date | null;
}

export interface ReleaseArtifact {
  pools: Record<string, string[]>;
  assignments: Record<string, { sourceObservation?: Observation }>;
}

export interface EvidenceResult {
  byNode: Map<string, Observation[]>;
  /** Yalnizca haftalik yayindan kanit bulan yapraklar. */
  fromRelease: number;
  /** Yalnizca korpus/DB'den kanit bulan yapraklar — duzeltmenin kazandigi. */
  fromDatabase: number;
  fromBoth: number;
}

/**
 * Bir gozlemin fiyatlamaya girip giremeyecegi. Esikler MOTORUN esikleridir
 * (`emsal-matcher.service.ts`): fiyat akil araliginda olmali ve kilometre
 * bilinmeli. Demoya ozel ikinci bir gecerlilik kurali YOKTUR.
 */
export const isUsableObservation = (o: Observation): boolean =>
  o.year > 1980 &&
  o.price >= PRICING_LIMITS.priceSanityRange[0] &&
  o.price <= PRICING_LIMITS.priceSanityRange[1] &&
  o.mileage != null;

/**
 * Hasar kurali motorun kuralidir: baslik varsa basliga bakilir, yoksa
 * saklanan bayrak kullanilir.
 */
export const isDamagedRow = (row: EvidenceRow): boolean => {
  const title = (row.title || '').trim();
  if (title) return hasStrongDamageSignal(title);
  return row.damaged === 1 || row.damaged === true;
};

const toIsoDay = (value: EvidenceRow['scrapedAt']): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(Number(value) || String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
};

/**
 * Kanit birlestirme — SAF. Girdiler cagirana aittir; burada dosya okunmaz,
 * boylece kural testte birebir ayni kodla sinanir.
 *
 * `isLeaf` sarttir: havuzlar YAPRAKTADIR. Cocugu olan bir dugume fiyat
 * baglamak, kullanici secimini bitirmeden fiyat gostermek olurdu; secim
 * zinciri o dugumde devam ediyor (`audit_demo_pools.ts` > ONEK GOLGELEMESI).
 */
export function mergeEvidence(input: {
  assignments: Record<string, { nodeId: string; evidence: ListingEvidence }>;
  rows: Iterable<EvidenceRow>;
  release: ReleaseArtifact | null;
  isLeaf: (nodeId: string) => boolean;
  minListingsPerPool?: number;
}): EvidenceResult {
  const minimum = input.minListingsPerPool ?? 1;
  /** dugum -> (ilan kimligi -> gozlem); tekillestirme buradan gelir. */
  const perNode = new Map<string, Map<string, Observation>>();
  const add = (node: string, id: string, observation: Observation): boolean => {
    if (!isUsableObservation(observation)) return false;
    let bucket = perNode.get(node);
    if (!bucket) perNode.set(node, (bucket = new Map()));
    bucket.set(id, observation);
    return true;
  };

  // --- TABAN: hiyerarsinin korpustan/DB'den KESIN cozdugu ilanlar
  const nodeOfListing = new Map<string, string>();
  for (const [listingId, assignment] of Object.entries(input.assignments)) {
    if (!isExactEvidence(assignment.evidence)) continue;
    if (!input.isLeaf(assignment.nodeId)) continue;
    nodeOfListing.set(listingId, assignment.nodeId);
  }

  const nodesWithDb = new Set<string>();
  for (const row of input.rows) {
    const node = nodeOfListing.get(row.id);
    if (!node) continue;
    if (isDamagedRow(row)) continue;
    const added = add(node, row.id, {
      year: row.year,
      mileage: row.mileage as number,
      price: row.price,
      listingDate: toIsoDay(row.scrapedAt),
    });
    if (added) nodesWithDb.add(node);
  }

  // --- USTUNE: taze haftalik gozlem ayni kimlik icin eskisini EZER
  const nodesWithRelease = new Set<string>();
  for (const [node, ids] of Object.entries(input.release?.pools ?? {})) {
    if (!input.isLeaf(node)) continue;
    for (const id of ids) {
      const observation = input.release?.assignments[id]?.sourceObservation;
      if (!observation) continue;
      if (add(node, id, observation)) nodesWithRelease.add(node);
    }
  }

  const byNode = new Map<string, Observation[]>();
  for (const [node, bucket] of perNode) {
    if (bucket.size >= minimum) byNode.set(node, [...bucket.values()]);
  }
  return {
    byNode,
    fromRelease: [...nodesWithRelease].filter((n) => !nodesWithDb.has(n)).length,
    fromDatabase: [...nodesWithDb].filter((n) => !nodesWithRelease.has(n)).length,
    fromBoth: [...nodesWithDb].filter((n) => nodesWithRelease.has(n)).length,
  };
}

/** Yaprak testini hiyerarsi dugumlerinden kurar (cocugu olmayan = yaprak). */
export function leafTestOf(
  nodes: Array<{ id: string; parentId: string | null }>,
): (nodeId: string) => boolean {
  const parents = new Set(
    nodes.filter((n) => n.parentId).map((n) => n.parentId as string),
  );
  return (nodeId: string) => !parents.has(nodeId);
}

/** DB'den fiyatlama satirlarini okur; motorun WHERE kosulunun aynisi. */
export const EVIDENCE_ROW_SQL =
  'SELECT sourceListingId AS id, rawTitle AS title, isDamaged AS damaged,' +
  ' year, mileageKm AS mileage, price, scrapedAt' +
  " FROM RawVehicleListing WHERE parseStatus = 'VALID' AND price > 0";

/**
 * Kanit kaynaklarini diskten okuyup birlestirir — veri setini ureten script,
 * havuz denetimi, motor dogrulamasi ve kapsama denetimi AYNI cagriyi kullanir.
 *
 * Dort yerde dort kopya olsaydi biri otekinden sessizce ayrilirdi; nitekim bu
 * hatanin kendisi tam olarak buydu: uretici yayini okuyor, denetim de yayini
 * okuyor, ikisi de "her sey yerinde" diyordu — oysa korpusta 20 ilani olan
 * arac fiyatsizdi.
 *
 * `required` false iken atamalar/veritabani yoksa null doner (CI makinesi);
 * cagiran bunu RAPOR EDER, sessizce gecmez.
 */
export function loadDemoEvidence(
  deps: {
    fs: typeof import('fs');
    path: typeof import('path');
    /** Yayinlanan hiyerarsi surumunun klasoru. */
    hierarchyReleaseDir: string | null;
    backendRoot: string;
  },
  nodes: Array<{ id: string; parentId: string | null }>,
  options: { required?: boolean; minListingsPerPool?: number } = {},
): EvidenceResult | null {
  const { fs, path } = deps;
  const assignmentsPath = path.join(
    deps.hierarchyReleaseDir ?? '',
    'listing-assignments.json',
  );
  const dbPath = path.join(deps.backendRoot, 'prisma/dev.db');

  if (!fs.existsSync(assignmentsPath) || !fs.existsSync(dbPath)) {
    if (!options.required) return null;
    throw new Error(
      'Fiyat kaniti eksik kalirdi: listing-assignments veya veritabani yok.\n' +
        `  atamalar  : ${assignmentsPath}\n` +
        `  veritabani: ${dbPath}\n` +
        'Once "npm run listings:build" calistirin. Yalnizca haftalik yayindan ' +
        'uretmek, taramanin henuz ulasmadigi her araci fiyatsiz birakir.',
    );
  }

  const publishedDir = path.join(
    deps.backendRoot,
    'data/market-refresh/weekly/published',
  );
  let release: ReleaseArtifact | null = null;
  const pointerFile = path.join(publishedDir, 'current.json');
  if (fs.existsSync(pointerFile)) {
    const pointer = JSON.parse(fs.readFileSync(pointerFile, 'utf-8')) as {
      release: string;
    };
    const releaseFile = path.join(publishedDir, 'versions', pointer.release);
    if (fs.existsSync(releaseFile)) {
      release = JSON.parse(
        fs.readFileSync(releaseFile, 'utf-8'),
      ) as ReleaseArtifact;
    }
  }

  const assignments = (
    JSON.parse(fs.readFileSync(assignmentsPath, 'utf-8')) as {
      assignments: Record<
        string,
        { nodeId: string; evidence: ListingEvidence }
      >;
    }
  ).assignments;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true });
  try {
    return mergeEvidence({
      assignments,
      rows: db.prepare(EVIDENCE_ROW_SQL).all() as EvidenceRow[],
      release,
      isLeaf: leafTestOf(nodes),
      minListingsPerPool: options.minListingsPerPool,
    });
  } finally {
    db.close();
  }
}
