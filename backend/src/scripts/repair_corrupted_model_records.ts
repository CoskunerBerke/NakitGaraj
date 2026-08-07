import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

export function cleanModelName(text: string, brandName?: string): string {
  if (!text) return '';
  let clean = text
    .replace(/\.html?/gi, '')
    .replace(/\s*-\s*\d+$/g, '')
    .replace(/&?\s*Modelleri\s*/gi, '')
    .replace(/Fiyatları\s*&\s*Modelleri/gi, '')
    .replace(/Fiyatları/gi, '')
    .replace(/sahibinden\.com'da/gi, '')
    .replace(/sahibinden\.com/gi, '')
    .replace(/sahibinden/gi, '')
    .replace(/Satılık/gi, '')
    .replace(/2\.El/gi, '')
    .replace(/2\. El/gi, '')
    .replace(/Sıfır Km/gi, '')
    .replace(/Otomobil/gi, '')
    .replace(/Arabalar ve/gi, '')
    .replace(/Arabalar/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (brandName) {
    const brandRegex = new RegExp(`^${brandName}\\s*`, 'i');
    clean = clean.replace(brandRegex, '').trim();
  }

  const words = clean.split(' ').filter(w => w.length > 0);
  if (words.length >= 2 && words[0].toLowerCase() === words[1].toLowerCase()) {
    clean = words.slice(1).join(' ');
  }

  const upperBrand = (brandName || '').toUpperCase();
  if (upperBrand === 'AUDI') {
    const audiMatch = clean.match(/^(A[1-8]|Q[2-8]|TT|R8|80 Serisi|100 Serisi|200 Serisi)/i);
    if (audiMatch) return audiMatch[1].toUpperCase();
  } else if (upperBrand === 'ALFA ROMEO') {
    const alfaMatch = clean.match(/^(147|156|159|Giulietta|MiTo|Stelvio|Tonale|Giulia|GT|Brera|Spider)/i);
    if (alfaMatch) return alfaMatch[1];
  } else if (upperBrand === 'FORD') {
    const fordMatch = clean.match(/^(Focus|Fiesta|Mondeo|Kuga|Puma|EcoSport|C-Max|S-Max|Mustang|Ranger|Tourneo Courier|Transit Courier|Tourneo Connect|Transit Connect|Tourneo Custom|Transit Custom|Transit|Ka|Fusion|Taunus|Escort|Sierra|Granada)/i);
    if (fordMatch) return fordMatch[1];
  } else if (upperBrand === 'BMW') {
    const bmwMatch = clean.match(/^([1-8] Serisi|M[2-8]|X[1-7]|Z[1-4])/i);
    if (bmwMatch) return bmwMatch[1];
  } else if (upperBrand === 'MERCEDES-BENZ' || upperBrand === 'MERCEDES BENZ' || upperBrand === 'MERCEDES') {
    const mercMatch = clean.match(/^([A-Z]-Serisi|[A-Z]-Class|CLA|CLS|GLA|GLB|GLC|GLE|GLS|SLK|SLC|SL|AMG GT)/i);
    if (mercMatch) return mercMatch[1];
  }

  const enginePos = clean.search(/\b\d\.\d\b/);
  if (enginePos > 0) {
    clean = clean.substring(0, enginePos).trim();
  }

  return clean || 'Diğer';
}

export function cleanVariantOrTrimName(text: string): string {
  if (!text) return '';
  return text
    .replace(/\.html?/gi, '')
    .replace(/\s*-\s*\d+$/g, '')
    .replace(/&?\s*Modelleri\s*/gi, '')
    .replace(/Fiyatları\s*&\s*Modelleri/gi, '')
    .replace(/Fiyatları/gi, '')
    .replace(/sahibinden\.com'da/gi, '')
    .replace(/sahibinden\.com/gi, '')
    .replace(/sahibinden/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function repair() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log(`\n====================================================================`);
  console.log(`  NAKİTGARAJ HATALI SAHİBİNDEN MODEL KAYITLARINI DÜZELTME VE TEMİZLEME`);
  console.log(`  Mod: ${isDryRun ? 'READ-ONLY DRY-RUN' : 'CANLI DÜZELTME'}`);
  console.log(`====================================================================\n`);

  const badModels = await prisma.model.findMany({
    where: {
      OR: [
        { name: { contains: 'sahibinden' } },
        { name: { contains: 'Fiyatları' } },
        { name: { contains: '.html' } },
        { name: { contains: 'Modelleri' } },
      ],
    },
    include: {
      manufacturer: true,
      specifications: true,
      variants: {
        include: {
          specifications: true,
          packages: true,
        },
      },
    },
  });

  console.log(`✓ Düzeltilecek bozuk Model sayısı: ${badModels.length}`);

  let totalModelsFixed = 0;
  let totalSpecsRelinked = 0;
  let totalListingsFixed = 0;
  let totalOrphanedDeleted = 0;

  for (const badModel of badModels) {
    const brandName = badModel.manufacturer.name;
    const brandId = badModel.manufacturerId;

    let cleanName = cleanModelName(badModel.name, brandName);

    // If cleanName is still "Diğer", try finding better name from linked variants
    if (cleanName === 'Diğer' || !cleanName) {
      for (const v of badModel.variants) {
        const vClean = cleanModelName(v.name, brandName);
        if (vClean && vClean !== 'Diğer') {
          cleanName = vClean;
          break;
        }
      }
    }

    if (!cleanName || cleanName === 'Diğer') {
      cleanName = 'Diğer';
    }

    console.log(`▶ [${brandName}] BOZUK: "${badModel.name}" => TEMİZ: "${cleanName}" (Specs: ${badModel.specifications.length}, Variants: ${badModel.variants.length})`);

    if (isDryRun) continue;

    // Find or create clean Model
    let targetModel = await prisma.model.findUnique({
      where: {
        manufacturerId_name: {
          manufacturerId: brandId,
          name: cleanName,
        },
      },
    });

    if (!targetModel) {
      targetModel = await prisma.model.create({
        data: {
          name: cleanName,
          manufacturerId: brandId,
        },
      });
      totalModelsFixed++;
    }

    // Re-link Specifications from badModel to targetModel
    const specCount = await prisma.vehicleSpecification.count({
      where: { modelId: badModel.id },
    });

    if (specCount > 0) {
      await prisma.vehicleSpecification.updateMany({
        where: { modelId: badModel.id },
        data: { modelId: targetModel.id },
      });
      totalSpecsRelinked += specCount;
    }

    // Force re-link or delete all variants under badModel
    const badVariants = await prisma.variant.findMany({ where: { modelId: badModel.id } });
    for (const bv of badVariants) {
      // Find or create a clean variant on targetModel
      let cleanVName = cleanVariantOrTrimName(bv.name) || 'Standart';
      if (cleanVName.toLowerCase().includes('sahibinden')) {
        cleanVName = 'Standart';
      }

      let cleanVariant = await prisma.variant.findFirst({
        where: { modelId: targetModel.id, name: cleanVName },
      });

      if (!cleanVariant) {
        cleanVariant = await prisma.variant.create({
          data: {
            name: cleanVName,
            modelId: targetModel.id,
            engineSize: bv.engineSize || 1600,
            horsepower: bv.horsepower || 100,
            torque: bv.torque || 150,
          },
        });
      }

      // Re-link specs pointing to bv.id to cleanVariant.id
      await prisma.vehicleSpecification.updateMany({
        where: { variantId: bv.id },
        data: { variantId: cleanVariant.id },
      });

      // Move packages
      await prisma.package.updateMany({
        where: { variantId: bv.id },
        data: { variantId: (await prisma.package.findFirst({ where: { variantId: cleanVariant.id } }))?.id || (await prisma.package.create({ data: { name: 'Standart', variantId: cleanVariant.id } })).id },
      });

      const bvExists = await prisma.variant.findUnique({ where: { id: bv.id } });
      if (bvExists) {
        await prisma.variant.delete({ where: { id: bv.id } });
      }
    }

    // Now delete badModel
    await prisma.vehicleSpecification.updateMany({
      where: { modelId: badModel.id },
      data: { modelId: targetModel.id },
    });

    const badModelExists = await prisma.model.findUnique({ where: { id: badModel.id } });
    if (badModelExists) {
      await prisma.model.delete({ where: { id: badModel.id } });
      totalOrphanedDeleted++;
    }
  }

  // Final cleanup of loose RawVehicleListing records with corrupted canonicalModel
  const looseListings = await prisma.rawVehicleListing.findMany({
    where: {
      OR: [
        { canonicalModel: { contains: 'sahibinden' } },
        { canonicalModel: { contains: 'Fiyatları' } },
        { canonicalModel: { contains: '.html' } },
      ],
    },
  });

  console.log(`\n✓ Temizlenecek gevşek RawVehicleListing sayısı: ${looseListings.length}`);

  if (!isDryRun) {
    for (const l of looseListings) {
      const clean = cleanModelName(l.canonicalModel, l.canonicalMake);
      await prisma.rawVehicleListing.update({
        where: { id: l.id },
        data: {
          canonicalModel: clean,
          rawModel: clean,
        },
      });
      totalListingsFixed++;
    }
  }

  console.log(`\n====================================================================`);
  console.log(`  TEMİZLEME ${isDryRun ? 'DRY-RUN' : 'CANLI'} BİTTİ`);
  console.log(`====================================================================`);
  console.log(`- Düzeltilen/Yeni Model Sayısı: ${totalModelsFixed}`);
  console.log(`- Yeniden Bağlanan Specification Sayısı: ${totalSpecsRelinked}`);
  console.log(`- Düzeltilen RawVehicleListing İlan Sayısı: ${totalListingsFixed}`);
  console.log(`- Silinen Bozuk Model Kaydı Sayısı: ${totalOrphanedDeleted}\n`);
}

if (require.main === module) {
  repair().catch(console.error).finally(() => prisma.$disconnect());
}
