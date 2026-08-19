import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const dbPath = path.resolve(__dirname, '../../prisma/dev.db');

function getSha256(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

async function runPreChangeAudit() {
  console.log(`\n====================================================================`);
  console.log(`  1. ADIM: DEĞİŞİKLİK ÖNCESİ GÜVENLİK, VERİTABANI YEDEĞİ VE SNAPSHOT`);
  console.log(`====================================================================\n`);

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Veritabanı dosyası bulunamadı: ${dbPath}`);
  }

  const stat = fs.statSync(dbPath);
  const fileSizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  const lastModified = stat.mtime.toISOString();
  const sha256Before = getSha256(dbPath);

  console.log(`- Mutlak DB Yolu: ${dbPath}`);
  console.log(`- İşlem Öncesi DB Boyutu: ${fileSizeMb} MB`);
  console.log(`- Son Değiştirilme Tarihi: ${lastModified}`);
  console.log(`- İşlem Öncesi SHA-256 Hash: ${sha256Before}`);

  // Create timestamped physical backup file (without overwriting existing .bak files)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `dev_backup_${timestamp}.db.bak`;
  const backupPath = path.resolve(__dirname, `../../prisma/${backupFileName}`);

  fs.copyFileSync(dbPath, backupPath);
  console.log(`- ✅ Fiziksel DB Yedeği Oluşturuldu: ${backupPath}`);
  console.log(`- Yedek Dosya Boyutu: ${(fs.statSync(backupPath).size / (1024 * 1024)).toFixed(2)} MB`);

  // Connect Prisma to inspect DB counts
  const prisma = new PrismaClient({
    datasources: { db: { url: `file:${dbPath}` } },
  });

  const totalRawListings: number = await prisma.rawVehicleListing.count();
  
  const uniqueCountResult: any[] = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT source || ':' || sourceListingId) as cnt FROM RawVehicleListing
  `;
  const uniqueListingsCount = Number(uniqueCountResult[0]?.cnt || 0);

  const validCount = await prisma.rawVehicleListing.count({ where: { parseStatus: 'VALID' } });
  const incompleteCount = await prisma.rawVehicleListing.count({ where: { parseStatus: 'INCOMPLETE_ATTRIBUTES' } });
  const missingPriceCount = await prisma.rawVehicleListing.count({ where: { parseStatus: 'MISSING_PRICE' } });

  const specCount = await prisma.vehicleSpecification.count();

  console.log(`\n- RawVehicleListing Toplam Satır: ${totalRawListings}`);
  console.log(`- Benzersiz (source + sourceListingId) Sayısı: ${uniqueListingsCount}`);
  console.log(`- VALID Sayısı: ${validCount}`);
  console.log(`- INCOMPLETE_ATTRIBUTES Sayısı: ${incompleteCount}`);
  console.log(`- MISSING_PRICE Sayısı: ${missingPriceCount}`);
  console.log(`- Aktif VehicleSpecification Sayısı: ${specCount}`);

  await prisma.$disconnect();

  console.log(`\n====================================================================`);
  console.log(`✅ DEĞİŞİKLİK ÖNCESİ GÜVENLİK KONTROLLERİ VE FİZİKSEL YEDEK TAMAMLANDI`);
  console.log(`====================================================================\n`);
}

runPreChangeAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
