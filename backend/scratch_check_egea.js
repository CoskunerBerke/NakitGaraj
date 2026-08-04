const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const egeaMarketPrices = await prisma.vehicleMarketPrice.findMany({
    where: {
      vehicleSpecification: {
        manufacturer: { name: { contains: 'Fiat' } },
        model: { name: { contains: 'Egea' } }
      }
    },
    include: {
      vehicleSpecification: {
        include: {
          manufacturer: true,
          model: true,
          variant: true,
          package: true
        }
      }
    }
  });

  console.log(`Found ${egeaMarketPrices.length} Fiat Egea market price records:`);
  for (const m of egeaMarketPrices) {
    const spec = m.vehicleSpecification;
    console.log(`Spec ID: ${spec.id} | Year: ${spec.year} | Variant: ${spec.variant?.name} | Pkg: ${spec.package?.name} | MarketAvg: ${m.currentMarketAverage.toLocaleString()} ₺ | Min: ${m.minPrice.toLocaleString()} ₺ | Max: ${m.maxPrice.toLocaleString()} ₺`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
