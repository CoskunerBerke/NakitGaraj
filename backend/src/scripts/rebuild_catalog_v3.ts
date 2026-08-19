import * as path from 'path';
import * as fs from 'fs';
try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.endsWith('dev.db')) {
  process.env.DATABASE_URL = 'file:' + path.resolve(__dirname, '../../prisma/dev.db');
}

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  console.log(`\n====================================================================`);
  console.log(`  NAKİTGARAJ CATALOG V3 KATALOG YENİDEN YAPILANDIRMA VE DÜZELTME`);
  console.log(`====================================================================\n`);

  // 1. Fetch all raw vehicle listings
  const allListings = await prisma.rawVehicleListing.findMany({
    select: {
      canonicalMake: true,
      canonicalModel: true,
      canonicalVariant: true,
      canonicalTrim: true,
      canonicalBodyType: true,
      year: true,
    },
  });

  console.log(`- Toplam İşlenecek RawListing Kaydı: ${allListings.length}`);

  let createdModels = 0;
  let createdVariants = 0;
  let createdPackages = 0;
  let createdSpecs = 0;

  // Cache maps to avoid redundant queries
  const makeMap = new Map<string, string>(); // name -> id
  const modelMap = new Map<string, string>(); // `${makeId}__${modelName}` -> id
  const variantMap = new Map<string, string>(); // `${modelId}__${variantName}` -> id
  const packageMap = new Map<string, string>(); // `${modelId}__${packageName}` -> id
  const bodyMap = new Map<string, string>(); // name -> id

  // Load existing Manufacturers
  const makes = await prisma.manufacturer.findMany();
  for (const m of makes) {
    makeMap.set(m.name.toLowerCase(), m.id);
  }

  // Default IDs for required relation fields
  let defaultFuel = await prisma.fuelType.findFirst({ where: { name: 'Benzin' } });
  if (!defaultFuel) defaultFuel = await prisma.fuelType.create({ data: { name: 'Benzin' } });

  let defaultTrans = await prisma.transmissionType.findFirst({ where: { name: 'Manuel' } });
  if (!defaultTrans) defaultTrans = await prisma.transmissionType.create({ data: { name: 'Manuel' } });

  let defaultDrive = await prisma.driveType.findFirst({ where: { name: 'Önden Çekiş' } });
  if (!defaultDrive) defaultDrive = await prisma.driveType.create({ data: { name: 'Önden Çekiş' } });

  let defaultBody = await prisma.bodyType.findFirst({ where: { name: 'Sedan' } });
  if (!defaultBody) defaultBody = await prisma.bodyType.create({ data: { name: 'Sedan' } });

  // Group listings by Make + Model + Variant + Trim + Year
  for (const item of allListings) {
    const makeName = (item.canonicalMake || '').trim();
    const modelName = (item.canonicalModel || '').trim();
    const variantName = (item.canonicalVariant || 'UNKNOWN').trim();
    const trimName = (item.canonicalTrim || '').trim();
    const bodyName = (item.canonicalBodyType || '').trim();
    const year = item.year || 2000;

    if (!makeName || !modelName || modelName === 'Genel Model') continue;

    // 1. Ensure Manufacturer
    let makeId = makeMap.get(makeName.toLowerCase());
    if (!makeId) {
      const createdMake = await prisma.manufacturer.create({ data: { name: makeName } });
      makeId = createdMake.id;
      makeMap.set(makeName.toLowerCase(), makeId);
    }

    // 2. Ensure Clean Model
    const modelKey = `${makeId}__${modelName.toLowerCase()}`;
    let modelId = modelMap.get(modelKey);
    if (!modelId) {
      let existingModel = await prisma.model.findFirst({
        where: { manufacturerId: makeId, name: { equals: modelName } }
      });
      if (!existingModel) {
        existingModel = await prisma.model.create({
          data: { manufacturerId: makeId, name: modelName }
        });
        createdModels++;
      }
      modelId = existingModel.id;
      modelMap.set(modelKey, modelId);
    }

    // 3. Ensure Variant
    const variantKey = `${modelId}__${variantName.toLowerCase()}`;
    let variantId = variantMap.get(variantKey);
    if (!variantId) {
      let existingVariant = await prisma.variant.findFirst({
        where: { modelId: modelId, name: { equals: variantName } }
      });
      if (!existingVariant) {
        existingVariant = await prisma.variant.create({
          data: {
            modelId: modelId,
            name: variantName,
            engineSize: 1600,
            horsepower: 120,
            torque: 200
          }
        });
        createdVariants++;
      }
      variantId = existingVariant.id;
      variantMap.set(variantKey, variantId);
    }

    // 4. Ensure Package (if trimName present)
    let packageId: string | null = null;
    if (trimName) {
      const packageKey = `${variantId}__${trimName.toLowerCase()}`;
      packageId = packageMap.get(packageKey) || null;
      if (!packageId) {
        let existingPackage = await prisma.package.findFirst({
          where: { variantId: variantId, name: { equals: trimName } }
        });
        if (!existingPackage) {
          existingPackage = await prisma.package.create({
            data: {
              variantId: variantId,
              name: trimName
            }
          });
          createdPackages++;
        }
        packageId = existingPackage.id;
        packageMap.set(packageKey, packageId);
      }
    }

    // 5. Ensure BodyType (if bodyName present)
    let bodyTypeId: string = defaultBody.id;
    if (bodyName) {
      let foundBodyId = bodyMap.get(bodyName.toLowerCase());
      if (!foundBodyId) {
        let existingBody = await prisma.bodyType.findFirst({
          where: { name: { equals: bodyName } }
        });
        if (!existingBody) {
          existingBody = await prisma.bodyType.create({
            data: { name: bodyName }
          });
        }
        foundBodyId = existingBody.id;
        bodyMap.set(bodyName.toLowerCase(), foundBodyId);
      }
      bodyTypeId = foundBodyId;
    }

    // 6. Ensure VehicleSpecification for (make, model, variant, package, year)
    const specWhere: any = {
      manufacturerId: makeId,
      modelId: modelId,
      variantId: variantId,
      year: year,
    };
    if (packageId) specWhere.packageId = packageId;

    const existingSpec = await prisma.vehicleSpecification.findFirst({
      where: specWhere
    });

    if (!existingSpec) {
      await prisma.vehicleSpecification.create({
        data: {
          manufacturerId: makeId,
          modelId: modelId,
          variantId: variantId,
          packageId: packageId || null,
          bodyTypeId: bodyTypeId,
          fuelTypeId: defaultFuel.id,
          transmissionTypeId: defaultTrans.id,
          driveTypeId: defaultDrive.id,
          year: year,
        }
      });
      createdSpecs++;
    }
  }

  console.log(`✓ Yeni Kataloğa Eklendi / Güncellendi:`);
  console.log(`  - Yeni Model Sayısı: ${createdModels}`);
  console.log(`  - Yeni Variant Sayısı: ${createdVariants}`);
  console.log(`  - Yeni Package Sayısı: ${createdPackages}`);
  console.log(`  - Yeni Specification Sayısı: ${createdSpecs}`);

  // 7. Cleanup corrupted Models (containing sahibinden, .html, Fiyatları, etc.)
  const corruptedModels = await prisma.model.findMany({
    where: {
      OR: [
        { name: { contains: 'sahibinden' } },
        { name: { contains: 'Fiyatları' } },
        { name: { contains: '.html' } },
        { name: { contains: 'Modelleri' } },
        { name: { contains: 'TFSI' } },
        { name: { contains: 'TDI' } },
        { name: { contains: 'TSI' } },
        { name: { contains: 'Sportback' } },
        { name: { contains: 'Design Line' } },
        { name: { contains: 'Ambition' } },
      ]
    },
    include: {
      variants: true,
      specifications: true,
    }
  });

  console.log(`\n- Temizlenecek Hatalı Model Kaydı Sayısı: ${corruptedModels.length}`);
  let removedCount = 0;

  for (const cm of corruptedModels) {
    // Check if any specification or variant is still tied
    if (cm.specifications.length > 0) {
      await prisma.vehicleSpecification.deleteMany({ where: { modelId: cm.id } });
    }
    if (cm.variants.length > 0) {
      await prisma.variant.deleteMany({ where: { modelId: cm.id } });
    }
    try {
      await prisma.model.delete({ where: { id: cm.id } });
      removedCount++;
    } catch (e) {}
  }

  console.log(`✓ Başarıyla Kaldırılan Hatalı Model Kaydı: ${removedCount}\n`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
