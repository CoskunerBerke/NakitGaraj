import { PrismaClient } from '@prisma/client';
import { EvaluationService } from '../evaluation/evaluation.service';
import { EmsalMatcherService } from '../evaluation/emsal-matcher.service';

const prisma = new PrismaClient();
const matcher = new EmsalMatcherService(prisma as any);
const service = new EvaluationService(prisma as any, {} as any, matcher);

async function main() {
  const honda = await prisma.manufacturer.findFirst({ where: { name: 'Honda' } });
  const civic = await prisma.model.findFirst({ where: { manufacturerId: honda!.id, name: 'Civic' } });
  const ecoEle = await prisma.variant.findFirst({ where: { modelId: civic!.id, name: { contains: 'Eco Elegance' } } });

  console.log(`Honda: ${honda?.id}, Civic: ${civic?.id}, Eco Elegance: ${ecoEle?.id}`);

  const resWithVar = await service.calculateVehicleValuationPreview({
    year: 2019,
    manufacturerId: honda!.id,
    modelId: civic!.id,
    variantId: ecoEle?.id,
    mileage: 20000,
    licensePlate: '34TEST123',
    color: 'Beyaz',
    damageStatus: 'NO',
  } as any);

  console.log('Res with Variant 20k:', JSON.stringify({
    status: resWithVar.status,
    fairMarketValue: resWithVar.results?.fairMarketValue,
    level: resWithVar.results?.matchedLevel,
    count: resWithVar.results?.actuallyUsedListingCount
  }, null, 2));

  await prisma.$disconnect();
}

main();
