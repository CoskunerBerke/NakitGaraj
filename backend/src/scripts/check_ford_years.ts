import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkFordYears() {
  const ford = await prisma.manufacturer.findFirst({ where: { name: 'Ford' } });
  if (!ford) return;

  const yearsRaw: any[] = await prisma.$queryRaw`
    SELECT DISTINCT year FROM RawVehicleListing WHERE rawMake = 'Ford' ORDER BY year DESC
  `;
  console.log('Ford Years in RawVehicleListing:', yearsRaw.map(r => r.year));

  const specYearsRaw: any[] = await prisma.$queryRaw`
    SELECT DISTINCT year FROM VehicleSpecification WHERE manufacturerId = ${ford.id} ORDER BY year DESC
  `;
  console.log('Ford Years in VehicleSpecification:', specYearsRaw.map(r => r.year));

  await prisma.$disconnect();
}

checkFordYears().catch(console.error);
