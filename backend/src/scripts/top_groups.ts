import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const topGroups: any[] = await prisma.$queryRaw`
    SELECT rawMake, rawModel, rawVariant, year, COUNT(*) as cnt
    FROM RawVehicleListing
    WHERE price > 100000 AND parseStatus = 'VALID'
    GROUP BY rawMake, rawModel, rawVariant, year
    HAVING cnt >= 5
    ORDER BY cnt DESC
    LIMIT 100
  `;

  console.log(`Found ${topGroups.length} groups with >= 5 listings in RawVehicleListing:`);
  for (const g of topGroups.slice(0, 15)) {
    console.log(`- ${g.rawMake} | ${g.rawModel} | ${g.rawVariant || 'NoVar'} | ${g.year} (${g.cnt} listings)`);
  }

  await prisma.$disconnect();
}

main();
