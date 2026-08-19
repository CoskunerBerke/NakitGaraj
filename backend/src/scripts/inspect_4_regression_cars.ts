import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function inspect4Cars() {
  console.log(`\n====================================================================`);
  console.log(`  4 KESİN REGRESYON ARACININ VERİTABANI VE KATALOG DURUM İNCELEMESİ`);
  console.log(`====================================================================\n`);

  const cars = [
    { make: 'BMW', model: '3 Serisi', year: 2014, variant: '316i', trim: 'M Sport' },
    { make: 'Audi', model: 'A6', year: 2025, variant: '40 TDI Quattro', trim: 'Advanced' },
    { make: 'Honda', model: 'City', year: 2022, variant: '1.5 i-VTEC', trim: 'Executive' },
    { make: 'Ford', model: 'Escort', year: 1997, variant: '1.6', trim: 'CLX' },
  ];

  for (const c of cars) {
    console.log(`--- ARAMA: ${c.make} ${c.model} (${c.year}) - Motor: ${c.variant}, Paket: ${c.trim} ---`);

    const mfg = await prisma.manufacturer.findFirst({ where: { name: { equals: c.make } } });
    console.log(`- Manufacturer ID: ${mfg?.id || 'YOK'}`);

    if (mfg) {
      const model = await prisma.model.findFirst({
        where: { manufacturerId: mfg.id, name: { equals: c.model } }
      });
      console.log(`- Model ID: ${model?.id || 'YOK'}`);

      if (model) {
        const variants = await prisma.variant.findMany({
          where: { modelId: model.id },
          include: { packages: true }
        });
        console.log(`- Tanımlı Variant Sayısı: ${variants.length}`);
        for (const v of variants) {
          console.log(`   * Variant: "${v.name}" (ID: ${v.id}) -> Paketler: [${v.packages.map(p => p.name).join(', ')}]`);
        }
      }
    }

    const rawListings = await prisma.rawVehicleListing.findMany({
      where: {
        rawMake: { equals: c.make },
        year: { equals: c.year },
        OR: [
          { rawModel: { equals: c.model } },
          { canonicalModel: { equals: c.model } }
        ]
      }
    });

    console.log(`- RawVehicleListing Aynı Yıl (${c.year}) İlan Sayısı: ${rawListings.length}`);
    const varDist: Record<string, number> = {};
    const trimDist: Record<string, number> = {};
    for (const r of rawListings) {
      const v = r.rawVariant || r.canonicalVariant || 'Boş';
      const t = r.canonicalTrim || 'Boş';
      varDist[v] = (varDist[v] || 0) + 1;
      trimDist[t] = (trimDist[t] || 0) + 1;
    }
    console.log(`- Motor Dağılımı:`, varDist);
    console.log(`- Paket Dağılımı:`, trimDist);
    console.log(`\n`);
  }

  // Also check Escort max year in DB
  const fordEscortMaxYear: any[] = await prisma.$queryRaw`
    SELECT MAX(year) as maxYear, MIN(year) as minYear, COUNT(*) as cnt
    FROM RawVehicleListing
    WHERE rawMake = 'Ford' AND (rawModel = 'Escort' OR canonicalModel = 'Escort')
  `;
  console.log(`- Ford Escort DB Yıl Aralığı:`, fordEscortMaxYear[0]);

  await prisma.$disconnect();
}

inspect4Cars().catch(console.error);
