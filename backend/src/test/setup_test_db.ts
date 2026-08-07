import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

export async function setupIsolatedTestDb(): Promise<PrismaClient> {
  const dbPath = path.resolve(__dirname, '../../prisma/test_security.db');
  const devDbPath = path.resolve(__dirname, '../../prisma/dev.db');

  if (fs.existsSync(devDbPath)) {
    fs.copyFileSync(devDbPath, dbPath);
  }

  process.env.DATABASE_URL = `file:${dbPath}`;

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${dbPath}`,
      },
    },
  });

  // Ensure test DB directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Clear existing test records if any
  try {
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF;');
    await prisma.vehicleEvaluation.deleteMany({});
    await prisma.vehicleSpecification.deleteMany({});
    await prisma.package.deleteMany({});
    await prisma.variant.deleteMany({});
    await prisma.model.deleteMany({});
    await prisma.manufacturer.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
  } catch (err) {
    // Fresh DB tables will be created
  }

  const fuelBenzin = await prisma.fuelType.upsert({
    where: { name: 'Benzin' },
    update: {},
    create: { name: 'Benzin' },
  });

  const bodySedan = await prisma.bodyType.upsert({
    where: { name: 'Sedan' },
    update: {},
    create: { name: 'Sedan' },
  });

  const transAuto = await prisma.transmissionType.upsert({
    where: { name: 'Otomatik' },
    update: {},
    create: { name: 'Otomatik' },
  });

  const driveRWD = await prisma.driveType.upsert({
    where: { name: 'Arkadan İtiş' },
    update: {},
    create: { name: 'Arkadan İtiş' },
  });

  // Seed essential test fixtures
  const bmw = await prisma.manufacturer.create({
    data: { name: 'BMW' },
  });

  const mercedes = await prisma.manufacturer.create({
    data: { name: 'Mercedes-Benz' },
  });

  const bmw3 = await prisma.model.create({
    data: {
      name: '3 Serisi',
      manufacturerId: bmw.id,
    },
  });

  const mercedesC = await prisma.model.create({
    data: {
      name: 'C-Serisi',
      manufacturerId: mercedes.id,
    },
  });

  const variant316i = await prisma.variant.create({
    data: {
      name: '316i',
      modelId: bmw3.id,
      engineSize: 1600,
      horsepower: 136,
      torque: 220,
    },
  });

  const pkgMSport = await prisma.package.create({
    data: {
      name: 'M Sport',
      variantId: variant316i.id,
    },
  });

  await prisma.vehicleSpecification.create({
    data: {
      year: 2015,
      manufacturerId: bmw.id,
      modelId: bmw3.id,
      variantId: variant316i.id,
      packageId: pkgMSport.id,
      bodyTypeId: bodySedan.id,
      fuelTypeId: fuelBenzin.id,
      transmissionTypeId: transAuto.id,
      driveTypeId: driveRWD.id,
    },
  });

  return prisma;
}
