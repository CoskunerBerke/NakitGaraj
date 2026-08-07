import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { TelegramService } from '../telegram/telegram.service';
import { EmsalMatcherService } from './emsal-matcher.service';
import { RobustPricingCalculator } from './robust-pricing-calculator';

@Injectable()
export class EvaluationService {
  constructor(
    private prisma: PrismaService,
    private telegramService: TelegramService,
    private emsalMatcherService: EmsalMatcherService,
  ) {}

  async evaluateVehicle(dto: CreateEvaluationDto, userIp?: string) {
    const res = await this.calculateValuationCore(dto);
    if (res.status === 'INSUFFICIENT_DATA' || res.status === 'DATA_INTEGRITY_ERROR') {
      return res;
    }

    // Save Evaluation to DB
    const evaluation = await this.prisma.vehicleEvaluation.create({
      data: {
        vehicleSpecificationId: res.results!.vehicleSpecificationId,
        licensePlate: dto.licensePlate,
        mileage: dto.mileage,
        color: dto.color,
        damageStatus: dto.damageStatus,
        damageDetails: dto.damageStatus === 'NO' ? 'Hatasız / Orijinal' : 'Hasarlı',
        estimatedValue: res.results!.cashOffer,
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
      userDesiredPrice: dto.userDesiredPrice,
      sellingTimeline: dto.sellingTimeline,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
    }).catch((err) => console.error('Telegram notification error:', err));

    return {
      status: 'SUCCESS',
      evaluationId: evaluation.id,
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

  private async calculateValuationCore(dto: CreateEvaluationDto) {
    // 1. Relational Validation: Verify modelId actually belongs to manufacturerId
    const targetModel = await this.prisma.model.findFirst({
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

    const spec = await this.prisma.vehicleSpecification.findFirst({
      where: whereCondition,
      include: {
        manufacturer: true,
        model: true,
        variant: true,
        package: true,
        bodyType: true,
        fuelType: true,
        transmissionType: true,
        driveType: true,
        marketPrices: true,
      },
    });

    if (!spec) {
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

    // Damage Penalty
    let damagePenalty = 0;
    const aiAnalysis: string[] = [];

    if (dto.damageStatus === 'YES') {
      damagePenalty = 0.08;
      aiAnalysis.push('Araçta kaporta/boya hasar kaydı bildirilmiştir (%8 amortisman uygulanmıştır).');
    } else if (dto.damageStatus === 'NO') {
      damagePenalty = 0;
      aiAnalysis.push('Aracın boyasız ve hatasız olması ikinci el piyasa değerini olumlu etkilemektedir.');
    } else {
      damagePenalty = 0.04;
    }

    // Match Comparable Listings
    const emsalResult = await this.emsalMatcherService.matchComparableListings({
      make: spec.manufacturer.name,
      model: spec.model.name,
      variant: spec.variant?.name,
      trim: spec.package?.name,
      year: dto.year,
      mileageKm: dto.mileage,
      bodyType: spec.bodyType?.name,
      fuelType: spec.fuelType?.name,
      transmission: spec.transmissionType?.name,
      isCleanCondition: dto.damageStatus === 'NO',
    });

    if (emsalResult.level === 4 || emsalResult.matchedCount === 0 || !emsalResult.cleanListings || emsalResult.cleanListings.length === 0) {
      return {
        status: 'INSUFFICIENT_DATA',
        confidenceScore: 0,
        message: 'Yeterli piyasa verisi bulunamadı',
        vehicle: {
          year: spec.year,
          brand: spec.manufacturer.name,
          model: spec.model.name,
          variant: spec.variant?.name || '',
          package: spec.package?.name || '',
          bodyType: spec.bodyType?.name || '',
          fuelType: spec.fuelType?.name || '',
          transmission: spec.transmissionType?.name || '',
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

    const calc = RobustPricingCalculator.computeValuationFromSnapshot({
      weightedP5: wP5,
      weightedP35: wP35,
      weightedP50: wP50,
      weightedP60: wP60,
      weightedP95: wP95,
      realMatchedListingCount: emsalResult.matchedCount,
      kmDecayPer10k: emsalResult.kmDecayPer10k || 0.0025,
      referenceMedianMileage: emsalResult.referenceMedianMileage || 100000,
      mileageAdjustmentSource: emsalResult.mileageAdjustmentSource || 'DEFAULT_FALLBACK',
      userYear: dto.year,
      userMileage: dto.mileage,
      damagePenalty,
      userDesiredPrice: dto.userDesiredPrice,
      matchedLevel: emsalResult.level,
      baseConfidenceScore: emsalResult.confidenceScore,
    });

    const isFmvTooHigh = calc.fairMarketValue >= 5000000;
    const isLevel3 = emsalResult.level === 3;
    const hasLowComps = emsalResult.matchedCount < 8;
    const hasLowCompsForHighFmv = isFmvTooHigh && emsalResult.matchedCount < 10;
    const hasLowConfidence = emsalResult.confidenceScore < 70;
    const isP35TooHigh = calc.adjustedP35 > calc.fairMarketValue;

    // Requirement 9: If adjustedP35 > fairMarketValue, throw DATA_INTEGRITY_ERROR (do not produce price)
    if (isP35TooHigh) {
      return {
        status: 'DATA_INTEGRITY_ERROR',
        confidenceScore: 0,
        message: 'Veri bütünlüğü hatası: Düzeltilmiş P35 değeri tahmini piyasa değerini aşamaz.',
        vehicle: {
          year: spec.year,
          brand: spec.manufacturer.name,
          model: spec.model.name,
          variant: spec.variant?.name || '',
          package: spec.package?.name || '',
          bodyType: spec.bodyType?.name || '',
          fuelType: spec.fuelType?.name || '',
          transmission: spec.transmissionType?.name || '',
        },
        results: null,
        aiAnalysis: ['HATA: Veri bütünlüğü doğrulanamadı.'],
        comparableListings: [],
      };
    }

    const requiresManual =
      hasPercentileError ||
      isLevel3 ||
      hasLowComps ||
      hasLowCompsForHighFmv ||
      hasLowConfidence ||
      calc.requiresManualApproval;

    aiAnalysis.push(emsalResult.explanationNote);
    aiAnalysis.push(`Kilometre Düzeltmesi: Referans Medyan Km: ${(emsalResult.referenceMedianMileage || 100000).toLocaleString('tr-TR')} km | Araç Km: ${dto.mileage.toLocaleString('tr-TR')} km | Fark: ${calc.kmDelta} km | Katsayı: %${((emsalResult.kmDecayPer10k || 0.0025) * 100).toFixed(2)}/10.000km | Düzeltme: ${(calc.mileageAdjustment || 0).toLocaleString('tr-TR')} ₺ (Kaynak: ${emsalResult.mileageAdjustmentSource || 'DEFAULT_FALLBACK'})`);

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
        year: spec.year,
        brand: spec.manufacturer.name,
        model: spec.model.name,
        variant: spec.variant?.name || '',
        package: spec.package?.name || '',
        bodyType: spec.bodyType?.name || '',
        fuelType: spec.fuelType?.name || '',
        transmission: spec.transmissionType?.name || '',
        engineSize: spec.variant?.engineSize || null,
        horsepower: spec.variant?.horsepower || null,
        originalMSRP: spec.originalMSRP,
      },
      results: {
        vehicleSpecificationId: spec.id,
        adjustedP35: calc.adjustedP35,
        fairMarketValue: calc.fairMarketValue,
        recommendedPublicListingPrice: calc.recommendedPublicListingPrice,
        expectedSalePrice: calc.expectedSalePrice,
        customerDesiredNet: calc.customerDesiredNet,
        aiRecommendedCustomerNet: calc.aiRecommendedCustomerNet,
        proposedCustomerNet: calc.proposedCustomerNet,
        agreedCustomerNet: calc.agreedCustomerNet,
        baseCommission: calc.baseCommission,
        performanceMargin: calc.performanceMargin,
        expectedCompanyGrossMargin: calc.expectedCompanyGrossMargin,

        cashOffer: calc.cashOffer,
        cashOfferMin: calc.cashOfferMin,
        cashOfferMax: calc.cashOfferMax,
        consignmentListingPrice: calc.recommendedPublicListingPrice,
        expectedConsignmentSalePrice: calc.expectedSalePrice,
        consignmentCommission: calc.baseCommission,
        customerConsignmentNet: calc.agreedCustomerNet,
        estimatedDaysToSell: `${calc.estimatedDaysToSellMin}-${calc.estimatedDaysToSellMax} gün`,
        confidenceScore: calc.confidenceScore,
        matchedListingCount: calc.matchedListingCount,
        matchedLevel: emsalResult.level,
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
        kmDecayPer10k: emsalResult.kmDecayPer10k || 0.0025,
        referenceMedianMileage: emsalResult.referenceMedianMileage || 100000,
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
    const contributingIds = emsalResult.contributingSnapshotIds || [emsalResult.snapshotId];
    const filteredIds = contributingIds.filter(Boolean);
    if (filteredIds.length === 0) return [];
    try {
      const allSnaps = await this.prisma.vehicleMarketSnapshot.findMany({
        where: { id: { in: filteredIds } },
      });

      const snapListingArrays = allSnaps
        .map(s => {
          try {
            return JSON.parse(s.snapshotDataJson || '{}').uniqueListingIds || [];
          } catch (e) {
            return [];
          }
        })
        .filter(arr => arr.length > 0);

      // Round-robin selection of up to 5 listing IDs
      const selectedListingIds: string[] = [];
      let added = true;
      let index = 0;
      while (selectedListingIds.length < 5 && added) {
        added = false;
        for (const arr of snapListingArrays) {
          if (selectedListingIds.length >= 5) break;
          if (index < arr.length) {
            const lid = arr[index];
            if (!selectedListingIds.includes(lid)) {
              selectedListingIds.push(lid);
              added = true;
            }
          }
        }
        index++;
      }

      if (selectedListingIds.length === 0) return [];

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

  private roundToCleanGalleryPrice(val: number): number {
    if (!val || val <= 0) return 0;
    if (val >= 2000000) {
      return Math.round(val / 50000) * 50000;
    } else if (val >= 500000) {
      return Math.round(val / 10000) * 10000;
    } else {
      return Math.round(val / 5000) * 5000;
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

    return {
      evaluationId: item.id,
      vehicle: {
        year: item.vehicleSpecification.year,
        brand: item.vehicleSpecification.manufacturer.name,
        model: item.vehicleSpecification.model.name,
        variant: item.vehicleSpecification.variant.name,
        package: item.vehicleSpecification.package?.name || '',
        bodyType: item.vehicleSpecification.bodyType.name,
        fuelType: item.vehicleSpecification.fuelType.name,
        transmission: item.vehicleSpecification.transmissionType.name,
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
