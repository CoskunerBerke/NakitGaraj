/**
 * BILINEN ILAN REFERANSI — SNAPSHOT'TAN HAFIF PARMAK IZI (SALT OKUNUR).
 *
 * Hizli yol (KNOWN_UNCHANGED) icin gereken tek sey her bilinen ilanin
 * fiyat/km/baslik ucludur. Bu modul snapshot'tan YALNIZCA bu ucluyu okur ve
 * bellekte bir haritaya koyar; boylece sayfa paketi islenirken senkron ve
 * I/O'suz karar verilir.
 *
 * SALT OKUNURLUK: bu sinif disariya HICBIR yazma yuzeyi acmaz. open() aninda
 * dosya boyutu+mtime kaydedilir; assertUnmutated() kosu sonunda "DB MODIFIED:
 * NO" kaniti uretir.
 */
import * as fs from 'fs';
import { SnapshotMutationForbiddenError } from '../contracts';
import { ReferenceFingerprint } from '../known-fingerprint';
import { resolveSnapshotPath } from '../snapshot-reference';
import { ReferenceLookup } from './autopilot-session';

const PAGE_SIZE = 5000;

export interface SnapshotFingerprintScope {
  /** Snapshot'taki `source` degeri (orn. "SAHIBINDEN_HTML"). */
  source: string;
  /** Bos ise TUM markalar yuklenir. */
  canonicalMakes?: string[];
}

export class SnapshotFingerprintLookup implements ReferenceLookup {
  private readonly rows = new Map<string, ReferenceFingerprint>();
  private client: any = null;
  private fingerprint: { size: number; mtimeMs: number } | null = null;

  constructor(private readonly dbPath: string = resolveSnapshotPath()) {}

  get size(): number {
    return this.rows.size;
  }

  get path(): string {
    return this.dbPath;
  }

  async open(scope: SnapshotFingerprintScope): Promise<void> {
    if (!fs.existsSync(this.dbPath)) {
      throw new Error(`Snapshot DB not found at ${this.dbPath}`);
    }
    this.fingerprint = this.fingerprintNow();

    const { PrismaClient } = await import('@prisma/client');
    this.client = new PrismaClient({
      datasources: { db: { url: `file:${this.dbPath.replace(/\\/g, '/')}` } },
    });

    const where: any = { source: scope.source };
    if (scope.canonicalMakes && scope.canonicalMakes.length > 0) {
      where.canonicalMake = { in: scope.canonicalMakes };
    }

    // Imlecli sayfalama: 280k satir tek seferde belleğe cekilmez.
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.client.rawVehicleListing.findMany({
        where,
        select: { id: true, sourceListingId: true, price: true, mileageKm: true, rawTitle: true },
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (batch.length === 0) break;
      for (const row of batch) {
        this.rows.set(row.sourceListingId, {
          price: typeof row.price === 'number' ? row.price : null,
          mileage: typeof row.mileageKm === 'number' ? row.mileageKm : null,
          title: row.rawTitle || '',
        });
      }
      cursor = batch[batch.length - 1].id;
      if (batch.length < PAGE_SIZE) break;
    }
  }

  get(sourceListingId: string): ReferenceFingerprint | null {
    return this.rows.get(sourceListingId) ?? null;
  }

  /** Kosu sonunda cagrilir: snapshot gercekten degismedi mi. */
  assertUnmutated(): void {
    if (!this.fingerprint) return;
    const now = this.fingerprintNow();
    if (now.size !== this.fingerprint.size || now.mtimeMs !== this.fingerprint.mtimeMs) {
      throw new SnapshotMutationForbiddenError(`snapshot file changed during run (${this.dbPath})`);
    }
  }

  async close(): Promise<void> {
    await this.client?.$disconnect();
    this.client = null;
  }

  private fingerprintNow() {
    const stat = fs.statSync(this.dbPath);
    return { size: stat.size, mtimeMs: stat.mtimeMs };
  }
}
