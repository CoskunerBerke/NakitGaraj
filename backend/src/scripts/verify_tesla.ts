import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const spec = await prisma.vehicleSpecification.findFirst({
    where: {
      manufacturer: { name: 'Tesla' }
    },
    include: {
      manufacturer: true,
      model: true,
      variant: true,
      fuelType: true,
      transmissionType: true,
      bodyType: true,
      driveType: true
    }
  });
  console.log('--- Tesla Spec DB Entry ---');
  console.log(JSON.stringify(spec, null, 2));

  const allTesla3Years = await prisma.vehicleSpecification.findMany({
    where: { model: { name: 'Model 3' } },
    select: { year: true }
  });
  console.log('Tesla Model 3 production years in DB:', Array.from(new Set(allTesla3Years.map(y => y.year))).sort());

  const allTeslaYYears = await prisma.vehicleSpecification.findMany({
    where: { model: { name: 'Model Y' } },
    select: { year: true }
  });
  console.log('Tesla Model Y production years in DB:', Array.from(new Set(allTeslaYYears.map(y => y.year))).sort());

  const allToggYears = await prisma.vehicleSpecification.findMany({
    where: { manufacturer: { name: 'Togg' } },
    select: { year: true }
  });
  console.log('Togg production years in DB:', Array.from(new Set(allToggYears.map(y => y.year))).sort());

  const allTofasYears = await prisma.vehicleSpecification.findMany({
    where: { manufacturer: { name: 'Tofaş' } },
    select: { year: true }
  });
  console.log('Tofaş production years in DB:', Array.from(new Set(allTofasYears.map(y => y.year))).sort());

  const tofasFuels = await prisma.vehicleSpecification.findMany({
    where: { manufacturer: { name: 'Tofaş' } },
    select: { fuelType: { select: { name: true } } }
  });
  console.log('Tofaş fuel types in DB:', Array.from(new Set(tofasFuels.map(f => f.fuelType.name))));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
