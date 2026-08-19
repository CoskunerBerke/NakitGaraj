import * as path from 'path';
import * as fs from 'fs';

try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}
const dbPath = path.resolve(__dirname, '../../prisma/dev.db');
process.env.DATABASE_URL = 'file:' + dbPath;

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const honda = await prisma.manufacturer.findFirst({ where: { name: 'Honda' } });
  if (!honda) {
    console.log('Honda bulunamadı');
    return;
  }

  const modelsInDb = await prisma.model.findMany({
    where: { manufacturerId: honda.id },
    orderBy: { name: 'asc' }
  });

  console.log(`\n====================================================================`);
  console.log(`  HONDA MARKA MODEL KATALOĞU DETAYLI BİLGİSİ`);
  console.log(`====================================================================`);
  console.log(`- Honda Marka ID: ${honda.id}`);
  console.log(`- Veritabanındaki Toplam Honda Model Sayısı: ${modelsInDb.length} adet\n`);

  console.log('--- TÜM HONDA MODELLERİ LİSTESİ ---');
  modelsInDb.forEach((m, idx) => {
    console.log(`${idx + 1}. ${m.name}`);
  });

  // Check unique models in RawVehicleListing
  const rawGroup = await prisma.rawVehicleListing.groupBy({
    by: ['canonicalModel'],
    where: { canonicalMake: 'Honda' },
    _count: true,
  });

  console.log(`\n--- İLAN VERİSİNDEKİ (RawVehicleListing) HONDA MODELLERİ (${rawGroup.length} çeşit) ---`);
  rawGroup.forEach((r, idx) => {
    console.log(`${idx + 1}. ${r.canonicalModel} (${r._count} ilan)`);
  });
}

run().catch(console.error).finally(() => prisma.$disconnect());
