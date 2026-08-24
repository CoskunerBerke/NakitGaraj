/**
 * DRY-RUN DIFF — HIC MUTASYON YOK.
 *
 * Staging kayitlari snapshot'a KARSI karsilastirilir; hicbir tablo yazilmaz,
 * hicbir promosyon yapilmaz. Cikti yalnizca SAYIMDIR.
 *
 * SINIFLANDIRMA ONCELIGI:
 *   INVALID > DUPLICATE > NEW > PRICE_CHANGED > MILEAGE_CHANGED > UNCHANGED
 * Hem fiyat hem km degistiginde kayit PRICE_CHANGED sayilir (fiyat ekonomik
 * olarak belirleyicidir) ve ayrica priceAndMileageChanged sayacina islenir.
 * MISSING, snapshot kapsaminda olup bu kosuda HIC gozlenmeyen kayitlardir.
 */
import { RawObservedListing } from './contracts';
import { SnapshotListing, SnapshotReader, SnapshotScope } from './snapshot-reference';

export type DiffClass =
  | 'UNCHANGED'
  | 'NEW'
  | 'PRICE_CHANGED'
  | 'MILEAGE_CHANGED'
  | 'MISSING'
  | 'DUPLICATE'
  | 'INVALID';

export interface DiffCounts {
  UNCHANGED: number;
  NEW: number;
  PRICE_CHANGED: number;
  MILEAGE_CHANGED: number;
  MISSING: number;
  DUPLICATE: number;
  INVALID: number;
}

export interface DryRunDiffResult {
  counts: DiffCounts;
  totalObserved: number;
  totalComparable: number;
  priceAndMileageChanged: number;
  snapshotTotal: number;
  snapshotScopeSize: number;
  /** V1 sozlesmesi: her zaman false. */
  dbModified: false;
}

export function isInvalidObservation(record: RawObservedListing): boolean {
  if (!record.sourceListingId || !record.sourceListingId.trim()) return true;
  if (record.price === null || !Number.isFinite(record.price) || record.price <= 0) return true;
  if (record.year === null || !Number.isFinite(record.year)) return true;
  return false;
}

function emptyCounts(): DiffCounts {
  return {
    UNCHANGED: 0,
    NEW: 0,
    PRICE_CHANGED: 0,
    MILEAGE_CHANGED: 0,
    MISSING: 0,
    DUPLICATE: 0,
    INVALID: 0,
  };
}

export interface DryRunDiffInput {
  source: string;
  observations: RawObservedListing[];
  reader: SnapshotReader;
  scope: SnapshotScope;
}

export async function runDryRunDiff(input: DryRunDiffInput): Promise<DryRunDiffResult> {
  const { source, observations, reader, scope } = input;
  const counts = emptyCounts();
  let priceAndMileageChanged = 0;

  const seen = new Set<string>();
  const comparable: RawObservedListing[] = [];

  for (const record of observations) {
    if (isInvalidObservation(record)) {
      counts.INVALID += 1;
      continue;
    }
    const key = record.sourceListingId;
    if (seen.has(key)) {
      counts.DUPLICATE += 1;
      continue;
    }
    seen.add(key);
    comparable.push(record);
  }

  const existing = await reader.findBySourceIds(source, [...seen]);
  const existingById = new Map<string, SnapshotListing>(
    existing.map((row) => [row.sourceListingId, row]),
  );

  for (const record of comparable) {
    const prior = existingById.get(record.sourceListingId);
    if (!prior) {
      counts.NEW += 1;
      continue;
    }

    const priceChanged = prior.price !== null && record.price !== prior.price;
    const mileageChanged =
      record.mileage !== null && prior.mileageKm !== null && record.mileage !== prior.mileageKm;

    if (priceChanged && mileageChanged) {
      priceAndMileageChanged += 1;
      counts.PRICE_CHANGED += 1;
    } else if (priceChanged) {
      counts.PRICE_CHANGED += 1;
    } else if (mileageChanged) {
      counts.MILEAGE_CHANGED += 1;
    } else {
      counts.UNCHANGED += 1;
    }
  }

  // MISSING: kapsam icinde snapshot'ta olan ama bu kosuda hic gorulmeyen ilan.
  const scopeRows = await reader.findByScope(source, scope);
  for (const row of scopeRows) {
    if (!seen.has(row.sourceListingId)) counts.MISSING += 1;
  }

  return {
    counts,
    totalObserved: observations.length,
    totalComparable: comparable.length,
    priceAndMileageChanged,
    snapshotTotal: await reader.totalCount(),
    snapshotScopeSize: scopeRows.length,
    dbModified: false,
  };
}
