import * as path from 'path';
try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}
process.env.DATABASE_URL = 'file:' + path.resolve(__dirname, '../../prisma/dev.db');

import { PrismaClient } from '@prisma/client';
import { VehicleService } from '../vehicle/vehicle.service';

const prisma = new PrismaClient();

async function runTest() {
  console.log(`\n====================================================================`);
  console.log(`  KULLANICI SEÇİM PANELİ DROPDOWN VE MODEL TEMİZLİK OTOMATİK TESTİ`);
  console.log(`====================================================================\n`);

  const vehicleService = new VehicleService(prisma as any, { get: async () => null, set: async () => {} } as any);

  const manufacturers = await prisma.manufacturer.findMany({ orderBy: { name: 'asc' } });
  console.log(`✓ DB'deki Toplam Marka Sayısı: ${manufacturers.length}`);

  let modelsWithSahibinden = 0;
  let modelsWithFiyatlari = 0;
  let modelsWithHtml = 0;
  let emptyModelOptions = 0;
  let duplicateModelOptions = 0;
  let emptyListForValidMakeGroup = 0;

  for (const m of manufacturers) {
    const models = await vehicleService.getModels(m.id);
    const rawDbModelsCount = await prisma.model.count({ where: { manufacturerId: m.id } });

    if (rawDbModelsCount > 0 && models.length === 0) {
      emptyListForValidMakeGroup++;
      console.error(`❌ UYARI: Marka [${m.name}] veritabanında model var ancak API boş liste döndü!`);
    }

    const seenNames = new Set<string>();

    for (const modelOpt of models) {
      const name = modelOpt.name;
      const lower = name.toLowerCase();

      if (lower.includes('sahibinden')) {
        modelsWithSahibinden++;
        console.error(`❌ HATA: Marka [${m.name}] Model [${name}] içinde "sahibinden" bulundu!`);
      }
      if (lower.includes('fiyatları & modelleri') || lower.includes('fiyatlari & modelleri') || lower.includes('& modelleri')) {
        modelsWithFiyatlari++;
        console.error(`❌ HATA: Marka [${m.name}] Model [${name}] içinde "Fiyatları & Modelleri" bulundu!`);
      }
      if (lower.includes('.html') || lower.includes('.htm')) {
        modelsWithHtml++;
        console.error(`❌ HATA: Marka [${m.name}] Model [${name}] içinde ".html" bulundu!`);
      }
      if (!name || name.trim() === '') {
        emptyModelOptions++;
        console.error(`❌ HATA: Marka [${m.name}] boş model seçeneği içeriyor!`);
      }

      const norm = name.trim().toLocaleLowerCase('tr-TR');
      if (seenNames.has(norm)) {
        duplicateModelOptions++;
        console.error(`❌ HATA: Marka [${m.name}] Model [${name}] mükerrer!`);
      }
      seenNames.add(norm);
    }
  }

  // Also test getVehicleData for sample years and brands
  const sampleYears = [2015, 2018, 2020, 2024];
  let newVehiclesVerified = 0;

  for (const m of manufacturers.slice(0, 10)) {
    const models = await vehicleService.getModels(m.id);
    for (const modelOpt of models.slice(0, 2)) {
      for (const year of sampleYears) {
        const data = await vehicleService.getVehicleData({
          year,
          manufacturerId: m.id,
          modelId: modelOpt.id,
        });

        if (data && (data.variants.length > 0 || data.packages.length > 0)) {
          newVehiclesVerified++;
        }
      }
    }
  }

  console.log(`\n====================================================================`);
  console.log(`  OTOMATİK MODEL VE SEÇİM PANELİ TEMİZLİK TEST SONUÇLARI`);
  console.log(`====================================================================`);
  console.log(`- Kullanıcıya dönen model seçeneklerinde "sahibinden" geçen kayıt: ${modelsWithSahibinden}`);
  console.log(`- "Fiyatları & Modelleri" geçen kayıt: ${modelsWithFiyatlari}`);
  console.log(`- ".html/.htm" geçen kayıt: ${modelsWithHtml}`);
  console.log(`- Boş model seçeneği: ${emptyModelOptions}`);
  console.log(`- Tekrarlanan model seçeneği: ${duplicateModelOptions}`);
  console.log(`- Gerçek modeli bulunduğu hâlde model listesi boş kalan araç grubu: ${emptyListForValidMakeGroup}`);
  console.log(`- Panelde doğrulanan araç verisi sayısı (Marka+Yıl+Model): ${newVehiclesVerified}`);

  const passed = (
    modelsWithSahibinden === 0 &&
    modelsWithFiyatlari === 0 &&
    modelsWithHtml === 0 &&
    emptyModelOptions === 0 &&
    duplicateModelOptions === 0 &&
    emptyListForValidMakeGroup === 0
  );

  console.log(`\nTEST SONUCU: ${passed ? 'PASSED (%100 BAŞARILI)' : 'FAILED'}\n`);
  if (!passed) {
    process.exit(1);
  }
}

runTest().catch(console.error).finally(() => prisma.$disconnect());
