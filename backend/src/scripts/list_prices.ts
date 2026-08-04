import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('Fetching all vehicle prices from database...\n');

  const specs = await prisma.vehicleSpecification.findMany({
    include: {
      manufacturer: true,
      model: true,
      marketPrices: true
    },
    orderBy: [
      { manufacturer: { name: 'asc' } },
      { model: { name: 'asc' } },
      { year: 'desc' }
    ]
  });

  if (specs.length === 0) {
    console.log('No specifications found in the database.');
    return;
  }

  // Group by brand and model to print a summary
  const tableData = specs.map(spec => {
    const marketPrice = spec.marketPrices[0];
    return {
      'Marka': spec.manufacturer.name,
      'Model': spec.model.name,
      'Yıl': spec.year,
      'Ortalama Fiyat (₺)': marketPrice ? marketPrice.currentMarketAverage.toLocaleString('tr-TR') + ' ₺' : 'Fiyat Yok',
      'Min Fiyat (₺)': marketPrice ? marketPrice.minPrice.toLocaleString('tr-TR') + ' ₺' : 'Fiyat Yok',
      'Max Fiyat (₺)': marketPrice ? marketPrice.maxPrice.toLocaleString('tr-TR') + ' ₺' : 'Fiyat Yok'
    };
  });

  console.table(tableData);
  console.log(`\nToplam ${specs.length} adet fiyatlandırılmış araç spesifikasyonu gösterildi.`);
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
