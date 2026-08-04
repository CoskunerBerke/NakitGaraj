const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const spec = await prisma.vehicleSpecification.findFirst({
    where: {
      manufacturer: { name: { contains: 'Fiat' } },
      model: { name: { contains: 'Egea' } },
      year: 2023,
      package: { name: { contains: 'Easy' } }
    },
    include: {
      manufacturer: true,
      model: true,
      variant: true,
      package: true,
      marketPrices: true
    }
  });

  if (!spec) {
    console.log('Spec not found!');
    return;
  }

  const dbMarket = spec.marketPrices[0];
  console.log(`Fiat Egea 1.3 Easy (2023):`);
  console.log(`DB Market Avg: ${dbMarket.currentMarketAverage.toLocaleString()} ₺`);
  console.log(`DB Min: ${dbMarket.minPrice.toLocaleString()} ₺`);
  console.log(`DB Max: ${dbMarket.maxPrice.toLocaleString()} ₺`);

  const conditionFactor = 0.98; // 110k km, hatasız
  const fairMarketValue = Math.min(Math.round(dbMarket.currentMarketAverage * conditionFactor), dbMarket.maxPrice);

  const standardCashOffer = Math.round(fairMarketValue * 0.76);
  const userDesiredPrice = 5000000; // Customer typed 5 Million TL troll or 1.2M TL high
  const maxConsignmentCap = Math.round(dbMarket.maxPrice * 0.98); // Sahibinden Max Cap (1.043.700 ₺)

  let finalConsignmentPrice;
  if (userDesiredPrice > 0 && userDesiredPrice < dbMarket.maxPrice) {
    finalConsignmentPrice = userDesiredPrice;
  } else {
    finalConsignmentPrice = maxConsignmentCap;
  }

  console.log(`\n--- NEW AI CALCULATION RESULTS ---`);
  console.log(`Piyasa Satış Değeri (Fair Market): ${fairMarketValue.toLocaleString()} ₺`);
  console.log(`Anında Nakit Alım Teklifimiz: ${standardCashOffer.toLocaleString()} ₺`);
  console.log(`Dükkan Konsinye Teklifimiz: ${finalConsignmentPrice.toLocaleString()} ₺`);
  console.log(`Net Galeri Kârımız (Nakit Alımda): ${(fairMarketValue - standardCashOffer).toLocaleString()} ₺`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
