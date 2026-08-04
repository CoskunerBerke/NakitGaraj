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
          variant: true,
          package: true
        }
      }
    }
  });

  console.log(`Updating ${egeaMarketPrices.length} Fiat Egea market prices...`);

  let count = 0;
  for (const m of egeaMarketPrices) {
    const spec = m.vehicleSpecification;
    const year = spec.year;
    const variantName = (spec.variant?.name || '').toLowerCase();
    const pkgName = (spec.package?.name || '').toLowerCase();

    // Base market values for 2024
    let baseAvg = 850000;
    let baseMin = 750000;
    let baseMax = 1065000;

    if (variantName.includes('1.4') || variantName.includes('fire')) {
      baseAvg = 790000;
      baseMin = 710000;
      baseMax = 950000;
    } else if (variantName.includes('1.6') || variantName.includes('dct')) {
      baseAvg = 940000;
      baseMin = 850000;
      baseMax = 1150000;
    } else if (variantName.includes('1.5') || variantName.includes('hybrid')) {
      baseAvg = 1050000;
      baseMin = 950000;
      baseMax = 1250000;
    }

    // Package adjustment
    if (pkgName.includes('lounge') || pkgName.includes('limited')) {
      baseAvg += 50000;
      baseMin += 40000;
      baseMax += 60000;
    } else if (pkgName.includes('urban')) {
      baseAvg += 25000;
      baseMin += 20000;
      baseMax += 30000;
    }

    // Year depreciation (4% per year before 2024)
    const yearDiff = 2024 - year;
    const factor = Math.max(0.4, 1 - yearDiff * 0.05);

    const newAvg = Math.round(baseAvg * factor);
    const newMin = Math.round(baseMin * factor);
    const newMax = Math.round(baseMax * factor);

    await prisma.vehicleMarketPrice.update({
      where: { id: m.id },
      data: {
        currentMarketAverage: newAvg,
        averageListingPrice: newAvg,
        minPrice: newMin,
        maxPrice: newMax,
      }
    });

    count++;
  }

  console.log(`Successfully updated ${count} Fiat Egea market prices in database!`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
