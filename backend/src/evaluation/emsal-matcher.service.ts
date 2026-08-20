import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PRICING_LIMITS, clamp } from './pricing-config';
import {
  deriveFuelFromEngineCode,
  deriveFuelType,
  deriveTransmission,
  foldTurkish,
  isEngineCompatible,
  normalizeBodyType,
  splitVariantString,
} from './listing-attributes';

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
  /** Yil normalizasyonu sonrasi hedef yila indirgenmis fiyat */
  normalizedPrice?: number;
  /** Tazelik * esleme kalitesi agirligi */
  weight?: number;
  listedAt?: Date | null;
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
  yearAdjustmentRate?: number;
  contributingSnapshotIds?: string[];
  level1CandidateCount?: number;
  level2CandidateCount?: number;
  level3CandidateCount?: number;
  actuallyUsedListingCount?: number;
  usedEngineDistribution?: Record<string, number>;
  usedTrimDistribution?: Record<string, number>;
  excludedListingCount?: number;
  exclusionReasons?: string[];
  /** Emsal fiyatlarinin agirliklari (calculator ile ayni sirada) */
  listingWeights?: number[];
  /** 0..1 tazelik skoru */
  freshnessScore?: number;
  /** 0..1 havuzdaki birebir motor eslesme orani */
  engineExactShare?: number;
  /** 0..1 yakiti bilinen emsal orani */
  fuelKnownShare?: number;
  /** 0..1 sanzimani bilinen emsal orani */
  transmissionKnownShare?: number;
  /** Emsal listesinin gercek ilan ID sayisi (mukerrer elendikten sonra) */
  uniqueListingIds?: string[];
  /**
   * Hedefin kasasi BILINMIYOR ve havuzdaki kasalar fiyat olarak anlamli
   * ayrisiyor -> otomatik fiyat guvenilir degil (otomasyon guvenlik sinyali).
   */
  bodyAmbiguityRisk?: boolean;
  /** Havuzdaki kasa dagilimi ve medyanlari (audit) */
  bodyDistribution?: Array<{ body: string; count: number; median: number }>;
  /** En yuksek/en dusuk kasa medyani arasindaki oransal fark */
  bodySpread?: number;
}

/**
 * OTOMASYON GUVENLIK ESIKLERI (fiyat orani DEGILDIR).
 *
 * Olculen gercek dagilim (178.931 ilan, kasasi bilinen 12.095):
 *   cok-kasali aile (her kasa n>=5): 21
 *   medyan farki >%5: 16 · >%8: 14 · >%10: 11 · >%15: 10 · >%20: 6 · >%30: 4
 *   tek kasali (guvenli) aile: 157 / 252
 *
 * Esik %10: dogrulanmis AUTO sonuclarda galerinin toplam marji
 * (expectedSale - cash) medyan ~%7'dir. Kasa belirsizliginin tek basina
 * piyasa medyanini bundan fazla kaydirdigi ailelerde otomatik teklif,
 * marjin tamamini asan bir hata tasiyabilir. Bu yuzden kasa BILINMIYORSA
 * ve ayrisma %10'u asiyorsa fiyat manuel degerlendirmeye gider.
 * Tek kasali ya da ayrismasi onemsiz araclar ETKILENMEZ.
 */
export const BODY_AMBIGUITY = {
  minSupportPerBody: 5,
  spreadThreshold: 0.10,
};

interface RawCandidate {
  sourceListingId: string;
  rawMake: string;
  rawModel: string;
  canonicalModel: string;
  rawVariant: string | null;
  canonicalVariant: string | null;
  canonicalTrim: string | null;
  canonicalBodyType: string | null;
  canonicalFuelType: string | null;
  canonicalTransmission: string | null;
  rawTitle: string | null;
  year: number;
  mileageKm: number | null;
  price: number;
  city: string | null;
  isDamaged: boolean;
  scrapedAt: Date | null;
}

const DAMAGE_TOKENS = ['agir hasar', 'agir hasarli', 'pert', 'hasar kayitli', 'hasarli'];

@Injectable()
export class EmsalMatcherService {
  constructor(private prisma: PrismaService) {}

  /* ---------------------------------------------------------------- */
  /* Yardimcilar                                                       */
  /* ---------------------------------------------------------------- */

  /** Ilan tazeligi agirligi: yarilanma omurlu ustel azalma, tabani sabit. */
  private freshnessWeight(scrapedAt: Date | null | undefined): number {
    if (!scrapedAt) return PRICING_LIMITS.freshnessFloorWeight;
    const ageDays = (Date.now() - new Date(scrapedAt).getTime()) / 86_400_000;
    if (!Number.isFinite(ageDays) || ageDays < 0) return 1;
    const w = Math.pow(0.5, ageDays / PRICING_LIMITS.freshnessHalfLifeDays);
    return clamp(w, PRICING_LIMITS.freshnessFloorWeight, 1);
  }

  private isDamagedListing(r: RawCandidate): boolean {
    if (r.isDamaged === true) return true;
    const t = foldTurkish(r.rawTitle || '');
    return DAMAGE_TOKENS.some((tok) => t.includes(tok));
  }

  /** Ilanin motor kodu: canonicalVariant > rawVariant */
  private engineOf(r: RawCandidate): string {
    return (r.canonicalVariant || r.rawVariant || '').trim();
  }

  private fuelOf(r: RawCandidate): string {
    if (r.canonicalFuelType && r.canonicalFuelType.trim()) return r.canonicalFuelType.trim();
    return deriveFuelFromEngineCode(this.engineOf(r)) || deriveFuelType(r.rawTitle || '');
  }

  private transmissionOf(r: RawCandidate): string {
    if (r.canonicalTransmission && r.canonicalTransmission.trim()) {
      return r.canonicalTransmission.trim();
    }
    return deriveTransmission(r.rawTitle || '');
  }

  /**
   * Havuzdan yillik deger kaybi orani ogrenir (log-fiyat ~ yil regresyonu).
   * Ogrenilemezse konfigurasyondaki varsayilan kullanilir.
   */
  private learnAnnualDepreciation(rows: RawCandidate[]): {
    rate: number;
    source: string;
  } {
    const byYear = new Map<number, number[]>();
    for (const r of rows) {
      if (r.price <= 0) continue;
      if (!byYear.has(r.year)) byYear.set(r.year, []);
      byYear.get(r.year)!.push(r.price);
    }
    const points: Array<{ year: number; logPrice: number; n: number }> = [];
    for (const [year, prices] of byYear) {
      if (prices.length < 3) continue;
      const sorted = [...prices].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      if (median > 0) points.push({ year, logPrice: Math.log(median), n: prices.length });
    }

    if (points.length >= 3) {
      const totalN = points.reduce((s, p) => s + p.n, 0);
      const meanX = points.reduce((s, p) => s + p.year * p.n, 0) / totalN;
      const meanY = points.reduce((s, p) => s + p.logPrice * p.n, 0) / totalN;
      let num = 0;
      let den = 0;
      for (const p of points) {
        num += p.n * (p.year - meanX) * (p.logPrice - meanY);
        den += p.n * (p.year - meanX) ** 2;
      }
      if (den > 0) {
        const slope = num / den; // log-fiyat / yil
        const rate = Math.exp(slope) - 1; // yillik artis orani (yeni model daha pahali)
        if (Number.isFinite(rate) && rate > 0) {
          return {
            rate: clamp(
              rate,
              PRICING_LIMITS.annualDepreciationRange[0],
              PRICING_LIMITS.annualDepreciationRange[1],
            ),
            source: 'LEARNED_FROM_LISTINGS',
          };
        }
      }
    }

    return {
      rate: PRICING_LIMITS.defaultAnnualDepreciation,
      source: 'DEFAULT_ANNUAL_RATE',
    };
  }

  /** Emsali hedef yila indirger. */
  private normalizeToYear(price: number, listingYear: number, targetYear: number, rate: number): number {
    const diff = targetYear - listingYear;
    if (diff === 0) return price;
    const factor = Math.pow(1 + rate, diff);
    return Math.max(1, Math.round(price * clamp(factor, 0.5, 2.0)));
  }

  private toCleanListing(
    r: RawCandidate,
    normalizedPrice: number,
    weight: number,
    make: string,
    model: string,
  ): CleanListingItem {
    return {
      id: r.sourceListingId,
      make,
      model,
      variant: this.engineOf(r) || undefined,
      trim: (r.canonicalTrim || '').trim() || undefined,
      year: r.year,
      // Km bilgisi yoksa UYDURULMAZ; 0 birakilir ve calculator agirligi dusurur.
      mileageKm: r.mileageKm && r.mileageKm > 0 ? r.mileageKm : 0,
      price: normalizedPrice,
      bodyType: (r.canonicalBodyType || '').trim() || undefined,
      fuelType: this.fuelOf(r) || undefined,
      transmission: this.transmissionOf(r) || undefined,
      city: r.city || undefined,
      title: r.rawTitle || undefined,
      isDamaged: false,
      normalizedPrice,
      weight,
      listedAt: r.scrapedAt,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Aday havuzu                                                       */
  /* ---------------------------------------------------------------- */

  private async fetchCandidates(make: string, model: string, yearMin: number, yearMax: number) {
    const cleanMake = make.trim();
    const cleanModel = model.trim();

    const rows = (await this.prisma.rawVehicleListing.findMany({
      where: {
        OR: [{ rawMake: { equals: cleanMake } }, { canonicalMake: { equals: cleanMake } }],
        year: { gte: yearMin, lte: yearMax },
        parseStatus: 'VALID',
        price: { gt: 0 },
      },
      select: {
        sourceListingId: true,
        rawMake: true,
        rawModel: true,
        canonicalModel: true,
        rawVariant: true,
        canonicalVariant: true,
        canonicalTrim: true,
        canonicalBodyType: true,
        canonicalFuelType: true,
        canonicalTransmission: true,
        rawTitle: true,
        year: true,
        mileageKm: true,
        price: true,
        city: true,
        isDamaged: true,
        scrapedAt: true,
      },
    })) as unknown as RawCandidate[];

    const target = foldTurkish(cleanModel);
    const seen = new Set<string>();
    const out: RawCandidate[] = [];
    let duplicateCount = 0;
    let damagedCount = 0;

    for (const r of rows) {
      const cm = foldTurkish(r.canonicalModel || '');
      const rm = foldTurkish(r.rawModel || '');
      const modelHit =
        cm === target ||
        rm === target ||
        (target.length >= 3 && (cm.includes(target) || rm.includes(target)));
      if (!modelHit) continue;

      if (seen.has(r.sourceListingId)) {
        duplicateCount++;
        continue;
      }
      if (this.isDamagedListing(r)) {
        damagedCount++;
        continue;
      }
      const [minP, maxP] = PRICING_LIMITS.priceSanityRange;
      if (r.price < minP || r.price > maxP) continue;

      seen.add(r.sourceListingId);
      out.push(r);
    }

    return { candidates: out, duplicateCount, damagedCount };
  }

  /* ---------------------------------------------------------------- */
  /* Ana esleme                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Kademeli emsal esleme.
   *
   *   marka -> model -> motor/variant -> paket/trim -> yakit -> sanziman -> yil -> km
   *
   * Seviye 1: birebir motor + yakit + (bilinen) sanziman + ayni yil
   * Seviye 2: uyumlu motor (ayni yakit, yakin hacim/seri) + yil +/-1, yil normalize
   * Seviye 3: ayni model + uyumlu yakit + yil +/-2, yil normalize, DUSUK GUVEN
   * Seviye 4: veri yok -> fiyat uretilmez
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
    const { make, model, variant, trim, year } = params;

    // Katalog variant adi motor + paket birlestirilmis gelebilir; emsal
    // tablosuyla ayni semantige indirgenir.
    const split = splitVariantString(variant || '');
    const paramEngine = split.engineCode;
    const paramTrim = (trim || '').trim() || split.trim;
    // Yakit oncelikle MOTOR KODUNDAN turetilir: motor kodu, emsal tablosuyla
    // birebir ayni metinden (sayfa basligi) gelir. Katalogtaki yakit etiketi
    // yalnizca motor kodundan yakit cikarilamadiginda kullanilir; aksi halde
    // katalog kaynakli hatali bir etiket dogru emsalleri havuzdan atabilir.
    const paramFuel =
      deriveFuelFromEngineCode(paramEngine) || (params.fuelType || '').trim() || '';
    // Kasa tipi: musteri/katalog girdisi merkezi normalizer'dan gecer.
    // UNKNOWN ise kasa uzerinden hicbir eleme veya exactness URETILMEZ (CASE D).
    const requestedBody = normalizeBodyType(params.bodyType);
    const paramTransmission = (params.transmission || '').trim();

    const { candidates, duplicateCount, damagedCount } = await this.fetchCandidates(
      make,
      model,
      year - 2,
      year + 2,
    );

    // KATALOG SOZLUGU != ILAN SOZLUGU.
    // Katalogda bu model icin secilebilen kasa adlari ile ilan metninden
    // turetilen kasa siniflari her zaman ortusmez (orn. BMW 4 Serisi katalogta
    // "Hatchback"/"Coupe" olarak durur, ilanlarda ise GRAN_COUPE/COUPE/CABRIO
    // gorunur; Audi A3/A5 katalogta "Hatchback", ilanlarda SPORTBACK'tir).
    // Havuzda hic gorulmeyen bir kasa etiketiyle eleme yapmak, DOGRU emsalleri
    // topluca disari atar. Boyle bir etiket kanit degildir: UNKNOWN kabul edilir
    // ve kasa uzerinden eleme yapilmaz (UNKNOWN > WRONG).
    const observedBodies = new Set(
      candidates.map((c) => (c.canonicalBodyType || '').trim()).filter(Boolean),
    );
    const bodySignalDropped = Boolean(requestedBody) && !observedBodies.has(requestedBody);
    const paramBody = bodySignalDropped ? '' : requestedBody;

    if (candidates.length === 0) {
      return this.emptyResult(make, model, year, duplicateCount, damagedCount);
    }

    const { rate: annualRate, source: yearAdjustmentSource } =
      this.learnAnnualDepreciation(candidates);

    const foldedParamTrim = foldTurkish(paramTrim);

    // Seviye kademelerini sirayla dene
    const levels: Array<{
      level: number;
      yearSpan: number;
      strictEngine: boolean;
      requireFuel: boolean;
      requireTransmission: boolean;
      minCount: number;
    }> = [
      { level: 1, yearSpan: 0, strictEngine: true, requireFuel: true, requireTransmission: true, minCount: PRICING_LIMITS.minCompCountForPricing },
      { level: 2, yearSpan: 1, strictEngine: false, requireFuel: true, requireTransmission: false, minCount: PRICING_LIMITS.minCompCountForPricing },
      { level: 3, yearSpan: 2, strictEngine: false, requireFuel: true, requireTransmission: false, minCount: 4 },
    ];

    let level3Snapshot: {
      level: number;
      selected: RawCandidate[];
      trimMatchedCount: number;
    } | null = null;

    for (const cfg of levels) {
      const selected: RawCandidate[] = [];
      let trimMatchedCount = 0;

      for (const r of candidates) {
        if (Math.abs(r.year - year) > cfg.yearSpan) continue;

        const engine = this.engineOf(r);
        if (paramEngine) {
          if (!engine) continue;
          if (!isEngineCompatible(paramEngine, engine, cfg.strictEngine)) continue;
        } else if (cfg.strictEngine) {
          // Hedef aracin motoru bilinmiyorsa Seviye 1 (birebir motor) uygulanamaz.
          continue;
        }

        // CASE A: hedef kasa BILINIYOR + adayin kasasi BILINIYOR + FARKLI
        // -> her seviyede dislanir (420d Cabrio, 420d Coupe'nin emsali olamaz).
        // CASE C: adayin kasasi bilinmiyorsa BURADA dislanmaz; buildResult'ta
        // dusuk agirlik alir. UNKNOWN != KNOWN MISMATCH.
        if (paramBody && r.canonicalBodyType && r.canonicalBodyType !== paramBody) continue;

        if (cfg.requireFuel && paramFuel) {
          const f = this.fuelOf(r);
          // Yakiti bilinmeyen ilan Seviye 1'e alinmaz; alt seviyelerde
          // agirligi dusurulerek kabul edilir.
          if (cfg.level === 1 && !f) continue;
          if (f && f !== paramFuel) continue;
        }

        if (cfg.requireTransmission && paramTransmission) {
          const t = this.transmissionOf(r);
          if (t && t !== paramTransmission) continue;
        }

        const listingTrim = foldTurkish((r.canonicalTrim || '').trim());
        const trimHit =
          !foldedParamTrim ||
          !listingTrim ||
          listingTrim === foldedParamTrim ||
          listingTrim.includes(foldedParamTrim) ||
          foldedParamTrim.includes(listingTrim);

        if (cfg.level === 1 && foldedParamTrim && listingTrim && !trimHit) continue;
        // Hedef aracin motoru bilinmiyorsa paketi ayni olmayan ilanlar havuza
        // alinmaz; aksi halde tum motor secenekleri tek fiyatta birlesir.
        if (!paramEngine && foldedParamTrim && !trimHit) continue;
        if (trimHit) trimMatchedCount++;

        selected.push(r);
      }

      if (cfg.level === 3) level3Snapshot = { level: 3, selected, trimMatchedCount };
      if (selected.length >= cfg.minCount) {
        return this.buildResult({
          level: cfg.level,
          make,
          model,
          paramEngine,
          paramTrim,
          paramFuel,
          paramBody,
          year,
          selected,
          trimMatchedCount,
          annualRate,
          yearAdjustmentSource,
          duplicateCount,
          damagedCount,
          totalCandidates: candidates.length,
        });
      }
    }

    if (level3Snapshot && level3Snapshot.selected.length > 0) {
      // Emsal var ama fiyat uretecek kadar degil: uydurma fiyat yerine
      // "yetersiz veri" don. Servis katmani manuel degerlendirmeye yonlendirir.
      return {
        ...this.emptyResult(make, model, year, duplicateCount, damagedCount),
        matchedCount: level3Snapshot.selected.length,
        explanationNote:
          `${make} ${model} ${paramEngine} (${year}) için veritabanında yalnızca ` +
          `${level3Snapshot.selected.length} uyumlu emsal ilan bulundu. Güvenilir fiyat üretmek için ` +
          `en az ${PRICING_LIMITS.minCompCountForPricing} emsal gereklidir; manuel değerlendirme yapılacaktır.`,
      };
    }

    return this.emptyResult(make, model, year, duplicateCount, damagedCount);
  }

  private emptyResult(
    make: string,
    model: string,
    year: number,
    duplicateCount: number,
    damagedCount: number,
  ): EmsalMatchResult {
    return {
      level: 4,
      matchedCount: 0,
      cleanListings: [],
      confidenceScore: 0,
      isLimitedComps: true,
      explanationNote: `Seviye 4: Yetersiz Veri! ${make} ${model} (${year}) için veritabanında uyumlu Sahibinden ilan kaydı bulunamadı.`,
      contributingSnapshotIds: [],
      level1CandidateCount: 0,
      level2CandidateCount: 0,
      level3CandidateCount: 0,
      actuallyUsedListingCount: 0,
      usedEngineDistribution: {},
      usedTrimDistribution: {},
      excludedListingCount: duplicateCount + damagedCount,
      exclusionReasons: [
        `Mükerrer ilan: ${duplicateCount}`,
        `Ağır hasarlı/pert ilan: ${damagedCount}`,
      ],
      listingWeights: [],
      freshnessScore: 0,
      engineExactShare: 0,
      fuelKnownShare: 0,
      transmissionKnownShare: 0,
      uniqueListingIds: [],
    };
  }

  private buildResult(args: {
    level: number;
    make: string;
    model: string;
    paramEngine: string;
    paramTrim: string;
    paramFuel: string;
    paramBody: string;
    year: number;
    selected: RawCandidate[];
    trimMatchedCount: number;
    annualRate: number;
    yearAdjustmentSource: string;
    duplicateCount: number;
    damagedCount: number;
    totalCandidates: number;
  }): EmsalMatchResult {
    const {
      level, make, model, paramEngine, paramTrim, paramFuel, paramBody, year, selected,
      trimMatchedCount, annualRate, yearAdjustmentSource, duplicateCount, damagedCount,
    } = args;

    const engineDist: Record<string, number> = {};
    const trimDist: Record<string, number> = {};
    const listings: CleanListingItem[] = [];
    const weights: number[] = [];
    let freshnessSum = 0;
    let exactEngineCount = 0;
    let fuelKnownCount = 0;
    let transKnownCount = 0;

    const foldedParamTrim = foldTurkish(paramTrim);

    for (const r of selected) {
      const engine = this.engineOf(r) || 'Bilinmiyor';
      const trimName = (r.canonicalTrim || '').trim() || 'Belirtilmemiş';
      engineDist[engine] = (engineDist[engine] || 0) + 1;
      trimDist[trimName] = (trimDist[trimName] || 0) + 1;

      const normalizedPrice = this.normalizeToYear(r.price, r.year, year, annualRate);

      const fresh = this.freshnessWeight(r.scrapedAt);
      freshnessSum += fresh;

      // Esleme kalitesi agirligi: yil farki, trim uyumu, yakit bilinmezligi
      let quality = 1;
      const yearDiff = Math.abs(r.year - year);
      if (yearDiff === 1) quality *= 0.75;
      else if (yearDiff >= 2) quality *= 0.5;

      const listingTrim = foldTurkish(trimName);
      if (foldedParamTrim && listingTrim && listingTrim !== 'belirtilmemis') {
        const trimHit =
          listingTrim === foldedParamTrim ||
          listingTrim.includes(foldedParamTrim) ||
          foldedParamTrim.includes(listingTrim);
        if (!trimHit) quality *= 0.7;
      } else if (foldedParamTrim) {
        quality *= 0.85;
      }

      // CASE C: hedef kasa biliniyor ama adayin kasasi bilinmiyorsa hafif
      // belirsizlik cezasi. CASE B (ayni kasa) tam agirlik alir.
      if (paramBody && !r.canonicalBodyType) quality *= 0.9;

      if (this.fuelOf(r)) fuelKnownCount++;
      if (this.transmissionOf(r)) transKnownCount++;
      if (paramFuel && !this.fuelOf(r)) quality *= 0.8;
      const exactEngine =
        !!paramEngine && !!this.engineOf(r) && isEngineCompatible(paramEngine, this.engineOf(r), true);
      if (paramEngine && !exactEngine) quality *= 0.55;
      if (exactEngine) exactEngineCount++;

      const weight = fresh * quality;
      listings.push(this.toCleanListing(r, normalizedPrice, weight, make, model));
      weights.push(weight);
    }

    const freshnessScore = selected.length > 0 ? freshnessSum / selected.length : 0;
    const engineExactShare = selected.length > 0 ? exactEngineCount / selected.length : 0;
    const fuelKnownShare = selected.length > 0 ? fuelKnownCount / selected.length : 0;
    const transmissionKnownShare = selected.length > 0 ? transKnownCount / selected.length : 0;

    const withKm = selected.filter((r) => r.mileageKm && r.mileageKm > 0);
    const kmSorted = withKm.map((r) => r.mileageKm as number).sort((a, b) => a - b);
    const referenceMedianMileage = kmSorted.length
      ? kmSorted[Math.floor(kmSorted.length / 2)]
      : undefined;

    let confidenceScore: number;
    let isLimitedComps = false;
    let explanationNote: string;

    const n = selected.length;
    if (level === 1) {
      confidenceScore = Math.min(97, 86 + Math.floor(n / 12));
      explanationNote =
        `Seviye 1: ${make} ${model} ${paramEngine} ${paramTrim} (${year}) için birebir motor, ` +
        `yakıt ve model yılı eşleşen ${n} gerçek Sahibinden ilanı kullanıldı. ` +
        `Farklı motor/yakıt seçenekleri fiyat hesabına katılmadı.`;
    } else if (level === 2) {
      // Havuzdaki birebir motor orani dustukce guven de duser.
      const exactShare = n > 0 ? exactEngineCount / n : 0;
      confidenceScore = Math.min(85, 72 + Math.floor(n / 15)) - Math.round((1 - exactShare) * 14);
      if (exactShare < 0.35) isLimitedComps = true;
      explanationNote =
        `Seviye 2: ${make} ${model} ${paramEngine} (${year - 1}-${year + 1}) aralığındaki ` +
        `${n} uyumlu motor/yakıt emsali, yıllık %${(annualRate * 100).toFixed(1)} değer farkı ` +
        `normalize edilerek ${year} model yılına indirgendi.`;
    } else {
      confidenceScore = Math.min(68, 55 + Math.floor(n / 20));
      isLimitedComps = true;
      if (n > 0 && exactEngineCount / n < 0.35) confidenceScore -= 6;
      explanationNote =
        `Seviye 3: ${make} ${model} (${year - 2}-${year + 2}) genel model grubundaki ${n} emsal ` +
        `kullanıldı ve yıllık %${(annualRate * 100).toFixed(1)} değer farkı normalize edildi. ` +
        `Birebir motor/paket emsali yetersiz olduğu için güven seviyesi düşüktür.`;
    }

    if (!paramEngine) {
      // Hedef aracin motoru bilinmiyorsa fiyat guveni ustten sinirlanir.
      confidenceScore = Math.min(confidenceScore, 70);
      isLimitedComps = true;
    }
    if (freshnessScore < 0.5) confidenceScore -= 4;
    confidenceScore = Math.max(0, Math.min(99, confidenceScore));

    // --- KASA BELIRSIZLIGI (otomasyon guvenligi) ---
    // Hedefin kasasi BILINMIYORSA havuz karisik olabilir. Cabrio/Coupe gibi
    // gruplar yuz binlerce TL ayrisabildigi icin, ayrisma olculur ve gerekirse
    // otomatik fiyat verilmez. Kasa BILINIYORSA (CASE A/B) bu kontrol calismaz.
    const bodyGroups = new Map<string, number[]>();
    for (const l of listings) {
      const b = (l.bodyType || '').trim();
      if (!b) continue;
      if (!bodyGroups.has(b)) bodyGroups.set(b, []);
      bodyGroups.get(b)!.push(l.normalizedPrice ?? l.price);
    }
    const med = (arr: number[]) => {
      const a = [...arr].sort((x, y) => x - y);
      const m = Math.floor(a.length / 2);
      return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
    };
    const bodyDistribution = [...bodyGroups.entries()]
      .map(([body, prices]) => ({ body, count: prices.length, median: med(prices) }))
      .sort((a, b) => b.count - a.count);
    const supported = bodyDistribution.filter((b) => b.count >= BODY_AMBIGUITY.minSupportPerBody);
    let bodySpread = 0;
    if (supported.length >= 2) {
      const meds = supported.map((b) => b.median).filter((m) => m > 0);
      const hi = Math.max(...meds), lo = Math.min(...meds);
      if (lo > 0) bodySpread = (hi - lo) / lo;
    }
    const bodyAmbiguityRisk =
      !paramBody && supported.length >= 2 && bodySpread > BODY_AMBIGUITY.spreadThreshold;

    return {
      level,
      matchedCount: n,
      bodyAmbiguityRisk,
      bodyDistribution,
      bodySpread,
      cleanListings: listings,
      confidenceScore,
      isLimitedComps,
      explanationNote,
      kmDecayPer10k: undefined,
      referenceMedianMileage,
      mileageAdjustmentSource: kmSorted.length ? 'LISTING_MEDIAN' : 'NO_KM_DATA',
      yearAdjustmentSource,
      yearAdjustmentRate: annualRate,
      level1CandidateCount: level === 1 ? n : 0,
      level2CandidateCount: level === 2 ? n : 0,
      level3CandidateCount: level === 3 ? n : 0,
      actuallyUsedListingCount: n,
      usedEngineDistribution: engineDist,
      usedTrimDistribution: trimDist,
      excludedListingCount: duplicateCount + damagedCount + (args.totalCandidates - n),
      exclusionReasons: [
        `Mükerrer ilan: ${duplicateCount}`,
        `Ağır hasarlı/pert ilan: ${damagedCount}`,
        `Farklı motor/yakıt/paket veya yıl aralığı dışı: ${Math.max(0, args.totalCandidates - n)}`,
        `Paket eşleşen emsal: ${trimMatchedCount}`,
        `Birebir motor eşleşen emsal: ${exactEngineCount}`,
      ],
      listingWeights: weights,
      freshnessScore,
      engineExactShare,
      fuelKnownShare,
      transmissionKnownShare,
      uniqueListingIds: selected.map((r) => r.sourceListingId),
    };
  }
}
