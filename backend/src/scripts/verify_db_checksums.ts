import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.endsWith('dev.db')) {
  process.env.DATABASE_URL = 'file:' + path.resolve(__dirname, '../../prisma/dev.db');
}

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CHECKSUM_FILE = path.join(__dirname, '../../data/import-state/db_listings_checksum.json');

async function run() {
  const args = process.argv.slice(2);
  const phase = args.includes('--phase') ? args[args.indexOf('--phase') + 1] : 'before';

  console.log(`\n====================================================================`);
  console.log(`  VERİTABANI İLAN BÜTÜNLÜĞÜ VE DOKUNULMAZLIK VERİFİKASYONU (${phase.toUpperCase()})`);
  console.log(`====================================================================\n`);

  const count = await prisma.rawVehicleListing.count();
  console.log(`- Veritabanındaki Toplam RawVehicleListing İlan Sayısı: ${count}`);

  if (phase === 'before') {
    // 1. Take Backup
    const dbPath = path.join(__dirname, '../../prisma/dev.db');
    const timestamp = Date.now();
    const backupPath = path.join(__dirname, `../../prisma/dev.db.backup_${timestamp}`);
    const staticBackupPath = path.join(__dirname, '../../prisma/dev.db.bak');

    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
      fs.copyFileSync(dbPath, staticBackupPath);
      console.log(`✓ Veritabanı Yedekleri Oluşturuldu:`);
      console.log(`  - ${backupPath}`);
      console.log(`  - ${staticBackupPath}`);
    }

    // 2. Compute Listing Hash Map and Detailed Preservation Map
    const allListings = await prisma.rawVehicleListing.findMany({
      select: {
        sourceListingId: true,
        price: true,
        year: true,
        mileageKm: true,
        city: true,
        sourceFile: true,
      },
      orderBy: { sourceListingId: 'asc' },
    });

    const listingMap: Record<string, { price: number; year: number; mileageKm: number | null; city: string | null }> = {};
    const hash = crypto.createHash('sha256');
    for (const item of allListings) {
      hash.update(`${item.sourceListingId}:${item.price}:${item.year}:${item.mileageKm || 0}:${item.city || ''};`);
      listingMap[item.sourceListingId] = {
        price: item.price,
        year: item.year,
        mileageKm: item.mileageKm,
        city: item.city,
      };
    }
    const digest = hash.digest('hex');

    const meta = {
      count: allListings.length,
      checksum: digest,
      listingMap,
      createdAt: new Date().toISOString(),
    };

    fs.mkdirSync(path.dirname(CHECKSUM_FILE), { recursive: true });
    fs.writeFileSync(CHECKSUM_FILE, JSON.stringify(meta, null, 2), 'utf8');
    console.log(`✓ İlan Checksum ve Bütünlük Haritası Kaydedildi: ${digest} (${allListings.length} ilan)\n`);
  } else {
    // Phase == after
    if (!fs.existsSync(CHECKSUM_FILE)) {
      console.error(`❌ HATA: Checksum dosyası bulunamadı (${CHECKSUM_FILE})!`);
      process.exit(1);
    }

    const saved = JSON.parse(fs.readFileSync(CHECKSUM_FILE, 'utf8'));
    const savedMap: Record<string, { price: number; year: number; mileageKm: number | null; city: string | null }> = saved.listingMap || {};

    const currentListings = await prisma.rawVehicleListing.findMany({
      select: {
        sourceListingId: true,
        price: true,
        year: true,
        mileageKm: true,
        city: true,
      },
    });
    const currentMap = new Map(currentListings.map(l => [l.sourceListingId, l]));

    console.log(`- Önceki İlan Sayısı: ${saved.count}`);
    console.log(`- Şimdiki İlan Sayısı: ${currentListings.length}`);
    console.log(`- Eklenen Yeni İlan Sayısı: ${currentListings.length - saved.count}`);

    if (currentListings.length < saved.count) {
      console.error(`❌ FAILED: Önceki ilanlardan silinme tespit edildi! (${saved.count} -> ${currentListings.length})`);
      process.exit(1);
    }

    let mutatedCount = 0;
    let missingCount = 0;

    for (const [sId, prevData] of Object.entries(savedMap)) {
      const currentItem = currentMap.get(sId);
      if (!currentItem) {
        missingCount++;
        console.error(`❌ MISSING LISTING: ${sId} silinmiş!`);
      } else if (
        currentItem.price !== prevData.price ||
        currentItem.year !== prevData.year ||
        currentItem.mileageKm !== prevData.mileageKm
      ) {
        mutatedCount++;
        console.error(`❌ MUTATED LISTING: ${sId} değişmiş! (Fiyat: ${prevData.price}->${currentItem.price}, Yıl: ${prevData.year}->${currentItem.year}, KM: ${prevData.mileageKm}->${currentItem.mileageKm})`);
      }
    }

    if (missingCount > 0 || mutatedCount > 0) {
      console.error(`❌ FAILED: Veri bütünlüğü korunamadı! (${missingCount} eksik, ${mutatedCount} bozulmuş ilan)`);
      process.exit(1);
    }

    console.log(`\n✓ VERİ BÜTÜNLÜĞÜ %100 PASSED: Önceki ${saved.count} ilandan 1 tanesi dahi silinmedi veya bozulmadı!\n`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
