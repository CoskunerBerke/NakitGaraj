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
  console.log(`  BOZUK VE KİRLİ MODEL KAYITLARINI TAMAMEN TEMİZLEME`);
  console.log(`====================================================================\n`);

  const allModels = await prisma.model.findMany({
    include: {
      manufacturer: true,
      specifications: true,
      variants: true,
    }
  });

  console.log(`- Toplam Model Sayısı: ${allModels.length}`);

  const cleanBaseModels = [
    'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q2', 'Q3', 'Q5', 'Q7', 'Q8', 'TT', 'R8',
    '156', '147', '159', 'Giulietta', 'MiTo', 'Stelvio', 'Tonale', 'Giulia', 'GT', 'Brera', 'Spider',
    '1 Serisi', '2 Serisi', '3 Serisi', '4 Serisi', '5 Serisi', '6 Serisi', '7 Serisi', '8 Serisi', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z3', 'Z4',
    'Civic', 'Accord', 'CR-V', 'HR-V', 'Jazz', 'City', 'S2000', 'NSX', 'Prelude',
    'Focus', 'Fiesta', 'Mondeo', 'Kuga', 'Puma', 'EcoSport', 'C-Max', 'S-Max', 'Mustang', 'Ranger',
    'Golf', 'Passat', 'Polo', 'Tiguan', 'Touareg', 'T-Roc', 'Taigo', 'Arteon', 'Scirocco', 'Jetta', 'Bora', 'Caddy',
    'Clio', 'Megane', 'Symbol', 'Fluence', 'Kadjar', 'Captur', 'Koleos', 'Talisman', 'Scenic', 'Laguna',
    'Egea', 'Linea', 'Punto', 'Panda', '500', '500L', '500X', 'Doblo', 'Fiorino', 'Bravo', 'Palio', 'Albea',
    'Corolla', 'Yaris', 'Auris', 'C-HR', 'RAV4', 'Avensis', 'Camry', 'Hilux', 'Land Cruiser',
    'i10', 'i20', 'i30', 'i40', 'Elantra', 'Tucson', 'Santa Fe', 'Kona', 'Bayon', 'Accent', 'Getz',
    'Astra', 'Corsa', 'Insignia', 'Mokka', 'Crossland', 'Grandland', 'Vectra', 'Zafira', 'Meriva', 'Combo',
    '206', '207', '208', '301', '307', '308', '407', '508', '2008', '3008', '5008', 'Rifter', 'Partner'
  ];

  let badCount = 0;
  for (const m of allModels) {
    const name = m.name;
    const lower = name.toLowerCase();

    // Check if model name extends a clean base model e.g. "A3 Sportback" when "A3" is clean base model
    const matchesCleanBase = cleanBaseModels.find(bm => {
      const lowerBm = bm.toLowerCase();
      return lower === lowerBm;
    });

    const mName = m.manufacturer.name;
    const isBrandPrefix = lower.startsWith(mName.toLowerCase() + ' ');
    const strippedName = isBrandPrefix ? name.substring(mName.length + 1).trim() : name;

    if (isBrandPrefix && strippedName) {
      const cleanTarget = await prisma.model.findFirst({
        where: { manufacturerId: m.manufacturerId, name: { equals: strippedName } }
      });
      if (cleanTarget && cleanTarget.id !== m.id) {
        await prisma.vehicleSpecification.updateMany({
          where: { modelId: m.id },
          data: { modelId: cleanTarget.id }
        });
        const mVariants = await prisma.variant.findMany({ where: { modelId: m.id } });
        for (const v of mVariants) {
          const existingVariant = await prisma.variant.findFirst({
            where: { modelId: cleanTarget.id, name: v.name }
          });
          if (existingVariant) {
            await prisma.vehicleSpecification.updateMany({
              where: { variantId: v.id },
              data: { variantId: existingVariant.id }
            });
            await prisma.variant.delete({ where: { id: v.id } }).catch(() => {});
          } else {
            await prisma.variant.update({
              where: { id: v.id },
              data: { modelId: cleanTarget.id }
            }).catch(() => {});
          }
        }
        await prisma.model.delete({ where: { id: m.id } }).catch(() => {});
        badCount++;
        continue;
      }
    }

    const isBad =
      !matchesCleanBase && (
        lower.includes('sahibinden') ||
        lower.includes('fiyatları') ||
        lower.includes('.html') ||
        lower.includes('modelleri') ||
        lower.includes('tfsi') ||
        lower.includes('tdi') ||
        lower.includes('tsi') ||
        lower.includes('cdi') ||
        lower.includes('cdti') ||
        lower.includes('crdi') ||
        lower.includes('dci') ||
        lower.includes('hdi') ||
        lower.includes('bluehdi') ||
        lower.includes('ecoboost') ||
        lower.includes('multijet') ||
        lower.includes('puretech') ||
        lower.includes('sportback') ||
        lower.includes('design line') ||
        lower.includes('ambition') ||
        lower.includes('attraction') ||
        lower.includes('ambiente') ||
        lower.includes('m sport') ||
        lower.includes('sport line') ||
        lower.includes('luxury line') ||
        /\b\d\.\d\b/.test(lower) ||
        /-\s*\d+$/.test(lower) ||
        cleanBaseModels.some(bm => lower.startsWith(bm.toLowerCase() + ' '))
      );

    if (isBad) {
      badCount++;
      // Delete specifications tied to this model
      if (m.specifications.length > 0) {
        await prisma.vehicleSpecification.deleteMany({ where: { modelId: m.id } });
      }
      // Delete variants tied to this model
      if (m.variants.length > 0) {
        await prisma.variant.deleteMany({ where: { modelId: m.id } });
      }
      await prisma.model.delete({ where: { id: m.id } });
    }
  }

  // Deduplicate Models (case-insensitive duplicate name under same manufacturer)
  const remaining = await prisma.model.findMany({ include: { manufacturer: true } });
  const modelGroupMap = new Map<string, typeof remaining>();
  for (const m of remaining) {
    const key = `${m.manufacturerId}__${m.name.trim().toLowerCase()}`;
    if (!modelGroupMap.has(key)) modelGroupMap.set(key, []);
    modelGroupMap.get(key)!.push(m);
  }

  let dupRemoved = 0;
  for (const [key, group] of modelGroupMap.entries()) {
    if (group.length > 1) {
      const primary = group[0];
      for (let i = 1; i < group.length; i++) {
        const dup = group[i];
        await prisma.vehicleSpecification.updateMany({
          where: { modelId: dup.id },
          data: { modelId: primary.id }
        });
        const dupVariants = await prisma.variant.findMany({ where: { modelId: dup.id } });
        for (const dv of dupVariants) {
          const existingInPrimary = await prisma.variant.findFirst({
            where: { modelId: primary.id, name: dv.name }
          });
          if (existingInPrimary) {
            await prisma.package.updateMany({ where: { variantId: dv.id }, data: { variantId: existingInPrimary.id } });
            await prisma.vehicleSpecification.updateMany({ where: { variantId: dv.id }, data: { variantId: existingInPrimary.id } });
            await prisma.variant.delete({ where: { id: dv.id } });
          } else {
            await prisma.variant.update({ where: { id: dv.id }, data: { modelId: primary.id } });
          }
        }
        try {
          await prisma.model.delete({ where: { id: dup.id } });
          dupRemoved++;
        } catch (e) {}
      }
    }
  }

  console.log(`✓ Başarıyla Birleştirilen Mükerrer Model Kaydı Sayısı: ${dupRemoved}`);
  const finalCount = await prisma.model.count();
  console.log(`- Kalan Temiz Model Sayısı: ${finalCount}\n`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
