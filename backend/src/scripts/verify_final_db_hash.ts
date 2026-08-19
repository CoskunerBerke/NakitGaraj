import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const dbPath = path.resolve(__dirname, '../../prisma/dev.db');

function getSha256(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

async function runFinalCheck() {
  console.log(`\n====================================================================`);
  console.log(`  NİHAİ VERİTABANI SHA-256 HASH VE METRİK DOĞRULAMASI`);
  console.log(`====================================================================\n`);

  const stat = fs.statSync(dbPath);
  const fileSizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  const sha256After = getSha256(dbPath);

  console.log(`- Mutlak DB Dosya Yolu: ${dbPath}`);
  console.log(`- İşlem Sonrası DB Boyutu: ${fileSizeMb} MB`);
  console.log(`- İşlem Sonrası SHA-256 Hash: ${sha256After}`);

  const prisma = new PrismaClient({
    datasources: { db: { url: `file:${dbPath}` } },
  });

  const totalRaw: number = await prisma.rawVehicleListing.count();
  const validCount = await prisma.rawVehicleListing.count({ where: { parseStatus: 'VALID' } });
  const incompleteCount = await prisma.rawVehicleListing.count({ where: { parseStatus: 'INCOMPLETE_ATTRIBUTES' } });
  const specCount = await prisma.vehicleSpecification.count();

  const mfgCount = await prisma.manufacturer.count();
  const modelCount = await prisma.model.count();
  const variantCount = await prisma.variant.count();
  const packageCount = await prisma.package.count();

  console.log(`\n- RawVehicleListing Satır: ${totalRaw}`);
  console.log(`- VALID Satır: ${validCount}`);
  console.log(`- INCOMPLETE_ATTRIBUTES Satır: ${incompleteCount}`);
  console.log(`- Toplam Manufacturer: ${mfgCount}`);
  console.log(`- Toplam Model: ${modelCount}`);
  console.log(`- Toplam Variant: ${variantCount}`);
  console.log(`- Toplam Package: ${packageCount}`);
  console.log(`- Toplam Temiz VehicleSpecification: ${specCount}`);

  await prisma.$disconnect();
}

runFinalCheck().catch((err) => {
  console.error(err);
  process.exit(1);
});
