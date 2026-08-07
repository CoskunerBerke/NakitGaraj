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
  referenceMedianMileage?: number;
  mileageAdjustmentSource?: string;
  yearAdjustmentSource?: string;
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

    // 1. Level 1: Exact Make, Model, Variant, Year (Exact String Equality)
    let snapshotRes = await this.querySnapshotFromDb({
      make,
      model,
      variant,
      yearExact: year,
    });

    if (snapshotRes && snapshotRes.snapshot && snapshotRes.snapshot.matchedListingCount >= 5) {
      const snapshot = snapshotRes.snapshot;
      const hasFullMetadata = snapshotRes.hasFullMetadata;

      let referenceMedianMileage: number | undefined;
      let mileageAdjustmentSource: string | undefined;

      if (snapshot.snapshotDataJson) {
        try {
          const parsed = JSON.parse(snapshot.snapshotDataJson);
          referenceMedianMileage = parsed.medianMileage;
          mileageAdjustmentSource = parsed.mileageAdjustmentSource;
        } catch (e) {}
      }

      const cleanComps = this.convertSnapshotToCleanListings(snapshot, mileageKm);

      // Section 4 Level 1: Check full metadata presence
      const baseScore = hasFullMetadata ? 95 : 88;
      const dynamicScore = Math.min(hasFullMetadata ? 99 : 92, Math.max(83, baseScore + Math.floor(snapshot.matchedListingCount / 12)));
      const levelAssigned = hasFullMetadata ? 1 : 2;

      return {
        level: levelAssigned,
        matchedCount: snapshot.matchedListingCount,
        cleanListings: cleanComps,
        confidenceScore: dynamicScore,
        isLimitedComps: false,
        explanationNote: `Seviye ${levelAssigned}: ${make} ${model} ${variant || ''} (${year}) veritabanındaki ${snapshot.matchedListingCount} adet gerçek Sahibinden ilan emsaliyle ${hasFullMetadata ? 'tam eşleşti (%99 Güven)' : 'kısmi metadata emsaliyle eşleşti (%92 Güven)'}. (Snapshot ID: ${snapshot.id.slice(0, 8)})`,
        snapshotId: snapshot.id,
        weightedP5: snapshot.weightedP5,
        weightedP35: snapshot.weightedP35,
        weightedP50: snapshot.weightedP50,
        weightedP60: snapshot.weightedP60,
        weightedP95: snapshot.weightedP95,
        kmDecayPer10k: snapshot.kmDecayPer10k || 0.0025,
        referenceMedianMileage: referenceMedianMileage || 100000,
        mileageAdjustmentSource: mileageAdjustmentSource || 'DEFAULT_FALLBACK',
        yearAdjustmentSource: 'NOT_APPLICABLE_EXACT_YEAR',
      };
    }

    // 2. Level 2: Year ±1 (Exact Make, Model, Variant with Price Normalization & Weighted Aggregation)
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
        explanationNote: `Seviye 2: ${make} ${model} ${variant || ''} (${year - 1}-${year + 1}) grubundaki ${snapshotL2.matchedListingCount} adet gerçek emsal ${snapshotL2.snapshotCount} snapshot birleştirilerek ve yıllık %${(snapshotL2.yearAdjustmentRate * 100).toFixed(1)} fiyat normalizasyonu (${snapshotL2.yearAdjustmentSource}) uygulanarak hesaplandı. (Snapshot ID: ${snapshotL2.id.slice(0, 8)})`,
        snapshotId: snapshotL2.id,
        weightedP5: snapshotL2.weightedP5,
        weightedP35: snapshotL2.weightedP35,
        weightedP50: snapshotL2.weightedP50,
        weightedP60: snapshotL2.weightedP60,
        weightedP95: snapshotL2.weightedP95,
        kmDecayPer10k: snapshotL2.kmDecayPer10k || 0.0025,
        referenceMedianMileage: snapshotL2.medianMileage || 100000,
        mileageAdjustmentSource: snapshotL2.mileageAdjustmentSource || 'DEFAULT_FALLBACK',
        yearAdjustmentSource: snapshotL2.yearAdjustmentSource,
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
        kmDecayPer10k: snapshotL3.kmDecayPer10k || 0.0025,
        referenceMedianMileage: snapshotL3.medianMileage || 100000,
        mileageAdjustmentSource: snapshotL3.mileageAdjustmentSource || 'DEFAULT_FALLBACK',
        yearAdjustmentSource: snapshotL3.yearAdjustmentSource,
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
    const whereClause: any = { make: { equals: make.trim() } };
    if (model) whereClause.model = { equals: model.trim() };
    if (variant && variant.trim() !== '' && variant.trim() !== 'Standart' && variant.trim() !== 'FarkliVaryant') {
      whereClause.variant = { equals: variant.trim() };
    }
    if (yearExact) whereClause.year = yearExact;
    else if (yearMin && yearMax) whereClause.year = { gte: yearMin, lte: yearMax };

    const snapshots = await this.prisma.vehicleMarketSnapshot.findMany({
      where: whereClause,
      orderBy: { matchedListingCount: 'desc' },
      take: 10,
    });

    if (snapshots.length === 0) return null;

    // Learn year price ratio from adjacent snapshots (Section 4 Level 2)
    let yearAdjustmentRate = 0.08;
    let yearAdjustmentSource = 'DEFAULT_YEAR_ADJUSTMENT';

    if (snapshots.length >= 2) {
      const yearMap = new Map<number, number>();
      for (const s of snapshots) {
        if (s.weightedP50 > 0) yearMap.set(s.year, s.weightedP50);
      }
      const years = Array.from(yearMap.keys()).sort((a, b) => a - b);
      if (years.length >= 2) {
        const y1 = years[0];
        const y2 = years[years.length - 1];
        const p1 = yearMap.get(y1)!;
        const p2 = yearMap.get(y2)!;
        if (y2 > y1 && p1 > 0) {
          const annualRatio = Math.pow(p2 / p1, 1 / (y2 - y1)) - 1;
          if (annualRatio > 0.01 && annualRatio < 0.20) {
            yearAdjustmentRate = annualRatio;
            yearAdjustmentSource = 'LEARNED_YEAR_ADJUSTMENT';
          }
        }
      }
    }

    let totalWeight = 0;
    let weightedCount = 0;
    let sumP5 = 0;
    let sumP35 = 0;
    let sumP50 = 0;
    let sumP60 = 0;
    let sumP95 = 0;
    let medianMileage = 100000;
    let mileageAdjustmentSource = 'DEFAULT_FALLBACK';
    let kmDecayPer10k = 0.0025;

    for (const snap of snapshots) {
      const yearDiff = userYear - snap.year;
      const yearPriceFactor = 1 + (yearDiff * yearAdjustmentRate);
      const yearFactor = Math.pow(0.92, Math.abs(yearDiff));
      const weight = (snap.matchedListingCount || 1) * yearFactor;

      if (snap.snapshotDataJson) {
        try {
          const parsed = JSON.parse(snap.snapshotDataJson);
          if (parsed.medianMileage) medianMileage = parsed.medianMileage;
          if (parsed.mileageAdjustmentSource) mileageAdjustmentSource = parsed.mileageAdjustmentSource;
          if (parsed.kmDecayPer10k) kmDecayPer10k = parsed.kmDecayPer10k;
        } catch (e) {}
      }

      totalWeight += weight;
      weightedCount += snap.matchedListingCount;
      sumP5 += (snap.weightedP5 || snap.weightedP50 * 0.85) * yearPriceFactor * weight;
      sumP35 += (snap.weightedP35 || snap.weightedP50 * 0.92) * yearPriceFactor * weight;
      sumP50 += snap.weightedP50 * yearPriceFactor * weight;
      sumP60 += (snap.weightedP60 || snap.weightedP50 * 1.02) * yearPriceFactor * weight;
      sumP95 += (snap.weightedP95 || snap.weightedP50 * 1.15) * yearPriceFactor * weight;
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
      medianMileage,
      mileageAdjustmentSource,
      kmDecayPer10k,
      yearAdjustmentRate,
      yearAdjustmentSource,
    };
  }

  private async querySnapshotFromDb(filter: {
    make: string;
    model: string;
    variant?: string;
    yearExact?: number;
    yearMin?: number;
    yearMax?: number;
  }) {
    const { make, model, variant, yearExact, yearMin, yearMax } = filter;

    const whereClause: any = {
      make: { equals: make.trim() },
    };

    if (model) {
      whereClause.model = { equals: model.trim() };
    }
    if (variant && variant.trim() !== '' && variant.trim() !== 'Standart' && variant.trim() !== 'FarkliVaryant') {
      whereClause.variant = { equals: variant.trim() };
    }
    if (yearExact) {
      whereClause.year = yearExact;
    } else if (yearMin && yearMax) {
      whereClause.year = { gte: yearMin, lte: yearMax };
    }

    const snapshot = await this.prisma.vehicleMarketSnapshot.findFirst({
      where: whereClause,
      orderBy: { matchedListingCount: 'desc' },
    });

    if (!snapshot) return null;

    const hasFullMetadata = Boolean(snapshot.bodyType && snapshot.fuelType && snapshot.transmission);

    return {
      snapshot,
      hasFullMetadata,
    };
  }

  private convertSnapshotToCleanListings(snapshot: any, userMileageKm: number): CleanListingItem[] {
    const p5 = snapshot.weightedP5 || Math.round(snapshot.weightedP50 * 0.85);
    const p35 = snapshot.weightedP35 || Math.round(snapshot.weightedP50 * 0.92);
    const p50 = snapshot.weightedP50;
    const p60 = snapshot.weightedP60 || Math.round(snapshot.weightedP50 * 1.02);
    const p95 = snapshot.weightedP95 || Math.round(snapshot.weightedP50 * 1.15);

    return [
      { id: `${snapshot.id}-p5`, make: snapshot.make, model: snapshot.model, variant: snapshot.variant, year: snapshot.year, mileageKm: userMileageKm, price: p5 },
      { id: `${snapshot.id}-p35`, make: snapshot.make, model: snapshot.model, variant: snapshot.variant, year: snapshot.year, mileageKm: userMileageKm, price: p35 },
      { id: `${snapshot.id}-p50`, make: snapshot.make, model: snapshot.model, variant: snapshot.variant, year: snapshot.year, mileageKm: userMileageKm, price: p50 },
      { id: `${snapshot.id}-p60`, make: snapshot.make, model: snapshot.model, variant: snapshot.variant, year: snapshot.year, mileageKm: userMileageKm, price: p60 },
      { id: `${snapshot.id}-p95`, make: snapshot.make, model: snapshot.model, variant: snapshot.variant, year: snapshot.year, mileageKm: userMileageKm, price: p95 },
    ];
  }
}
