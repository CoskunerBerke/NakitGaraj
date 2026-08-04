import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const toyotaModels = [
  'Yaris', 'Corolla', 'Auris', 'C-HR', 'RAV4', 'Land Cruiser',
  'Avensis', 'Camry', 'Carina', 'Celica', 'Corona', 'Cressida',
  'GT86', 'MR2', 'Picnic', 'Prius', 'Starlet', 'Supra',
  'Tercel', 'Urban Cruiser', 'Verso'
];

async function run() {
  console.log('Seeding additional Toyota models...');
  
  // Find Toyota manufacturer
  const mfg = await prisma.manufacturer.findFirst({
    where: { name: { contains: 'Toyota' } }
  });

  if (!mfg) {
    console.error('Toyota manufacturer not found in database!');
    return;
  }

  console.log(`Found Toyota with ID: ${mfg.id}`);

  for (const modelName of toyotaModels) {
    const model = await prisma.model.upsert({
      where: {
        manufacturerId_name: {
          manufacturerId: mfg.id,
          name: modelName
        }
      },
      update: {},
      create: {
        name: modelName,
        manufacturerId: mfg.id,
        popularityScore: 7.5
      }
    });
    console.log(`Upserted model: ${model.name}`);
  }
  
  console.log('Toyota models seeding completed successfully!');
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
