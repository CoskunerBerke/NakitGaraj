import { PrismaClient } from '@prisma/client';
import { EvaluationService } from '../evaluation/evaluation.service';
import { EmsalMatcherService } from '../evaluation/emsal-matcher.service';

const prisma = new PrismaClient();
const matcher = new EmsalMatcherService(prisma as any);
const service = new EvaluationService(prisma as any, {} as any, matcher);

async function main() {
  const ford = await prisma.manufacturer.findFirst({ where: { name: 'Ford' } });
  const focus = await prisma.model.findFirst({ where: { manufacturerId: ford!.id, name: 'Focus' } });

  console.log(`Ford: ${ford?.id}, Focus: ${focus?.id}`);

  const res20 = await service.calculateVehicleValuationPreview({
    year: 2015,
    manufacturerId: ford!.id,
    modelId: focus!.id,
    mileage: 20000,
    licensePlate: '34TEST123',
    color: 'Beyaz',
    damageStatus: 'NO',
  } as any);

  console.log('Res 20k:', JSON.stringify(res20, null, 2));

  await prisma.$disconnect();
}

main();
