import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CacheService } from '../cache.service';

@Injectable()
export class VehicleService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  async getBrands() {
    const cacheKey = 'brands_list';
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    let brands = await this.prisma.manufacturer.findMany({
      orderBy: { name: 'asc' },
    });

    if (brands.length < 15) {
      await this.ensureMajorBrandsAndModelsSeeded();
      brands = await this.prisma.manufacturer.findMany({
        orderBy: { name: 'asc' },
      });
    }

    await this.cache.set(cacheKey, brands, 3600); // 1 hour caching
    return brands;
  }

  async getModels(brandId: string) {
    const cacheKey = `models_${brandId}`;
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const models = await this.prisma.model.findMany({
      where: { manufacturerId: brandId },
      orderBy: { name: 'asc' },
    });
    await this.cache.set(cacheKey, models, 3600);
    return models;
  }

  async getVariants(modelId: string) {
    const cacheKey = `variants_${modelId}`;
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const variants = await this.prisma.variant.findMany({
      where: { modelId },
      orderBy: { name: 'asc' },
    });
    await this.cache.set(cacheKey, variants, 3600);
    return variants;
  }

  async getYears() {
    const years = [];
    for (let y = 2026; y >= 2000; y--) {
      years.push(y);
    }
    return years;
  }

  async getVehicleData(query: {
    year: number;
    manufacturerId: string;
    modelId: string;
    variantId?: string;
    packageId?: string;
    bodyTypeId?: string;
    fuelTypeId?: string;
    transmissionTypeId?: string;
  }) {
    const baseWhere = {
      year: Number(query.year),
      manufacturerId: query.manufacturerId,
      modelId: query.modelId,
    };

    // Ensure database specifications are generated/cached
    const existingSpecsCount = await this.prisma.vehicleSpecification.count({
      where: baseWhere,
    });
    if (existingSpecsCount === 0) {
      await this.generateSpecsForModel(
        Number(query.year),
        query.manufacturerId,
        query.modelId,
      );
    }

    const getSpecsWithFilters = async (filters: any) => {
      return this.prisma.vehicleSpecification.findMany({
        where: {
          ...baseWhere,
          ...filters,
        },
        include: {
          variant: true,
          package: true,
          bodyType: true,
          fuelType: true,
          transmissionType: true,
        },
      });
    };

    // 1. Variants depend only on Year, Brand, Model (always fully editable)
    const variantSpecs = await getSpecsWithFilters({});

    // 2. Packages depend on Variant
    const packageFilters: any = {};
    if (query.variantId) packageFilters.variantId = query.variantId;
    const packageSpecs = await getSpecsWithFilters(packageFilters);

    // 3. Body Types depend on Variant and Package
    const bodyFilters: any = { ...packageFilters };
    if (query.packageId) bodyFilters.packageId = query.packageId;
    const bodySpecs = await getSpecsWithFilters(bodyFilters);

    // 4. Fuel Types depend on Variant, Package, and Body Type
    const fuelFilters: any = { ...bodyFilters };
    if (query.bodyTypeId) fuelFilters.bodyTypeId = query.bodyTypeId;
    const fuelSpecs = await getSpecsWithFilters(fuelFilters);

    // 5. Transmission Types depend on Variant, Package, Body Type, and Fuel Type
    const transFilters: any = { ...fuelFilters };
    if (query.fuelTypeId) transFilters.fuelTypeId = query.fuelTypeId;
    const transSpecs = await getSpecsWithFilters(transFilters);

    const variantsMap = new Map();
    for (const spec of variantSpecs) {
      if (spec.variant) variantsMap.set(spec.variant.id, spec.variant);
    }

    const packagesMap = new Map();
    for (const spec of packageSpecs) {
      if (spec.package) packagesMap.set(spec.package.id, spec.package);
    }

    const bodiesMap = new Map();
    for (const spec of bodySpecs) {
      if (spec.bodyType) bodiesMap.set(spec.bodyType.id, spec.bodyType);
    }

    const fuelsMap = new Map();
    for (const spec of fuelSpecs) {
      if (spec.fuelType) fuelsMap.set(spec.fuelType.id, spec.fuelType);
    }

    const transmissionsMap = new Map();
    for (const spec of transSpecs) {
      if (spec.transmissionType) {
        transmissionsMap.set(spec.transmissionType.id, spec.transmissionType);
      }
    }

    const uniqueVariants = Array.from(variantsMap.values());
    const uniquePackages = Array.from(packagesMap.values());
    const uniqueBodies = Array.from(bodiesMap.values());
    const uniqueFuels = Array.from(fuelsMap.values());
    const uniqueTransmissions = Array.from(transmissionsMap.values());

    return {
      variants: uniqueVariants,
      packages: uniquePackages,
      bodyTypes: uniqueBodies,
      fuelTypes: uniqueFuels,
      transmissionTypes: uniqueTransmissions,
      autoPopulate: {
        variantId: uniqueVariants.length === 1 ? uniqueVariants[0].id : null,
        packageId: uniquePackages.length === 1 ? uniquePackages[0].id : null,
        bodyTypeId: uniqueBodies.length === 1 ? uniqueBodies[0].id : null,
        fuelTypeId: uniqueFuels.length === 1 ? uniqueFuels[0].id : null,
        transmissionTypeId: uniqueTransmissions.length === 1 ? uniqueTransmissions[0].id : null,
      },
    };
  }

  private async generateSpecsForModel(
    year: number,
    manufacturerId: string,
    modelId: string,
  ) {
    const manufacturer = await this.prisma.manufacturer.findUnique({
      where: { id: manufacturerId },
    });
    const model = await this.prisma.model.findUnique({
      where: { id: modelId },
    });

    if (!manufacturer || !model) return;

    const brandName = manufacturer.name;
    const modelName = model.name;
    const lowerBrand = brandName.toLowerCase();
    const lowerModel = modelName.toLowerCase();

    let basePrice2026 = 1550000; // default C-segment
    let floorPrice = 450000;
    let isPremium = false;
    let isExotic = false;
    let isEconomy = false;

    // Segment Pricing Base
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
    } else if (
      lowerBrand.includes('porsche') ||
      lowerBrand.includes('maserati') ||
      lowerModel.includes('r8') ||
      lowerModel.includes('amg gt')
    ) {
      basePrice2026 = 18000000;
      floorPrice = 6000000;
      isExotic = true;
    } else if (
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
    } else if (
      lowerModel.includes('e-class') || lowerModel.includes('e serisi') ||
      lowerModel.includes('5 series') || lowerModel.includes('5 serisi') ||
      lowerModel.includes('a6') ||
      lowerModel.includes('a7') ||
      lowerModel.includes('s90') ||
      lowerModel.includes('v90') ||
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
      basePrice2026 = 12500000;
      floorPrice = 3500000;
      isPremium = true;
    } else if (
      lowerBrand.includes('mercedes') ||
      lowerBrand.includes('bmw') ||
      lowerBrand.includes('audi') ||
      lowerBrand.includes('volvo') ||
      lowerBrand.includes('land rover') ||
      lowerBrand.includes('tesla') ||
      lowerBrand.includes('jaguar')
    ) {
      basePrice2026 = 4500000;
      floorPrice = 1600000;
      isPremium = true;
    } else if (
      lowerBrand.includes('fiat') ||
      (lowerBrand.includes('dacia') && !lowerModel.includes('duster') && !lowerModel.includes('jogger')) ||
      lowerBrand.includes('citroen') ||
      lowerBrand.includes('chevrolet') ||
      lowerModel.includes('clio') ||
      lowerModel.includes('i20') ||
      lowerModel.includes('corsa') ||
      lowerModel.includes('polo') ||
      lowerModel.includes('fiesta') ||
      lowerModel.includes('sandero')
    ) {
      basePrice2026 = 1050000;
      floorPrice = 350000;
      isEconomy = true;
    } else if (
      lowerModel.includes('passat') ||
      lowerModel.includes('superb') ||
      lowerModel.includes('insignia') ||
      lowerModel.includes('mondeo') ||
      lowerModel.includes('508') ||
      lowerModel.includes('talisman') ||
      lowerModel.includes('accord') ||
      lowerModel.includes('c5')
    ) {
      basePrice2026 = 2800000;
      floorPrice = 700000;
    }

    const age = Math.max(0, 2026 - year);
    const marketAvg = Math.round(
      floorPrice + (basePrice2026 - floorPrice) * Math.pow(0.88, age)
    );

    type VariantSeed = {
      name: string;
      engineSize: number;
      horsepower: number;
      torque: number;
      cylinders?: number;
      fuel: string;
      trans: string;
      body?: string;
      packages: string[];
    };

    let variantSpecs: VariantSeed[] = [];

    if (lowerBrand.includes('citroen')) {
      if (lowerModel.includes('elysée') || lowerModel.includes('elysee')) {
        variantSpecs = [
          { name: '1.2 PureTech', engineSize: 1199, horsepower: 82, torque: 118, fuel: 'Benzin', trans: 'Manuel', body: 'Sedan', packages: ['Live', 'Feel', 'Shine'] },
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 100, torque: 250, fuel: 'Dizel', trans: 'Manuel', body: 'Sedan', packages: ['Feel', 'Feel Bold', 'Shine'] },
          { name: '1.6 HDi', engineSize: 1560, horsepower: 92, torque: 230, fuel: 'Dizel', trans: 'Manuel', body: 'Sedan', packages: ['Attraction', 'Confort', 'Exclusive'] },
        ];
      } else if (lowerModel.includes('c4 x') || lowerModel.includes('c4x')) {
        variantSpecs = [
          { name: '1.2 PureTech', engineSize: 1199, horsepower: 130, torque: 230, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Feel', 'Feel Bold', 'Shine', 'Shine Bold'] },
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 130, torque: 300, fuel: 'Dizel', trans: 'Otomatik', packages: ['Feel Bold', 'Shine', 'Shine Bold'] },
        ];
      } else if (lowerModel.includes('e-c4') || lowerModel.includes('ec4')) {
        variantSpecs = [
          { name: 'Elektrik (100 kW)', engineSize: 0, horsepower: 136, torque: 260, fuel: 'Elektrik', trans: 'Otomatik', body: lowerModel.includes('x') ? 'Sedan' : 'Hatchback', packages: ['Shine Bold'] },
          { name: 'Elektrik (115 kW)', engineSize: 0, horsepower: 156, torque: 260, fuel: 'Elektrik', trans: 'Otomatik', body: lowerModel.includes('x') ? 'Sedan' : 'Hatchback', packages: ['Max'] },
        ];
      } else if (lowerModel.includes('c4')) {
        variantSpecs = [
          { name: '1.2 PureTech', engineSize: 1199, horsepower: 130, torque: 230, fuel: 'Benzin', trans: 'Otomatik', body: 'Hatchback', packages: ['Feel', 'Feel Bold', 'Shine', 'Shine Bold'] },
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 130, torque: 300, fuel: 'Dizel', trans: 'Otomatik', packages: ['Feel Bold', 'Shine', 'Shine Bold'] },
          { name: '1.6 HDi', engineSize: 1560, horsepower: 115, torque: 270, fuel: 'Dizel', trans: 'Manuel', body: 'Hatchback', packages: ['Confort', 'Exclusive'] },
          { name: '1.6 e-HDi', engineSize: 1560, horsepower: 115, torque: 270, fuel: 'Dizel', trans: 'Otomatik', packages: ['Confort', 'Exclusive'] },
        ];
      } else if (lowerModel.includes('c3')) {
        const body = lowerModel.includes('aircross') ? 'SUV' : 'Hatchback';
        variantSpecs = [
          { name: '1.2 PureTech', engineSize: 1199, horsepower: 83, torque: 118, fuel: 'Benzin', trans: 'Manuel', body, packages: ['Feel', 'Feel Bold', 'You', 'Max'] },
          { name: '1.2 PureTech EAT6', engineSize: 1199, horsepower: 110, torque: 205, fuel: 'Benzin', trans: 'Otomatik', body, packages: ['Feel Bold', 'Shine', 'Max'] },
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 100, torque: 250, fuel: 'Dizel', trans: 'Manuel', body, packages: ['Feel', 'Feel Bold', 'Shine'] },
        ];
      } else if (lowerModel.includes('c5')) {
        variantSpecs = [
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 130, torque: 300, fuel: 'Dizel', trans: 'Otomatik', body: 'SUV', packages: ['Feel Bold', 'Shine', 'Shine Bold'] },
          { name: '1.2 PureTech', engineSize: 1199, horsepower: 130, torque: 230, fuel: 'Benzin', trans: 'Otomatik', body: 'SUV', packages: ['Feel Bold', 'Shine'] },
          { name: '1.6 PureTech', engineSize: 1598, horsepower: 180, torque: 250, fuel: 'Benzin', trans: 'Otomatik', packages: ['Shine', 'Shine Bold'] },
        ];
      }
    } else if (lowerBrand.includes('peugeot')) {
      if (lowerModel.includes('508')) {
        variantSpecs = [
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 130, torque: 300, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Active Prime', 'Allure', 'GT Line', 'GT'] },
          { name: '1.6 PureTech', engineSize: 1598, horsepower: 180, torque: 250, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Allure', 'GT Line', 'GT'] },
          { name: '1.6 Hybrid PSE', engineSize: 1598, horsepower: 360, torque: 520, fuel: 'Hibrit', trans: 'Otomatik', body: 'Sedan', packages: ['PSE', 'GT'] },
          { name: '2.0 BlueHDi', engineSize: 1997, horsepower: 180, torque: 400, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Allure', 'GT'] },
        ];
      } else if (lowerModel.includes('3008') || lowerModel.includes('5008')) {
        variantSpecs = [
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 130, torque: 300, fuel: 'Dizel', trans: 'Otomatik', body: 'SUV', packages: ['Active Prime', 'Allure', 'GT'] },
          { name: '1.2 PureTech', engineSize: 1199, horsepower: 130, torque: 230, fuel: 'Benzin', trans: 'Otomatik', body: 'SUV', packages: ['Active', 'Allure', 'GT'] },
          { name: '1.6 PureTech', engineSize: 1598, horsepower: 180, torque: 250, fuel: 'Benzin', trans: 'Otomatik', body: 'SUV', packages: ['Allure', 'GT'] },
        ];
      } else if (lowerModel.includes('208') || lowerModel.includes('2008') || lowerModel.includes('308')) {
        const body = lowerModel.includes('2008') ? 'SUV' : 'Hatchback';
        variantSpecs = [
          { name: '1.2 PureTech', engineSize: 1199, horsepower: 100, torque: 205, fuel: 'Benzin', trans: 'Manuel', body, packages: ['Active', 'Allure'] },
          { name: '1.2 PureTech EAT8', engineSize: 1199, horsepower: 130, torque: 230, fuel: 'Benzin', trans: 'Otomatik', body, packages: ['Allure', 'GT'] },
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 130, torque: 300, fuel: 'Dizel', trans: 'Otomatik', body, packages: ['Active', 'Allure', 'GT'] },
        ];
      } else if (lowerModel.includes('301')) {
        variantSpecs = [
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 100, torque: 250, fuel: 'Dizel', trans: 'Manuel', body: 'Sedan', packages: ['Active', 'Allure'] },
          { name: '1.6 HDi', engineSize: 1560, horsepower: 92, torque: 230, fuel: 'Dizel', trans: 'Manuel', body: 'Sedan', packages: ['Access', 'Active', 'Allure'] },
          { name: '1.2 VTi', engineSize: 1199, horsepower: 82, torque: 118, fuel: 'Benzin', trans: 'Manuel', body: 'Sedan', packages: ['Access', 'Active'] },
        ];
      }
    } else if (lowerBrand.includes('volkswagen')) {
      if (lowerModel.includes('passat') || lowerModel.includes('arteon')) {
        variantSpecs = [
          { name: '1.5 TSI', engineSize: 1498, horsepower: 150, torque: 250, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Business', 'Elegance', 'R-Line'] },
          { name: '1.6 TDI', engineSize: 1598, horsepower: 120, torque: 250, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Trendline', 'Comfortline', 'Highline'] },
          { name: '2.0 TDI', engineSize: 1968, horsepower: 150, torque: 360, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Business', 'Elegance', 'Highline'] },
        ];
      } else if (lowerModel.includes('golf') || lowerModel.includes('t-roc') || lowerModel.includes('tiguan') || lowerModel.includes('polo')) {
        const body = lowerModel.includes('tiguan') || lowerModel.includes('t-roc') ? 'SUV' : 'Hatchback';
        variantSpecs = [
          { name: '1.0 TSI', engineSize: 999, horsepower: 110, torque: 200, fuel: 'Benzin', trans: 'Manuel', body, packages: ['Impression', 'Life'] },
          { name: '1.5 TSI / eTSI', engineSize: 1498, horsepower: 150, torque: 250, fuel: 'Benzin', trans: 'Otomatik', body, packages: ['Life', 'Style', 'R-Line'] },
          { name: '1.6 TDI / 2.0 TDI', engineSize: 1968, horsepower: 150, torque: 360, fuel: 'Dizel', trans: 'Otomatik', body, packages: ['Life', 'Style'] },
        ];
      }
    } else if (lowerBrand.includes('renault')) {
      if (lowerModel.includes('megane') || lowerModel.includes('talisman') || lowerModel.includes('austral')) {
        variantSpecs = [
          { name: '1.3 TCe', engineSize: 1332, horsepower: 140, torque: 240, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Joy', 'Touch', 'Icon'] },
          { name: '1.5 Blue dCi', engineSize: 1461, horsepower: 115, torque: 270, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Joy', 'Touch', 'Icon'] },
        ];
      } else if (lowerModel.includes('clio') || lowerModel.includes('captur')) {
        variantSpecs = [
          { name: '1.0 TCe', engineSize: 999, horsepower: 90, torque: 160, fuel: 'Benzin', trans: 'Otomatik', body: 'Hatchback', packages: ['Joy', 'Touch', 'Icon'] },
          { name: '1.5 Blue dCi', engineSize: 1461, horsepower: 85, torque: 220, fuel: 'Dizel', trans: 'Manuel', body: 'Hatchback', packages: ['Joy', 'Touch'] },
        ];
      }
    } else if (lowerBrand.includes('fiat')) {
      if (lowerModel.includes('egea')) {
        variantSpecs = [
          { name: '1.3 Multijet', engineSize: 1248, horsepower: 95, torque: 200, fuel: 'Dizel', trans: 'Manuel', body: 'Sedan', packages: ['Easy', 'Urban', 'Lounge'] },
          { name: '1.6 Multijet DCT', engineSize: 1598, horsepower: 130, torque: 320, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Urban', 'Lounge'] },
          { name: '1.4 Fire', engineSize: 1368, horsepower: 95, torque: 127, fuel: 'Benzin', trans: 'Manuel', body: 'Sedan', packages: ['Easy', 'Urban', 'Lounge'] },
          { name: '1.5 T4 Hybrid', engineSize: 1469, horsepower: 130, torque: 240, fuel: 'Hibrit', trans: 'Otomatik', body: 'Sedan', packages: ['Urban', 'Lounge'] },
        ];
      }
    } else if (lowerBrand.includes('toyota')) {
      variantSpecs = [
        { name: '1.8 Hybrid', engineSize: 1798, horsepower: 140, torque: 185, fuel: 'Hibrit', trans: 'Otomatik', body: 'Sedan', packages: ['Dream', 'Flame', 'Passion'] },
        { name: '1.5 Vision / Dream', engineSize: 1490, horsepower: 125, torque: 153, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Vision', 'Dream', 'Flame'] },
        { name: '1.4 D-4D', engineSize: 1364, horsepower: 90, torque: 205, fuel: 'Dizel', trans: 'Manuel', body: 'Sedan', packages: ['Life', 'Touch'] },
      ];
    } else if (lowerBrand.includes('togg')) {
      variantSpecs = [
        { name: 'V1 RWD Standart Menzil', engineSize: 0, horsepower: 218, torque: 350, fuel: 'Elektrik', trans: 'Otomatik', body: 'SUV', packages: ['V1'] },
        { name: 'V2 RWD Uzun Menzil', engineSize: 0, horsepower: 218, torque: 350, fuel: 'Elektrik', trans: 'Otomatik', body: 'SUV', packages: ['V2'] },
      ];
    } else if (lowerBrand.includes('tesla')) {
      variantSpecs = [
        { name: 'Standard Range RWD', engineSize: 0, horsepower: 283, torque: 420, fuel: 'Elektrik', trans: 'Otomatik', body: 'Sedan', packages: ['Standard'] },
        { name: 'Long Range AWD', engineSize: 0, horsepower: 441, torque: 493, fuel: 'Elektrik', trans: 'Otomatik', body: 'Sedan', packages: ['Long Range'] },
      ];
    }

    if (variantSpecs.length === 0) {
      if (isEconomy) {
        variantSpecs = [
          { name: '1.0 / 1.2 Benzin', engineSize: 1199, horsepower: 90, torque: 160, fuel: 'Benzin', trans: 'Manuel', body: 'Hatchback', packages: ['Standart', 'Comfort'] },
          { name: '1.4 / 1.5 Dizel', engineSize: 1461, horsepower: 95, torque: 220, fuel: 'Dizel', trans: 'Manuel', body: 'Hatchback', packages: ['Standart', 'Comfort'] },
        ];
      } else if (isPremium || isExotic) {
        variantSpecs = [
          { name: '2.0 Benzin Turbo', engineSize: 1998, horsepower: 200, torque: 320, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Luxury', 'Sport'] },
          { name: '2.0 Dizel Turbo', engineSize: 1995, horsepower: 190, torque: 400, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Luxury', 'Sport'] },
        ];
      } else {
        variantSpecs = [
          { name: '1.5 Dizel', engineSize: 1499, horsepower: 120, torque: 300, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Standart', 'Comfort', 'Premium'] },
          { name: '1.6 Benzin Turbo', engineSize: 1598, horsepower: 150, torque: 240, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Standart', 'Comfort', 'Premium'] },
        ];
      }
    }

    for (const vSpec of variantSpecs) {
      const variant = await this.prisma.variant.upsert({
        where: {
          modelId_name: {
            modelId: model.id,
            name: vSpec.name,
          },
        },
        update: {
          engineSize: vSpec.engineSize,
          horsepower: vSpec.horsepower,
          torque: vSpec.torque,
        },
        create: {
          name: vSpec.name,
          modelId: model.id,
          engineSize: vSpec.engineSize,
          horsepower: vSpec.horsepower,
          torque: vSpec.torque,
          cylinders: vSpec.cylinders || 4,
        },
      });

      const fuelType = await this.prisma.fuelType.upsert({
        where: { name: vSpec.fuel },
        update: {},
        create: { name: vSpec.fuel },
      });

      const transType = await this.prisma.transmissionType.upsert({
        where: { name: vSpec.trans },
        update: {},
        create: { name: vSpec.trans },
      });

      const defaultBody = vSpec.body || (isPremium || isExotic ? 'Sedan' : 'Hatchback');
      const bodyType = await this.prisma.bodyType.upsert({
        where: { name: defaultBody },
        update: {},
        create: { name: defaultBody },
      });

      const driveType = await this.prisma.driveType.upsert({
        where: { name: isPremium || isExotic ? 'Arkadan İtiş' : 'Önden Çekiş' },
        update: {},
        create: { name: isPremium || isExotic ? 'Arkadan İtiş' : 'Önden Çekiş' },
      });

      const packagesList = vSpec.packages && vSpec.packages.length > 0
        ? vSpec.packages
        : ['Standart', 'Comfort', 'Premium'];

      for (const pName of packagesList) {
        const pkg = await this.prisma.package.upsert({
          where: {
            variantId_name: {
              variantId: variant.id,
              name: pName,
            },
          },
          update: {},
          create: {
            name: pName,
            variantId: variant.id,
          },
        });

        const specPrice = pName.includes('GT') || pName.includes('Premium') || pName.includes('AMG') || pName.includes('M Sport') || pName.includes('Icon')
          ? Math.round(marketAvg * 1.15)
          : marketAvg;

        const spec = await this.prisma.vehicleSpecification.create({
          data: {
            year,
            manufacturerId: manufacturer.id,
            modelId: model.id,
            variantId: variant.id,
            packageId: pkg.id,
            bodyTypeId: bodyType.id,
            fuelTypeId: fuelType.id,
            transmissionTypeId: transType.id,
            driveTypeId: driveType.id,
            originalMSRP: specPrice * 1.2,
            popularityScore: isPremium || isEconomy ? 8.5 : 7.0,
            reliabilityScore: 8.0,
          },
        });

        await this.prisma.vehicleMarketPrice.create({
          data: {
            vehicleSpecificationId: spec.id,
            currentMarketAverage: specPrice,
            averageListingPrice: Math.round(specPrice * 1.03),
            minPrice: Math.round(specPrice * 0.92),
            maxPrice: Math.round(specPrice * 1.08),
            regionalPriceDifferences: JSON.stringify({
              Istanbul: 1.0,
              Ankara: 0.98,
              Izmir: 0.99,
            }),
            averageSellingTime: 18,
          },
        });
      }
    }
  }

  private async ensureMajorBrandsAndModelsSeeded() {
    const majorCatalog = [
      { brand: 'Alfa Romeo', models: ['147', '156', '159', 'Giulia', 'Giulietta', 'Mito', 'Stelvio', 'Tonale'] },
      { brand: 'Audi', models: ['A1', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q2', 'Q3', 'Q5', 'Q7', 'Q8', 'R8', 'TT'] },
      { brand: 'BMW', models: ['1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '6 Series', '7 Series', '8 Series', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z4', 'i3', 'i4', 'i8', 'iX'] },
      { brand: 'Chery', models: ['Alia', 'Chance', 'Kimo', 'Omoda 5', 'Tiggo 3', 'Tiggo 4 Pro', 'Tiggo 7 Pro', 'Tiggo 8 Pro'] },
      { brand: 'Chevrolet', models: ['Aveo', 'Camaro', 'Captiva', 'Cruze', 'Epica', 'Kalos', 'Lacetti', 'Spark', 'Trax'] },
      { brand: 'Citroen', models: ['C-Elysee', 'C1', 'C2', 'C3', 'C3 Aircross', 'C3 Picasso', 'C4', 'C4 Aircross', 'C4 Cactus', 'C4 Picasso', 'C5', 'C5 Aircross', 'DS3', 'DS4', 'DS5', 'Saxo', 'Xsara'] },
      { brand: 'Cupra', models: ['Born', 'Formentor', 'Leon'] },
      { brand: 'Dacia', models: ['Duster', 'Jogger', 'Lodgy', 'Logan', 'Sandero', 'Solenza', 'Spring'] },
      { brand: 'Fiat', models: ['124 Spider', '500', '500L', '500X', 'Albea', 'Bravo', 'Doblo', 'Egea', 'Fiorino', 'Freemont', 'Idea', 'Linea', 'Marea', 'Palio', 'Panda', 'Punto', 'Siena', 'Stilo', 'Tempra', 'Tipo', 'Uno'] },
      { brand: 'Ford', models: ['B-Max', 'C-Max', 'Escort', 'Fiesta', 'Focus', 'Fusion', 'Galaxy', 'Ka', 'Kuga', 'Mondeo', 'Mustang', 'Puma', 'S-Max', 'Taunus'] },
      { brand: 'Honda', models: ['Accord', 'Civic', 'CR-V', 'City', 'HR-V', 'Jazz', 'Prelude', 'S2000'] },
      { brand: 'Hyundai', models: ['Accent', 'Accent Blue', 'Accent Era', 'Atos', 'Bayon', 'Coupe', 'Elantra', 'Getz', 'Genesis', 'i10', 'i20', 'i30', 'i40', 'Ioniq', 'Ioniq 5', 'Ioniq 6', 'Kona', 'Matrix', 'Santa Fe', 'Sonata', 'Tucson'] },
      { brand: 'Jaguar', models: ['F-Pace', 'F-Type', 'I-Pace', 'XE', 'XF', 'XJ'] },
      { brand: 'Jeep', models: ['Cherokee', 'Compass', 'Grand Cherokee', 'Patriot', 'Renegade', 'Wrangler'] },
      { brand: 'Kia', models: ['Ceed', 'Cerato', 'EV6', 'Niro', 'Picanto', 'Rio', 'Sorento', 'Soul', 'Sportage', 'Stinger', 'Stonic', 'Venga'] },
      { brand: 'Land Rover', models: ['Defender', 'Discovery', 'Discovery Sport', 'Freelander', 'Range Rover', 'Range Rover Evoque', 'Range Rover Sport', 'Range Rover Velar'] },
      { brand: 'Maserati', models: ['Ghibli', 'GranCabrio', 'GranTurismo', 'Grecale', 'Levante', 'Quattroporte'] },
      { brand: 'Mazda', models: ['2', '3', '5', '6', 'CX-3', 'CX-5', 'CX-9', 'MX-5', 'RX-8'] },
      { brand: 'Mercedes-Benz', models: ['A-Class', 'B-Class', 'C-Class', 'CL', 'CLA', 'CLK', 'CLS', 'E-Class', 'EQA', 'EQB', 'EQC', 'EQE', 'EQS', 'G-Class', 'GL', 'GLA', 'GLB', 'GLC', 'GLE', 'GLK', 'GLS', 'ML', 'S-Class', 'SL', 'SLC', 'SLK'] },
      { brand: 'MG', models: ['4', '5', 'E-HS', 'HS', 'Marvel R', 'ZS'] },
      { brand: 'Mini', models: ['Clubman', 'Cooper', 'Countryman', 'Paceman'] },
      { brand: 'Nissan', models: ['Almera', 'Juke', 'Micra', 'Note', 'Pathfinder', 'Primera', 'Pulsar', 'Qashqai', 'Sunny', 'X-Trail'] },
      { brand: 'Opel', models: ['Adam', 'Ampera', 'Antara', 'Astra', 'Cascada', 'Corsa', 'Crossland', 'Grandland', 'Insignia', 'Meriva', 'Mokka', 'Tigra', 'Vectra', 'Zafira'] },
      { brand: 'Peugeot', models: ['106', '107', '206', '207', '208', '301', '307', '308', '407', '508', '2008', '3008', '5008', 'RCZ'] },
      { brand: 'Porsche', models: ['718 Boxster', '718 Cayman', '911', 'Boxster', 'Cayenne', 'Cayman', 'Macan', 'Panamera', 'Taycan'] },
      { brand: 'Renault', models: ['Austral', 'Captur', 'Clio', 'Fluence', 'Kadjar', 'Koleos', 'Laguna', 'Latitude', 'Megane', 'Modus', 'Safrane', 'Scenic', 'Symbol', 'Talisman', 'Twingo', 'Zoe'] },
      { brand: 'Seat', models: ['Alhambra', 'Altea', 'Arona', 'Ateca', 'Cordoba', 'Ibiza', 'Leon', 'Tarraco', 'Toledo'] },
      { brand: 'Skoda', models: ['Fabia', 'Favorit', 'Felicia', 'Kamiq', 'Karoq', 'Kodiaq', 'Octavia', 'Rapid', 'Roomster', 'Scala', 'Superb', 'Yeti'] },
      { brand: 'Subaru', models: ['BRZ', 'Forester', 'Impreza', 'Legacy', 'Outback', 'XV'] },
      { brand: 'Suzuki', models: ['Alto', 'Baleno', 'Jimny', 'S-Cross', 'Splash', 'Swift', 'Vitara', 'Wagon R'] },
      { brand: 'Tesla', models: ['Model 3', 'Model S', 'Model X', 'Model Y'] },
      { brand: 'Togg', models: ['T10X'] },
      { brand: 'Toyota', models: ['Auris', 'Avensis', 'C-HR', 'Camry', 'Carina', 'Celica', 'Corolla', 'Corona', 'Cressida', 'GT86', 'Land Cruiser', 'MR2', 'Picnic', 'Prius', 'RAV4', 'Starlet', 'Supra', 'Tercel', 'Urban Cruiser', 'Verso', 'Yaris'] },
      { brand: 'Volvo', models: ['C30', 'C70', 'S40', 'S60', 'S80', 'S90', 'V40', 'V40 Cross Country', 'V60', 'V90', 'XC40', 'XC60', 'XC90'] },
      { brand: 'Volkswagen', models: ['Arteon', 'Bora', 'Beetle', 'Golf', 'ID.3', 'ID.4', 'Jetta', 'Lupo', 'Passat', 'Passat Variant', 'Polo', 'Scirocco', 'Sharan', 'T-Roc', 'Tiguan', 'Touareg', 'Touran'] }
    ];

    for (const item of majorCatalog) {
      const mfg = await this.prisma.manufacturer.upsert({
        where: { name: item.brand },
        update: {},
        create: { name: item.brand },
      });

      for (const mName of item.models) {
        await this.prisma.model.upsert({
          where: {
            manufacturerId_name: {
              manufacturerId: mfg.id,
              name: mName,
            },
          },
          update: {},
          create: {
            name: mName,
            manufacturerId: mfg.id,
          },
        });
      }
    }
  }

  async createVehicleRequest(data: {
    brand: string;
    model: string;
    year?: number;
    note?: string;
    phone?: string;
    email?: string;
  }) {
    return this.prisma.vehicleRequest.create({
      data: {
        brand: data.brand,
        model: data.model,
        year: data.year ? Number(data.year) : null,
        note: data.note || null,
        phone: data.phone || null,
        email: data.email || null,
      },
    });
  }

  async adjustMarketPrices(percentage: number, brandName?: string) {
    const multiplier = 1 + (percentage / 100);
    const whereCondition = brandName
      ? { manufacturer: { name: { equals: brandName } } }
      : {};

    const specs = await this.prisma.vehicleSpecification.findMany({
      where: whereCondition,
    });

    let count = 0;
    for (const spec of specs) {
      if (spec.originalMSRP && spec.originalMSRP > 0) {
        await this.prisma.vehicleSpecification.update({
          where: { id: spec.id },
          data: { originalMSRP: Math.round(spec.originalMSRP * multiplier) },
        });
        count++;
      }
    }
    return { success: true, count, percentage, brand: brandName || 'ALL' };
  }
}
