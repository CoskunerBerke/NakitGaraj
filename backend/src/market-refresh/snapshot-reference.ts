/**
 * SNAPSHOT REFERANSI — V1'DE SALT OKUNUR.
 *
 * Diff, kopyalanmis snapshot DB'sine karsi kosulur ve ONU DEGISTIRMEZ.
 *
 * DURUSTLUK NOTU: Prisma'nin SQLite baglayicisinda "read-only" bir baglanti
 * parametresi YOKTUR. Bu yuzden salt okunurluk uc katmanla saglanir:
 *   1) Bu modul disariya HICBIR yazma yuzeyi acmaz (yalnizca count/findMany).
 *   2) Mutasyon yardimcilari cagrilirsa SnapshotMutationForbiddenError firlar.
 *   3) open() sirasinda dosya boyutu+mtime kaydedilir; assertUnmutated() bunu
 *      dogrular ve rapora DB MODIFIED: NO kaniti olarak yazilir.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SnapshotMutationForbiddenError } from './contracts';

export interface SnapshotListing {
  source: string;
  sourceListingId: string;
  price: number | null;
  mileageKm: number | null;
  year: number | null;
  canonicalMake: string | null;
  canonicalModel: string | null;
}

export interface SnapshotScope {
  /** Kaynakta gozlenen marka adlari; MISSING sinifi bu kapsamla sinirlidir. */
  makes: string[];
  /**
   * Model AILESI adlari (ornek: "A3"). Verilirse referans kapsami markaya
   * DEGIL, o aileye daraltilir: canonicalModel ya ailenin kendisidir ya da
   * "aile " ile baslar ("A3 A3 Sportback", "A3 A3 Hatchback"). Bu, eslesticinin
   * token-sinirli model eslemesiyle ayni ruhtadir ve altin kapsami (Audi A3)
   * TUM Audi'den ayirir. Bos ise yalniz marka uygulanir.
   */
  families?: string[];
}

/** canonicalModel, verilen ailelerden birine ait mi (kendisi ya da onek). */
function modelInFamilies(model: string, families: string[]): boolean {
  const m = String(model || '').toLowerCase().trim();
  return families.some((f) => {
    const fl = f.toLowerCase().trim();
    return m === fl || m.startsWith(fl + ' ') || m.endsWith(' ' + fl) || m.includes(' ' + fl + ' ');
  });
}

export interface SnapshotReader {
  totalCount(): Promise<number>;
  findBySourceIds(source: string, ids: string[]): Promise<SnapshotListing[]>;
  /** Kapsam icindeki mevcut kayitlar — MISSING tespiti icin. */
  findByScope(source: string, scope: SnapshotScope): Promise<SnapshotListing[]>;
  describe(): { kind: string; path: string | null };
  close(): Promise<void>;
}

/** Snapshot yolu: makineye sabitlenmez, modul koken alinir veya env ile verilir. */
export const SNAPSHOT_ENV_VAR = 'MARKET_REFRESH_SNAPSHOT_DB';

export function resolveSnapshotPath(): string {
  const fromEnv = process.env[SNAPSHOT_ENV_VAR];
  if (fromEnv && fromEnv.trim()) return path.resolve(fromEnv.trim());
  return path.resolve(__dirname, '../../prisma/dev.db');
}

/** Fixture/test okuyucusu — DB gerektirmez. */
export class InMemorySnapshotReader implements SnapshotReader {
  constructor(private readonly rows: SnapshotListing[]) {}

  async totalCount(): Promise<number> {
    return this.rows.length;
  }

  async findBySourceIds(source: string, ids: string[]): Promise<SnapshotListing[]> {
    const wanted = new Set(ids);
    return this.rows.filter((r) => r.source === source && wanted.has(r.sourceListingId));
  }

  async findByScope(source: string, scope: SnapshotScope): Promise<SnapshotListing[]> {
    const makes = new Set(scope.makes.map((m) => m.toLowerCase()));
    const families = scope.families || [];
    return this.rows.filter(
      (r) =>
        r.source === source &&
        makes.has(String(r.canonicalMake || '').toLowerCase()) &&
        (families.length === 0 || modelInFamilies(String(r.canonicalModel || ''), families)),
    );
  }

  describe() {
    return { kind: 'in-memory', path: null };
  }

  async close(): Promise<void> {
    // no-op
  }
}

interface FileFingerprint {
  size: number;
  mtimeMs: number;
}

export class PrismaSnapshotReader implements SnapshotReader {
  private client: any = null;
  private fingerprint: FileFingerprint | null = null;

  constructor(private readonly dbPath: string = resolveSnapshotPath()) {}

  async open(): Promise<void> {
    if (!fs.existsSync(this.dbPath)) {
      throw new Error(`Snapshot DB not found at ${this.dbPath}`);
    }
    this.fingerprint = this.fingerprintNow();
    const { PrismaClient } = await import('@prisma/client');
    this.client = new PrismaClient({
      datasources: { db: { url: `file:${this.dbPath.replace(/\\/g, '/')}` } },
    });
  }

  private fingerprintNow(): FileFingerprint {
    const stat = fs.statSync(this.dbPath);
    return { size: stat.size, mtimeMs: stat.mtimeMs };
  }

  /** Diff sonrasi cagrilir: snapshot gercekten degismedi mi. */
  assertUnmutated(): void {
    if (!this.fingerprint) return;
    const now = this.fingerprintNow();
    if (now.size !== this.fingerprint.size || now.mtimeMs !== this.fingerprint.mtimeMs) {
      throw new SnapshotMutationForbiddenError(
        `snapshot file changed during run (${this.dbPath})`,
      );
    }
  }

  async totalCount(): Promise<number> {
    return this.require().rawVehicleListing.count();
  }

  async findBySourceIds(source: string, ids: string[]): Promise<SnapshotListing[]> {
    if (ids.length === 0) return [];
    const rows = await this.require().rawVehicleListing.findMany({
      where: { source, sourceListingId: { in: ids } },
      select: this.selection(),
    });
    return rows as SnapshotListing[];
  }

  async findByScope(source: string, scope: SnapshotScope): Promise<SnapshotListing[]> {
    if (scope.makes.length === 0) return [];
    const where: any = { source, canonicalMake: { in: scope.makes } };
    const families = scope.families || [];
    if (families.length > 0) {
      // canonicalModel ailenin kendisi ya da "<aile> ..." oneki. SQLite'ta
      // buyuk/kucuk harf duyarsizligini kalici veri karsilastirmasiyla
      // birakiyoruz; korpusta model adlari zaten tutarli bicimdedir.
      where.OR = families.flatMap((f) => [
        { canonicalModel: f },
        { canonicalModel: { startsWith: `${f} ` } },
      ]);
    }
    const rows = await this.require().rawVehicleListing.findMany({
      where,
      select: this.selection(),
    });
    return rows as SnapshotListing[];
  }

  private selection() {
    return {
      source: true,
      sourceListingId: true,
      price: true,
      mileageKm: true,
      year: true,
      canonicalMake: true,
      canonicalModel: true,
    };
  }

  describe() {
    return { kind: 'prisma-sqlite-readonly', path: this.dbPath };
  }

  /** V1'de yazma yolu YOKTUR; cagrilirsa acikca reddedilir. */
  write(): never {
    throw new SnapshotMutationForbiddenError('write to snapshot RawVehicleListing');
  }

  private require() {
    if (!this.client) throw new Error('PrismaSnapshotReader: open() must be called first');
    return this.client;
  }

  async close(): Promise<void> {
    await this.client?.$disconnect();
    this.client = null;
  }
}
