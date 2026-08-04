import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const years = [2018, 2020, 2022, 2024, 2025, 2026];

async function generateSpecsForModel(
  year: number,
  manufacturerId: string,
  modelId: string,
  brandName: string,
  modelName: string,
  dbFuels: any[],
  dbTrans: any[],
  dbBodies: any[],
  dbDrives: any[]
) {
  let basePrice2026 = 1400000; // default C-segment
  let floorPrice = 300000;
  let isPremium = false;
  let isExotic = false;
  let isEconomy = false;

  const lowerBrand = brandName.toLowerCase();
  const lowerModel = modelName.toLowerCase();

  // 1. Exotic Tier
  if (
    lowerBrand.includes('porsche') ||
    lowerBrand.includes('maserati') ||
    lowerBrand.includes('aston') ||
    lowerBrand.includes('ferrari') ||
    lowerBrand.includes('lamborghini') ||
    lowerBrand.includes('bentley')
  ) {
    basePrice2026 = 12000000;
    floorPrice = 2500000;
    isExotic = true;
  } 
  // 2. Premium Tier
  else if (
    lowerBrand.includes('mercedes') ||
    lowerBrand.includes('bmw') ||
    lowerBrand.includes('audi') ||
    lowerBrand.includes('volvo') ||
    lowerBrand.includes('land rover') ||
    lowerBrand.includes('tesla') ||
    lowerBrand.includes('jaguar')
  ) {
    basePrice2026 = 4000000;
    floorPrice = 850000;
    isPremium = true;
  }
  // 3. Economy Tier
  else if (
    lowerBrand.includes('fiat') ||
    lowerBrand.includes('dacia') ||
    lowerBrand.includes('citroen') ||
    lowerBrand.includes('chevrolet') ||
    lowerModel.includes('clio') ||
    lowerModel.includes('i20') ||
    lowerModel.includes('corsa') ||
    lowerModel.includes('polo') ||
    lowerModel.includes('fiesta') ||
    lowerModel.includes('sandero')
  ) {
    basePrice2026 = 900000;
    floorPrice = 200000;
    isEconomy = true;
  }
  // 4. D-Segment / Upper-Mid Tier
  else if (
    lowerModel.includes('passat') ||
    lowerModel.includes('superb') ||
    lowerModel.includes('insignia') ||
    lowerModel.includes('mondeo') ||
    lowerModel.includes('508') ||
    lowerModel.includes('talisman') ||
    lowerModel.includes('accord') ||
    lowerModel.includes('c5')
  ) {
    basePrice2026 = 2200000;
    floorPrice = 450000;
  }
  // 5. C-Segment / Standard Tier (default)
  else {
    basePrice2026 = 1400000;
    floorPrice = 300000;
  }

  const age = Math.max(0, 2026 - year);
  const marketAvg = Math.round(
    floorPrice + (basePrice2026 - floorPrice) * Math.pow(0.88, age)
  );

  let variantSpecs = [
    { name: '1.6 Motor', engineSize: 1598, horsepower: 120, torque: 250, cylinders: 4 },
    { name: '2.0 Motor', engineSize: 1998, horsepower: 180, torque: 350, cylinders: 4 }
  ];

  if (isEconomy) {
    variantSpecs = [
      { name: '1.0 Motor', engineSize: 999, horsepower: 90, torque: 160, cylinders: 3 },
      { name: '1.4 Motor', engineSize: 1368, horsepower: 95, torque: 130, cylinders: 4 }
    ];
  } else if (isPremium) {
    variantSpecs = [
      { name: '2.0 Turbo', engineSize: 1998, horsepower: 190, torque: 320, cylinders: 4 },
      { name: '3.0 Turbo', engineSize: 2998, horsepower: 340, torque: 450, cylinders: 6 }
    ];
  } else if (isExotic) {
    variantSpecs = [
      { name: '3.0 Twin-Turbo', engineSize: 2992, horsepower: 430, torque: 580, cylinders: 6 },
      { name: '4.0 V8', engineSize: 3982, horsepower: 580, torque: 730, cylinders: 8 }
    ];
  }

  for (const vSpec of variantSpecs) {
    const variant = await prisma.variant.upsert({
      where: {
        modelId_name: {
          modelId,
          name: vSpec.name,
        },
      },
      update: {},
      create: {
        name: vSpec.name,
        modelId,
        engineSize: vSpec.engineSize,
        horsepower: vSpec.horsepower,
        torque: vSpec.torque,
        cylinders: vSpec.cylinders,
      },
    });

    const packagesList = ['Standart / Comfort', 'Premium / Sport'];
    for (const pName of packagesList) {
      const pkg = await prisma.package.upsert({
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

      const bodyType = dbBodies[0]; 
      const fuelType = dbFuels[0];  
      const transType = dbTrans[0];  
      const driveType = isPremium || isExotic ? dbDrives[1] : dbDrives[0]; 

      const specPrice = pName.includes('Premium') ? Math.round(marketAvg * 1.15) : marketAvg;

      const spec = await prisma.vehicleSpecification.create({
        data: {
          year,
          manufacturerId,
          modelId,
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

      await prisma.vehicleMarketPrice.create({
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

async function run() {
  console.log('--- Starting Spec and Default Price Generation for ALL Database Models ---');

  // Load attribute references
  const fuelTypes = ['Benzin', 'Dizel'];
  const bodyTypes = ['Sedan', 'SUV', 'Hatchback'];
  const transmissionTypes = ['Manuel', 'Otomatik'];
  const driveTypes = ['Önden Çekiş', 'Arkadan İtiş', '4x4'];

  const dbFuels = await Promise.all(fuelTypes.map(f => prisma.fuelType.upsert({ where: { name: f }, update: {}, create: { name: f } })));
  const dbTrans = await Promise.all(transmissionTypes.map(t => prisma.transmissionType.upsert({ where: { name: t }, update: {}, create: { name: t } })));
  const dbBodies = await Promise.all(bodyTypes.map(b => prisma.bodyType.upsert({ where: { name: b }, update: {}, create: { name: b } })));
  const dbDrives = await Promise.all(driveTypes.map(d => prisma.driveType.upsert({ where: { name: d }, update: {}, create: { name: d } })));

  const models = await prisma.model.findMany({
    include: {
      manufacturer: true,
      specifications: true
    }
  });

  console.log(`Found ${models.length} models in the database.`);
  let count = 0;

  for (const model of models) {
    if (model.specifications.length === 0) {
      console.log(`Generating specifications for: ${model.manufacturer.name} ${model.name}...`);
      
      for (const year of years) {
        await generateSpecsForModel(
          year,
          model.manufacturerId,
          model.id,
          model.manufacturer.name,
          model.name,
          dbFuels,
          dbTrans,
          dbBodies,
          dbDrives
        );
      }
      count++;
    }
  }

  console.log(`\n--- Generation Completed successfully! ---`);
  console.log(`Generated specs for ${count} models.`);
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
