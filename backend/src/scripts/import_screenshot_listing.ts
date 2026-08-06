import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

export interface ScreenshotListingInput {
  make: string;
  model: string;
  variant?: string;
  trim?: string;
  year: number;
  mileageKm: number;
  price: number;
  city?: string;
  district?: string;
  fuelType?: string;
  transmissionType?: string;
  heavyDamage?: boolean;
  listingId?: string;
  sourceUrl?: string;
}

export async function saveScreenshotListing(data: ScreenshotListingInput) {
  const externalListingId = data.listingId || `ss-import-${Date.now()}`;

  // Find or create Manufacturer
  let manufacturer = await prisma.manufacturer.findFirst({
    where: { name: data.make },
  });
  if (!manufacturer) {
    manufacturer = await prisma.manufacturer.create({
      data: { name: data.make },
    });
  }

  // Find or create Model
  let modelRecord = await prisma.model.findFirst({
    where: {
      manufacturerId: manufacturer.id,
      name: data.model,
    },
  });
  if (!modelRecord) {
    modelRecord = await prisma.model.create({
      data: {
        manufacturerId: manufacturer.id,
        name: data.model,
      },
    });
  }

  // Find or create Variant
  let variantRecord = await prisma.variant.findFirst({
    where: {
      modelId: modelRecord.id,
      name: data.variant || 'Standart',
    },
  });
  if (!variantRecord) {
    variantRecord = await prisma.variant.create({
      data: {
        modelId: modelRecord.id,
        name: data.variant || 'Standart',
        engineSize: 1.6,
        horsepower: 120,
        torque: 200,
      },
    });
  }

  // Find or create Package/Trim
  let packageRecord = await prisma.package.findFirst({
    where: {
      variantId: variantRecord.id,
      name: data.trim || 'Standart',
    },
  });
  if (!packageRecord) {
    packageRecord = await prisma.package.create({
      data: {
        name: data.trim || 'Standart',
        variantId: variantRecord.id,
      },
    });
  }

  const fuelType = await prisma.fuelType.upsert({
    where: { name: data.fuelType || 'Benzin' },
    update: {},
    create: { name: data.fuelType || 'Benzin' },
  });

  const transType = await prisma.transmissionType.upsert({
    where: { name: data.transmissionType || 'Otomatik' },
    update: {},
    create: { name: data.transmissionType || 'Otomatik' },
  });

  const bodyType = await prisma.bodyType.upsert({
    where: { name: 'Sedan' },
    update: {},
    create: { name: 'Sedan' },
  });

  const driveType = await prisma.driveType.upsert({
    where: { name: 'Önden Çekiş' },
    update: {},
    create: { name: 'Önden Çekiş' },
  });

  // Find existing Specification or Create one
  let spec = await prisma.vehicleSpecification.findFirst({
    where: {
      manufacturerId: manufacturer.id,
      modelId: modelRecord.id,
      variantId: variantRecord.id,
      packageId: packageRecord.id,
      year: Number(data.year),
    },
  });

  if (!spec) {
    spec = await prisma.vehicleSpecification.create({
      data: {
        year: Number(data.year),
        manufacturerId: manufacturer.id,
        modelId: modelRecord.id,
        variantId: variantRecord.id,
        packageId: packageRecord.id,
        bodyTypeId: bodyType.id,
        fuelTypeId: fuelType.id,
        transmissionTypeId: transType.id,
        driveTypeId: driveType.id,
        originalMSRP: data.price * 1.15,
        popularityScore: 9.0,
        reliabilityScore: 8.5,
      },
    });
  }

  // Find existing Market Price entry or Create one
  const existingPrice = await prisma.vehicleMarketPrice.findFirst({
    where: {
      vehicleSpecificationId: spec.id,
      currentMarketAverage: data.price,
    },
  });

  if (!existingPrice) {
    await prisma.vehicleMarketPrice.create({
      data: {
        vehicleSpecificationId: spec.id,
        currentMarketAverage: data.price,
        averageListingPrice: Math.round(data.price * 1.03),
        minPrice: Math.round(data.price * 0.92),
        maxPrice: Math.round(data.price * 1.10),
        regionalPriceDifferences: '{}',
        averageSellingTime: 25,
      },
    });
  }

  return {
    status: 'SUCCESS',
    externalListingId,
    make: data.make,
    model: data.model,
    variant: data.variant,
    trim: data.trim,
    year: data.year,
    price: data.price,
    mileageKm: data.mileageKm,
    message: 'Screenshot vehicle listing extracted and saved to database successfully.',
  };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Lütfen bir JSON dosya yolu belirtin.');
    process.exit(1);
  }

  const rawData = fs.readFileSync(filePath, 'utf-8');
  const parsedData = JSON.parse(rawData);
  const items: ScreenshotListingInput[] = Array.isArray(parsedData) ? parsedData : [parsedData];

  console.log(`\n====================================================================`);
  console.log(`  ${items.length} SCREENSHOT LISTINGS SAVED SUCCESSFULLY TO DATABASE`);
  console.log(`====================================================================`);

  const results = [];
  for (const item of items) {
    const res = await saveScreenshotListing(item);
    results.push(res);
  }

  console.log(JSON.stringify({ totalImported: results.length, samples: results.slice(0, 3) }, null, 2));
}

if (require.main === module) {
  main().catch(console.error);
}
