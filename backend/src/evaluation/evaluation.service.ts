import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { TelegramService } from '../telegram/telegram.service';
import { EmsalMatcherService } from './emsal-matcher.service';
import { RobustPricingCalculator } from './robust-pricing-calculator';
import { splitVariantString } from './listing-attributes';
import { assessCondition } from './condition-assessment';

@Injectable()
export class EvaluationService {
  /** Yetersiz veri lead'ini musterinin kendi katalog talebinden ayirir. */
  private static readonly INSUFFICIENT_LEAD_SOURCE = 'INSUFFICIENT_VALUATION';

  /** Ayni denemeyi tekrarlamak lead spam'i URETMEZ. */
  private static readonly LEAD_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private telegramService: TelegramService,
    private emsalMatcherService: EmsalMatcherService,
  ) {}

  /**
   * Lead icin arac kimligi. YALNIZCA dogrulanmis ya da musterinin kendi
   * bildirdigi deger kullanilir; hicbir sey UYDURULMAZ.
   *
   * Sira: cekirdegin dogruladigi hedef -> musterinin gozlenen secimi ->
   * katalogdaki marka/model adi. Hicbiri cozulemezse lead ACILMAZ, cunku
   * `VehicleRequest.brand/model` zorunludur ve yer tutucu yazmak veriyi
   * kirletirdi.
   */
  private async resolveLeadIdentity(
    dto: CreateEvaluationDto,
    res: any,
  ): Promise<{ brand: string; model: string } | null> {
    const brandFromResult = res?.vehicle?.brand;
    const modelFromResult = res?.vehicle?.model;
    if (brandFromResult && modelFromResult) {
      return { brand: brandFromResult, model: modelFromResult };
    }

    if (dto.observedMake && dto.observedModel) {
      return { brand: dto.observedMake, model: dto.observedModel };
    }

    const [manufacturer, model] = await Promise.all([
      this.prisma.manufacturer.findUnique({ where: { id: dto.manufacturerId } }),
      this.prisma.model.findUnique({ where: { id: dto.modelId } }),
    ]);
    if (manufacturer?.name && model?.name) {
      return { brand: manufacturer.name, model: model.name };
    }

    return null;
  }

  /**
   * Yetersiz veri donen degerlemeyi uzman degerlendirmesi talebi olarak saklar.
   *
   * Saklanan her alan MUSTERININ KENDI BEYANIDIR. Motor, paket, piyasa degeri,
   * nakit teklif, konsinye fiyati ve guven skoru YAZILMAZ: bunlar hic
   * hesaplanmadi.
   *
   * Hata durumunda musteri yaniti BOZULMAZ; lead kaybi loglanir.
   */
  private async preserveInsufficientLead(dto: CreateEvaluationDto, res: any): Promise<void> {
    try {
      const identity = await this.resolveLeadIdentity(dto, res);
      if (!identity) {
        console.warn('Yetersiz veri lead atlandi: arac kimligi cozulemedi (UYDURULMADI).');
        return;
      }

      const phone = (dto.phone || '').trim() || null;
      const year = typeof dto.year === 'number' ? dto.year : null;

      // Ayni musteri/arac icin yakin zamanda acilmis bekleyen talep varsa
      // yenisi ACILMAZ: "Tekrar Dene" lead spam'ine donusmemeli.
      const duplicate = await this.prisma.vehicleRequest.findFirst({
        where: {
          source: EvaluationService.INSUFFICIENT_LEAD_SOURCE,
          status: 'PENDING',
          phone,
          brand: identity.brand,
          model: identity.model,
          year,
          createdAt: { gte: new Date(Date.now() - EvaluationService.LEAD_DEDUP_WINDOW_MS) },
        },
      });
      if (duplicate) return;

      await this.prisma.vehicleRequest.create({
        data: {
          source: EvaluationService.INSUFFICIENT_LEAD_SOURCE,
          brand: identity.brand,
          model: identity.model,
          year,
          mileage: Number.isFinite(dto.mileage) ? dto.mileage : null,
          firstName: dto.firstName?.trim() || null,
          lastName: dto.lastName?.trim() || null,
          phone,
        },
      });
    } catch (err) {
      console.error('Yetersiz veri lead kaydedilemedi:', err);
    }
  }

  async evaluateVehicle(dto: CreateEvaluationDto, userIp?: string) {
    const res = await this.calculateValuationCore(dto);
    if (res.status === 'INSUFFICIENT_DATA' || res.status === 'DATA_INTEGRITY_ERROR') {
      /**
       * YETERSIZ VERI BIR SATIS FIRSATIDIR, TEKNIK HATA DEGIL.
       *
       * `VehicleEvaluation` yine ACILMAZ ve bu dogrudur: ortada gercek bir
       * degerleme yoktur; o tablonun fiyat alanlari zorunlu Float'tir ve 0
       * yazmak PARA UYDURMAK olurdu.
       *
       * Ancak musterinin verdigi bilgiler de kayboluyordu: ad, telefon ve arac
       * kimligi hicbir yerde saklanmiyordu (olculen: 1.593 hedefin 180'i,
       * %11,3). Musteri kendisi aramazsa galeri bu denemeden HABERSIZ kaliyordu.
       * Artik mevcut "Arac Talepleri" akisinda uzman degerlendirmesi talebi
       * olarak korunur.
       *
       * DATA_INTEGRITY_ERROR BILEREK DISARIDA: o bozuk istek/hesap koruma
       * durumudur (modelId markaya ait degil, ya da adjustedP35 > FMV), piyasa
       * kapsama sorunu DEGILDIR ve satis talebi uretmemelidir.
       */
      if (res.status === 'INSUFFICIENT_DATA') {
        await this.preserveInsufficientLead(dto, res);
      }
      return res;
    }

    // Save Evaluation to DB
    // vehicleSpecificationId OPSIYONELDIR: katalogda karsiligi olmayan gercek
    // araclar (orn. Fiat Egea) da kaydedilir. Arac kimligi her durumda
    // anlik goruntu alanlarinda saklanir, boylece katalog kaydi olmadan da
    // degerlemenin hangi arac icin yapildigi kaybolmaz.
    const evaluation = await this.prisma.vehicleEvaluation.create({
      data: {
        vehicleSpecificationId: res.results!.vehicleSpecificationId ?? null,
        vehicleMake: res.vehicle!.brand || null,
        vehicleModel: res.vehicle!.model || null,
        vehicleEngine: res.vehicle!.variant || null,
        vehicleTrim: res.vehicle!.package || null,
        vehicleYear: res.vehicle!.year ?? null,
        vehicleBodyType: res.vehicle!.bodyType || null,
        licensePlate: dto.licensePlate,
        mileage: dto.mileage,
        color: dto.color,
        damageStatus: dto.damageStatus,
        damageDetails: dto.damageStatus === 'NO' ? 'Hatasız / Orijinal' : 'Hasarlı',
        estimatedValue: res.results!.cashOffer,
        // GERCEK piyasa degerleri artik SAKLANIR: galeri paneli bunlari
        // nakit teklifden sabit carpanlarla yeniden URETMEZ.
        marketReferenceValue: res.results!.marketReferenceValue ?? null,
        conditionAdjustedSaleValue: res.results!.conditionAdjustedSaleValue ?? null,
        // KONSINYE ILAN FIYATI (maxExpectedValue) MUSTERI NETI DEGILDIR.
        // Ilan fiyati tanim geregi beklenen satisin ustundedir; musterinin
        // eline gececek tutar ayri bir sayidir ve cekirdek onu zaten
        // hesapliyor. Panel bunu komisyon/ilan/nakit uzerinden TURETMEZ.
        customerConsignmentNet: res.results!.customerConsignmentNet ?? null,
        // GERCEK DURUM AYNEN SAKLANIR: galeri paneli durumu artik
        // `aiAnalysis`/`confidenceScore`/fiyat alanlarindan TURETMEZ.
        // Istemciye donen `status` ile birebir ayni deger yazilir.
        evaluationStatus: res.status,
        minExpectedValue: res.results!.cashOfferMin,
        maxExpectedValue: res.results!.consignmentListingPrice,
        quickSaleValue: res.results!.cashOfferMin,
        confidenceScore: res.results!.confidenceScore,
        aiAnalysis: JSON.stringify(res.aiAnalysis),
        userIp,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        sellingTimeline: dto.sellingTimeline,
        userDesiredPrice: dto.userDesiredPrice,
        finalOfferedPrice: res.results!.cashOffer,
        features: dto.features || null,
      },
    });

    this.telegramService.sendEvaluationNotification({
      licensePlate: dto.licensePlate,
      vehicleName: `${res.vehicle!.year} ${res.vehicle!.brand} ${res.vehicle!.model} (${res.vehicle!.variant || ''})`,
      brandName: res.vehicle!.brand,
      modelName: res.vehicle!.model,
      variantName: res.vehicle!.variant || '',
      year: res.vehicle!.year,
      fuel: res.vehicle!.fuelType || 'Benzin',
      transmission: res.vehicle!.transmission || 'Otomatik',
      mileage: dto.mileage,
      color: dto.color,
      damageStatus: dto.damageStatus,
      fairMarketValue: res.results!.fairMarketValue,
      finalOfferedPrice: res.results!.cashOffer,
      finalConsignmentPrice: res.results!.consignmentListingPrice,
      // Bildirimde ILAN FIYATI ile MUSTERI NETI ayri ayri gorunur; bayi
      // hangisinin isteme fiyati, hangisinin odeme oldugunu tahmin etmez.
      customerConsignmentNet: res.results!.customerConsignmentNet ?? null,
      userDesiredPrice: dto.userDesiredPrice,
      sellingTimeline: dto.sellingTimeline,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
    }).catch((err) => console.error('Telegram notification error:', err));

    return {
      /**
       * HESAPLANAN DURUM AYNEN AKTARILIR.
       *
       * Onceki surumde burada 'SUCCESS' SABIT yaziliyordu; boylece guvenlik
       * katmaninin MANUEL'e kapattigi arac (yapisal hasar, airbag, motor/
       * sanziman arizasi, Tramer >= %20, 3+ degisen panel, kasa belirsizligi,
       * Seviye 3, dusuk emsal/guven, musteri tabani catismasi) musteriye
       * TAMAMLANMIS OTOMATIK TEKLIF olarak gosteriliyordu: istemci yalnizca
       * `status` alanina bakar ve MANUAL_EVALUATION_REQUIRED ekrani hic
       * calismazdi. `results.requiresManualApproval` yanitin icinde tasiniyor
       * olsa da hicbir istemci bu alani okumuyor.
       *
       * Kayit ve bildirim davranisi DEGISMEZ: degerleme yine kaydedilir ve
       * `evaluationId` doner; yalnizca durum sozlesmesi geri gelir.
       *
       * `message` BILEREK aktarilmaz: cekirdekteki metin dahili ("dusuk
       * segment veya yuksek riskli...") ve musteriye gosterilecek dille
       * yazilmamistir. Istemci kendi musteri dostu metnini kullanir.
       */
      status: res.status,
      evaluationId: evaluation.id,
      persisted: true,
      vehicle: res.vehicle,
      results: res.results,
      aiAnalysis: res.aiAnalysis,
      comparableListings: res.comparableListings,
    };
  }

  async calculateVehicleValuationPreview(dto: CreateEvaluationDto) {
    const res = await this.calculateValuationCore(dto);
    if (res.status === 'INSUFFICIENT_DATA' || res.status === 'DATA_INTEGRITY_ERROR') {
      return {
        status: res.status,
        confidenceScore: res.confidenceScore,
        message: res.message,
        results: null,
        comparableListings: [],
      };
    }

    return {
      status: res.status,
      confidenceScore: res.confidenceScore,
      message: res.message,
      results: res.results,
      comparableListings: res.comparableListings,
    };
  }

  /**
   * Verilen kondisyon kesintisi ile fiyat zincirini calistirir.
   * damagePenalty = 0 verildiginde sonuc TEMIZ ESDEGER degerdir.
   */
  private computePricing(
    emsalResult: any,
    dto: CreateEvaluationDto,
    targetVariant: string,
    damagePenalty: number,
    wP5: number, wP35: number, wP50: number, wP60: number, wP95: number,
  ): any {
    /**
     * MOTOR KIMLIGI KANITI EMSAL MOTORUNDAN OKUNUR — TEKRAR TURETILMEZ.
     *
     * Emsal motoru hedefin motorunu iki yoldan taniyabilir: musterinin sectigi
     * motor alanindan (CUSTOMER_FIELD) ya da TAM MODEL icindeki acik imzadan
     * (FULL_MODEL_SIGNATURE, orn. "1.5 BlueHDi Performance Line"). Eslesmeyi
     * bu kanitla yapar ve kendi guven tavanini da buna gore uygular.
     *
     * Onceki surumde burada AYNI GERCEK ikinci kez, yalnizca motor ALANINA
     * bakan ayri bir ayristirmayla turetiliyordu. Alan bos oldugunda kanit
     * gercekte VARKEN "motor bilinmiyor" sayiliyor ve guven 60'a tavanlanip
     * arac MANUEL'e gidiyordu. Olculen: 1.413 fiyatlanan hedefin 349'u
     * (%24,7) bu durumdaydi; 349/349 MANUAL, 205'i L1 birebir eslesme,
     * 140'i L1 + >=8 emsal (orn. DS 4 2023 "1.5 BlueHDi Performance Line",
     * L1, 54 emsal, guven 60).
     *
     * Kanit YOKSA (NONE) eski guvenlik davranisi AYNEN korunur. Bu deger
     * kalici veriye YAZILMAZ ve tek basina AUTO uretmez: diger tum guven
     * cezalari ve manuel kapilari degismeden calisir.
     */
    const targetEngineKnown: boolean =
      emsalResult?.engineEvidence
        ? Boolean(emsalResult.engineEvidence.strong)
        : Boolean(splitVariantString(String(targetVariant || '')).engineCode);
    if (emsalResult.cleanListings && emsalResult.cleanListings.length > 0) {
      return RobustPricingCalculator.computeValuation({
        cleanListings: emsalResult.cleanListings,
        userYear: dto.year,
        userMileage: dto.mileage,
        damagePenalty,
        userDesiredPrice: dto.userDesiredPrice,
        matchedLevel: emsalResult.level,
        baseConfidenceScore: emsalResult.confidenceScore,
        realMatchedListingCount: emsalResult.actuallyUsedListingCount || emsalResult.matchedCount,
        level1CandidateCount: emsalResult.level1CandidateCount,
        level2CandidateCount: emsalResult.level2CandidateCount,
        level3CandidateCount: emsalResult.level3CandidateCount,
        usedEngineDistribution: emsalResult.usedEngineDistribution,
        usedTrimDistribution: emsalResult.usedTrimDistribution,
        excludedListingCount: emsalResult.excludedListingCount,
        exclusionReasons: emsalResult.exclusionReasons,
        listingWeights: emsalResult.listingWeights,
        freshnessScore: emsalResult.freshnessScore,
        engineExactShare: emsalResult.engineExactShare,
        fuelKnownShare: emsalResult.fuelKnownShare,
        transmissionKnownShare: emsalResult.transmissionKnownShare,
        targetEngineKnown,
      });
    }
    return RobustPricingCalculator.computeValuationFromSnapshot({
      weightedP5: wP5,
      weightedP35: wP35,
      weightedP50: wP50,
      weightedP60: wP60,
      weightedP95: wP95,
      realMatchedListingCount: emsalResult.matchedCount,
      kmDecayPer10k: emsalResult.kmDecayPer10k || 0.0025,
      referenceMedianMileage: emsalResult.referenceMedianMileage,
      mileageAdjustmentSource: emsalResult.mileageAdjustmentSource || 'DEFAULT_FALLBACK',
      userYear: dto.year,
      userMileage: dto.mileage,
      damagePenalty,
      userDesiredPrice: dto.userDesiredPrice,
      matchedLevel: emsalResult.level,
      baseConfidenceScore: emsalResult.confidenceScore,
      freshnessScore: emsalResult.freshnessScore,
      engineExactShare: emsalResult.engineExactShare,
      fuelKnownShare: emsalResult.fuelKnownShare,
      transmissionKnownShare: emsalResult.transmissionKnownShare,
      targetEngineKnown,
    });
  }

  private async calculateValuationCore(dto: CreateEvaluationDto) {
    /**
     * GERCEK KAYNAK: RawVehicleListing.
     * Musteri, gercek ilan verisinden turetilen (gozlenen) marka/model/motor/
     * paket degerlerini secmisse degerleme KATALOGDAN BAGIMSIZ yurur.
     * VehicleSpecification yalnizca teknik zenginlestirme icin aranir;
     * bulunamamasi degerlemeyi ENGELLEMEZ.
     * (Olculen: 443 gercek marka/model kombinasyonundan 151'i -- 40.634 ilan,
     *  %22,7 -- katalog eksikligi yuzunden secilemiyordu; orn. Fiat Egea.)
     */
    // Gozlenen secenekler istemciye "OBS:<canonical deger>" kimligiyle sunulur.
    // Istemci ayrica observed* alanlarini gondermese bile bu kimlikler burada
    // cozulur; aksi halde hedef sessizce rastgele bir katalog kaydina duserdi.
    const OBS = 'OBS:';
    const decodeObs = (id?: string) =>
      id && id.startsWith(OBS) ? id.slice(OBS.length).trim() : '';
    const observed = {
      make: (dto.observedMake || '').trim(),
      model: (dto.observedModel || decodeObs(dto.modelId) || '').trim(),
      engine: (dto.observedEngine || decodeObs(dto.variantId) || '').trim(),
      trim: (dto.observedTrim || decodeObs(dto.packageId) || '').trim(),
    };
    if (!observed.make && (observed.model || observed.engine)) {
      const brand = await this.prisma.manufacturer.findUnique({
        where: { id: dto.manufacturerId }, select: { name: true },
      }).catch(() => null);
      observed.make = decodeObs(dto.manufacturerId) || brand?.name || '';
    }
    // Model katalogdan, motor gozlenen listeden gelmis olabilir: model adini
    // katalogdan tamamla ki hedef eksik kalmasin.
    if (!observed.model && observed.engine && dto.modelId) {
      const md = await this.prisma.model.findUnique({
        where: { id: dto.modelId }, select: { name: true },
      }).catch(() => null);
      observed.model = md?.name || '';
    }
    const hasObservedTarget = Boolean(observed.make && observed.model);

    // 1. Relational Validation: Verify modelId actually belongs to manufacturerId
    const targetModel = hasObservedTarget
      ? true
      : await this.prisma.model.findFirst({
          where: { id: dto.modelId, manufacturerId: dto.manufacturerId },
        });

    if (!targetModel) {
      return {
        status: 'DATA_INTEGRITY_ERROR',
        confidenceScore: 0,
        message: 'Seçilen model belirtilen markaya ait değildir (İlişkisel Veri Hatası).',
        results: null,
        vehicle: null,
        aiAnalysis: ['Geçersiz marka/model kombinasyonu gönderildi.'],
        comparableListings: [],
      };
    }

    const whereCondition: any = {
      year: dto.year,
      manufacturerId: dto.manufacturerId,
      modelId: dto.modelId,
    };
    if (dto.variantId) whereCondition.variantId = dto.variantId;
    if (dto.packageId) whereCondition.packageId = dto.packageId;
    if (dto.bodyTypeId) whereCondition.bodyTypeId = dto.bodyTypeId;
    if (dto.fuelTypeId) whereCondition.fuelTypeId = dto.fuelTypeId;
    if (dto.transmissionTypeId) whereCondition.transmissionTypeId = dto.transmissionTypeId;

    const specInclude = {
      manufacturer: true,
      model: true,
      variant: true,
      package: true,
      bodyType: true,
      fuelType: true,
      transmissionType: true,
      driveType: true,
      marketPrices: true,
    };

    let spec = await this.prisma.vehicleSpecification.findFirst({
      where: whereCondition,
      include: specInclude,
    });

    if (!spec) {
      // Fallback 1: Drop package/body/fuel/transmission filters for exact year
      const fb1: any = { year: dto.year, manufacturerId: dto.manufacturerId, modelId: dto.modelId };
      if (dto.variantId) fb1.variantId = dto.variantId;
      spec = await this.prisma.vehicleSpecification.findFirst({ where: fb1, include: specInclude });
    }

    if (!spec) {
      // Fallback 2: Drop year filter for variant
      const fb2: any = { manufacturerId: dto.manufacturerId, modelId: dto.modelId };
      if (dto.variantId) fb2.variantId = dto.variantId;
      spec = await this.prisma.vehicleSpecification.findFirst({ where: fb2, include: specInclude });
    }

    if (!spec) {
      // Fallback 3: Broad model lookup
      spec = await this.prisma.vehicleSpecification.findFirst({
        where: { manufacturerId: dto.manufacturerId, modelId: dto.modelId },
        include: specInclude,
      });
    }

    if (!spec && !hasObservedTarget) {
      return {
        status: 'INSUFFICIENT_DATA',
        confidenceScore: 0,
        message: 'Yeterli piyasa verisi bulunamadı',
        results: null,
        vehicle: null,
        aiAnalysis: ['Piyasa verisi eksik (Specification bulunamadı)'],
        comparableListings: [],
      };
    }

    /**
     * DEGERLEMENIN HEDEFI = MUSTERININ GERCEKTEN BEYAN ETTIGI ARAC.
     *
     * Katalog (VehicleSpecification) yalnizca TEKNIK ZENGINLESTIRME kaynagidir
     * (hp/tork/motor hacmi). Musteri bir motoru/paketi SECMEDIYSE o alan
     * BILINMIYOR'dur; katalogtan doldurulmaz.
     *
     * Onceki surumde `spec?.variant?.name` / `spec?.package?.name` kosulsuz
     * yedek olarak kullaniliyordu. Spec ise arama zincirinin son basamaginda
     * (Fallback 3: `findFirst({ manufacturerId, modelId })`) o modele ait
     * RASTGELE bir satirdi. Sonuc, olculmus gercek veriyle:
     *   - Renault Megane 2017 (1.243 ilan) icin musteriye motor
     *     "Megane E-Tech Electric" gosteriliyor, 937.707 TL piyasa /
     *     860.000 TL nakit uretiliyordu (arac elektrikli DEGIL).
     *   - Hyundai i20 / Citroen C-Elysee / Tesla Model Y -> paket
     *     "AMG / M / Sport Line"; BMW 3 Serisi -> motor "Premium".
     *   - Uydurma etiket emsal motorunda SERT FILTRE gibi calisip tum gercek
     *     emsalleri eledigi icin Opel Astra 2012 (1.498 gercek ilan)
     *     "Yeterli piyasa verisi bulunamadi" donuyordu. Korpusta >=20 emsali
     *     olan 146 hedefin %47,3'u bu yuzden fiyat alamiyordu.
     *
     * Emsal motoru ayni ilkeyi KASA TIPI icin zaten uyguluyor
     * (emsal-matcher.service.ts `bodySignalDropped`: "havuzda gorulmeyen
     * etiket kanit degildir"). Burasi ayni ilkeyi motor/paket/yakit/sanziman
     * icin kaynaginda uygular: kanit yoksa UNKNOWN, uydurma YOK.
     *
     * Marka/model DISARIDA kalir: musteri onlari acikca secti ve arama
     * zincirinin her basamagi manufacturerId + modelId ile filtrelenir.
     */
    const target = {
      make: observed.make || spec?.manufacturer?.name || '',
      model: observed.model || spec?.model?.name || '',
      variant: observed.engine || (dto.variantId ? spec?.variant?.name : '') || '',
      trim: observed.trim || (dto.packageId ? spec?.package?.name : '') || '',
      bodyType:
        dto.observedBodyType === 'UNKNOWN'
          ? undefined
          : dto.observedBodyType || (dto.bodyTypeId ? spec?.bodyType?.name : undefined),
      fuelType: dto.fuelTypeId ? spec?.fuelType?.name : undefined,
      transmission: dto.transmissionTypeId ? spec?.transmissionType?.name : undefined,
    };

    const aiAnalysis: string[] = [];

    // Match Comparable Listings
    const emsalResult = await this.emsalMatcherService.matchComparableListings({
      make: target.make,
      model: target.model,
      variant: target.variant || undefined,
      trim: target.trim || undefined,
      year: dto.year,
      mileageKm: dto.mileage,
      // Kasa tipi onceligi:
      //  1) Musterinin GOZLENEN secenekler arasindan yaptigi secim (kanit),
      //  2) 'UNKNOWN' secildiyse kasa bilgisi YOKTUR (katalog degerine dusulmez),
      //  3) secim yoksa katalog spec degeri (eslesme motoru, havuzda hic
      //     gorulmeyen katalog etiketlerini zaten kanit saymaz).
      bodyType: target.bodyType,
      fuelType: target.fuelType,
      transmission: target.transmission,
    });

    if (emsalResult.level === 4 || emsalResult.matchedCount === 0 || !emsalResult.cleanListings || emsalResult.cleanListings.length === 0) {
      return {
        status: 'INSUFFICIENT_DATA',
        confidenceScore: 0,
        message: 'Yeterli piyasa verisi bulunamadı',
        vehicle: {
          year: dto.year,
          brand: target.make,
          model: target.model,
          variant: target.variant || '',
          package: target.trim || '',
          bodyType: target.bodyType || '',
          fuelType: target.fuelType || '',
          transmission: target.transmission || '',
        },
        results: null,
        aiAnalysis: ['UYARI: Girdiğiniz araç için veritabanımızda yeterli emsal ilan verisi bulunamamıştır.'],
        comparableListings: [],
      };
    }

    // Percentile Protections (Requirement 9)
    const wP5 = emsalResult.weightedP5 || (emsalResult.weightedP50 || 0) * 0.85;
    const wP35 = emsalResult.weightedP35 || (emsalResult.weightedP50 || 0) * 0.92;
    const wP50 = emsalResult.weightedP50 || 0;
    const wP60 = emsalResult.weightedP60 || (emsalResult.weightedP50 || 0) * 1.02;
    const wP95 = emsalResult.weightedP95 || (emsalResult.weightedP50 || 0) * 1.15;

    const hasPercentileError = !(wP5 <= wP35 && wP35 <= wP50 && wP50 <= wP60 && wP60 <= wP95);

    // FIYAT ZINCIRI (sira onemlidir):
    //   EMSAL PIYASA -> TEMIZ ESDEGER DEGER -> KONDISYON DUZELTMESI ->
    //   KONDISYONA GORE DUZELTILMIS BEKLENEN SATIS -> NAKIT -> KONSINYE
    // Kondisyon katmani Tramer tutarini arac degerine ORANLAYARAK degerlendirir;
    // bu yuzden once damagePenalty=0 ile temiz esdeger deger hesaplanir, kondisyon
    // duzeltmesi bu degerin uzerine uygulanir. Kondisyon cezasi ile galeri kari
    // birbirinden ayri kalir.
    const priceWith = (damagePenalty: number) => this.computePricing(
      emsalResult, dto, target.variant, damagePenalty, wP5, wP35, wP50, wP60, wP95,
    );

    const cleanEquivalent = priceWith(0);

    const condition = assessCondition({
      damageStatus: dto.damageStatus,
      paintScheme: dto.paintScheme,
      chassisState: dto.chassisState,
      vehicleStatus: dto.vehicleStatus,
      tramerAmount: dto.tramerAmount,
      vehicleYear: dto.year,
      cleanMarketValue: cleanEquivalent.fairMarketValue,
    });
    const damagePenalty = condition.penalty;

    if (dto.damageStatus === 'NO' && damagePenalty === 0) {
      aiAnalysis.push('Aracın boyasız ve hatasız olması ikinci el piyasa değerini olumlu etkilemektedir.');
    } else if (damagePenalty > 0) {
      aiAnalysis.push(
        `Bildirdiğiniz kaporta/hasar durumu değerlendirmeye dahil edilmiştir (${(damagePenalty * 100).toFixed(1)}% kondisyon düzeltmesi).`,
      );
    }

    const calc: any = damagePenalty > 0 ? priceWith(damagePenalty) : cleanEquivalent;

    const isFmvTooHigh = calc.fairMarketValue >= 5000000;
    const isLevel3 = emsalResult.level === 3;
    const hasLowComps = emsalResult.matchedCount < 8;
    const hasLowCompsForHighFmv = isFmvTooHigh && emsalResult.matchedCount < 10;
    const hasLowConfidence = calc.confidenceScore <= 70;
    // Butunluk kontrolu HASSAS degerler uzerinde yapilir: calc.fairMarketValue
    // artik musteriye sunulan 5.000 TL adimli ticari degerdir ve 2.500'e kadar
    // asagi yuvarlanabilir; hassas P35 ile karsilastirmak sahte hata uretirdi.
    const preciseFmv = (calc as any).pricingAudit?.fairMarketValueRaw ?? calc.fairMarketValue;
    const isP35TooHigh = calc.adjustedP35 > preciseFmv;

    // Requirement 9: If adjustedP35 > fairMarketValue, throw DATA_INTEGRITY_ERROR (do not produce price)
    if (isP35TooHigh) {
      return {
        status: 'DATA_INTEGRITY_ERROR',
        confidenceScore: 0,
        message: 'Veri bütünlüğü hatası: Düzeltilmiş P35 değeri tahmini piyasa değerini aşamaz.',
        vehicle: {
          year: dto.year,
          brand: target.make,
          model: target.model,
          variant: target.variant || '',
          package: target.trim || '',
          bodyType: target.bodyType || '',
          fuelType: target.fuelType || '',
          transmission: target.transmission || '',
        },
        results: null,
        aiAnalysis: ['HATA: Veri bütünlüğü doğrulanamadı.'],
        comparableListings: [],
      };
    }

    // Emsal havuzu birebir motor/paket temsil etmiyorsa (isLimitedComps) fiyat
    // model ailesini temsil eder; otomatik teklif verilmez.
    const hasLimitedComps = Boolean(emsalResult.isLimitedComps);
    // Ağır hasar fiziksel ekspertiz gerektirir.
    // Yapisal/agir hasar veya mekanik ariza beyani -> otomatik fiyat verilmez.
    const hasHeavyDamage = damagePenalty >= 0.15 || condition.requiresManualReview;

    // Kasa BILINMIYOR + havuzdaki kasalar fiyat olarak anlamli ayrisiyor
    // -> otomatik teklif guvenilir degil (bkz. BODY_AMBIGUITY).
    const hasBodyAmbiguity = Boolean(emsalResult.bodyAmbiguityRisk);
    if (hasBodyAmbiguity) {
      aiAnalysis.push(
        'Aracınızın kasa tipi belirtilmediği için emsal havuzunda farklı kasa tipleri bir arada bulunuyor ' +
        've bu tipler arasında belirgin fiyat farkı var. Doğru fiyat için aracınız uzmanımızca değerlendirilecektir.',
      );
    }

    const requiresManual =
      hasPercentileError ||
      hasBodyAmbiguity ||
      isLevel3 ||
      hasLimitedComps ||
      hasHeavyDamage ||
      hasLowComps ||
      hasLowCompsForHighFmv ||
      hasLowConfidence ||
      calc.requiresManualApproval;

    if (calc.requiresManualApproval && calc.manualApprovalReason) {
      aiAnalysis.push(calc.manualApprovalReason);
    }
    if (condition.requiresManualReview && condition.manualReason) {
      aiAnalysis.push(condition.manualReason);
    }

    aiAnalysis.push(emsalResult.explanationNote);
    // Tek gercek emsalde KILOMETRE normalizasyonu da UYGULANMAZ; yapilmamis
    // bir duzeltmeyi katsayiyla birlikte raporlamak denetimi yanlis yonlendirir.
    if (calc.mileageAdjustmentSource === 'SINGLE_COMPARABLE_NO_MILEAGE_ADJUSTMENT') {
      aiAnalysis.push('Kilometre Düzeltmesi: Tek gerçek emsal bulunduğu için piyasa referansı o ilanın kendi fiyatıdır; kilometre düzeltmesi uygulanmamıştır.');
    } else if (calc.referenceMedianMileage) {
      aiAnalysis.push(`Kilometre Düzeltmesi: Emsal Medyan Km: ${calc.referenceMedianMileage.toLocaleString('tr-TR')} km | Araç Km: ${dto.mileage.toLocaleString('tr-TR')} km | Fark: ${(calc.kmDelta || 0).toLocaleString('tr-TR')} km | Katsayı: %${((calc.kmDecayPer10k || 0) * 100).toFixed(2)}/10.000km (${calc.mileageAdjustmentSource}) | Düzeltme: ${(calc.mileageAdjustment || 0).toLocaleString('tr-TR')} ₺`);
    } else {
      aiAnalysis.push('Emsal ilanlarda kilometre bilgisi bulunmadığı için kilometre düzeltmesi uygulanmamıştır.');
    }
    // Tek gercek emsalde YIL NORMALIZASYONU UYGULANMAZ (piyasa referansi o
    // ilanin kendi fiyatidir); dolayisiyla "indirgenmistir" notu da yazilmaz.
    // Aksi halde denetim dokumu yapilmayan bir islemi yapilmis gosterirdi.
    if (emsalResult.yearAdjustmentRate && emsalResult.yearAdjustmentSource !== 'SINGLE_COMPARABLE_NO_YEAR_ADJUSTMENT') {
      aiAnalysis.push(`Model Yılı Normalizasyonu: Farklı model yılına ait emsaller, veriden öğrenilen yıllık %${(emsalResult.yearAdjustmentRate * 100).toFixed(1)} değer farkıyla ${dto.year} model yılına indirgenmiştir (${emsalResult.yearAdjustmentSource}).`)
    } else if (emsalResult.yearAdjustmentSource === 'SINGLE_COMPARABLE_NO_YEAR_ADJUSTMENT') {
      aiAnalysis.push('Model Yılı Normalizasyonu: Tek gerçek emsal bulunduğu için piyasa referansı o ilanın kendi fiyatıdır; model yılı düzeltmesi uygulanmamıştır.');
    }

    if (emsalResult.isLimitedComps) {
      aiAnalysis.push('UYARI: Aracınız için sınırlı sayıda emsal bulunabilmiştir. Fiyat için galerimizden ek teyit almanızı öneririz.');
    }

    if (dto.userDesiredPrice && dto.userDesiredPrice > 0) {
      aiAnalysis.push(`Elinize geçmesini istediğiniz net tutar (${dto.userDesiredPrice.toLocaleString('tr-TR')} ₺) dikkate alınarak, Önerilen Halka Açık İlan Fiyatı ${calc.recommendedPublicListingPrice.toLocaleString('tr-TR')} ₺, Beklenen Satış Fiyatı ${calc.expectedSalePrice.toLocaleString('tr-TR')} ₺ ve Satış Sonrası Garantili Net Tutarınız ${calc.agreedCustomerNet.toLocaleString('tr-TR')} ₺ olarak hesaplanmıştır.`);
    }

    const comparableListings = await this.getRealComparableListings(emsalResult);

    return {
      status: requiresManual ? 'MANUAL_EVALUATION_REQUIRED' : 'SUCCESS',
      confidenceScore: calc.confidenceScore,
      message: requiresManual ? 'Düşük segment veya yüksek riskli araçlarda manuel değerlendirme gereklidir' : 'Başarılı',
      vehicle: {
        year: dto.year,
        brand: target.make,
        model: target.model,
        variant: target.variant || '',
        package: target.trim || '',
        bodyType: target.bodyType || '',
        fuelType: target.fuelType || '',
        transmission: target.transmission || '',
        // Teknik zenginlestirme: katalog kaydi varsa doldurulur, yoksa UNKNOWN.
        engineSize: spec?.variant?.engineSize || null,
        horsepower: spec?.variant?.horsepower || null,
        originalMSRP: spec?.originalMSRP ?? null,
      },
      results: {
        vehicleSpecificationId: spec?.id ?? null,
        adjustedP35: calc.adjustedP35,
        fairMarketValue: calc.fairMarketValue,
        /**
         * GERCEK PIYASA REFERANSI (kondisyon ONCESI temiz esdeger emsal merkezi).
         *
         * `fairMarketValue` kondisyon duzeltmesinden SONRAKI degerdir; galeri
         * paneli ise "piyasa degeri" olarak temiz referansi gostermek ister.
         * Bu deger daha once hicbir yerde saklanmiyordu ve panel onu nakit
         * teklifden sabit bir carpanla (cash / 0,88) URETIYORDU.
         */
        marketReferenceValue: cleanEquivalent.fairMarketValue,
        conditionAdjustedSaleValue: calc.expectedSalePrice,
        recommendedPublicListingPrice: calc.recommendedPublicListingPrice,
        expectedSalePrice: calc.expectedSalePrice,
        customerDesiredNet: calc.customerDesiredNet,
        aiRecommendedCustomerNet: calc.aiRecommendedCustomerNet,
        proposedCustomerNet: calc.proposedCustomerNet,
        agreedCustomerNet: calc.agreedCustomerNet,
        // NOT: galeri kârı, rezerv, komisyon ve risk katsayısı gibi dahili
        // kalemler müşteriye açılan yanıtta YER ALMAZ.

        cashOffer: calc.cashOffer,
        cashOfferMin: calc.cashOfferMin,
        cashOfferMax: calc.cashOfferMax,
        consignmentListingPrice: calc.recommendedPublicListingPrice,
        expectedConsignmentSalePrice: calc.expectedSalePrice,
        customerConsignmentNet: calc.agreedCustomerNet,
        estimatedDaysToSell: `${calc.estimatedDaysToSellMin}-${calc.estimatedDaysToSellMax} gün`,
        confidenceScore: calc.confidenceScore,
        matchedListingCount: emsalResult.actuallyUsedListingCount || calc.matchedListingCount,
        matchedLevel: emsalResult.level,
        level1CandidateCount: emsalResult.level1CandidateCount || 0,
        level2CandidateCount: emsalResult.level2CandidateCount || 0,
        level3CandidateCount: emsalResult.level3CandidateCount || 0,
        actuallyUsedListingCount: emsalResult.actuallyUsedListingCount || calc.matchedListingCount,
        usedEngineDistribution: emsalResult.usedEngineDistribution || {},
        usedTrimDistribution: emsalResult.usedTrimDistribution || {},
        pricingExplanation: emsalResult.explanationNote,
        // Backward Compatibility Aliases:
        estimatedValue: calc.cashOffer,
        finalOfferedPrice: calc.cashOffer,
        finalConsignmentPrice: calc.recommendedPublicListingPrice,
        userDesiredPrice: dto.userDesiredPrice,
        fairMarketRange: `${calc.cashOfferMin.toLocaleString('tr-TR')} ₺ - ${calc.recommendedPublicListingPrice.toLocaleString('tr-TR')} ₺`,
        minExpectedValue: calc.cashOfferMin,
        maxExpectedValue: calc.recommendedPublicListingPrice,
        quickSaleValue: calc.cashOfferMin,
        requiresManualApproval: requiresManual,
        kmDecayPer10k: emsalResult.kmDecayPer10k || calc.kmDecayPer10k || 0.0025,
        // Emsallerde km bilgisi yoksa uydurma referans UYRETILMEZ, null doner.
        referenceMedianMileage: emsalResult.referenceMedianMileage || calc.referenceMedianMileage || null,
        snapshotId: emsalResult.snapshotId,
        contributingSnapshotIds: emsalResult.contributingSnapshotIds || [],
        weightedP35: emsalResult.weightedP35,
        weightedP50: emsalResult.weightedP50,
      },
      aiAnalysis,
      comparableListings,
    };
  }

  private async getRealComparableListings(emsalResult: any) {
    // Fiyati gercekten olusturan ilanlar gosterilir (temsili/uydurma ilan yok).
    const selectedListingIds: string[] = (emsalResult.uniqueListingIds || []).slice(0, 5);
    if (selectedListingIds.length === 0) return [];
    try {

      const rawListings = await this.prisma.rawVehicleListing.findMany({
        where: { sourceListingId: { in: selectedListingIds } },
      });

      // Keep order as in selectedListingIds
      const listingMap = new Map(rawListings.map(r => [r.sourceListingId, r]));
      const orderedListings = selectedListingIds
        .map(id => listingMap.get(id))
        .filter(Boolean) as typeof rawListings;

      return orderedListings.map((r) => {
        let location = 'Bilinmiyor';
        if (r.city && r.city.trim() !== '') {
          location = r.city;
        }

        let date = 'Bilinmiyor';
        if (r.scrapedAt) {
          try {
            const d = new Date(r.scrapedAt);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            date = `${day}.${month}.${year}`;
          } catch (e) {}
        }

        return {
          id: r.id,
          year: r.year,
          mileage: r.mileageKm || 0,
          price: r.price,
          province: location,
          district: '',
          listingDate: date,
          photo: '',
          details: `${r.canonicalVariant || ''} ${r.canonicalTrim || ''} - ${r.canonicalTransmission || ''} - ${r.canonicalFuelType || ''}`,
          isRepresentativeVisualScenario: false,
          typeNote: 'Gerçek Piyasa Emsal İlanı',
        };
      });
    } catch (e) {
      console.error('Error fetching real comparable listings:', e);
      return [];
    }
  }

  async getEvaluationById(id: string) {
    const item = await this.prisma.vehicleEvaluation.findUnique({
      where: { id },
      include: {
        vehicleSpecification: {
          include: {
            manufacturer: true,
            model: true,
            variant: true,
            package: true,
            bodyType: true,
            fuelType: true,
            transmissionType: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Değerleme bulunamadı.');
    }

    // Arac kimligi: once kayit anindaki anlik goruntu, yoksa katalog iliskisi.
    // Katalogda karsiligi olmayan gercek araclarda spec NULL olabilir.
    const spec = item.vehicleSpecification;
    return {
      evaluationId: item.id,
      vehicle: {
        year: item.vehicleYear ?? spec?.year ?? null,
        brand: item.vehicleMake || spec?.manufacturer?.name || '',
        model: item.vehicleModel || spec?.model?.name || '',
        variant: item.vehicleEngine || spec?.variant?.name || '',
        package: item.vehicleTrim || spec?.package?.name || '',
        bodyType: item.vehicleBodyType || spec?.bodyType?.name || '',
        fuelType: spec?.fuelType?.name || '',
        transmission: spec?.transmissionType?.name || '',
      },
      results: {
        estimatedValue: item.estimatedValue,
        finalOfferedPrice: item.finalOfferedPrice || item.estimatedValue,
        userDesiredPrice: item.userDesiredPrice || null,
        fairMarketRange: `${item.minExpectedValue.toLocaleString('tr-TR')} ₺ - ${item.maxExpectedValue.toLocaleString('tr-TR')} ₺`,
        minExpectedValue: item.minExpectedValue,
        maxExpectedValue: item.maxExpectedValue,
        quickSaleValue: item.quickSaleValue,
        confidenceScore: `${item.confidenceScore}%`,
      },
      aiAnalysis: item.aiAnalysis ? JSON.parse(item.aiAnalysis as string) : [],
    };
  }
}
