import { PrismaService } from '../prisma.service';
import { EvaluationService } from '../evaluation/evaluation.service';
import { EmsalMatcherService } from '../evaluation/emsal-matcher.service';
import { TelegramService } from '../telegram/telegram.service';

const prisma = new PrismaService();
const telegram = new TelegramService();
const emsalMatcher = new EmsalMatcherService(prisma);
const evaluationService = new EvaluationService(prisma, telegram, emsalMatcher);

async function testKmOutputs() {
  console.log('=== TESTING LIVE EVALUATION SERVICE FOR 3 KILOMETERS ===');

  const bmw = await prisma.manufacturer.findFirst({ where: { name: 'BMW' } });
  const model3 = await prisma.model.findFirst({ where: { name: '3 Serisi', manufacturerId: bmw?.id } });
  const variants = await prisma.variant.findMany({ where: { modelId: model3?.id } });
  const var316i = variants.find(v => v.name.includes('316i'));
  const packages = await prisma.package.findMany({ where: { variantId: var316i?.id } });
  const mSport = packages.find(p => p.name.toLowerCase().includes('m sport')) || packages[0];

  console.log(`Vehicle params: BMW 2014 3 Serisi, variantId=${var316i?.id} (${var316i?.name}), packageId=${mSport?.id} (${mSport?.name})`);

  const mileages = [20000, 80000, 120000];

  for (const km of mileages) {
    console.log(`\n==================================================`);
    console.log(`  EVALUATING KM: ${km}`);
    console.log(`==================================================`);
    const dto: any = {
      year: 2014,
      manufacturerId: bmw!.id,
      modelId: model3!.id,
      variantId: var316i?.id,
      packageId: mSport?.id,
      mileage: km,
      color: 'Beyaz',
      damageStatus: 'NO',
      licensePlate: '34ABC123',
      firstName: 'Test',
      lastName: 'User',
      phone: '05551234567',
      sellingTimeline: 'hemen',
      userDesiredPrice: 1650000,
    };

    const res = await evaluationService.calculateVehicleValuationPreview(dto);
    console.log(`Result Status: ${res.status}`);
    console.log(`Valuation Outputs:`, {
      fairMarketValue: res.results?.fairMarketValue,
      cashOffer: res.results?.cashOffer,
      consignmentListingPrice: res.results?.consignmentListingPrice,
      recommendedPublicListingPrice: res.results?.recommendedPublicListingPrice,
      matchedListingCount: res.results?.matchedListingCount,
      confidenceScore: res.confidenceScore,
    });
    // pricingAudit artik musteriye acilan API yanitinda dondurulmez (dahili kalem).
  }

  await prisma.$disconnect();
}

testKmOutputs().catch(console.error);
