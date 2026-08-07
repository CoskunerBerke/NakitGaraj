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
    // 1. Query matching VehicleSpecification
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

    let spec = await this.prisma.vehicleSpecification.findFirst({
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

    // Fallback if specific package/body filter yielded no spec but variant exists
    if (!spec && dto.variantId) {
      spec = await this.prisma.vehicleSpecification.findFirst({
        where: {
          year: dto.year,
          manufacturerId: dto.manufacturerId,
          modelId: dto.modelId,
          variantId: dto.variantId,
        },
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
    }

    if (!spec) {
      throw new NotFoundException(
        'Girilen araç özelliklerine uygun piyasa verisi bulunamadı. Lütfen bilgileri kontrol ediniz.',
      );
    }

    const aiAnalysis: string[] = [];

    // Damage Penalty
    let damagePenalty = 0;
    let detailReports: string[] = [];

    if (dto.damageStatus === 'YES') {
      damagePenalty = 0.08;
      aiAnalysis.push('Araçta kaporta/boya hasar kaydı bildirilmiştir (%8 amortisman uygulanmıştır).');
    } else if (dto.damageStatus === 'NO') {
      damagePenalty = 0;
      aiAnalysis.push('Aracın boyasız ve hatasız olması ikinci el piyasa değerini olumlu etkilemektedir.');
    } else {
      damagePenalty = 0.04;
    }

    // 2. Perform 4-Level Emsal Matching & Robust Pricing Calculation
    const emsalResult = await this.emsalMatcherService.matchComparableListings({
      make: spec.manufacturer.name,
      model: spec.model.name,
      variant: spec.variant?.name,
      year: dto.year,
      mileageKm: dto.mileage,
      bodyType: spec.bodyType?.name,
      fuelType: spec.fuelType?.name,
      transmission: spec.transmissionType?.name,
      isCleanCondition: dto.damageStatus === 'NO',
    });

    const calc = RobustPricingCalculator.computeValuation({
      cleanListings: emsalResult.cleanListings,
      userYear: dto.year,
      userMileage: dto.mileage,
      damagePenalty,
      userDesiredPrice: dto.userDesiredPrice,
      matchedLevel: emsalResult.level,
      baseConfidenceScore: emsalResult.confidenceScore,
    });

    aiAnalysis.push(emsalResult.explanationNote);

    if (emsalResult.isLimitedComps) {
      aiAnalysis.push('UYARI: Aracınız için sınırlı sayıda emsal bulunabilmiştir. Fiyat için galerimizden ek teyit almanızı öneririz.');
    }

    if (dto.userDesiredPrice && dto.userDesiredPrice > 0) {
      aiAnalysis.push(`Fiyat beklentiniz (${dto.userDesiredPrice.toLocaleString('tr-TR')} ₺) dikkate alınarak Konsinye İlan fiyatı ${calc.consignmentListingPrice.toLocaleString('tr-TR')} ₺, müşteriye net kalacak tutar ${calc.customerConsignmentNet.toLocaleString('tr-TR')} ₺ ve anında Nakit Alış teklifi ${calc.cashOffer.toLocaleString('tr-TR')} ₺ olarak hesaplanmıştır.`);
    }

    // Save Evaluation to DB
    const evaluation = await this.prisma.vehicleEvaluation.create({
      data: {
        vehicleSpecificationId: spec.id,
        licensePlate: dto.licensePlate,
        mileage: dto.mileage,
        color: dto.color,
        damageStatus: dto.damageStatus,
        damageDetails: detailReports.join(', ') || (dto.damageStatus === 'NO' ? 'Hatasız / Orijinal' : 'Hasarlı'),
        estimatedValue: calc.cashOffer,
        minExpectedValue: calc.cashOfferMin,
        maxExpectedValue: calc.consignmentListingPrice,
        quickSaleValue: calc.cashOfferMin,
        confidenceScore: calc.confidenceScore,
        aiAnalysis: JSON.stringify(aiAnalysis),
        userIp,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        sellingTimeline: dto.sellingTimeline,
        userDesiredPrice: dto.userDesiredPrice,
        finalOfferedPrice: calc.cashOffer,
        features: dto.features || null,
      },
    });

    this.telegramService.sendEvaluationNotification({
      licensePlate: dto.licensePlate,
      vehicleName: `${spec.year} ${spec.manufacturer.name} ${spec.model.name} (${spec.variant.name})`,
      brandName: spec.manufacturer.name,
      modelName: spec.model.name,
      variantName: spec.variant.name,
      year: spec.year,
      fuel: spec.fuelType?.name || 'Benzin',
      transmission: spec.transmissionType?.name || 'Otomatik',
      mileage: dto.mileage,
      color: dto.color,
      damageStatus: dto.damageStatus,
      fairMarketValue: calc.fairMarketValue,
      finalOfferedPrice: calc.cashOffer,
      finalConsignmentPrice: calc.consignmentListingPrice,
      userDesiredPrice: dto.userDesiredPrice,
      sellingTimeline: dto.sellingTimeline,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
    }).catch((err) => console.error('Telegram notification error:', err));

    const comparableListings = this.generateComparableListings(spec, calc.fairMarketValue, calc.cashOfferMin, calc.consignmentListingPrice);

    return {
      evaluationId: evaluation.id,
      vehicle: {
        year: spec.year,
        brand: spec.manufacturer.name,
        model: spec.model.name,
        variant: spec.variant.name,
        package: spec.package?.name || '',
        bodyType: spec.bodyType.name,
        fuelType: spec.fuelType.name,
        transmission: spec.transmissionType.name,
        engineSize: spec.variant.engineSize,
        horsepower: spec.variant.horsepower,
        originalMSRP: spec.originalMSRP,
      },
      results: {
        fairMarketValue: calc.fairMarketValue,
        cashOffer: calc.cashOffer,
        cashOfferMin: calc.cashOfferMin,
        cashOfferMax: calc.cashOfferMax,
        consignmentListingPrice: calc.consignmentListingPrice,
        expectedConsignmentSalePrice: calc.expectedConsignmentSalePrice,
        consignmentCommission: calc.consignmentCommission,
        customerConsignmentNet: calc.customerConsignmentNet,
        estimatedDaysToSell: `${calc.estimatedDaysToSellMin}-${calc.estimatedDaysToSellMax} gün`,
        confidenceScore: calc.confidenceScore,
        matchedListingCount: calc.matchedListingCount,
        matchedLevel: calc.matchedLevel,
        pricingExplanation: calc.pricingExplanation,
        // Backward Compatibility Aliases:
        estimatedValue: calc.cashOffer,
        finalOfferedPrice: calc.cashOffer,
        finalConsignmentPrice: calc.consignmentListingPrice,
        userDesiredPrice: dto.userDesiredPrice,
        fairMarketRange: `${calc.cashOfferMin.toLocaleString('tr-TR')} ₺ - ${calc.consignmentListingPrice.toLocaleString('tr-TR')} ₺`,
        minExpectedValue: calc.cashOfferMin,
        maxExpectedValue: calc.consignmentListingPrice,
        quickSaleValue: calc.cashOfferMin,
      },
      aiAnalysis,
      comparableListings,
    };
  }

  private generateComparableListings(spec: any, fairMarketValue: number, minFloor: number, maxCeiling: number) {
    const cities = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya'];
    const dists: Record<string, string[]> = {
      'İstanbul': ['Kadıköy', 'Ataşehir', 'Beşiktaş', 'Bakırköy', 'Ümraniye'],
      'Ankara': ['Çankaya', 'Yenimahalle', 'Etimesgut'],
      'İzmir': ['Karşıyaka', 'Bornova', 'Bayraklı'],
      'Bursa': ['Nilüfer', 'Osmangazi'],
      'Antalya': ['Muratpaşa', 'Konyaaltı'],
    };

    const listings = [];
    const priceOffsets = [-0.03, 0, 0.04];
    for (let i = 0; i < 3; i++) {
      const city = cities[i % cities.length];
      const district = dists[city][i % dists[city].length];
      const targetPrice = this.roundToCleanGalleryPrice(Math.min(maxCeiling, Math.max(minFloor, fairMarketValue * (1 + priceOffsets[i]))));
      const mileageVar = Math.round(spec.year === 2026 ? 8000 + i * 2000 : (2026 - spec.year) * 15000 * (1 + priceOffsets[i] * 0.5));

      listings.push({
        id: `visual-comp-${i + 1}`,
        year: spec.year,
        mileage: mileageVar,
        price: targetPrice,
        province: city,
        district: district,
        listingDate: `${3 + i * 2} gün önce`,
        photo: `/cars/mock-car-${i + 1}.jpg`,
        details: `${spec.variant.name} ${spec.package?.name || ''} - ${spec.transmissionType.name} - ${spec.fuelType.name}`,
        isRepresentativeVisualScenario: true,
        typeNote: 'Temsili Vitrin Görsel Emsali (Gerçek piyasa hesaplamasına etki etmez)',
      });
    }

    return listings;
  }

  private roundToCleanGalleryPrice(val: number): number {
    if (!val || val <= 0) return 0;
    if (val >= 2000000) {
      // 2M+ TL: Round to nearest 50.000 TL (e.g. 2.937.500 TL -> 2.950.000 TL / 3.000.000 TL)
      return Math.round(val / 50000) * 50000;
    } else if (val >= 500000) {
      // 500k - 2M TL: Round to nearest 10.000 TL (e.g. 930.000 TL, 950.000 TL)
      return Math.round(val / 10000) * 10000;
    } else {
      // < 500k TL: Round to nearest 5.000 TL
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
