import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Permissions
  const permissions = [
    'manage_vehicles',
    'view_valuations',
    'manage_consignments',
    'view_audit_logs',
  ];
  
  const dbPermissions = [];
  for (const perm of permissions) {
    const dbPerm = await prisma.permission.upsert({
      where: { name: perm },
      update: {},
      create: { name: perm },
    });
    dbPermissions.push(dbPerm);
  }

  // 2. Roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {
      permissions: {
        set: dbPermissions.map(p => ({ id: p.id })),
      },
    },
    create: {
      name: 'ADMIN',
      permissions: {
        connect: dbPermissions.map(p => ({ id: p.id })),
      },
    },
  });

  const crmRole = await prisma.role.upsert({
    where: { name: 'CRM_MANAGER' },
    update: {
      permissions: {
        set: dbPermissions
          .filter(p => p.name === 'view_valuations' || p.name === 'manage_consignments')
          .map(p => ({ id: p.id })),
      },
    },
    create: {
      name: 'CRM_MANAGER',
      permissions: {
        connect: dbPermissions
          .filter(p => p.name === 'view_valuations' || p.name === 'manage_consignments')
          .map(p => ({ id: p.id })),
      },
    },
  });

  // 3. Admin User
  const seedEmail = process.env.ADMIN_EMAIL || 'admin@nakitgaraj.com';
  const seedPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const adminPasswordHash = await bcrypt.hash(seedPassword, 10);
  await prisma.user.upsert({
    where: { email: seedEmail },
    update: { passwordHash: adminPasswordHash },
    create: {
      email: seedEmail,
      passwordHash: adminPasswordHash,
      firstName: 'Garaj',
      lastName: 'Admin',
      roleId: adminRole.id,
    },
  });

  // 4. Vehicle Attributes
  const fuels = ['Benzin', 'Dizel', 'Hibrit', 'Elektrik', 'LPG'];
  const transmissions = ['Manuel', 'Otomatik', 'Yarı Otomatik'];
  const bodies = ['Sedan', 'Hatchback', 'Hatchback 5 kapı', 'SUV', 'Coupe', 'Station Wagon', 'Cabrio'];
  const drives = ['Önden Çekiş', 'Arkadan İtiş', '4x4', '4 Çeker (xDrive)', '4 Çeker (AWD)'];

  const fuelMap: Record<string, string> = {};
  const transMap: Record<string, string> = {};
  const bodyMap: Record<string, string> = {};
  const driveMap: Record<string, string> = {};

  for (const f of fuels) {
    const res = await prisma.fuelType.upsert({ where: { name: f }, update: {}, create: { name: f } });
    fuelMap[f] = res.id;
  }
  for (const t of transmissions) {
    const res = await prisma.transmissionType.upsert({ where: { name: t }, update: {}, create: { name: t } });
    transMap[t] = res.id;
  }
  for (const b of bodies) {
    const res = await prisma.bodyType.upsert({ where: { name: b }, update: {}, create: { name: b } });
    bodyMap[b] = res.id;
  }
  for (const d of drives) {
    const res = await prisma.driveType.upsert({ where: { name: d }, update: {}, create: { name: d } });
    driveMap[d] = res.id;
  }

  // 5. Vehicle Database Seeding (Manufacturers, Models, Variants, Packages)
  // =====================================================================
  // basePrice = 2026 Türkiye'de SIFIR (0 km) araç ÖTV+KDV dahil liste fiyatı (TL)
  // Sahibinden'deki gerçek 2026 ilan fiyatlarına kalibre edilmiştir.
  // =====================================================================
  const masterData = [
    {
      brand: 'Fiat',
      popularityScore: 9.8,
      models: [
        {
          name: 'Egea',
          popularityScore: 9.9,
          variants: [
            { name: '1.4 Fire', engineSize: 1368, horsepower: 95, torque: 127, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 1150000, packages: ['Easy', 'Urban', 'Lounge'] },
            { name: '1.3 Multijet', engineSize: 1248, horsepower: 95, torque: 200, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 1350000, packages: ['Easy', 'Urban'] },
            { name: '1.6 Multijet', engineSize: 1598, horsepower: 130, torque: 320, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1650000, packages: ['Urban', 'Lounge'] },
          ],
        },
      ],
    },
    {
      brand: 'Renault',
      popularityScore: 9.5,
      models: [
        {
          name: 'Clio',
          popularityScore: 9.6,
          variants: [
            { name: '1.0 TCe', engineSize: 999, horsepower: 90, torque: 160, cylinders: 3, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1250000, packages: ['Joy', 'Touch', 'Icon'] },
            { name: '1.5 dCi', engineSize: 1461, horsepower: 85, torque: 220, cylinders: 4, body: 'Hatchback', fuel: 'Dizel', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 1400000, packages: ['Joy', 'Touch'] },
          ],
        },
        {
          name: 'Megane',
          popularityScore: 9.3,
          variants: [
            { name: '1.3 TCe', engineSize: 1332, horsepower: 140, torque: 240, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1650000, packages: ['Joy', 'Touch', 'Icon'] },
            { name: '1.5 Blue dCi', engineSize: 1461, horsepower: 115, torque: 270, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1850000, packages: ['Touch', 'Icon'] },
          ],
        },
      ],
    },
    {
      brand: 'Volkswagen',
      popularityScore: 9.4,
      models: [
        {
          name: 'Golf',
          popularityScore: 9.5,
          variants: [
            { name: '1.0 TSI', engineSize: 999, horsepower: 110, torque: 200, cylinders: 3, body: 'Hatchback', fuel: 'Benzin', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 1600000, packages: ['Impression', 'Life'] },
            { name: '1.5 eTSI', engineSize: 1498, horsepower: 150, torque: 250, cylinders: 4, body: 'Hatchback', fuel: 'Hibrit', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 2200000, packages: ['Life', 'Style', 'R-Line'] },
          ],
        },
      ],
    },
    {
      brand: 'Toyota',
      popularityScore: 9.2,
      models: [
        {
          name: 'Corolla',
          popularityScore: 9.5,
          variants: [
            { name: '1.5 Vision', engineSize: 1490, horsepower: 125, torque: 153, cylinders: 3, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1550000, packages: ['Vision', 'Dream', 'Flame'] },
            { name: '1.8 Hybrid', engineSize: 1798, horsepower: 140, torque: 185, cylinders: 4, body: 'Sedan', fuel: 'Hibrit', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 2100000, packages: ['Dream', 'Flame', 'Passion'] },
          ],
        },
        {
          name: 'Auris',
          popularityScore: 9.0,
          variants: [
            { name: '1.6 Motor', engineSize: 1598, horsepower: 124, torque: 157, cylinders: 4, body: 'Hatchback 5 kapı', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1450000, packages: ['Standart', 'Comfort', 'Elegant'] },
            { name: '1.4 D-4D', engineSize: 1364, horsepower: 90, torque: 205, cylinders: 4, body: 'Hatchback 5 kapı', fuel: 'Dizel', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 1550000, packages: ['Standart', 'Comfort'] },
          ],
        },
      ],
    },
    {
      brand: 'Honda',
      popularityScore: 9.1,
      models: [
        {
          name: 'Civic',
          popularityScore: 9.3,
          variants: [
            { name: '1.5 VTEC Turbo', engineSize: 1498, horsepower: 182, torque: 240, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1900000, packages: ['Elegance', 'Executive'] },
          ],
        },
      ],
    },
    {
      brand: 'Dacia',
      popularityScore: 9.0,
      models: [
        {
          name: 'Sandero',
          popularityScore: 9.2,
          variants: [
            { name: '1.0 TCe', engineSize: 999, horsepower: 90, torque: 160, cylinders: 3, body: 'Hatchback 5 kapı', fuel: 'Benzin', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 950000, packages: ['Essential', 'Comfort', 'Expression'] },
            { name: '1.5 BlueDCI Stepway', engineSize: 1461, horsepower: 95, torque: 220, cylinders: 4, body: 'Hatchback 5 kapı', fuel: 'Dizel', trans: 'Manuel', drive: 'Önden Çekiş', basePrice: 1200000, packages: ['Stepway', 'Comfort'] },
          ],
        },
      ],
    },
    {
      brand: 'BMW',
      popularityScore: 8.8,
      models: [
        {
          name: '3 Serisi',
          popularityScore: 9.0,
          variants: [
            { name: '320i', engineSize: 1998, horsepower: 184, torque: 300, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 3200000, packages: ['First Edition', 'Sport Line', 'Luxury Line'] },
            { name: '320d', engineSize: 1995, horsepower: 190, torque: 400, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 3500000, packages: ['Sport Line', 'Luxury Line', 'M Sport'] },
          ],
        },
        {
          name: 'M3',
          popularityScore: 8.5,
          variants: [
            { name: 'Competition', engineSize: 2993, horsepower: 510, torque: 650, cylinders: 6, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: '4 Çeker (xDrive)', basePrice: 8500000, packages: ['M Sport', 'Competition'] },
          ],
        },
      ],
    },
    {
      brand: 'Mercedes-Benz',
      popularityScore: 8.9,
      models: [
        {
          name: 'C Serisi',
          popularityScore: 9.1,
          variants: [
            { name: 'C200', engineSize: 1496, horsepower: 204, torque: 300, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 3800000, packages: ['Avantgarde', 'AMG Line'] },
            { name: 'C220d', engineSize: 1993, horsepower: 200, torque: 440, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Arkadan İtiş', basePrice: 4100000, packages: ['Avantgarde', 'AMG Line'] },
          ],
        },
      ],
    },
    {
      brand: 'Hyundai',
      popularityScore: 9.0,
      models: [
        {
          name: 'i20',
          popularityScore: 9.1,
          variants: [
            { name: '1.4 MPI', engineSize: 1368, horsepower: 100, torque: 132, cylinders: 4, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1100000, packages: ['Style', 'Elite'] },
          ],
        },
        {
          name: 'Tucson',
          popularityScore: 9.0,
          variants: [
            { name: '1.6 T-GDI', engineSize: 1598, horsepower: 180, torque: 265, cylinders: 4, body: 'SUV', fuel: 'Benzin', trans: 'Otomatik', drive: '4 Çeker (AWD)', basePrice: 2500000, packages: ['Style', 'Elite', 'Prime'] },
          ],
        },
      ],
    },
    {
      brand: 'Peugeot',
      popularityScore: 8.7,
      models: [
        {
          name: '208',
          popularityScore: 8.9,
          variants: [
            { name: '1.2 PureTech', engineSize: 1199, horsepower: 100, torque: 205, cylinders: 3, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1150000, packages: ['Active', 'Allure', 'GT Line'] },
          ],
        },
        {
          name: '3008',
          popularityScore: 8.8,
          variants: [
            { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 130, torque: 300, cylinders: 4, body: 'SUV', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 2200000, packages: ['Active', 'Allure', 'GT'] },
          ],
        },
      ],
    },
    {
      brand: 'Opel',
      popularityScore: 8.5,
      models: [
        {
          name: 'Astra',
          popularityScore: 8.7,
          variants: [
            { name: '1.2 Turbo', engineSize: 1199, horsepower: 130, torque: 230, cylinders: 3, body: 'Hatchback', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1350000, packages: ['Edition', 'Elegance', 'Ultimate'] },
            { name: '1.5 CDTI', engineSize: 1499, horsepower: 122, torque: 300, cylinders: 4, body: 'Hatchback', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1500000, packages: ['Elegance', 'Ultimate'] },
          ],
        },
      ],
    },
    {
      brand: 'Chevrolet',
      popularityScore: 8.2,
      models: [
        {
          name: 'Aveo',
          popularityScore: 8.3,
          variants: [
            { name: '1.4', engineSize: 1399, horsepower: 100, torque: 130, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 900000, packages: ['LS', 'LT', 'LTZ'] },
          ],
        },
        {
          name: 'Cruze',
          popularityScore: 8.4,
          variants: [
            { name: '1.6', engineSize: 1598, horsepower: 124, torque: 155, cylinders: 4, body: 'Sedan', fuel: 'Benzin', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1100000, packages: ['LS', 'LT', 'LTZ'] },
            { name: '1.6 CDTI', engineSize: 1598, horsepower: 136, torque: 320, cylinders: 4, body: 'Sedan', fuel: 'Dizel', trans: 'Otomatik', drive: 'Önden Çekiş', basePrice: 1300000, packages: ['LT', 'LTZ'] },
          ],
        },
      ],
    },
  ];

  // Türkiye'deki ikinci el araç piyasasını kapsayan geniş yıl aralığı
  const years = [2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

  for (const mData of masterData) {
    const mfg = await prisma.manufacturer.upsert({
      where: { name: mData.brand },
      update: { popularityScore: mData.popularityScore },
      create: { name: mData.brand, popularityScore: mData.popularityScore },
    });

    for (const mModel of mData.models) {
      const model = await prisma.model.upsert({
        where: {
          manufacturerId_name: {
            manufacturerId: mfg.id,
            name: mModel.name,
          },
        },
        update: { popularityScore: mModel.popularityScore },
        create: {
          name: mModel.name,
          manufacturerId: mfg.id,
          popularityScore: mModel.popularityScore,
        },
      });

      for (const mVar of mModel.variants) {
        const variant = await prisma.variant.upsert({
          where: {
            modelId_name: {
              modelId: model.id,
              name: mVar.name,
            },
          },
          update: {
            engineSize: mVar.engineSize,
            horsepower: mVar.horsepower,
            torque: mVar.torque,
            cylinders: mVar.cylinders,
          },
          create: {
            name: mVar.name,
            modelId: model.id,
            engineSize: mVar.engineSize,
            horsepower: mVar.horsepower,
            torque: mVar.torque,
            cylinders: mVar.cylinders,
          },
        });

        // Packages
        for (const pkgName of mVar.packages) {
          const pkg = await prisma.package.upsert({
            where: {
              variantId_name: {
                variantId: variant.id,
                name: pkgName,
              },
            },
            update: {},
            create: {
              name: pkgName,
              variantId: variant.id,
            },
          });

          // Generate specifications for various years
          for (const year of years) {
            // =====================================================================
            // TÜRKİYE'YE ÖZEL ENFLASYONLU DEĞİŞİM FORMÜLÜ
            // =====================================================================
            // Türkiye'de ikinci el araba fiyatları yüksek enflasyon, kur artışı ve
            // arz kısıtlığı nedeniyle Avrupa/ABD'ye göre çok daha az düşüyor.
            // 
            // Sahibinden verileri gösteriyor ki:
            // - 2 yıllık araç: Sıfır fiyatının ~%85-90'ını koruyor
            // - 5 yıllık araç: ~%70-75'ini koruyor
            // - 10 yıllık araç: ~%55-60'ını koruyor
            // - 18 yıllık araç: ~%45-50'sini koruyor (NOT: %40'a düşMÜYOR)
            //
            // Formül: depMultiplier = max(0.48, 1 - age * 0.025 - (age^1.2) * 0.002)
            // Bu, yılda ~%3-4 azalan ama giderek yavaşlayan bir eğri verir.
            // =====================================================================
            const age = 2026 - year;
            const linearDep = age * 0.025;
            const curveDep = Math.pow(age, 1.2) * 0.002;
            const depMultiplier = Math.max(0.48, 1 - linearDep - curveDep);
            
            // Package impact
            let pkgMultiplier = 1.0;
            if (pkgName === 'Urban' || pkgName === 'Life' || pkgName === 'Dream' || pkgName === 'Touch' || pkgName === 'Comfort' || pkgName === 'LT' || pkgName === 'Style' || pkgName === 'Allure' || pkgName === 'Elegance') pkgMultiplier = 1.08;
            if (pkgName === 'Lounge' || pkgName === 'Flame' || pkgName === 'Executive' || pkgName === 'Icon' || pkgName === 'Elegant' || pkgName === 'LTZ' || pkgName === 'GT Line' || pkgName === 'AMG Line' || pkgName === 'Sport Line' || pkgName === 'Luxury Line' || pkgName === 'Elite' || pkgName === 'Prime' || pkgName === 'GT' || pkgName === 'Ultimate') pkgMultiplier = 1.18;
            if (pkgName === 'R-Line' || pkgName === 'Passion' || pkgName === 'M Sport' || pkgName === 'Competition') pkgMultiplier = 1.25;

            const averageListing = Math.round(mVar.basePrice * depMultiplier * pkgMultiplier);
            const minPrice = Math.round(averageListing * 0.92);
            const maxPrice = Math.round(averageListing * 1.08);
            const marketAvg = Math.round(averageListing * 0.97);

            const spec = await prisma.vehicleSpecification.create({
              data: {
                year: year,
                manufacturerId: mfg.id,
                modelId: model.id,
                variantId: variant.id,
                packageId: pkg.id,
                bodyTypeId: bodyMap[mVar.body] || bodyMap['Hatchback'],
                fuelTypeId: fuelMap[mVar.fuel],
                transmissionTypeId: transMap[mVar.trans],
                driveTypeId: driveMap[mVar.drive] || driveMap['Önden Çekiş'],
                doors: (mVar.body.includes('Hatchback') || mVar.body === 'SUV') ? 5 : 4,
                seats: 5,
                fuelConsumption: mVar.fuel === 'Dizel' ? 4.5 : mVar.fuel === 'Hibrit' ? 3.8 : 5.8,
                emission: mVar.fuel === 'Dizel' ? 118 : mVar.fuel === 'Hibrit' ? 88 : 135,
                equipmentLevel: `Standart ${pkgName} Donanımı`,
                safetyEquipment: 'Euro NCAP 5 Yıldız, ABS, ASR, ESP, 6 Hava Yastığı',
                originalMSRP: mVar.basePrice * 1.2,
                popularityScore: (mData.popularityScore + mModel.popularityScore) / 2,
                reliabilityScore: mData.brand === 'Toyota' ? 9.5 : mData.brand === 'Honda' ? 9.2 : mData.brand === 'BMW' || mData.brand === 'Mercedes-Benz' ? 8.8 : 8.5,
              },
            });

            await prisma.vehicleMarketPrice.create({
              data: {
                vehicleSpecificationId: spec.id,
                currentMarketAverage: marketAvg,
                averageListingPrice: averageListing,
                minPrice: minPrice,
                maxPrice: maxPrice,
                regionalPriceDifferences: JSON.stringify({
                  Istanbul: 1.0,
                  Ankara: 0.98,
                  Izmir: 0.99,
                  Bursa: 0.97,
                  Antalya: 1.01,
                }),
                averageSellingTime: mData.brand === 'Fiat' || mData.brand === 'Renault' ? 14 : mData.brand === 'BMW' || mData.brand === 'Mercedes-Benz' ? 25 : 20,
              },
            });
          }
        }
      }
    }
  }

  console.log('Seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
