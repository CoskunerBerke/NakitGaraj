import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function reconcileCatalog() {
  console.log(`\n====================================================================`);
  console.log(`  HONDA CITY VE FORD ESCORT KATALOG & VARYANT NORMALİZASYONU`);
  console.log(`====================================================================\n`);

  const bt = await prisma.bodyType.findFirst();
  const ft = await prisma.fuelType.findFirst();
  const tt = await prisma.transmissionType.findFirst();
  const dt = await prisma.driveType.findFirst();

  if (!bt || !ft || !tt || !dt) {
    throw new Error('Reference type missing in DB');
  }

  // 1. Honda City Reconcile
  const honda = await prisma.manufacturer.findFirst({ where: { name: 'Honda' } });
  if (honda) {
    const city = await prisma.model.findFirst({ where: { manufacturerId: honda.id, name: 'City' } });
    if (city) {
      console.log(`- Honda City Model Bulundu: ID=${city.id}`);
      const existingV15 = await prisma.variant.findFirst({ where: { modelId: city.id, name: '1.5 i-VTEC' } });
      const v15 = existingV15 || await prisma.variant.create({
        data: { modelId: city.id, name: '1.5 i-VTEC', engineSize: 1.5, horsepower: 121, torque: 145 }
      });
      console.log(`- Variant "1.5 i-VTEC" oluşturuldu/doğrulandı: ID=${v15.id}`);

      for (const pName of ['Executive', 'Elegance']) {
        const existingPkg = await prisma.package.findFirst({ where: { variantId: v15.id, name: pName } });
        const pkg = existingPkg || await prisma.package.create({
          data: { variantId: v15.id, name: pName }
        });
        console.log(`   * Package "${pName}" oluşturuldu/doğrulandı: ID=${pkg.id}`);
      }

      await prisma.rawVehicleListing.updateMany({
        where: {
          rawMake: 'Honda',
          OR: [{ rawModel: 'City' }, { canonicalModel: 'City' }],
          canonicalVariant: null,
        },
        data: { canonicalVariant: '1.5 i-VTEC' }
      });

      await prisma.rawVehicleListing.updateMany({
        where: {
          rawMake: 'Honda',
          OR: [{ rawModel: 'City' }, { canonicalModel: 'City' }],
          rawVariant: 'Executive'
        },
        data: { canonicalTrim: 'Executive' }
      });
      await prisma.rawVehicleListing.updateMany({
        where: {
          rawMake: 'Honda',
          OR: [{ rawModel: 'City' }, { canonicalModel: 'City' }],
          rawVariant: 'Elegance'
        },
        data: { canonicalTrim: 'Elegance' }
      });
    }
  }

  // 2. Ford Escort Reconcile
  const ford = await prisma.manufacturer.findFirst({ where: { name: 'Ford' } });
  if (ford) {
    const escort = await prisma.model.findFirst({ where: { manufacturerId: ford.id, name: 'Escort' } });
    if (escort) {
      console.log(`\n- Ford Escort Model Bulundu: ID=${escort.id}`);

      const escortEnginePackages: Record<string, { size: number; hp: number; pkgs: string[] }> = {
        '1.6': { size: 1.6, hp: 90, pkgs: ['CLX', 'CL', 'Ghia'] },
        '1.4': { size: 1.4, hp: 75, pkgs: ['CL', 'CLX'] },
        '1.8': { size: 1.8, hp: 115, pkgs: ['CLX', 'Ghia', 'XR3i'] },
        '1.3': { size: 1.3, hp: 60, pkgs: ['CL'] }
      };

      for (const [eng, info] of Object.entries(escortEnginePackages)) {
        const existingV = await prisma.variant.findFirst({ where: { modelId: escort.id, name: eng } });
        const vEng = existingV || await prisma.variant.create({
          data: { modelId: escort.id, name: eng, engineSize: info.size, horsepower: info.hp, torque: 130 }
        });
        console.log(`- Variant "${eng}" oluşturuldu/doğrulandı: ID=${vEng.id}`);

        for (const pName of info.pkgs) {
          const existingPkg = await prisma.package.findFirst({ where: { variantId: vEng.id, name: pName } });
          const pkg = existingPkg || await prisma.package.create({
            data: { variantId: vEng.id, name: pName }
          });
          console.log(`   * Package "${pName}" oluşturuldu/doğrulandı: ID=${pkg.id}`);
        }
      }

      await prisma.rawVehicleListing.updateMany({
        where: {
          rawMake: 'Ford',
          OR: [{ rawModel: 'Escort' }, { canonicalModel: 'Escort' }],
          rawVariant: 'CLX'
        },
        data: { canonicalVariant: '1.6', canonicalTrim: 'CLX' }
      });
      await prisma.rawVehicleListing.updateMany({
        where: {
          rawMake: 'Ford',
          OR: [{ rawModel: 'Escort' }, { canonicalModel: 'Escort' }],
          rawVariant: 'CL'
        },
        data: { canonicalVariant: '1.6', canonicalTrim: 'CL' }
      });
      await prisma.rawVehicleListing.updateMany({
        where: {
          rawMake: 'Ford',
          OR: [{ rawModel: 'Escort' }, { canonicalModel: 'Escort' }],
          rawVariant: 'Ghia'
        },
        data: { canonicalVariant: '1.6', canonicalTrim: 'Ghia' }
      });
    }
  }

  // 3. Upsert VehicleSpecifications for Honda City and Ford Escort real listing combinations
  console.log(`\n- Real Ilan Kombinasyonları İçin VehicleSpecification Oluşturuluyor...`);
  
  const realGroups: any[] = await prisma.$queryRaw`
    SELECT r.rawMake as make, r.rawModel as model, r.year, r.canonicalVariant as variant, r.canonicalTrim as trim, COUNT(*) as cnt
    FROM RawVehicleListing r
    WHERE r.rawMake IN ('Honda', 'Ford') AND (r.rawModel IN ('City', 'Escort') OR r.canonicalModel IN ('City', 'Escort')) AND r.canonicalVariant IS NOT NULL
    GROUP BY r.rawMake, r.rawModel, r.year, r.canonicalVariant, r.canonicalTrim
  `;

  let specCreated = 0;
  for (const g of realGroups) {
    const mfg = await prisma.manufacturer.findFirst({ where: { name: g.make } });
    if (!mfg) continue;
    const model = await prisma.model.findFirst({ where: { manufacturerId: mfg.id, name: g.model } });
    if (!model) continue;
    const variant = await prisma.variant.findFirst({ where: { modelId: model.id, name: g.variant } });
    if (!variant) continue;
    const pkg = await prisma.package.findFirst({ where: { variantId: variant.id, name: g.trim || 'Standart' } });

    const existingSpec = await prisma.vehicleSpecification.findFirst({
      where: {
        manufacturerId: mfg.id,
        modelId: model.id,
        year: Number(g.year),
        variantId: variant.id,
        packageId: pkg?.id || null
      }
    });

    if (!existingSpec) {
      await prisma.vehicleSpecification.create({
        data: {
          manufacturerId: mfg.id,
          modelId: model.id,
          year: Number(g.year),
          variantId: variant.id,
          packageId: pkg?.id || null,
          bodyTypeId: bt.id,
          fuelTypeId: ft.id,
          transmissionTypeId: tt.id,
          driveTypeId: dt.id
        }
      });
      specCreated++;
    }
  }

  console.log(`- Yeni Eklenen VehicleSpecification Sayısı: ${specCreated}`);

  await prisma.$disconnect();
  console.log(`\n====================================================================`);
  console.log(`✅ KATALOG VE VARYANT İLİŞKİLERİ BAŞARIYLA NORMALE DÖNDÜRÜLDÜ`);
  console.log(`====================================================================\n`);
}

reconcileCatalog().catch(console.error);
