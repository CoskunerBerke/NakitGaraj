import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const DESKTOP_DIR = 'C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan';

async function main() {
  console.log(`\n====================================================================`);
  console.log(`  26 GERÇEK MARKA VERİTABANINA EKSİKSİZ KAYDEDİLİYOR`);
  console.log(`====================================================================\n`);

  const dirs = fs.readdirSync(DESKTOP_DIR).filter(d => {
    const fullPath = path.join(DESKTOP_DIR, d);
    return fs.statSync(fullPath).isDirectory();
  });

  console.log(`Masaüstünde Bulunan 26 Klasör: ${dirs.join(', ')}\n`);

  for (const name of dirs) {
    const mfg = await prisma.manufacturer.upsert({
      where: { name },
      update: {},
      create: {
        name,
        popularityScore: 8.5,
      },
    });
    console.log(`✓ Marka Veritabanında Hazır: ${mfg.name}`);
  }

  const allMfg = await prisma.manufacturer.findMany({ orderBy: { name: 'asc' } });
  console.log(`\n====================================================================`);
  console.log(`✓ VERİTABANINDAKİ TOPLAM AKTİF MARKA SAYISI: ${allMfg.length} ADET`);
  console.log(allMfg.map(m => m.name).join(', '));
  console.log(`====================================================================\n`);
}

main().finally(() => prisma.$disconnect());
