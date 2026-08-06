import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const specs = await prisma.vehicleSpecification.count();
  const prices = await prisma.vehicleMarketPrice.count();
  const manufacturers = await prisma.manufacturer.count();
  const models = await prisma.model.count();

  console.log('\n======================================================');
  console.log('  VERİTABANINDAKİ ARAÇ VE SPESİFİKASYON SAYILARI');
  console.log('======================================================');
  console.log('Üretici Sayısı (Manufacturers):', manufacturers);
  console.log('Model Sayısı (Models):', models);
  console.log('Spesifikasyon Sayısı (Specifications):', specs);
  console.log('Fiyat Kaydı Sayısı (Market Prices):', prices);

  const specByMake = await prisma.vehicleSpecification.groupBy({
    by: ['manufacturerId'],
    _count: { _all: true },
  });

  console.log('\n[Marka Bazlı Spesifikasyon Dağılımı]:');
  for (const group of specByMake) {
    const make = await prisma.manufacturer.findUnique({ where: { id: group.manufacturerId } });
    console.log(`  - ${make?.name || 'Bilinmeyen'}: ${group._count._all} Adet`);
  }
}

main().catch(console.error);
