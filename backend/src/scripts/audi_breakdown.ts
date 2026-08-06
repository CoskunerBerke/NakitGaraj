import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const audiSpecs = await prisma.vehicleSpecification.findMany({
    where: {
      manufacturer: {
        name: 'Audi',
      },
    },
    select: {
      model: { select: { name: true } },
      variant: { select: { name: true } },
      package: { select: { name: true } },
    },
  });

  const modelMap: Record<string, Set<string>> = {};
  const modelCounts: Record<string, number> = {};

  audiSpecs.forEach((spec) => {
    const modelName = spec.model.name;
    const pkgName = spec.package?.name || 'Paket';
    const variantName = `${spec.variant.name} (${pkgName})`;

    if (!modelMap[modelName]) {
      modelMap[modelName] = new Set();
      modelCounts[modelName] = 0;
    }

    modelMap[modelName].add(variantName);
    modelCounts[modelName]++;
  });

  console.log(`\n======================================================`);
  console.log(`  AUDİ VERİTABANI DETAYLI MODEL VE ALT MODEL RAPORU`);
  console.log(`======================================================\n`);

  const sortedModels = Object.keys(modelCounts).sort((a, b) => modelCounts[b] - modelCounts[a]);

  sortedModels.forEach((model) => {
    console.log(`📌 [${model}] - Total: ${modelCounts[model]} İlan`);
    const variants = Array.from(modelMap[model]).slice(0, 10);
    console.log(`   Alt Modeller / Paketler: ${variants.join(', ')}${modelMap[model].size > 10 ? ' ...ve daha fazlası' : ''}`);
    console.log(`------------------------------------------------------`);
  });
}

main().catch(console.error);
