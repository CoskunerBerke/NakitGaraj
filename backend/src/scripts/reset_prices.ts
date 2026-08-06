import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Clear prices imported from synthetic or bad script mapping
  await prisma.vehicleMarketPrice.deleteMany({});
  console.log('Fiyat veritabanı sıfırlandı.');
}

main().catch(console.error);
