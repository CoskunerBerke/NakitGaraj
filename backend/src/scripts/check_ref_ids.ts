import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRefIds() {
  const bt = await prisma.bodyType.findFirst();
  const ft = await prisma.fuelType.findFirst();
  const tt = await prisma.transmissionType.findFirst();
  const dt = await prisma.driveType.findFirst();

  console.log('BodyType ID:', bt?.id);
  console.log('FuelType ID:', ft?.id);
  console.log('TransmissionType ID:', tt?.id);
  console.log('DriveType ID:', dt?.id);

  await prisma.$disconnect();
}

checkRefIds().catch(console.error);
