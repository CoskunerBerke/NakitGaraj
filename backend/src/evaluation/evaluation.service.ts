import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class EvaluationService {
  constructor(
    private prisma: PrismaService,
    private telegramService: TelegramService,
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

    // DYNAMIC & HIGHLY OPTIMIZED TURKISH CAR MARKET SEGMENTATION & PRICING CALIBRATION
    const brandName = spec.manufacturer.name;
    const modelName = spec.model.name;
    const lowerBrand = brandName.toLowerCase();
    const lowerModel = (modelName + ' ' + (spec.variant?.name || '')).toLowerCase();

    // =====================================================================
    // TÜRK İKİNCİ EL OTOMOBİL PİYASASI - DİNAMİK DEĞERLEME MOTORU
    // Base fiyatlar Sahibinden.com 2026 gerçek ilan ortalamalarından alınmıştır.
    // Depreciation: floor + (base - floor) * 0.88^yaş  (yıllık ~%12 değer kaybı)
    // =====================================================================
    let basePrice2026 = 1550000; // default C-segment sedan/hatchback
    let floorPrice = 450000;
    let isPremium = false;
    let isExotic = false;
    let isEconomy = false;

    // 1. Ultra-Exotic / Hypercar Tier (Sahibinden 2026: 35M+)
    if (
      lowerBrand.includes('lamborghini') ||
      lowerBrand.includes('ferrari') ||
      lowerBrand.includes('bentley') ||
      lowerBrand.includes('rolls-royce') ||
      lowerBrand.includes('aston martin') ||
      lowerBrand.includes('mclaren')
    ) {
      basePrice2026 = 35000000;
      floorPrice = 12000000;
      isExotic = true;
    }
    // 2. Exotic / High-End Performance Tier (Sahibinden 2026: 18-25M)
    else if (
      lowerBrand.includes('porsche') ||
      lowerBrand.includes('maserati') ||
      lowerModel.includes('m5') || lowerModel.includes('m 5') ||
      lowerModel.includes('m8') || lowerModel.includes('m 8') ||
      lowerModel.includes('xm') ||
      lowerModel.includes('g 63') || lowerModel.includes('g63') ||
      lowerModel.includes('amg gt') || lowerModel.includes('gt 63') ||
      lowerModel.includes('rs6') || lowerModel.includes('rs 6') || lowerModel.includes('rs7') || lowerModel.includes('rs 7') || lowerModel.includes('rsq8') || lowerModel.includes('rs q8') ||
      lowerModel.includes('r8')
    ) {
      basePrice2026 = 24500000;
      floorPrice = 8000000;
      isExotic = true;
    }
    // 3. Lüks / Executive Tier (Sahibinden 2026: 15-28M)
    else if (
      lowerModel.includes('s-class') || lowerModel.includes('s serisi') ||
      lowerModel.includes('7 series') || lowerModel.includes('7 serisi') ||
      lowerModel.includes('a8') ||
      lowerModel.includes('panamera') ||
      lowerModel.includes('cayenne') ||
      lowerModel.includes('x7') ||
      lowerModel.includes('q8') ||
      lowerModel.includes('gls') ||
      lowerModel.includes('g-class') || lowerModel.includes('g serisi') || lowerModel.includes('g 63') ||
      (lowerBrand.includes('land rover') && lowerModel.includes('range rover') && !lowerModel.includes('evoque') && !lowerModel.includes('velar'))
    ) {
      basePrice2026 = 18500000;
      floorPrice = 6500000;
      isPremium = true;
    }
    // 4a. Large SUV / Top Executive Tier (Sahibinden 2026: 11-15M)
    else if (
      lowerModel.includes('xc90') ||
      lowerModel.includes('x5') ||
      lowerModel.includes('x6') ||
      lowerModel.includes('q7') ||
      lowerModel.includes('gle') ||
      lowerModel.includes('glc coupe') ||
      lowerModel.includes('macan') ||
      lowerModel.includes('velar') ||
      lowerModel.includes('discovery')
    ) {
      basePrice2026 = 11500000;
      floorPrice = 3000000;
      isPremium = true;
    }
    // 4b. Executive Sedan & Mid SUV Tier (Volvo S90, V90, XC60, Audi A6, BMW 5, E-Class) (Sahibinden 2026: 6.8-8M)
    else if (
      lowerModel.includes('s90') ||
      lowerModel.includes('v90') ||
      lowerModel.includes('xc60') ||
      lowerModel.includes('e-class') || lowerModel.includes('e serisi') ||
      lowerModel.includes('5 series') || lowerModel.includes('5 serisi') ||
      lowerModel.includes('a6') ||
      lowerModel.includes('a7') ||
      lowerModel.includes('s90') ||
      lowerModel.includes('v90')
    ) {
      basePrice2026 = 7200000;
      floorPrice = 1000000;
      isPremium = true;
    }
    // 5. Compact Premium Tier (Sahibinden 2026: 3.2-4.5M)
    else if (
      lowerModel.includes('c-class') || lowerModel.includes('c serisi') ||
      lowerModel.includes('3 series') || lowerModel.includes('3 serisi') ||
      lowerModel.includes('a4') ||
      lowerModel.includes('a3') ||
      lowerModel.includes('a5') ||
      lowerModel.includes('cla') ||
      lowerModel.includes('gla') ||
      lowerModel.includes('glb') ||
      lowerModel.includes('glc') ||
      lowerModel.includes('x1') ||
      lowerModel.includes('x2') ||
      lowerModel.includes('x3') ||
      lowerModel.includes('x4') ||
      lowerModel.includes('q5') ||
      lowerModel.includes('q3') ||
      lowerModel.includes('s60') ||
      lowerModel.includes('v60') ||
      lowerModel.includes('xc40') ||
      lowerModel.includes('xc60') ||
      lowerModel.includes('evoque') ||
      lowerBrand.includes('tesla') ||
      lowerBrand.includes('jaguar') ||
      lowerBrand.includes('lexus') ||
      lowerBrand.includes('mini') ||
      (lowerBrand.includes('mercedes') && !lowerModel.includes('a serisi') && !lowerModel.includes('a-class') && !lowerModel.includes('b serisi') && !lowerModel.includes('b-class') && !lowerModel.includes('e-class') && !lowerModel.includes('e serisi') && !lowerModel.includes('s-class') && !lowerModel.includes('s serisi')) ||
      (lowerBrand.includes('bmw') && !lowerModel.includes('1 ser') && !lowerModel.includes('2 ser') && !lowerModel.includes('1 series') && !lowerModel.includes('2 series') && !lowerModel.includes('5 ser') && !lowerModel.includes('5 series') && !lowerModel.includes('7 ser') && !lowerModel.includes('7 series')) ||
      (lowerBrand.includes('audi') && !lowerModel.includes('a1') && !lowerModel.includes('a6') && !lowerModel.includes('a7') && !lowerModel.includes('a8'))
    ) {
      basePrice2026 = 4200000;
      floorPrice = 1600000;
      isPremium = true;
    }
    // 6. Entry Premium / Premium Hatch (Sahibinden 2026: 2.2-3.2M)
    else if (
      lowerModel.includes('a serisi') || lowerModel.includes('a-class') ||
      lowerModel.includes('b serisi') || lowerModel.includes('b-class') ||
      lowerModel.includes('1 ser') || lowerModel.includes('1 series') ||
      lowerModel.includes('2 ser') || lowerModel.includes('2 series') ||
      lowerModel.includes('a1') ||
      (lowerBrand.includes('volvo') && (lowerModel.includes('v40') || lowerModel.includes('c30')))
    ) {
      basePrice2026 = 3700000;
      floorPrice = 1250000;
      isPremium = true;
    }
    // 7. D-Segment / Upper-Mid Tier (Sahibinden 2026: 2.3-3.2M)
    else if (
      lowerModel.includes('passat') ||
      lowerModel.includes('superb') ||
      lowerModel.includes('insignia') ||
      lowerModel.includes('mondeo') ||
      lowerModel.includes('508') ||
      lowerModel.includes('talisman') ||
      lowerModel.includes('accord') ||
      lowerModel.includes('camry') ||
      lowerModel.includes('c5') ||
      lowerModel.includes('sorento') ||
      lowerModel.includes('outback')
    ) {
      basePrice2026 = 3600000;
      floorPrice = 1250000;
    }
    // 8a. Premium Standard SUV (Sahibinden 2026: 2.2-3.0M)
    else if (
      lowerModel.includes('tiguan') ||
      lowerModel.includes('3008') ||
      lowerModel.includes('5008') ||
      lowerModel.includes('forester') ||
      lowerModel.includes('rav4') ||
      lowerModel.includes('cr-v') ||
      lowerModel.includes('outlander') ||
      lowerModel.includes('koleos')
    ) {
      basePrice2026 = 3500000;
      floorPrice = 1200000;
    }
    // 8b. Mid Standard SUV / Crossover (Sahibinden 2026: 1.8-2.5M)
    else if (
      lowerModel.includes('tucson') ||
      lowerModel.includes('sportage') ||
      lowerModel.includes('qashqai') ||
      lowerModel.includes('kuga') ||
      lowerModel.includes('kadjar') ||
      lowerModel.includes('austral') ||
      lowerModel.includes('karoq') ||
      lowerModel.includes('ateca') ||
      lowerModel.includes('c5 aircross') ||
      lowerModel.includes('eclipse cross') ||
      lowerModel.includes('omoda') ||
      lowerModel.includes('tiggo') ||
      lowerModel.includes('t10x')
    ) {
      basePrice2026 = 3000000;
      floorPrice = 1050000;
    }
    // 8c. Budget SUV / MPV (Sahibinden 2026: 1.3-1.8M)
    else if (
      lowerModel.includes('duster') ||
      lowerModel.includes('jogger') ||
      lowerModel.includes('sandero stepway') ||
      lowerModel.includes('crossland') ||
      lowerModel.includes('bayon') ||
      lowerModel.includes('arona') ||
      lowerModel.includes('kamiq') ||
      lowerModel.includes('stonic') ||
      lowerModel.includes('juke') ||
      lowerModel.includes('captur') ||
      lowerModel.includes('2008') ||
      lowerModel.includes('c3 aircross') ||
      lowerModel.includes('t-cross') ||
      lowerModel.includes('t-roc')
    ) {
      basePrice2026 = 2200000;
      floorPrice = 850000;
    }
    // 9. Standard C-Segment Sedan/HB (Sahibinden 2026: 1.7-2.0M for 2023)
    // Golf, Megane, Focus, Corolla, Civic, Astra, Leon, Octavia, Cerato, Elantra
    else if (
      lowerModel.includes('golf') ||
      lowerModel.includes('megane') ||
      lowerModel.includes('focus') ||
      lowerModel.includes('corolla') ||
      lowerModel.includes('civic') ||
      lowerModel.includes('astra') ||
      lowerModel.includes('leon') ||
      lowerModel.includes('octavia') ||
      lowerModel.includes('cerato') ||
      lowerModel.includes('elantra') ||
      lowerModel.includes('i30') ||
      lowerModel.includes('scala') ||
      lowerModel.includes('308') ||
      lowerModel.includes('c4')
    ) {
      basePrice2026 = 2450000;
      floorPrice = 880000;
    }
    // 10. Compact Economy / B-Segment (Sahibinden 2026: 1.0-1.4M)
    else if (
      lowerBrand.includes('fiat') ||
      (lowerBrand.includes('dacia') && !lowerModel.includes('duster') && !lowerModel.includes('jogger') && !lowerModel.includes('stepway')) ||
      (lowerBrand.includes('citroen') && !lowerModel.includes('c5') && !lowerModel.includes('c4') && !lowerModel.includes('3008') && !lowerModel.includes('2008')) ||
      lowerBrand.includes('chevrolet') ||
      lowerModel.includes('clio') ||
      lowerModel.includes('i20') ||
      lowerModel.includes('corsa') ||
      lowerModel.includes('polo') ||
      lowerModel.includes('fiesta') ||
      lowerModel.includes('sandero') ||
      lowerModel.includes('symbol') ||
      lowerModel.includes('punto') ||
      lowerModel.includes('albea') ||
      lowerModel.includes('palio') ||
      lowerModel.includes('c3') ||
      lowerModel.includes('c-elysee') ||
      lowerModel.includes('aveo') ||
      lowerModel.includes('kalos') ||
      lowerModel.includes('spark') ||
      lowerModel.includes('yaris') ||
      lowerModel.includes('micra') ||
      lowerModel.includes('rio') ||
      lowerModel.includes('picanto') ||
      lowerModel.includes('i10') ||
      lowerModel.includes('fabia') ||
      lowerModel.includes('ibiza') ||
      lowerModel.includes('swift') ||
      lowerModel.includes('baleno')
    ) {
      basePrice2026 = 1700000;
      floorPrice = 680000;
      isEconomy = true;
    }

    // Authoritative pricing: dbMarket (real Sahibinden market data) takes top priority, falling back to originalMSRP or segment defaults
    const dbMarket = spec.marketPrices && spec.marketPrices.length > 0 ? spec.marketPrices[0] : null;
    let baseValuation = (dbMarket && dbMarket.currentMarketAverage > 0)
      ? dbMarket.currentMarketAverage
      : ((spec.originalMSRP && spec.originalMSRP > 0) ? spec.originalMSRP : basePrice2026);

    if ((!dbMarket || !dbMarket.currentMarketAverage) && !spec.originalMSRP && dto.year < 2026) {
      // Floor-based decay: value never drops below floorPrice
      const carAge = 2026 - dto.year;
      const decayRate = (isPremium || isExotic) ? 0.94 : 0.88;
      const decayedPortion = (baseValuation - floorPrice) * Math.pow(decayRate, carAge);
      baseValuation = Math.round(floorPrice + decayedPortion);
    }

    const calculatedBasePrice = baseValuation;
    let baseValuationFinal = baseValuation;
    const averageSellingTime = isPremium || isExotic ? 28 : (isEconomy ? 14 : 19);

    // Hard ceiling for maximum Sahibinden market listing price
    const sahibindenMaxCap = (dbMarket && dbMarket.maxPrice > 0) 
      ? dbMarket.maxPrice 
      : Math.round(calculatedBasePrice * 1.35);

    // A. 7-Day Local Cache Lookup - Bypassed to ensure every evaluation creates a unique secure DB entry
    /*
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const existingEval = await this.prisma.vehicleEvaluation.findFirst({
      where: {
        vehicleSpecificationId: spec.id,
        damageStatus: dto.damageStatus,
        mileage: {
          gte: dto.mileage - 5000,
          lte: dto.mileage + 5000,
        },
        createdAt: {
          gte: oneWeekAgo,
        },
      },
    });

    if (existingEval) {
      const comparableListings = this.generateComparableListings(spec, existingEval.estimatedValue);
      return {
        evaluationId: existingEval.id,
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
          estimatedValue: existingEval.estimatedValue,
          fairMarketRange: `${existingEval.minExpectedValue.toLocaleString('tr-TR')} ₺ - ${existingEval.maxExpectedValue.toLocaleString('tr-TR')} ₺`,
          minExpectedValue: existingEval.minExpectedValue,
          maxExpectedValue: existingEval.maxExpectedValue,
          quickSaleValue: existingEval.quickSaleValue,
          confidenceScore: `${existingEval.confidenceScore}%`,
        },
        aiAnalysis: JSON.parse(existingEval.aiAnalysis as string),
        comparableListings,
        cached: true,
      };
    }
    */

    // 2. Pricing Logic Adjustments
    const aiAnalysis: string[] = [];

    // A. Mileage Penalty/Bonus
    const age = Math.max(1, 2026 - dto.year);
    const expectedMileage = age * 15000; // 15,000 km per year average in TR
    let mileageAdjustment = 0;

    if (dto.mileage > expectedMileage) {
      const excessKm = dto.mileage - expectedMileage;
      // 0.3% depreciation per 10,000 excess km, capped at 10%
      const penalty = Math.min(0.10, (excessKm / 10000) * 0.003);
      mileageAdjustment = -penalty;
      aiAnalysis.push(
        `Aracınızın kilometresi (${dto.mileage.toLocaleString()} km), yaşına göre beklenen ortalama kilometrenin (${expectedMileage.toLocaleString()} km) üzerindedir. Bu durum araç değerini yaklaşık %${Math.round(penalty * 100)} düşürmektedir.`,
      );
    } else {
      const lowerKm = expectedMileage - dto.mileage;
      // 0.25% appreciation per 10,000 km lower, capped at 6%
      const bonus = Math.min(0.06, (lowerKm / 10000) * 0.0025);
      mileageAdjustment = bonus;
      aiAnalysis.push(
        `Aracınızın kilometresi (${dto.mileage.toLocaleString()} km), emsallerine kıyasla düşüktür. Düşük kilometre araç değerini yaklaşık %${Math.round(bonus * 100)} oranında olumlu etkilemektedir.`,
      );
    }

    // B. Damage Penalty (Appraisal-based detailed pricing logic)
    let damagePenalty = 0;
    let hasDetailedAppraisal = false;
    const detailReports: string[] = [];

    // 1. Paint Scheme Analysis
    if (dto.paintScheme) {
      try {
        const paintMap = JSON.parse(dto.paintScheme);
        hasDetailedAppraisal = true;
        let paintCount = 0;
        let changeCount = 0;
        let localCount = 0;

        for (const [part, status] of Object.entries(paintMap)) {
          if (status === 'DEGISEN') {
            changeCount++;
            const penalty = (part === 'Motor Kaputu' || part === 'Tavan') ? 0.04 : 0.02;
            damagePenalty += penalty;
            detailReports.push(`${part} değişmiş (${Math.round(penalty * 100)}% indirim)`);
          } else if (status === 'BOYALI') {
            paintCount++;
            const penalty = (part === 'Motor Kaputu' || part === 'Tavan') ? 0.025 : 0.01;
            damagePenalty += penalty;
            detailReports.push(`${part} boyanmış (${Math.round(penalty * 100)}% indirim)`);
          } else if (status === 'LOKAL') {
            localCount++;
            const penalty = (part === 'Motor Kaputu' || part === 'Tavan') ? 0.015 : 0.005;
            damagePenalty += penalty;
            detailReports.push(`${part} lokal boyalı (${Math.round(penalty * 100)}% indirim)`);
          }
        }

        if (changeCount > 0 || paintCount > 0 || localCount > 0) {
          aiAnalysis.push(
            `Ekspertiz Şeması: Araçta ${changeCount} değişen, ${paintCount} boyalı, ${localCount} lokal boyalı parçe tespit edilmiştir.`
          );
        } else {
          aiAnalysis.push('Ekspertiz Şeması: Araçta boyanan veya değişen herhangi bir parça bulunmamaktadır (Hatasız/Orijinal).');
        }
      } catch (e) {
        console.error('Error parsing paintScheme:', e);
      }
    }

    // 2. Chassis Analysis
    if (dto.chassisState) {
      try {
        const chassisMap = JSON.parse(dto.chassisState);
        hasDetailedAppraisal = true;
        let chassisDamaged = false;
        
        for (const [chassisPart, hasAction] of Object.entries(chassisMap)) {
          if (hasAction === true) {
            chassisDamaged = true;
            damagePenalty += 0.12;
            detailReports.push(`${chassisPart} işlemi var (Şasi hasarı: 12% indirim)`);
          }
        }
        
        if (chassisDamaged) {
          aiAnalysis.push('UYARI: Aracın şasi parçalarında işlem tespit edilmiştir! Güvenlik ve yapısal hasar nedeniyle ekstra fiyat kırma uygulanmıştır.');
        }
      } catch (e) {
        console.error('Error parsing chassisState:', e);
      }
    }

    // 3. Mechanical / Extra Status Analysis
    if (dto.vehicleStatus) {
      try {
        const statusMap = JSON.parse(dto.vehicleStatus);
        hasDetailedAppraisal = true;
        if (statusMap.heavyDamage === true) {
          damagePenalty += 0.15;
          aiAnalysis.push('UYARI: Araçta ağır hasar (pert) kaydı bildirilmiştir. Bu durum araç değerini %15 oranında düşürmektedir.');
        }
        if (statusMap.scratchOrDent === true) {
          damagePenalty += 0.02;
          detailReports.push('Ezik/çizik/göçük var (%2 indirim)');
        }
        if (statusMap.crackedGlass === true) {
          damagePenalty += 0.01;
          detailReports.push('Camda kırık var (%1 indirim)');
        }
      } catch (e) {
        console.error('Error parsing vehicleStatus:', e);
      }
    }

    if (hasDetailedAppraisal) {
      damagePenalty = Math.min(0.60, damagePenalty);
      if (damagePenalty > 0) {
        aiAnalysis.push(`Ekspertiz detaylarına göre araçta toplam %${Math.round(damagePenalty * 100)} oranında değer düşüşü uygulanmıştır.`);
      }
    } else {
      if (dto.damageStatus === 'YES') {
        damagePenalty = 0.05;
        aiAnalysis.push(
          'Araçta hasar kaydının bulunması, piyasa ortalamasının altında fiyatlanmasına sebep olmaktadır. (%5 amortisman uygulanmıştır)',
        );
      } else if (dto.damageStatus === 'NO') {
        damagePenalty = 0;
        aiAnalysis.push(
          'Aracın boyasız ve hasarsız olması, ikinci el piyasasındaki cazibesini artırmakta ve fiyat değerini yukarı çekmektedir.',
        );
      } else {
        damagePenalty = 0.04;
        aiAnalysis.push(
          'Hasar durumunun belirsiz olması sebebiyle, piyasa risklerine karşı tedbiren küçük bir fiyat düzeltmesi (%4) yapılmıştır.',
        );
      }
    }

    // C. Popularity Score Influence
    const popularity = spec.popularityScore;
    let popularityAdjustment = 0;
    if (popularity >= 9.0) {
      popularityAdjustment = 0.02; // 2% bonus for high demand
      aiAnalysis.push(
        `Bu marka/model kombinasyonu (${spec.manufacturer.name} ${spec.model.name}) ikinci el piyasasında yüksek talep görmektedir. Ortalama satış süresi ${averageSellingTime} gündür.`,
      );
    } else {
      aiAnalysis.push(
        `Aracınızın ortalama satış süresi yaklaşık ${averageSellingTime} gündür.`,
      );
    }

    // D. Compute the condition factor from mileage and damage adjustments
    // gamma_donanim (Optional package multiplier for sub-model trims)
    let gammaDonanim = 1.0;
    const packageName = (spec.package?.name || '').toLowerCase();
    const variantName = (spec.variant?.name || '').toLowerCase();
    const combinedTrimStr = `${packageName} ${variantName}`;

    if (
      combinedTrimStr.includes('m sport') ||
      combinedTrimStr.includes('amg') ||
      combinedTrimStr.includes('r-line') ||
      combinedTrimStr.includes('highline') ||
      combinedTrimStr.includes('inscription') ||
      combinedTrimStr.includes('plus bright') ||
      combinedTrimStr.includes('ultimate dark') ||
      combinedTrimStr.includes('elite') ||
      combinedTrimStr.includes('n-line') ||
      combinedTrimStr.includes('fr') ||
      combinedTrimStr.includes('icon') ||
      combinedTrimStr.includes('shine') ||
      combinedTrimStr.includes('titanium') ||
      combinedTrimStr.includes('prestige') ||
      combinedTrimStr.includes('excellence') ||
      combinedTrimStr.includes('design') ||
      combinedTrimStr.includes('recharge')
    ) {
      gammaDonanim = 1.05; // %5 donanım/paket primi
    } else if (
      combinedTrimStr.includes('easy') ||
      combinedTrimStr.includes('trendline') ||
      combinedTrimStr.includes('joy') ||
      combinedTrimStr.includes('life') ||
      combinedTrimStr.includes('touch') ||
      combinedTrimStr.includes('active')
    ) {
      gammaDonanim = 0.97; // %3 baz paket ayarı
    }

    // Condition factor: mileage adjustment, damage penalty, and package multiplier
    const conditionFactor = (1 + mileageAdjustment - damagePenalty) * gammaDonanim;

    // E. STRATEGIC PRICING: YÜZDELİK DİLİM TABANLI (PERCENTILE-BASED) FİYATLANDIRMA
    // ─────────────────────────────────────────────────────────────────────────────────
    // dbMarket artık yüzdelik dilim verileri içerir:
    //   currentMarketAverage = P50 (Medyan - Gerçek Piyasa Merkezi)
    //   averageListingPrice  = P60 (Konsinye Satış Referansı)
    //   cleanMarketAverage   = Kırpılmış Ortalama (Trimmed Mean %10)
    //   minPrice             = P5  (Outlier hariç taban)
    //   maxPrice             = P95 (Outlier hariç tavan)
    //   regionalPriceDifferences.nakitAlisReferansi = P35 (Nakit Alış Referansı)
    // ─────────────────────────────────────────────────────────────────────────────────
    let fairMarketValue = Math.min(Math.round(baseValuationFinal * conditionFactor), sahibindenMaxCap);
    fairMarketValue = this.roundToCleanGalleryPrice(fairMarketValue);

    // Yüzdelik dilim referanslarını veritabanından çek
    let p35Reference = 0; // Nakit Alış Referansı
    let p60Reference = 0; // Konsinye Satış Referansı
    if (dbMarket && dbMarket.regionalPriceDifferences) {
      try {
        const regionData = JSON.parse(dbMarket.regionalPriceDifferences as string);
        p35Reference = regionData.nakitAlisReferansi || 0;
        p60Reference = regionData.konsinyeReferansi || 0;
      } catch (e) {}
    }

    // Percentile tabanlı Nakit Alış ve Konsinye Satış hesaplaması
    // P35 doğal olarak piyasanın %15 altında → ek marj düşürmeye gerek yok
    // P60 doğal olarak piyasanın %10 üstünde → müşteri çekmek için ideal
    let standardCashOffer: number;
    let standardConsignmentOffer: number;

    if (p35Reference > 0 && p60Reference > 0) {
      // ✅ Percentile verisi mevcut → doğrudan kullan
      // Condition factor'ü P35 ve P60'a da uygula (km/hasar düzeltmesi)
      standardCashOffer = this.roundToCleanGalleryPrice(
        Math.round(p35Reference * conditionFactor)
      );
      standardConsignmentOffer = this.roundToCleanGalleryPrice(
        Math.round(p60Reference * conditionFactor)
      );
    } else {
      // ⚠️ Percentile verisi yok (eski veri veya fallback) → dinamik marj ile hesapla
      let cashProfitPct: number;
      let consProfitPct: number;

      if (fairMarketValue >= 20000000) {
        cashProfitPct = 0.16; consProfitPct = 0.09;
      } else if (fairMarketValue >= 15000000) {
        cashProfitPct = 0.15; consProfitPct = 0.08;
      } else if (fairMarketValue >= 10000000) {
        cashProfitPct = 0.14; consProfitPct = 0.075;
      } else if (fairMarketValue >= 6000000) {
        cashProfitPct = 0.13; consProfitPct = 0.07;
      } else if (fairMarketValue >= 4000000) {
        cashProfitPct = 0.12; consProfitPct = 0.065;
      } else if (fairMarketValue >= 2500000) {
        cashProfitPct = 0.10; consProfitPct = 0.055;
      } else if (fairMarketValue >= 1500000) {
        cashProfitPct = 0.09; consProfitPct = 0.05;
      } else if (fairMarketValue >= 800000) {
        cashProfitPct = 0.08; consProfitPct = 0.04;
      } else {
        cashProfitPct = 0.07; consProfitPct = 0.035;
      }

      // Admin panel ayarlarından override (varsa)
      try {
        const fs = require('fs');
        const path = require('path');
        const settingsPath = path.join(process.cwd(), 'market-sync-settings.json');
        if (fs.existsSync(settingsPath)) {
          const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
          if (parsed.cashOfferProfitPercentage && parsed.cashOfferProfitPercentage > 0) {
            cashProfitPct = parsed.cashOfferProfitPercentage / 100;
          }
          if (parsed.consignmentProfitPercentage && parsed.consignmentProfitPercentage > 0) {
            consProfitPct = parsed.consignmentProfitPercentage / 100;
          }
        }
      } catch (e) {}

      const maxProfit = Math.max(40000, Math.round(fairMarketValue * cashProfitPct));
      const minProfit = Math.max(20000, Math.round(fairMarketValue * consProfitPct));

      standardCashOffer = this.roundToCleanGalleryPrice(fairMarketValue - maxProfit);
      standardConsignmentOffer = this.roundToCleanGalleryPrice(fairMarketValue - minProfit);
    }

    let finalOfferedPrice = standardCashOffer;
    let finalConsignmentPrice = standardConsignmentOffer;

    const userDesiredPrice = dto.userDesiredPrice;

    if (userDesiredPrice > 0) {
      if (userDesiredPrice < 200000) {
        // A. Troll / Geçersiz Rakam:
        finalOfferedPrice = standardCashOffer;
        finalConsignmentPrice = standardConsignmentOffer;
        aiAnalysis.push(
          `Girdiğiniz fiyat beklentisi (${userDesiredPrice.toLocaleString('tr-TR')} ₺) araç piyasasının çok altındadır. Galeri standart yapay zeka teklifimiz sunulmuştur.`
        );
      } 
      else if (userDesiredPrice <= standardCashOffer) {
        // B. Müşteri teklifimizden düşük istiyor
        finalOfferedPrice = this.roundToCleanGalleryPrice(userDesiredPrice);
        finalConsignmentPrice = this.roundToCleanGalleryPrice(Math.min(userDesiredPrice + 50000, standardConsignmentOffer));
      } 
      else if (userDesiredPrice <= standardConsignmentOffer) {
        // C. Müşteri makul bir fiyat istiyor
        finalOfferedPrice = standardCashOffer;
        finalConsignmentPrice = this.roundToCleanGalleryPrice(userDesiredPrice);
      } 
      else {
        // D. Müşteri tavan konsinye üstünde fiyat istiyor
        finalOfferedPrice = standardCashOffer;
        finalConsignmentPrice = standardConsignmentOffer;
        aiAnalysis.push(
          `Girdiğiniz fiyat beklentisi (${userDesiredPrice.toLocaleString('tr-TR')} ₺), Sahibinden.com piyasa satış ortalamasının (${fairMarketValue.toLocaleString('tr-TR')} ₺) üzerindedir. Dükkanımızda alıcı bulabilmesi ve minimum kâr marjımız korunabilmesi için tavan konsinye satış fiyatımız ${standardConsignmentOffer.toLocaleString('tr-TR')} ₺ olarak belirlenmiştir.`
        );
      }
    }

    // STRICT SAFETY: Konsinye Fiyatı asla (Piyasa - minProfit) tavanını geçemez!
    finalConsignmentPrice = this.roundToCleanGalleryPrice(Math.min(finalConsignmentPrice, standardConsignmentOffer));

    const estimatedValue = finalOfferedPrice;
    const minExpectedValue = this.roundToCleanGalleryPrice(standardCashOffer * 0.96);
    const quickSaleValue = this.roundToCleanGalleryPrice(standardCashOffer * 0.94);

    // Mode / Density Peak (En Çok Tekrar Eden Küme) Adaptif Piyasa Kıyaslama Aralığı:
    // Araç hatasız ve makul km ise yıkık/taksi çıkması ilanlar (275k) yerine en yoğun emsal kümesini (0.85x - 1.15x) gösterir!
    const isCleanCondition = (dto.damageStatus === 'NO' || damagePenalty <= 0.03) && dto.mileage <= 180000;

    const floorMarketPrice = (dbMarket && dbMarket.minPrice > 0)
      ? dbMarket.minPrice
      : this.roundToCleanGalleryPrice(fairMarketValue * (isCleanCondition ? 0.85 : 0.45));

    const ceilingMarketPrice = (dbMarket && dbMarket.maxPrice > 0)
      ? dbMarket.maxPrice
      : this.roundToCleanGalleryPrice(fairMarketValue * (isCleanCondition ? 1.15 : 1.55));

    let confidenceScore = 95;
    if (dto.damageStatus === 'UNKNOWN') confidenceScore -= 5;
    if (dto.mileage > 250000) confidenceScore -= 4;
    if (dto.year < 2010) confidenceScore -= 6;
    confidenceScore = Math.max(85, confidenceScore);

    // 3. Save Evaluation to Database
    const evaluation = await this.prisma.vehicleEvaluation.create({
      data: {
        vehicleSpecificationId: spec.id,
        licensePlate: dto.licensePlate,
        mileage: dto.mileage,
        color: dto.color,
        damageStatus: dto.damageStatus,
        damageDetails: detailReports.length > 0 ? detailReports.join(', ') : (dto.damageStatus === 'NO' ? 'Hatasız / Orijinal' : 'Hasarlı (Detay bildirilmedi)'),
        estimatedValue,
        minExpectedValue,
        maxExpectedValue: finalConsignmentPrice,
        quickSaleValue,
        confidenceScore,
        aiAnalysis: JSON.stringify(aiAnalysis),
        userIp,
        
        // Müşteri bilgileri
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        
        // Sorular ve pazarlık teklifleri
        sellingTimeline: dto.sellingTimeline,
        userDesiredPrice: dto.userDesiredPrice,
        finalOfferedPrice,
        
        // Araç özellikleri checklist
        features: dto.features || null,
      },
    });

    // 3b. Asenkrone Telegram Bildirimi Gönder (Kullanıcı beklemez)
    this.telegramService.sendEvaluationNotification({
      licensePlate: dto.licensePlate,
      vehicleName: `${spec.year} ${spec.manufacturer.name} ${spec.model.name} (${spec.variant.name})`,
      brandName: spec.manufacturer.name,
      modelName: spec.model.name,
      variantName: spec.variant.name,
      year: spec.year,
      fuel: spec.fuelType?.name || 'Benzin',
      transmission: spec.transmissionType?.name || 'Otomatik',
      bodyType: spec.bodyType?.name || 'Sedan',
      mileage: dto.mileage,
      color: dto.color,
      damageStatus: dto.damageStatus === 'NO' ? 'Hatasız' : 'Hasarlı',
      tramerAmount: dto.tramerAmount || (dto.damageStatus === 'NO' ? '0 TL' : 'Var (Tutar belirtilmedi)'),
      paintScheme: dto.paintScheme,
      chassisStatus: dto.chassisState,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      userDesiredPrice: dto.userDesiredPrice,
      fairMarketValue,
      finalOfferedPrice,
      finalConsignmentPrice,
      sellingTimeline: dto.sellingTimeline,
    }).catch((err) => console.error('Telegram Evaluation Notify Error:', err.message));

    // 4. Retrieve Comparable Listings (Based on real Sahibinden market average)
    const comparableListings = this.generateComparableListings(spec, fairMarketValue, floorMarketPrice, ceilingMarketPrice);

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
        fairMarketValue,
        estimatedValue, // Raw AI recommendation
        finalOfferedPrice, // Final negotiated offer to user
        finalConsignmentPrice, // Final consignment recommendation
        userDesiredPrice: dto.userDesiredPrice,
        guaranteedProfit: fairMarketValue - finalOfferedPrice,
        fairMarketRange: `${floorMarketPrice.toLocaleString('tr-TR')} ₺ - ${ceilingMarketPrice.toLocaleString('tr-TR')} ₺`,
        minExpectedValue,
        maxExpectedValue: finalConsignmentPrice,
        quickSaleValue,
        confidenceScore: `${confidenceScore}%`,
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
        id: `listing-${i + 1}`,
        year: spec.year,
        mileage: mileageVar,
        price: targetPrice,
        province: city,
        district: district,
        listingDate: `${3 + i * 2} gün önce`,
        photo: `/cars/mock-car-${i + 1}.jpg`,
        details: `${spec.variant.name} ${spec.package?.name || ''} - ${spec.transmissionType.name} - ${spec.fuelType.name}`,
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
