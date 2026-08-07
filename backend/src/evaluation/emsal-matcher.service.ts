import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface CleanListingItem {
  id?: string;
  make: string;
  model: string;
  variant?: string;
  trim?: string;
  year: number;
  mileageKm: number;
  price: number;
  bodyType?: string;
  fuelType?: string;
  transmission?: string;
  city?: string;
  title?: string;
  isDamaged?: boolean;
}

export interface EmsalMatchResult {
  level: number; // 1, 2, 3, or 4
  matchedCount: number;
  cleanListings: CleanListingItem[];
  confidenceScore: number;
  isLimitedComps: boolean;
  explanationNote: string;
  snapshotId?: string;
  weightedP5?: number;
  weightedP35?: number;
  weightedP50?: number;
  weightedP60?: number;
  weightedP95?: number;
  kmDecayPer10k?: number;
}

@Injectable()
export class EmsalMatcherService {
  constructor(private prisma: PrismaService) {}

  /**
   * Performs strict 4-Level Emsal Matching against real VehicleMarketSnapshot DB records
   */
  async matchComparableListings(params: {
    make: string;
    model: string;
    variant?: string;
    trim?: string;
    year: number;
    mileageKm: number;
    bodyType?: string;
    fuelType?: string;
    transmission?: string;
    isCleanCondition?: boolean;
  }): Promise<EmsalMatchResult> {
    const { make, model, variant, year, mileageKm, bodyType, fuelType, transmission } = params;

    // 1. Level 1: Exact Make, Model, Variant, Year (Requires full metadata presence)
    let snapshot = await this.querySnapshotFromDb({
      make,
      model,
      variant,
      yearExact: year,
    });

    if (snapshot && snapshot.matchedListingCount >= 5) {
      const cleanComps = this.convertSnapshotToCleanListings(snapshot, mileageKm);
      const dynamicScore = Math.min(99, Math.max(83, 85 + Math.floor(snapshot.matchedListingCount / 12)));

      return {
        level: 1,
        matchedCount: snapshot.matchedListingCount,
        cleanListings: cleanComps,
        confidenceScore: dynamicScore,
        isLimitedComps: false,
        explanationNote: `Seviye 1: ${make} ${model} ${variant || ''} (${year}) veritabanındaki ${snapshot.matchedListingCount} adet gerçek Sahibinden ilan emsaliyle tam eşleşti. (Snapshot ID: ${snapshot.id.slice(0, 8)})`,
        snapshotId: snapshot.id,
        weightedP5: snapshot.weightedP5,
        weightedP35: snapshot.weightedP35,
        weightedP50: snapshot.weightedP50,
        weightedP60: snapshot.weightedP60,
        weightedP95: snapshot.weightedP95,
        kmDecayPer10k: snapshot.kmDecayPer10k || 0.0025,
      };
    }

    // 2. Level 2: Year ±1 (Exact Make, Model, Variant with Weighted Snapshot Aggregation & Year Decay)
    let snapshotL2 = await this.queryWeightedSnapshotsFromDb({
      make,
      model,
      variant,
      yearMin: year - 1,
      yearMax: year + 1,
      userYear: year,
    });

    if (snapshotL2 && snapshotL2.matchedListingCount >= 5) {
      const cleanComps = this.convertSnapshotToCleanListings(snapshotL2, mileageKm);
      const dynamicScore = Math.min(88, Math.max(76, 78 + Math.floor(snapshotL2.matchedListingCount / 20)));
      return {
        level: 2,
        matchedCount: snapshotL2.matchedListingCount,
        cleanListings: cleanComps,
        confidenceScore: dynamicScore,
        isLimitedComps: false,
        explanationNote: `Seviye 2: ${make} ${model} ${variant || ''} (${year - 1}-${year + 1}) grubundaki ${snapshotL2.matchedListingCount} adet gerçek emsal ${snapshotL2.snapshotCount} snapshot birleştirilerek ve yıllık %8 değer kaybı düzeltmesi uygulanarak hesaplandı. (Snapshot ID: ${snapshotL2.id.slice(0, 8)})`,
        snapshotId: snapshotL2.id,
        weightedP5: snapshotL2.weightedP5,
        weightedP35: snapshotL2.weightedP35,
        weightedP50: snapshotL2.weightedP50,
        weightedP60: snapshotL2.weightedP60,
        weightedP95: snapshotL2.weightedP95,
        kmDecayPer10k: 0.0025,
      };
    }

    // 3. Level 3: Broader Model + Year range (Weighted Snapshot Aggregation)
    let snapshotL3 = await this.queryWeightedSnapshotsFromDb({
      make,
      model,
      yearMin: year - 2,
      yearMax: year + 2,
      userYear: year,
    });

    if (snapshotL3 && snapshotL3.matchedListingCount >= 3) {
      const cleanComps = this.convertSnapshotToCleanListings(snapshotL3, mileageKm);
      const dynamicScore = Math.min(78, Math.max(62, 65 + Math.floor(snapshotL3.matchedListingCount / 25)));
      return {
        level: 3,
        matchedCount: snapshotL3.matchedListingCount,
        cleanListings: cleanComps,
        confidenceScore: dynamicScore,
        isLimitedComps: false,
        explanationNote: `Seviye 3: ${make} ${model} genel model grubundaki ${snapshotL3.matchedListingCount} adet gerçek ilan emsali ağırlıklı ortalamayla hesaplandı. (Snapshot ID: ${snapshotL3.id.slice(0, 8)})`,
        snapshotId: snapshotL3.id,
        weightedP5: snapshotL3.weightedP5,
        weightedP35: snapshotL3.weightedP35,
        weightedP50: snapshotL3.weightedP50,
        weightedP60: snapshotL3.weightedP60,
        weightedP95: snapshotL3.weightedP95,
        kmDecayPer10k: 0.0025,
      };
    }

    // 4. Level 4 Fallback: No real DB listings found for this vehicle
    return {
      level: 4,
      matchedCount: 0,
      cleanListings: [],
      confidenceScore: 0,
      isLimitedComps: true,
      explanationNote: `Seviye 4: Yetersiz Veri! ${make} ${model} (${year}) için veritabanında henüz Sahibinden ilan kaydı bulunamadı.`,
    };
  }

  private async queryWeightedSnapshotsFromDb(filter: {
    make: string;
    model: string;
    variant?: string;
    yearExact?: number;
    yearMin?: number;
    yearMax?: number;
    userYear: number;
  }) {
    const { make, model, variant, yearExact, yearMin, yearMax, userYear } = filter;
    const whereClause: any = { make: { contains: make } };
    if (model) whereClause.model = { contains: model };
    if (variant) whereClause.variant = { contains: variant };
    if (yearExact) whereClause.year = yearExact;
    else if (yearMin && yearMax) whereClause.year = { gte: yearMin, lte: yearMax };

    const snapshots = await this.prisma.vehicleMarketSnapshot.findMany({
      where: whereClause,
      orderBy: { matchedListingCount: 'desc' },
      take: 10,
    });

    if (snapshots.length === 0) return null;

    let totalWeight = 0;
    let weightedCount = 0;
    let sumP5 = 0;
    let sumP35 = 0;
    let sumP50 = 0;
    let sumP60 = 0;
    let sumP95 = 0;

    for (const snap of snapshots) {
      const yearDiff = Math.abs(snap.year - userYear);
      const yearFactor = Math.pow(0.92, yearDiff); // 8% depreciation per year difference
      const weight = (snap.matchedListingCount || 1) * yearFactor;

      totalWeight += weight;
      weightedCount += snap.matchedListingCount;
      sumP5 += (snap.weightedP5 || snap.weightedP50 * 0.85) * weight;
      sumP35 += (snap.weightedP35 || snap.weightedP50 * 0.92) * weight;
      sumP50 += snap.weightedP50 * weight;
      sumP60 += (snap.weightedP60 || snap.weightedP50 * 1.02) * weight;
      sumP95 += (snap.weightedP95 || snap.weightedP50 * 1.15) * weight;
    }

    if (totalWeight <= 0) return null;

    return {
      id: snapshots[0].id,
      make: snapshots[0].make,
      model: snapshots[0].model,
      variant: snapshots[0].variant,
      year: userYear,
      matchedListingCount: weightedCount,
      weightedP5: Math.round(sumP5 / totalWeight),
      weightedP35: Math.round(sumP35 / totalWeight),
      weightedP50: Math.round(sumP50 / totalWeight),
      weightedP60: Math.round(sumP60 / totalWeight),
      weightedP95: Math.round(sumP95 / totalWeight),
      snapshotCount: snapshots.length,
    };
  }

  private async querySnapshotFromDb(filter: {
    make: string;
    model: string;
    variant?: string;
    yearExact?: number;
    yearMin?: number;
    yearMax?: number;
    bodyType?: string;
    fuelType?: string;
    transmission?: string;
  }) {
    const { make, model, variant, yearExact, yearMin, yearMax } = filter;

    const whereClause: any = {
      make: { contains: make },
    };

    if (model) {
      whereClause.model = { contains: model };
    }
    if (variant) {
      whereClause.variant = { contains: variant };
    }
    if (yearExact) {
      whereClause.year = yearExact;
    } else if (yearMin && yearMax) {
      whereClause.year = { gte: yearMin, lte: yearMax };
    }

    return await this.prisma.vehicleMarketSnapshot.findFirst({
      where: whereClause,
      orderBy: { matchedListingCount: 'desc' },
    });
  }

  private convertSnapshotToCleanListings(snapshot: any, userKm: number): CleanListingItem[] {
    const p35 = snapshot.weightedP35 || snapshot.weightedP50 * 0.92;
    const p50 = snapshot.weightedP50;
    const p60 = snapshot.weightedP60 || snapshot.weightedP50 * 1.02;
    const p5 = snapshot.weightedP5 || snapshot.weightedP50 * 0.85;
    const p95 = snapshot.weightedP95 || snapshot.weightedP50 * 1.15;

    // Convert real percentiles into representational clean listing array points
    const points = [p5, p35, p50, p60, p95];
    return points.map((price, idx) => ({
      id: `snapshot-${snapshot.id.slice(0, 8)}-p${idx}`,
      make: snapshot.make,
      model: snapshot.model,
      variant: snapshot.variant || '',
      year: snapshot.year,
      mileageKm: userKm,
      price: Math.round(price),
      bodyType: snapshot.bodyType || undefined,
      fuelType: snapshot.fuelType || undefined,
      transmission: snapshot.transmission || undefined,
      isDamaged: false,
    }));
  }
}
