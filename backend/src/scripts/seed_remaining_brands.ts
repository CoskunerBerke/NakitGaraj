import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const years = [2018, 2020, 2022, 2024, 2025, 2026];

const remainingCatalog = [
  // A-J Brands from screenshots
  { brand: 'Abarth', models: ['500', '595', '695'] },
  { brand: 'Acura', models: ['Integra', 'NSX', 'TLX'] },
  { brand: 'Aion', models: ['S', 'V'] },
  { brand: 'Alpine', models: ['A110'] },
  { brand: 'Anadol', models: ['A1', 'A2', 'SV-1600', 'STC-16'] },
  { brand: 'Arora', models: ['S1', 'M1'] },
  { brand: 'Aston Martin', models: ['DB9', 'DB11', 'DBS', 'DBX', 'Vanquish', 'Vantage'] },
  { brand: 'Bentley', models: ['Bentayga', 'Continental', 'Flying Spur', 'Mulsanne'] },
  { brand: 'Buick', models: ['Century', 'LeSabre', 'Regal'] },
  { brand: 'BYD', models: ['Atto 3', 'Dolphin', 'Han', 'Seal', 'Tang'] },
  { brand: 'Cadillac', models: ['ATS', 'CTS', 'Deville', 'Escalade', 'Seville'] },
  { brand: 'Chrysler', models: ['300C', 'Neon', 'PT Cruiser', 'Sebring'] },
  { brand: 'Daewoo', models: ['Lanos', 'Matiz', 'Nexia', 'Nubira', 'Tacuma'] },
  { brand: 'Daihatsu', models: ['Copen', 'Cuore', 'Materia', 'Sirion', 'Terios', 'YRV'] },
  { brand: 'Dodge', models: ['Avenger', 'Caliber', 'Challenger', 'Charger', 'Neon'] },
  { brand: 'DS Automobiles', models: ['DS 3', 'DS 4', 'DS 5', 'DS 7 Crossback', 'DS 9'] },
  { brand: 'Eagle', models: ['Talon'] },
  { brand: 'Ferrari', models: ['360', '458', '488', '599', '812', 'F430', 'F8', 'Portofino', 'Roma', 'SF90'] },
  { brand: 'Geely', models: ['CK', 'Echo', 'Emgrand'] },
  { brand: 'Ikco', models: ['Samand'] },
  { brand: 'Infiniti', models: ['FX35', 'G35', 'G37', 'Q30', 'Q50', 'QX70'] },
  { brand: 'Jiayuan', models: ['City Spirit'] },
  { brand: 'Joyce', models: ['EV'] },

  // K-Z Brands from Sahibinden Otomobil list
  { brand: 'Lancia', models: ['Delta', 'Thema', 'Ypsilon'] },
  { brand: 'Lexus', models: ['ES', 'IS', 'LS', 'NX', 'RX'] },
  { brand: 'Lincoln', models: ['Aviator', 'Navigator', 'Town Car'] },
  { brand: 'Lotus', models: ['Elise', 'Emira', 'Evora', 'Exige'] },
  { brand: 'McLaren', models: ['570S', '720S', 'Artura', 'GT'] },
  { brand: 'Mitsubishi', models: ['Carisma', 'Colt', 'Eclipse', 'Lancer', 'Space Star'] },
  { brand: 'Proton', models: ['Persona', 'Saga', 'Wira'] },
  { brand: 'Rolls-Royce', models: ['Cullinan', 'Ghost', 'Phantom', 'Wraith'] },
  { brand: 'Rover', models: ['25', '45', '75', '200'] },
  { brand: 'Saab', models: ['9-3', '9-5'] },
  { brand: 'Smart', models: ['Forfour', 'Fortwo'] },
  { brand: 'Tata', models: ['Indica', 'Indigo', 'Marina'] },
  { brand: 'Tofaş', models: ['Doğan', 'Kartal', 'Murat 124', 'Murat 131', 'Serçe', 'Şahin'] }
];

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
  let basePrice2026 = 1400000;
  let floorPrice = 300000;
  let isPremium = false;
  let isExotic = false;
  let isEconomy = false;

  const lowerBrand = brandName.toLowerCase();
  const lowerModel = modelName.toLowerCase();

  if (
    lowerBrand.includes('porsche') ||
    lowerBrand.includes('maserati') ||
    lowerBrand.includes('aston') ||
    lowerBrand.includes('ferrari') ||
    lowerBrand.includes('lamborghini') ||
    lowerBrand.includes('bentley') ||
    lowerBrand.includes('mclaren') ||
    lowerBrand.includes('rolls-royce')
  ) {
    basePrice2026 = 12000000;
    floorPrice = 2500000;
    isExotic = true;
  } else if (
    lowerBrand.includes('mercedes') ||
    lowerBrand.includes('bmw') ||
    lowerBrand.includes('audi') ||
    lowerBrand.includes('volvo') ||
    lowerBrand.includes('land rover') ||
    lowerBrand.includes('tesla') ||
    lowerBrand.includes('jaguar') ||
    lowerBrand.includes('lexus') ||
    lowerBrand.includes('ds automobiles') ||
    lowerBrand.includes('infiniti')
  ) {
    basePrice2026 = 4000000;
    floorPrice = 850000;
    isPremium = true;
  } else if (
    lowerBrand.includes('fiat') ||
    lowerBrand.includes('dacia') ||
    lowerBrand.includes('citroen') ||
    lowerBrand.includes('chevrolet') ||
    lowerBrand.includes('daewoo') ||
    lowerBrand.includes('tata') ||
    lowerBrand.includes('tofaş') ||
    lowerBrand.includes('arora') ||
    lowerBrand.includes('jiayuan') ||
    lowerBrand.includes('joyce') ||
    lowerModel.includes('clio') ||
    lowerModel.includes('i20') ||
    lowerModel.includes('corsa') ||
    lowerModel.includes('polo') ||
    lowerModel.includes('fiesta')
  ) {
    basePrice2026 = 800000;
    floorPrice = 180000;
    isEconomy = true;
  } else {
    basePrice2026 = 1300000;
    floorPrice = 280000;
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
  console.log('--- Seeding Remaining Brands and Generating Specs ---');

  // Load references
  const fuelTypes = ['Benzin', 'Dizel'];
  const bodyTypes = ['Sedan', 'SUV', 'Hatchback'];
  const transmissionTypes = ['Manuel', 'Otomatik'];
  const driveTypes = ['Önden Çekiş', 'Arkadan İtiş', '4x4'];

  const dbFuels = await Promise.all(fuelTypes.map(f => prisma.fuelType.upsert({ where: { name: f }, update: {}, create: { name: f } })));
  const dbTrans = await Promise.all(transmissionTypes.map(t => prisma.transmissionType.upsert({ where: { name: t }, update: {}, create: { name: t } })));
  const dbBodies = await Promise.all(bodyTypes.map(b => prisma.bodyType.upsert({ where: { name: b }, update: {}, create: { name: b } })));
  const dbDrives = await Promise.all(driveTypes.map(d => prisma.driveType.upsert({ where: { name: d }, update: {}, create: { name: d } })));

  let brandCount = 0;
  let modelCount = 0;
  let specCount = 0;

  for (const item of remainingCatalog) {
    const mfg = await prisma.manufacturer.upsert({
      where: { name: item.brand },
      update: {},
      create: { 
        name: item.brand,
        popularityScore: 5.0
      }
    });
    brandCount++;

    for (const modelName of item.models) {
      const model = await prisma.model.upsert({
        where: {
          manufacturerId_name: {
            manufacturerId: mfg.id,
            name: modelName
          }
        },
        update: {},
        create: {
          name: modelName,
          manufacturerId: mfg.id,
          popularityScore: 5.0
        }
      });
      modelCount++;

      // Check if specifications already exist
      const existingSpecs = await prisma.vehicleSpecification.findMany({
        where: { modelId: model.id }
      });

      if (existingSpecs.length === 0) {
        console.log(`Generating specifications for new model: ${mfg.name} ${model.name}...`);
        for (const year of years) {
          await generateSpecsForModel(
            year,
            mfg.id,
            model.id,
            mfg.name,
            model.name,
            dbFuels,
            dbTrans,
            dbBodies,
            dbDrives
          );
        }
        specCount += years.length;
      }
    }
  }

  console.log(`\n--- Seeding Completed! ---`);
  console.log(`Successfully added/verified ${brandCount} brands.`);
  console.log(`Successfully added/verified ${modelCount} models.`);
  console.log(`Successfully generated specifications for ${specCount} specifications.`);
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
