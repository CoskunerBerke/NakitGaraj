import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PRICING_LIMITS, clamp } from './pricing-config';
import {
  composeFullModel,
  deriveFuelFromEngineCode,
  deriveFuelType,
  deriveTransmission,
  explicitEngineSignature,
  foldTurkish,
  fullModelExact,
  hasExplicitPackageEvidence,
  hasStrongDamageSignal,
  isEngineCompatible,
  normalizeBodyType,
  deriveBodyType,
  splitVariantString,
  modelNameMatches,
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
  /**
   * HEDEF ARACIN MOTOR KIMLIGI KANITI — TEK DOGRU KAYNAK.
   *
   * Emsal motoru, hedefin motorunu iki yoldan taniyabilir:
   *   CUSTOMER_FIELD        musterinin sectigi motor alani zaten acik bir
   *                         motor imzasi tasiyor ("1.5 dCi", "320d")
   *   FULL_MODEL_SIGNATURE  motor alani bos ama TAM MODEL kendi icinde acik
   *                         imza tasiyor ("1.5 BlueHDi Performance Line")
   *   NONE                  guvenilir motor kimligi YOK
   *
   * Ayni gercek, fiyat/guven katmaninda TEKRAR turetilmemelidir: onceki
   * surumde `computePricing` yalnizca motor ALANINA bakiyor, TAM MODEL
   * imzasini gormuyor ve guveni gereksiz yere 60'a tavanliyordu (olculen:
   * 1.413 fiyatlanan hedefin 349'u, 349/349 MANUAL, 205'i L1 birebir).
   *
   * `strong`, projenin dogrulanmis `explicitEngineSignature` yardimcisiyla
   * belirlenir; paket-only ifadeler (AMG, M, Premium, Luxury, Comfort,
   * Highline) kanit SAYILMAZ. Bu deger KALICI VERIYE YAZILMAZ; yalnizca
   * degerleme anindaki kanit durumunu bildirir.
   */
  engineEvidence?: {
    source: 'CUSTOMER_FIELD' | 'FULL_MODEL_SIGNATURE' | 'NONE';
    signature: string;
    strong: boolean;
  };
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

/* Agir hasar tespiti icin bkz. listing-attributes.hasStrongDamageSignal:
   yalniz ACIK ve guclu beyanlar, kelime siniriyla ("EKSPERTIZ" eslesmez). */

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

  /**
   * Emsal havuzuna alinamayacak kadar ACIK agir hasar beyani var mi?
   *
   * Ilan basligi VARSA metin kazanir: `isDamaged` bayragi eski (kelime sinirsiz)
   * kurala gore uretilmis turetilmis veridir ve "EKSPERTIZ" iceren temiz
   * ilanlari hasarli isaretler. Baslik yoksa import bayragina dusulur.
   * Bir sonraki rebuild'de bayrak da ayni kurali kullanacaktir.
   */
  private isDamagedListing(r: RawCandidate): boolean {
    const title = (r.rawTitle || '').trim();
    if (title) return hasStrongDamageSignal(title);
    return r.isDamaged === true;
  }

  /** Ilanin kasa kaniti: kalici alan > tam-model metnindeki acik kasa sozcugu. */
  private bodyOf(r: RawCandidate): string {
    const stored = (r.canonicalBodyType || '').trim();
    return stored || deriveBodyType(r.canonicalTrim || '');
  }

  /** Ilanin motor kodu: canonicalVariant > rawVariant */
  private engineOf(r: RawCandidate): string {
    return (r.canonicalVariant || r.rawVariant || '').trim();
  }

  /** Ilanin TAM MODEL string'i (motor + paket, tekrarsiz). */
  private fullModelOf(r: RawCandidate): string {
    return composeFullModel(this.engineOf(r), r.canonicalTrim || '');
  }

  /**
   * PAKET (DONANIM) KANITI — UC DURUMLU, markadan bagimsiz.
   *
   *   MATCH    aranan paket, ilanin yapisal donanim alaninda YA DA ilanin
   *            kendi basliginda/model dizgesinde ACIKCA yaziyor
   *   UNKNOWN  ilanda paket kaniti yok (yapisal alan bos ya da yalnizca
   *            model/motor dizgesi tasiyor) -> CELISKI DEGILDIR
   *   CONFLICT yapisal donanim alani gercek bir paket tasiyor ve aranan
   *            paketle ortusmuyor (orn. "Joy" aranirken "Touch")
   *
   * Onceki kural ikili idi: yapisal alan doluysa ve aranan paketi
   * icermiyorsa UYUSMAZLIK sayiyordu. Oysa alan cogu zaman kaynak model
   * dizgesidir ("A3 Sedan 35 TFSI"); paket ise ayni ilanin basliginda
   * yazilidir ("... 35 TFSI S-LINE ..."). Olculen: 46 Sedan S Line ilani
   * bu yuzden "uyusmuyor" sayilip donanima sadik kademeden dusuyor, havuz
   * daha ucuz paketlerle doluyordu.
   *
   * Aciklik, kaynak metinde paket adinin SINIR duyarli gecmesidir; uydurma
   * cikarim yoktur. Kalici veriye yazilmaz.
   */
  private packageEvidenceOf(r: RawCandidate, foldedParamTrim: string): 'MATCH' | 'UNKNOWN' | 'CONFLICT' {
    if (!foldedParamTrim) return 'MATCH';
    const listingTrim = foldTurkish((r.canonicalTrim || '').trim());
    if (listingTrim && listingTrim !== 'belirtilmemis') {
      if (listingTrim === foldedParamTrim || listingTrim.includes(foldedParamTrim) || foldedParamTrim.includes(listingTrim)) {
        return 'MATCH';
      }
    }
    // Yapisal alan eslesmedi: ayni ilanin ACIK metinlerine bakilir.
    if (hasExplicitPackageEvidence(foldedParamTrim, r.rawTitle, r.canonicalTrim, r.rawModel, r.rawVariant)) {
      return 'MATCH';
    }
    // Yapisal alan gercek bir PAKET tasiyorsa (motor/kasa/model dizgesi
    // degil) ve ortusmuyorsa bu celiskidir. Motor imzasi ya da kasa sozcugu
    // tasiyan dizge paket degil, model kimligidir -> UNKNOWN.
    if (listingTrim && listingTrim !== 'belirtilmemis') {
      const looksLikeModelString =
        Boolean(explicitEngineSignature(r.canonicalTrim || '')) || Boolean(deriveBodyType(r.canonicalTrim || ''));
      if (!looksLikeModelString) return 'CONFLICT';
    }
    return 'UNKNOWN';
  }

  /**
   * Motor KANITI: ayri bir motor kodu alani yoksa, ilanin kendi TAM MODEL
   * hucresindeki ACIK motor imzasi kullanilir ("1.6 TDI BlueMotion Highline"
   * -> "1.6 TDI"). Uydurma degildir; bilgi ilanda zaten yazilidir. Kalici
   * veriye yazilmaz, yalnizca eslesme aninda kullanilir.
   */
  private engineEvidenceOf(r: RawCandidate): string {
    return this.engineOf(r) || explicitEngineSignature(r.canonicalTrim || '');
  }

  /**
   * Ilanin yakiti. Hedef tarafindaki kuralin AYNISI: acik motor kodu, kalici
   * yakit etiketinden daha guvenilirdir. Olculen: "1.5 TSI Business" ilani,
   * basliktaki "ELEKTRIKLI BAGAJ" ifadesinden "Elektrik" etiketi almis ve
   * benzinli hedeften dislanmisti. Celiskide motor kodu kazanir; "Hibrit"
   * ise yanma motoru koduyla CELISMEZ (benzinli/dizel hibrit) ve korunur.
   */
  private fuelOf(r: RawCandidate): string {
    const stored = (r.canonicalFuelType || '').trim();
    const fromEngine = deriveFuelFromEngineCode(this.engineEvidenceOf(r));
    if (stored && fromEngine && stored !== fromEngine) {
      return stored === 'Hibrit' ? stored : fromEngine;
    }
    return stored || fromEngine || deriveFuelType(r.rawTitle || '');
  }

  /**
   * YAKIT UYUMU — `fuelOf` ile AYNI semantik, markadan bagimsiz.
   *
   * `fuelOf` zaten soyluyor: "Hibrit", yanma motoru koduyla CELISMEZ
   * (benzinli/dizel hafif hibrit). Ancak kapi bu tolerasyonu uygulamiyor ve
   * ayni motor kodunu ("35 TFSI") tasiyan MHEV ilanlarini "yakit uyusmuyor"
   * diye dusuruyordu. Olculen: Audi A3 Sedan 35 TFSI S Line 2025 icin
   * 3.675.000 / 6.005 km ve 3.590.000 / 18.914 km ilanlari (ikisi de
   * "35 TFSI MHEV S-LINE") kohorttan dismisti.
   *
   * Kural: hedef yanma yakiti (Benzin/Dizel) ise ilanin "Hibrit" etiketi
   * uyumludur; tam elektrik/LPG vb. farkli yakitlar celiskidir. Hedef
   * Hibrit ise yalnizca Hibrit ya da ayni yanma yakiti uyumludur.
   */
  private fuelCompatible(target: string, candidate: string): boolean {
    if (!target || !candidate) return true;
    if (target === candidate) return true;
    const combustion = new Set(['Benzin', 'Dizel']);
    if (combustion.has(target) && candidate === 'Hibrit') return true;
    if (target === 'Hibrit' && combustion.has(candidate)) return true;
    return false;
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

  /**
   * KILOMETRE YERELLIGI — her arac icin ayni, marka/model ayrimi YOK.
   *
   * Musterinin kilometresi K ise, once K VE ALTI gercek gozlemler kullanilir.
   * Onceki surumde kohorta o yilin TUM kilometreleri esit hakla giriyordu:
   * olculen ornek, 60.000 km'lik Clio 2022 icin 6.350-224.850 km araligindan
   * 502 ilan; 502'nin 361'i hedefin UZERINDE.
   *
   * Kilometresi BILINMEYEN ilan dislanmaz: bilinmezlik celiski degildir ve
   * fiyat cekirdegi zaten agirligini yariya dusurur.
   *
   * K ve alti yeterli DEGILSE (orn. hedef 5.000 km, piyasa 6.001 km'den
   * basliyor) EN YAKIN gercek gozlemlere acilir — uzaga atlanmaz.
   */
  private applyMileageLocality(
    selected: RawCandidate[],
    targetKm: number,
    minCount: number,
  ): RawCandidate[] {
    if (!targetKm || targetKm <= 0 || selected.length === 0) return selected;

    const known = selected.filter((r) => typeof r.mileageKm === 'number' && (r.mileageKm as number) > 0);
    const unknown = selected.filter((r) => !(typeof r.mileageKm === 'number' && (r.mileageKm as number) > 0));
    if (known.length === 0) return selected;

    const atOrBelow = known.filter((r) => (r.mileageKm as number) <= targetKm);
    if (atOrBelow.length >= minCount) {
      // Yeterli YEREL kanit var: hedefin uzerindeki kilometreler merkeze girmez.
      return [...atOrBelow, ...unknown];
    }

    // Yeterli degil: mesafe sirasiyla EN YAKIN gercek gozlemlere acilir.
    //
    // Yaricap iki olcutun BUYUGUDUR:
    //   (a) minCount'a ulastiran mesafe,
    //   (b) yakinlik olcegi (asagidaki agirlik fonksiyonuyla ayni olcek).
    //
    // (b) taban olmasaydi yaricap tek bir yigilmaya kilitlenebilirdi: Audi A3
    // 2025 hedefi 5.000 km iken kaynak veride 303 ilanin 35'i tam olarak
    // 6.001 km'de duruyor (Sahibinden'in "0-6.001 km" araligi). Sadece o
    // yigilma alinsaydi, 6.002-15.000 km'deki 138 gercek gozlem — hedefe en
    // az onun kadar yakin kanit — disarida kalirdi.
    //
    // Yaricap ICINDE hangi ilanin merkezi belirledigini yakinlik AGIRLIGI
    // soyler; secim kapisi yalnizca uzagi disarida tutar.
    const byDistance = [...known].sort(
      (a, b) => Math.abs((a.mileageKm as number) - targetKm) - Math.abs((b.mileageKm as number) - targetKm),
    );
    const cut = byDistance[Math.min(minCount, byDistance.length) - 1];
    const radius = Math.max(
      Math.abs((cut.mileageKm as number) - targetKm),
      this.mileageProximityScale(targetKm),
    );
    return [...known.filter((r) => Math.abs((r.mileageKm as number) - targetKm) <= radius), ...unknown];
  }

  /**
   * Hedef kilometreye YAKINLIK agirligi (0 < w <= 1).
   *
   * Secim tek basina yetmez: kucuk havuzlarda K ve alti kanitlarin hepsi
   * kalir ve cok dusuk kilometreli bir ilan, hedefe komsu ilanlarla ayni
   * hakki alirdi. Olcek hedefin kendisinden turetilir (veri surer, sabit
   * bir segment tablosu DEGIL); cok dusuk hedeflerde taban olcek kullanilir.
   */
  private mileageProximityWeight(listingKm: number | null, targetKm: number): number {
    if (!targetKm || targetKm <= 0) return 1;
    if (!listingKm || listingKm <= 0) return 1; // bilinmiyor: celiski degil
    return 1 / (1 + Math.abs(listingKm - targetKm) / this.mileageProximityScale(targetKm));
  }

  /** Yakinlik olcegi: hedefin kendisinden turetilir, sabit segment tablosu YOK. */
  private mileageProximityScale(targetKm: number): number {
    return Math.max(targetKm * 0.5, 15_000);
  }

  /**
   * Ailenin (marka+model) TUM yillardaki ilanlarinda gorulen kasa sozlugu.
   * Yalnizca "bu kasa etiketi ilan sozlugunde var mi?" sorusuna cevap verir;
   * fiyat kohortuna hicbir ilan eklemez (yil kurali DEGISMEZ).
   */
  private async familyBodyVocabulary(make: string, model: string): Promise<Set<string>> {
    const cleanMake = make.trim();
    const rows = (await this.prisma.rawVehicleListing.findMany({
      where: {
        OR: [{ rawMake: { equals: cleanMake } }, { canonicalMake: { equals: cleanMake } }],
        parseStatus: 'VALID',
        price: { gt: 0 },
      },
      select: { rawModel: true, canonicalModel: true, canonicalTrim: true, canonicalBodyType: true },
    })) as Array<{ rawModel: string; canonicalModel: string; canonicalTrim: string | null; canonicalBodyType: string | null }>;
    const out = new Set<string>();
    for (const r of rows) {
      if (!modelNameMatches(r.canonicalModel, model) && !modelNameMatches(r.rawModel, model)) continue;
      const b = (r.canonicalBodyType || '').trim() || deriveBodyType(r.canonicalTrim || '');
      if (b) out.add(b);
    }
    return out;
  }

  /**
   * @param sourceFiles KESIN YAPRAK kapsami. Verildiginde aday havuzu marka/
   *   model ADIYLA degil, hiyerarsi yaprağinin KAYNAK SAYFALARIYLA secilir.
   *
   *   Isim eslesmesi kimlik DEGILDIR: "Advanced", "Comfort", "S Line" gibi
   *   paket adlari onlarca farkli araca tekrar eder ve "A3" adi hem
   *   "A3 Hatchback" hem "A3 Sportback" satirlarini yakalar. Yaprak kimligi
   *   ise tam yoldan turetilmistir; kaynak dosyalari yalnizca O yaprağa aittir.
   */
  private async fetchCandidates(
    make: string,
    model: string,
    yearMin: number,
    yearMax: number,
    sourceFiles?: string[],
  ) {
    const cleanMake = make.trim();
    const cleanModel = model.trim();
    const exactLeaf = Array.isArray(sourceFiles) && sourceFiles.length > 0;

    const rows = (await this.prisma.rawVehicleListing.findMany({
      where: {
        ...(exactLeaf
          ? { sourceFile: { in: sourceFiles } }
          : {
              OR: [
                { rawMake: { equals: cleanMake } },
                { canonicalMake: { equals: cleanMake } },
              ],
            }),
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

    const seen = new Set<string>();
    const out: RawCandidate[] = [];
    let duplicateCount = 0;
    let damagedCount = 0;

    for (const r of rows) {
      // Sihirbazla AYNI model kurali (token sinirli). Onceki surum kisa
      // adlarda (<3 karakter) yalniz birebir esliyordu: "A4" hedefi
      // "A4 A4 Sedan" satirlarini goremiyor, sihirbazin sundugu secenek
      // degerlemede bos donuyordu.
      if (!exactLeaf) {
        const modelHit =
          modelNameMatches(r.canonicalModel, cleanModel) ||
          modelNameMatches(r.rawModel, cleanModel);
        if (!modelHit) continue;
      }
      // exactLeaf: havuz zaten TAM O yaprağin sayfalarindan geldi; isim
      // filtresi uygulamak, kaynagin kendi gruplamasini ikinci kez tahmin
      // etmek olurdu.

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

  /**
   * Kesin yaprak havuzunun BASKIN depolanmis motor/paket degeri.
   *
   * Havuzdaki satirlarin tamami ayni kategori sayfasindan geldigi icin bu
   * degerler o yaprağin ilan sozlugundeki karsiligidir. Uydurma yoktur:
   * deger, ilanlarin kendisinden sayilarak secilir.
   */
  private async dominantPoolIdentity(
    sourceFiles: string[],
    year: number,
  ): Promise<{ variant: string; trim: string }> {
    const rows = (await this.prisma.rawVehicleListing.findMany({
      where: {
        sourceFile: { in: sourceFiles },
        year: { gte: year, lte: year + 2 },
        parseStatus: 'VALID',
      },
      select: { canonicalVariant: true, rawVariant: true, canonicalTrim: true },
    })) as Array<{ canonicalVariant: string | null; rawVariant: string | null; canonicalTrim: string | null }>;

    const top = (values: Array<string | null | undefined>): string => {
      const counts = new Map<string, number>();
      for (const value of values) {
        const key = String(value || '').trim();
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      let best = '';
      let bestCount = 0;
      for (const [key, count] of counts) {
        if (count > bestCount) {
          best = key;
          bestCount = count;
        }
      }
      return best;
    };

    return {
      variant: top(rows.map((r) => r.canonicalVariant || r.rawVariant)),
      trim: top(rows.map((r) => r.canonicalTrim)),
    };
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
    /** Kesin hiyerarsi yaprağinin kaynak sayfalari (varsa aday havuzu budur). */
    sourceFiles?: string[];
  }): Promise<EmsalMatchResult> {
    const { make, model, year } = params;
    const targetKm = params.mileageKm > 0 ? params.mileageKm : 0;

    /**
     * KESIN YAPRAKTA ESLESME ANAHTARI HAVUZUN KENDISINDEN GELIR.
     *
     * Olculen: ilan satirlarindaki alanlar eski normalizasyonun bosluktan
     * bolmesiyle hala bozuk duruyor —
     *     canonicalModel = "A3 A3 Sportback 35", canonicalVariant = "TFSI"
     * Hiyerarsiden gelen DOGRU motor adi "35 TFSI" hicbir satira uymuyor ve
     * 168 ilanlik dogru havuz seviye 4'e (veri yok) dusuyordu.
     *
     * Havuz zaten TAM O yaprağin sayfalarindan geldigi icin her satir ayni
     * motor ve pakete aittir; kimlik ISPATLANMISTIR. Bu yuzden metin
     * karsilastirmasi hedefin adiyla degil, havuzun KENDI depolanmis
     * degeriyle yapilir. Fiyat matematigi degismez; yalnizca dogru satirlarin
     * yanlis bir metin yuzunden atilmasi onlenir.
     */
    let variant = params.variant;
    let trim = params.trim;
    if (Array.isArray(params.sourceFiles) && params.sourceFiles.length > 0) {
      const poolKey = await this.dominantPoolIdentity(params.sourceFiles, year);
      if (poolKey.variant) variant = poolKey.variant;
      if (poolKey.trim) trim = poolKey.trim;
    }

    // Katalog variant adi motor + paket birlestirilmis gelebilir; emsal
    // tablosuyla ayni semantige indirgenir.
    const split = splitVariantString(variant || '');
    const paramEngine = split.engineCode;
    const paramTrim = (trim || '').trim() || split.trim;
    // Hedefin TAM MODEL kimligi (motor + paket, tekrarsiz). Birebir (L1)
    // eslesme bu string uzerinden NORMALIZE EDILMIS ESITLIK ile yapilir.
    //
    // Motor ALANI taninmadiysa variant metni model kimliginin PARCASIDIR ve
    // atilmaz: "A3 Sedan 35 TFSI" + paket "S Line" -> "A3 Sedan 35 TFSI S Line".
    // Onceki surumde acik paket verildiginde variant metni tamamen kayboluyor,
    // tam model yalniz "S Line" kaliyordu (motor kaniti da onunla birlikte).
    const variantText = (variant || '').trim();
    const targetFullModel = paramEngine
      ? composeFullModel(paramEngine, paramTrim)
      : composeFullModel(variantText, paramTrim);
    // Motor kodu alani bos olsa bile TAM MODEL kendi icinde motor tasiyor
    // olabilir ("1.6 TDI BlueMotion Comfortline"). Bu ACIK kanit kullanilir.
    const paramEngineEvidence = paramEngine || explicitEngineSignature(targetFullModel);
    const targetHasEngineSignature = Boolean(explicitEngineSignature(targetFullModel));

    /**
     * Motor kimligi kaniti TEK YERDE belirlenir ve sonuca eklenir; fiyat/guven
     * katmani ayni gercegi ikinci bir ayristiriciyla TEKRAR turetmez.
     *
     * Kural KESINLIKLE EKLEMELIDIR: daha once "biliniyor" sayilan hicbir durum
     * "bilinmiyor"a DUSMEZ.
     *
     *  - CUSTOMER_FIELD: musterinin sectigi MOTOR ALANI dolu. Bu alan zaten
     *    motor olarak beyan edilmistir ve emsal motoru eslemeyi BUNUNLA
     *    kisitlar; dolayisiyla kanittir. Hacim testi burada UYGULANMAZ, cunku
     *    hacim model adinda olabilir ("Kia Rio 1.25" + "CVVT", "A6 40" + "TDI",
     *    "C 180" + "BlueEfficiency"). Olculen: bu test alana uygulandiginda 37
     *    arac gereksiz yere AUTO -> MANUAL'e dusuyordu.
     *  - FULL_MODEL_SIGNATURE: motor alani BOS; kanit yalnizca TAM MODEL
     *    icindeki ACIK imzadan gelebilir. Burada `explicitEngineSignature`
     *    testi ZORUNLUDUR, aksi halde paket metni (AMG / Premium / Comfort /
     *    Highline) motor sanilir.
     */
    const fullModelSignature = explicitEngineSignature(targetFullModel);
    const engineEvidence: EmsalMatchResult['engineEvidence'] = paramEngine
      ? { source: 'CUSTOMER_FIELD', signature: paramEngine, strong: true }
      : fullModelSignature
        ? { source: 'FULL_MODEL_SIGNATURE', signature: fullModelSignature, strong: true }
        : { source: 'NONE', signature: '', strong: false };
    // Yakit oncelikle MOTOR KODUNDAN turetilir: motor kodu, emsal tablosuyla
    // birebir ayni metinden (sayfa basligi) gelir. Katalogtaki yakit etiketi
    // yalnizca motor kodundan yakit cikarilamadiginda kullanilir; aksi halde
    // katalog kaynakli hatali bir etiket dogru emsalleri havuzdan atabilir.
    const paramFuel =
      deriveFuelFromEngineCode(paramEngineEvidence) || (params.fuelType || '').trim() || '';
    // Kasa tipi: musteri/katalog girdisi merkezi normalizer'dan gecer.
    // UNKNOWN ise kasa uzerinden hicbir eleme veya exactness URETILMEZ (CASE D).
    // Kasa musteri/katalog alaninda yoksa, musterinin SECTIGI etiketin kendisi
    // kasa tasiyabilir ("A3 Sedan 35 TFSI" -> SEDAN). Bu musterinin beyanidir,
    // uydurma degildir. Ilan tarafinda da ayni kanit kullanilir (bodyOf).
    /**
     * KASA KANITININ IKI KAYNAGI, IKI FARKLI GUCU VARDIR (bkz. kimlik kurali):
     *
     *   bodyFromName  aracin KENDI ADINDAN gelir ("840i Coupe", "A3 Sedan
     *                 35 TFSI"). Ad, kimliktir: RED tarafinda her zaman
     *                 gecerlidir -- ACIKCA farkli kasali ilan (Cabrio) bu
     *                 hedefe hicbir kosulda emsal olamaz.
     *   bodyType parametresi kategorik bir etikettir ("Hatchback") ve marka
     *                 sozlugune gore YER TUTUCU olabilir (BMW 4 Serisi'nde
     *                 Gran Coupe, Audi A3'te Sportback anlamina gelir).
     *                 Yalnizca ilan sozlugu destekliyorsa kullanilir.
     */
    const bodyFromName = deriveBodyType(variantText, paramTrim);
    const requestedBody = normalizeBodyType(params.bodyType) || bodyFromName;
    const paramTransmission = (params.transmission || '').trim();

    /**
     * ADAY PENCERESI: HEDEF YIL VE DAHA YENISI.
     *
     * Musterinin aracindan DAHA ESKI bir ilan, o aracin piyasa fiyatinin
     * kaniti degildir. Onceki surumde pencere simetrikti (yil -/+2) ve eski
     * yillar merkezi asagi cekiyordu. Olculen: Audi A3 Sedan 35 TFSI S Line
     * 2025 hedefinde secilen 234 emsalin 102'si 2024 modeldi; piyasa
     * referansi 3.085.000 TL cikiyordu. Fiat Egea 1.4 Fire 2021 hedefinde
     * 3.195 emsalin 1.024'u 2020 modeldi.
     *
     * Bu KURAL, marka/model ayrimi YAPMAZ; her arac icin aynidir.
     */
    const { candidates, duplicateCount, damagedCount } = await this.fetchCandidates(
      make,
      model,
      year,
      year + 2,
      params.sourceFiles,
    );

    // KATALOG SOZLUGU != ILAN SOZLUGU.
    // Katalogda bu model icin secilebilen kasa adlari ile ilan metninden
    // turetilen kasa siniflari her zaman ortusmez (orn. BMW 4 Serisi katalogta
    // "Hatchback"/"Coupe" olarak durur, ilanlarda ise GRAN_COUPE/COUPE/CABRIO
    // gorunur; Audi A3/A5 katalogta "Hatchback", ilanlarda SPORTBACK'tir).
    // Havuzda hic gorulmeyen bir kasa etiketiyle eleme yapmak, DOGRU emsalleri
    // topluca disari atar. Boyle bir etiket kanit degildir: UNKNOWN kabul edilir
    // ve kasa uzerinden eleme yapilmaz (UNKNOWN > WRONG).
    //
    // ANCAK: "havuzda gorulmedi" karari YALNIZCA sozluk uyusmazligi icin
    // gecerlidir. Musterinin kasasi ailenin TUM ilanlarinda (yil filtresiz)
    // gercekten gorulmus bir kasaysa, etiket kanittir ve hedef yil
    // penceresinde o kasa satista degilse bile baska bir kasa EMSAL OLAMAZ.
    // Olculen: Abarth 500e Coupe 2025 hedefinde tek Coupe ilani 2024
    // modeldi; 2025 penceresi yalnizca CABRIO icerdigi icin "Coupe"
    // sozlugu dusuruluyor ve iki acik Cabrio ilani Coupe kohortuna giriyordu.
    const observedBodies = new Set(
      candidates.map((c) => this.bodyOf(c)).filter(Boolean),
    );
    let bodySignalDropped = Boolean(requestedBody) && !observedBodies.has(requestedBody);
    if (bodySignalDropped) {
      const familyBodies = await this.familyBodyVocabulary(make, model);
      if (familyBodies.has(requestedBody)) bodySignalDropped = false;
    }
    const paramBody = bodySignalDropped ? '' : requestedBody;

    if (candidates.length === 0) {
      return { ...this.emptyResult(make, model, year, duplicateCount, damagedCount), engineEvidence };
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
      /** Paket/donanim gevsetilmez: yalniz ayni donanim etiketi. */
      trimFaithful?: boolean;
    }> = [
      { level: 1, yearSpan: 0, strictEngine: true, requireFuel: true, requireTransmission: true, minCount: PRICING_LIMITS.minCompCountForPricing },
      // SIRA: once KIMLIK korunur, sonra yil TEK YONLU ve EN YAKINDAN acilir.
      //
      // Her kimlik kademesi kendi icinde yil 0 -> +1 (-> +2) diye genisler.
      // Hedef yilda yeterli kanit varken daha yeni yil EKLENMEZ: emsal
      // sayisini buyutmek yerel piyasayi genel ortalamaya cevirir.
      //
      // DONANIM, yil genislemesinden ONCE gelir. Olculen: Passat
      // "1.5 TSI Elegance" 2021 icin 17 birebir Elegance emsali varken
      // Business/Impression havuza katilinca nakit teklif %16 dusuyordu.
      // Yani "ayni donanim / komsu yeni yil", "ayni yil / baska donanim"dan
      // daha dogru bir emsaldir. Donanim ancak GERCEKTEN kitken gevsetilir.
      { level: 2, yearSpan: 0, strictEngine: false, requireFuel: true, requireTransmission: false, minCount: PRICING_LIMITS.minCompCountForPricing, trimFaithful: true },
      { level: 2, yearSpan: 1, strictEngine: false, requireFuel: true, requireTransmission: false, minCount: PRICING_LIMITS.minCompCountForPricing, trimFaithful: true },
      { level: 2, yearSpan: 2, strictEngine: false, requireFuel: true, requireTransmission: false, minCount: PRICING_LIMITS.minCompCountForPricing, trimFaithful: true },
      { level: 2, yearSpan: 0, strictEngine: false, requireFuel: true, requireTransmission: false, minCount: PRICING_LIMITS.minCompCountForPricing },
      { level: 2, yearSpan: 1, strictEngine: false, requireFuel: true, requireTransmission: false, minCount: PRICING_LIMITS.minCompCountForPricing },
      { level: 3, yearSpan: 1, strictEngine: false, requireFuel: true, requireTransmission: false, minCount: 4 },
      { level: 3, yearSpan: 2, strictEngine: false, requireFuel: true, requireTransmission: false, minCount: 4 },
    ];

    let level3Snapshot: {
      level: number;
      selected: RawCandidate[];
      bodyEvidence: RawCandidate[];
      trimMatchedCount: number;
    } | null = null;

    for (const cfg of levels) {
      const selected: RawCandidate[] = [];
      let trimMatchedCount = 0;

      for (const r of candidates) {
        // TEK YONLU YIL KAPISI: hedeften ESKI ilan hicbir kademede giremez.
        if (r.year < year) continue;
        if (r.year - year > cfg.yearSpan) continue;

        // Motor KANITI her kademede ayni sekilde kullanilir: ayri motor alani
        // YA DA tam-model metnindeki ACIK imza. Onceki surumde alt kademeler
        // yalniz ayri alana bakiyordu; motoru "A3 Sedan 35 TFSI" etiketinde
        // acikca yazili 429 gercek ilan, alan bos diye L2/L3'te toptan
        // dusuyordu. Imza olmayan ilan yine dislanir: "bilinmiyor" genis
        // havuza sizmaz, ama "bilinen" de yok sayilmaz.
        const targetEngine = paramEngineEvidence;
        const engine = this.engineEvidenceOf(r);
        if (targetEngine) {
          if (!engine) continue;
          if (!isEngineCompatible(targetEngine, engine, cfg.strictEngine)) continue;
        } else if (cfg.strictEngine) {
          // Hedefin motoru ne alanda ne de TAM MODEL icinde bilinmiyorsa
          // Seviye 1 (birebir motor) uygulanamaz.
          continue;
        }

        // BIREBIR KIMLIK: marka + seri + TAM MODEL normalize esitligi.
        // Substring KULLANILMAZ: "Trend" != "Trend X", "Emotion" != "Emotion Plus".
        // Hedef hic paket beyan etmediyse (yalniz motor secildi) tam model
        // esitligi ARANMAZ; o durumda kimlik marka+seri+birebir motordur.
        if (cfg.level === 1 && foldedParamTrim) {
          // Taraflardan biri bossa sahte birebir kimlik URETILMEZ.
          if (!fullModelExact(targetFullModel, this.fullModelOf(r))) continue;
          if (!targetHasEngineSignature) {
            // TAM MODEL motor tasimiyorsa (orn. "Joy"), motor ayrimini
            // canonicalEngine yapmalidir: 1.0 TCe Joy != 1.0 SCe Joy.
            const candidateEngine = this.engineOf(r);
            if (!paramEngine || !candidateEngine) continue;
            if (!isEngineCompatible(paramEngine, candidateEngine, true)) continue;
          }
        }

        // CASE A: hedef kasa BILINIYOR + adayin kasasi BILINIYOR + FARKLI
        // -> her seviyede dislanir (420d Cabrio, 420d Coupe'nin emsali olamaz).
        // CASE C: adayin kasasi bilinmiyorsa BURADA dislanmaz; buildResult'ta
        // dusuk agirlik alir. UNKNOWN != KNOWN MISMATCH.
        //
        // RED tarafi iki katmanlidir:
        //   1) bodyFromName (aracin adi kasa soyluyor): sozluk dusmesinden
        //      ETKILENMEZ. Olculen: BMW 840i Coupe 2019/2020 kohortlarina
        //      1 acik Cabrio sizmisti (ailenin ilan sozlugunde COUPE etiketi
        //      yok diye kapi topyekun kapaniyordu). Ad kimliktir; ACIKCA
        //      farkli kasa dislanir, UNKNOWN serbesttir.
        //   2) paramBody (kategorik etiket): yalnizca ilan sozlugu
        //      destekliyorsa calisir (KATALOG SOZLUGU != ILAN SOZLUGU).
        const candidateBody = this.bodyOf(r);
        if (bodyFromName && candidateBody && candidateBody !== bodyFromName) continue;
        if (paramBody && candidateBody && candidateBody !== paramBody) continue;

        if (cfg.requireFuel && paramFuel) {
          const f = this.fuelOf(r);
          // Yakiti bilinmeyen ilan Seviye 1'e alinmaz; alt seviyelerde
          // agirligi dusurulerek kabul edilir.
          if (cfg.level === 1 && !f) continue;
          if (f && !this.fuelCompatible(paramFuel, f)) continue;
        }

        if (cfg.requireTransmission && paramTransmission) {
          const t = this.transmissionOf(r);
          if (t && t !== paramTransmission) continue;
        }

        // Paket kaniti UC durumludur; UNKNOWN celiski degildir, CONFLICT'tir.
        const pkgEvidence = this.packageEvidenceOf(r, foldedParamTrim);
        const trimHit = pkgEvidence !== 'CONFLICT';
        const trimExplicit = Boolean(foldedParamTrim) && pkgEvidence === 'MATCH';

        // Seviye 1'de paket kontrolu TAM MODEL esitligiyle zaten yapildi.
        // Hedef aracin motor kodu bilinmiyorsa paketi ayni olmayan ilanlar
        // havuza alinmaz; aksi halde tum motor secenekleri tek fiyatta birlesir.
        // Motor KANITI biliniyorsa paket gevsetilebilir (ayni arac ailesi,
        // farkli donanim); bilinmiyorsa paket tek ayirt edici oldugu icin
        // korunur. Onceki surumde bu koruma motor ALANINA bakiyordu ve kanit
        // etikette olsa bile tum aileyi eliyordu.
        if (!paramEngineEvidence && foldedParamTrim && !trimHit) continue;
        // DONANIMA SADIK kademe: yalnizca ACIK paket kaniti olan ilanlar.
        // UNKNOWN burada YETMEZ (sadakat, bilinen paket demektir); gevsek
        // kademelerde UNKNOWN kabul edilir, CONFLICT hicbirinde.
        if (cfg.trimFaithful && foldedParamTrim && !trimExplicit) continue;
        if (trimExplicit) trimMatchedCount++;

        selected.push(r);
      }

      // KM YERELLIGI kademe kabulunden ONCE uygulanir: kohort neyse, kabul
      // olcutu de o kohort uzerinden isler.
      const local = this.applyMileageLocality(selected, targetKm, cfg.minCount);

      if (cfg.level === 3) level3Snapshot = { level: 3, selected: local, bodyEvidence: selected, trimMatchedCount };
      if (local.length >= cfg.minCount) {
        return { ...this.buildResult({
          level: cfg.level,
          make,
          model,
          // Motor kanitini gecer: alan bos olsa bile TAM MODEL icindeki acik
          // imza gecerli motor bilgisidir.
          paramEngine: paramEngineEvidence,
          paramTrim,
          paramFuel,
          paramBody,
          year,
          selected: local,
          bodyEvidence: selected,
          targetKm,
          trimMatchedCount,
          annualRate,
          yearAdjustmentSource,
          duplicateCount,
          damagedCount,
          totalCandidates: candidates.length,
        }), engineEvidence };
      }
    }

    if (level3Snapshot && level3Snapshot.selected.length > 0) {
      // DUSUK SAYI != VERI YOK. Ayni arac ailesinden gercek emsal varsa fiyat
      // URETILIR; sayi azligi guveni dusurur ve manuel kapiya yonlendirir
      // (servis katmani: Seviye 3 ve <8 emsal zaten MANUAL). Onceki surumde
      // 1-3 gercek emsal "yetersiz veri"ye cevriliyor, musteri eldeki kanita
      // ragmen bos sayfa goruyordu.
      const n = level3Snapshot.selected.length;
      const built = this.buildResult({
        level: 3,
        make,
        model,
        paramEngine: paramEngineEvidence,
        paramTrim,
        paramFuel,
        paramBody,
        year,
        selected: level3Snapshot.selected,
        bodyEvidence: level3Snapshot.bodyEvidence,
        targetKm,
        trimMatchedCount: level3Snapshot.trimMatchedCount,
        annualRate,
        yearAdjustmentSource,
        duplicateCount,
        damagedCount,
        totalCandidates: candidates.length,
      });
      return {
        ...built,
        engineEvidence,
        isLimitedComps: true,
        // Musteriye EMSAL SAYISI ve kademe SIZDIRILMAZ (bkz. is kurali):
        // yalnizca "sinirli sayida benzer ilan" bilgisi verilir. Sayi ve
        // kademe denetim alanlarinda (matchedCount / level) zaten mevcuttur.
        explanationNote:
          `${make} ${model} ${paramEngineEvidence || ''} (${year}) için piyasada sınırlı sayıda ` +
          `benzer ilan bulunduğu için teklif uzman kontrolüyle kesinleşecektir.`,
      };
    }

    return { ...this.emptyResult(make, model, year, duplicateCount, damagedCount), engineEvidence };
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
    /**
     * KASA BELIRSIZLIGI KANITI — km yerelligi UYGULANMADAN ONCEKI kume.
     *
     * Kasa belirsizligi, hedefin KIMLIGINE dair bir risktir; fiyat kohortunun
     * kilometre penceresine gore daralmasi bu riski ortadan kaldirmaz. Ayni
     * kumeyi kullanmak guvenlik sinyalini korurken fiyat kohortunu yerel
     * tutar. Olculen: BMW 420d 2014 (kasa beyansiz) icin km yerelligi sonrasi
     * kasa gruplari destek esiginin altina dusuyor ve uyari SUSUYORDU.
     */
    bodyEvidence: RawCandidate[];
    targetKm: number;
    trimMatchedCount: number;
    annualRate: number;
    yearAdjustmentSource: string;
    duplicateCount: number;
    damagedCount: number;
    totalCandidates: number;
  }): EmsalMatchResult {
    const {
      level, make, model, paramEngine, paramTrim, paramFuel, paramBody, year, selected,
      bodyEvidence, targetKm, trimMatchedCount, annualRate, yearAdjustmentSource,
      duplicateCount, damagedCount,
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

    /**
     * TEK GERCEK EMSAL: PIYASA REFERANSI O ILANIN FIYATIDIR.
     *
     * Elimizde tek bir gercek ilan varsa, gozlenebilir piyasa TEK bir isteme
     * fiyatindan ibarettir. Bu fiyati genel bir yillik deger kaybi orani ile
     * hedef model yilina tasimak, sahip OLMADIGIMIZ bir piyasa bilgisini
     * biliyormus gibi davranmaktir.
     *
     * Oran zaten kanittan gelmiyor: `learnAnnualDepreciation` en az 3 yil
     * noktasi (her biri >=3 ilan) ister; tek ilanli havuzda daima
     * DEFAULT_ANNUAL_RATE doner. Olculen: Abarth 500e Coupe icin tek gercek
     * ilan 2024 / 3.500.000 TL iken 2025 hedefinde piyasa referansi
     * 3.695.000 TL gosteriliyordu — gozlenmemis bir fiyat.
     *
     * Kilometre duzeltmesi DEGISMEDI: o, fiyat cekirdeginin mevcut kanonik
     * yoludur ve ayni ilanin farkli kilometreye tasinmasidir, baska bir
     * araca degil.
     *
     * N >= 2 davranisi AYNEN korunur.
     */
    const singleComparable = selected.length === 1;

    for (const r of selected) {
      const engine = this.engineEvidenceOf(r) || 'Bilinmiyor';
      const trimName = (r.canonicalTrim || '').trim() || 'Belirtilmemiş';
      engineDist[engine] = (engineDist[engine] || 0) + 1;
      trimDist[trimName] = (trimDist[trimName] || 0) + 1;

      const normalizedPrice = singleComparable
        ? r.price
        : this.normalizeToYear(r.price, r.year, year, annualRate);

      const fresh = this.freshnessWeight(r.scrapedAt);
      freshnessSum += fresh;

      // Esleme kalitesi agirligi: yil farki, trim uyumu, yakit bilinmezligi
      let quality = 1;

      // Hedef kilometreye YAKINLIK: en yakin gercek gozlemler merkezi belirler.
      // Ornek (hedef 5.000 km): 6k/8k/15k ilanlari, 80k/120k ilanlarina gore
      // toplam agirligin buyuk cogunlugunu tasir.
      quality *= this.mileageProximityWeight(r.mileageKm, targetKm);

      const yearDiff = Math.abs(r.year - year);
      if (yearDiff === 1) quality *= 0.75;
      else if (yearDiff >= 2) quality *= 0.5;

      // Paket kalitesi: ACIK eslesme tam agirlik, bilinmeyen hafif, celiski
      // belirgin ceza (havuza girmisse gevsek kademededir).
      if (foldedParamTrim) {
        const ev = this.packageEvidenceOf(r, foldedParamTrim);
        if (ev === 'CONFLICT') quality *= 0.7;
        else if (ev === 'UNKNOWN') quality *= 0.85;
      }

      // CASE C: hedef kasa biliniyor ama adayin kasasi bilinmiyorsa hafif
      // belirsizlik cezasi. CASE B (ayni kasa) tam agirlik alir.
      if (paramBody && !this.bodyOf(r)) quality *= 0.9;

      if (this.fuelOf(r)) fuelKnownCount++;
      if (this.transmissionOf(r)) transKnownCount++;
      if (paramFuel && !this.fuelOf(r)) quality *= 0.8;
      const exactEngine =
        !!paramEngine &&
        !!this.engineEvidenceOf(r) &&
        isEngineCompatible(paramEngine, this.engineEvidenceOf(r), true);
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
      // Hedef aracin motoru NE alanda NE DE tam model icinde biliniyorsa fiyat
      // guveni ustten sinirlanir. Tam model acik motor imzasi tasiyorsa
      // (orn. "1.6 TDI BlueMotion Comfortline") bu sinir uygulanmaz.
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
    for (const r of bodyEvidence) {
      const b = (this.bodyOf(r) || '').trim();
      if (!b) continue;
      if (!bodyGroups.has(b)) bodyGroups.set(b, []);
      bodyGroups.get(b)!.push(r.price);
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
      yearAdjustmentSource: singleComparable ? 'SINGLE_COMPARABLE_NO_YEAR_ADJUSTMENT' : yearAdjustmentSource,
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
