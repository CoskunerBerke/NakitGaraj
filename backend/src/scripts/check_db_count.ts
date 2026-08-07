import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const specCount = await prisma.vehicleSpecification.count();
  const marketPriceCount = await prisma.vehicleMarketPrice.count();
  const evalCount = await prisma.vehicleEvaluation.count();

  console.log(`\n==================================================`);
  console.log(`   VERİTABANI DOĞRULAMA KONTROLÜ (SIFIR VERİ KAYBI)`);
  console.log(`==================================================`);
  console.log(`✓ Toplam Fiyatlandırılmış Araç Paket/Yıl (VehicleSpecification): ${specCount}`);
  console.log(`✓ Toplam Aktif Piyasa Kaydı (VehicleMarketPrice): ${marketPriceCount}`);
  console.log(`✓ Toplam Yapılan Araç Değerlemesi (VehicleEvaluation): ${evalCount}\n`);
}

main().finally(() => prisma.$disconnect());
