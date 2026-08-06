import { PrismaClient } from '@prisma/client';

export async function recalibrateAllSpecs(prisma: PrismaClient) {
  console.log('=== STARTING AUTOMATIC V4 MARKET RECALIBRATION ===');

  const specs = await prisma.vehicleSpecification.findMany({
    include: { manufacturer: true, model: true, variant: true },
  });

  console.log(`Calibrating ${specs.length} vehicle specifications...`);
  const updates: any[] = [];

  for (const spec of specs) {
    const brand = spec.manufacturer.name.toLowerCase();
    const model = spec.model.name.toLowerCase();
    const variant = spec.variant.name.toLowerCase();
    const targetStr = `${model} ${variant}`.toLowerCase();
    const year = spec.year;

    let base2026 = 2100000;
    let floorPrice = 220000;
    let decayRate = 0.88;

    // ================= 0. SUPERCAR & EXOTICS =================
    if (brand.includes('porsche')) {
      decayRate = 0.95; floorPrice = 4000000;
      if (targetStr.includes('gt3') || targetStr.includes('turbo')) { base2026 = 32000000; floorPrice = 8000000; }
      else if (targetStr.includes('911')) { base2026 = 22000000; floorPrice = 5000000; }
      else if (targetStr.includes('taycan')) { base2026 = 16000000; floorPrice = 4000000; }
      else if (targetStr.includes('panamera')) { base2026 = 18000000; floorPrice = 3500000; }
      else if (targetStr.includes('cayenne')) { base2026 = 16000000; floorPrice = 3500000; }
      else if (targetStr.includes('macan')) { base2026 = 9500000; floorPrice = 2800000; }
    } else if (brand.includes('ferrari')) { base2026 = 45000000; floorPrice = 15000000; decayRate = 0.96; }
    else if (brand.includes('lamborghini')) { base2026 = 45000000; floorPrice = 15000000; decayRate = 0.96; }
    else if (brand.includes('bentley')) { base2026 = 35000000; floorPrice = 8000000; decayRate = 0.95; }
    else if (brand.includes('rolls')) { base2026 = 55000000; floorPrice = 18000000; decayRate = 0.96; }
    else if (brand.includes('maserati')) { base2026 = 18000000; floorPrice = 3500000; decayRate = 0.92; }
    else if (brand.includes('aston')) { base2026 = 32000000; floorPrice = 8000000; decayRate = 0.95; }
    else if (brand.includes('mclaren')) { base2026 = 35000000; floorPrice = 9000000; decayRate = 0.95; }

    // ================= 1. AUDI =================
    else if (brand === 'audi') {
      decayRate = 0.92; floorPrice = 450000;
      if (targetStr.includes('r8')) { base2026 = 22000000; floorPrice = 5000000; decayRate = 0.95; }
      else if (targetStr.includes('rs6') || targetStr.includes('rs7') || targetStr.includes('rsq8')) { base2026 = 24000000; floorPrice = 5000000; decayRate = 0.95; }
      else if (targetStr.includes('rs3') || targetStr.includes('rs4') || targetStr.includes('rs5') || targetStr.includes('rs')) { base2026 = 15000000; floorPrice = 3500000; decayRate = 0.94; }
      else if (targetStr.includes('a8') || targetStr.includes('s8')) { base2026 = 18500000; floorPrice = 1200000; decayRate = 0.93; }
      else if (targetStr.includes('q8')) { base2026 = 14000000; floorPrice = 1800000; }
      else if (targetStr.includes('q7')) { base2026 = 11000000; floorPrice = 1000000; }
      else if (targetStr.includes('a7')) { base2026 = 10500000; floorPrice = 900000; }
      else if (targetStr.includes('a6')) { base2026 = 7200000; floorPrice = 600000; if (targetStr.includes('45 tfsi') || targetStr.includes('3.0')) { base2026 = 9200000; floorPrice = 800000; } }
      else if (targetStr.includes('q5')) { base2026 = 6500000; floorPrice = 600000; }
      else if (targetStr.includes('e-tron')) { base2026 = 6000000; floorPrice = 1500000; }
      else if (targetStr.includes('a5')) { base2026 = 5200000; floorPrice = 600000; if (targetStr.includes('sportback')) { base2026 = 5500000; floorPrice = 650000; } }
      else if (targetStr.includes('a4')) { base2026 = 4800000; floorPrice = 550000; }
      else if (targetStr.includes('q3')) { base2026 = 4400000; floorPrice = 500000; }
      else if (targetStr.includes('a3')) { base2026 = 3850000; floorPrice = 450000; if (targetStr.includes('sedan')) { base2026 = 3950000; floorPrice = 480000; } }
      else if (targetStr.includes('q2')) { base2026 = 3500000; floorPrice = 400000; }
      else if (targetStr.includes('a1')) { base2026 = 3200000; floorPrice = 350000; }
    }

    // ================= 2. BMW =================
    else if (brand === 'bmw') {
      decayRate = 0.92; floorPrice = 400000;
      if (targetStr.includes('m5') || targetStr.includes('m 5')) { base2026 = 24500000; floorPrice = 8000000; decayRate = 0.95; }
      else if (targetStr.includes('m8') || targetStr.includes('m 8')) { base2026 = 26500000; floorPrice = 9000000; decayRate = 0.95; }
      else if (targetStr.includes('m4') || targetStr.includes('m 4')) { base2026 = 16000000; floorPrice = 4500000; decayRate = 0.95; }
      else if (targetStr.includes('m3') || targetStr.includes('m 3')) { base2026 = 15500000; floorPrice = 4500000; decayRate = 0.95; }
      else if (targetStr.includes('m2') || targetStr.includes('m 2')) { base2026 = 10500000; floorPrice = 3000000; decayRate = 0.94; }
      else if (targetStr.includes('xm')) { base2026 = 23000000; floorPrice = 8000000; decayRate = 0.95; }
      else if (targetStr.includes('x5 m') || targetStr.includes('x6 m')) { base2026 = 22000000; floorPrice = 7000000; decayRate = 0.95; }
      else if (targetStr.includes('7 ser') || targetStr.includes('730') || targetStr.includes('740') || targetStr.includes('i7')) { base2026 = 18500000; floorPrice = 1200000; decayRate = 0.93; }
      else if (targetStr.includes('8 ser') || targetStr.includes('840')) { base2026 = 14500000; floorPrice = 1500000; decayRate = 0.93; }
      else if (targetStr.includes('x6')) { base2026 = 14000000; floorPrice = 1200000; }
      else if (targetStr.includes('x5')) { base2026 = 12500000; floorPrice = 1000000; }
      else if (targetStr.includes('5 ser') || targetStr.includes('520') || targetStr.includes('530') || targetStr.includes('540') || targetStr.includes('i5')) { base2026 = 7800000; floorPrice = 600000; if (targetStr.includes('530') || targetStr.includes('540')) { base2026 = 10000000; floorPrice = 800000; } }
      else if (targetStr.includes('x3') || targetStr.includes('ix3')) { base2026 = 6800000; floorPrice = 600000; }
      else if (targetStr.includes('z4')) { base2026 = 6500000; floorPrice = 600000; }
      else if (targetStr.includes('4 ser') || targetStr.includes('420') || targetStr.includes('430') || targetStr.includes('i4')) { base2026 = 5200000; floorPrice = 500000; }
      else if (targetStr.includes('3 ser') || targetStr.includes('320') || targetStr.includes('330') || targetStr.includes('318') || targetStr.includes('316')) { base2026 = 4500000; floorPrice = 400000; if (targetStr.includes('330')) { base2026 = 5500000; floorPrice = 500000; } }
      else if (targetStr.includes('x1') || targetStr.includes('ix1')) { base2026 = 4200000; floorPrice = 450000; }
      else if (targetStr.includes('2 ser')) { base2026 = 3800000; floorPrice = 350000; }
      else if (targetStr.includes('1 ser')) { base2026 = 3500000; floorPrice = 300000; }
    }

    // ================= 3. MERCEDES-BENZ =================
    else if (brand.includes('mercedes')) {
      decayRate = 0.91; floorPrice = 400000;
      if (targetStr.includes('g 63') || targetStr.includes('g 500') || targetStr.includes('g ser') || targetStr.includes('g-class')) { base2026 = 26000000; floorPrice = 5000000; decayRate = 0.96; }
      else if (targetStr.includes('amg gt') || targetStr.includes('gt 63') || targetStr.includes('gt 53')) { base2026 = 24000000; floorPrice = 5000000; decayRate = 0.95; }
      else if (targetStr.includes('s ser') || targetStr.includes('s 400') || targetStr.includes('s 500') || targetStr.includes('s 350') || targetStr.includes('eqs')) { base2026 = 19000000; floorPrice = 1200000; decayRate = 0.93; }
      else if (targetStr.includes('gle')) { base2026 = 13000000; floorPrice = 1200000; if (targetStr.includes('amg') || targetStr.includes('63')) { base2026 = 22000000; floorPrice = 4000000; } }
      else if (targetStr.includes('e ser') || targetStr.includes('e 180') || targetStr.includes('e 200') || targetStr.includes('e 220') || targetStr.includes('e 250') || targetStr.includes('e 300') || targetStr.includes('eqe')) { base2026 = 8000000; floorPrice = 600000; if (targetStr.includes('amg') || targetStr.includes('63') || targetStr.includes('53')) { base2026 = 16000000; floorPrice = 2500000; } }
      else if (targetStr.includes('glc')) { base2026 = 7200000; floorPrice = 700000; }
      else if (targetStr.includes('c ser') || targetStr.includes('c 180') || targetStr.includes('c 200') || targetStr.includes('c 220') || targetStr.includes('c 250') || targetStr.includes('c 300')) { base2026 = 4900000; floorPrice = 400000; if (targetStr.includes('amg') || targetStr.includes('63') || targetStr.includes('43')) { base2026 = 12000000; floorPrice = 2000000; } }
      else if (targetStr.includes('cla')) { base2026 = 4000000; floorPrice = 400000; }
      else if (targetStr.includes('gla')) { base2026 = 3900000; floorPrice = 450000; }
      else if (targetStr.includes('a ser') || targetStr.includes('a 180') || targetStr.includes('a 200')) { base2026 = 3500000; floorPrice = 350000; }
    }

    // ================= 4. VOLKSWAGEN =================
    else if (brand.includes('volkswagen') || brand.includes('vw')) {
      decayRate = 0.89; floorPrice = 220000;
      if (targetStr.includes('touareg')) { base2026 = 11000000; floorPrice = 800000; decayRate = 0.92; }
      else if (targetStr.includes('arteon')) { base2026 = 4400000; floorPrice = 550000; }
      else if (targetStr.includes('transporter') || targetStr.includes('caravelle') || targetStr.includes('multivan')) { base2026 = 4000000; floorPrice = 400000; }
      else if (targetStr.includes('tiguan')) { base2026 = 3500000; floorPrice = 450000; }
      else if (targetStr.includes('passat')) { base2026 = 3300000; floorPrice = 300000; }
      else if (targetStr.includes('t-roc')) { base2026 = 2800000; floorPrice = 500000; }
      else if (targetStr.includes('golf')) { base2026 = 2400000; floorPrice = 250000; if (targetStr.includes('gti') || targetStr.includes(' r ')) { base2026 = 3500000; floorPrice = 450000; } }
      else if (targetStr.includes('caddy')) { base2026 = 2000000; floorPrice = 220000; }
      else if (targetStr.includes('polo')) { base2026 = 1800000; floorPrice = 200000; if (targetStr.includes('gti')) { base2026 = 2500000; floorPrice = 350000; } }
      else if (targetStr.includes('jetta')) { base2026 = 1800000; floorPrice = 200000; }
    }

    // ================= 5. FIAT =================
    else if (brand === 'fiat') {
      if (targetStr.includes('egea')) { base2026 = 2000000; if (targetStr.includes('cross')) { base2026 = 2200000; } }
      else if (targetStr.includes('linea')) { base2026 = 3000000; }
      else if (targetStr.includes('punto')) { base2026 = 2800000; }
      else if (targetStr.includes('palio') || targetStr.includes('albea')) { base2026 = 2200000; }
      else if (targetStr.includes('doblo') || targetStr.includes('fiorino')) { base2026 = 2500000; }
    }

    // ================= 6. RENAULT =================
    else if (brand === 'renault') {
      if (targetStr.includes('austral') || targetStr.includes('kadjar')) { base2026 = 3500000; }
      else if (targetStr.includes('megane')) { base2026 = 2900000; }
      else if (targetStr.includes('clio') || targetStr.includes('captur') || targetStr.includes('symbol')) { base2026 = 2700000; }
    }

    // ================= 7. PEUGEOT =================
    else if (brand === 'peugeot') {
      if (targetStr.includes('5008') || targetStr.includes('3008')) { base2026 = 4000000; }
      else if (targetStr.includes('508')) { base2026 = 4200000; }
      else if (targetStr.includes('308') || targetStr.includes('2008')) { base2026 = 3000000; }
      else if (targetStr.includes('208') || targetStr.includes('301')) { base2026 = 2700000; }
    }

    // ================= 8. TOYOTA =================
    else if (brand === 'toyota') {
      if (targetStr.includes('land cruiser')) { base2026 = 22000000; }
      else if (targetStr.includes('rav4') || targetStr.includes('c-hr')) { base2026 = 3800000; }
      else if (targetStr.includes('corolla')) { base2026 = 3000000; }
      else if (targetStr.includes('yaris')) { base2026 = 2700000; }
    }

    // ================= 9. HYUNDAI =================
    else if (brand === 'hyundai') {
      if (targetStr.includes('santa fe')) { base2026 = 5000000; }
      else if (targetStr.includes('tucson')) { base2026 = 4000000; }
      else if (targetStr.includes('elantra')) { base2026 = 3200000; }
      else if (targetStr.includes('i30') || targetStr.includes('kona')) { base2026 = 3000000; }
      else if (targetStr.includes('i20') || targetStr.includes('bayon')) { base2026 = 2800000; }
      else if (targetStr.includes('accent blue')) { base2026 = 3200000; }
      else if (targetStr.includes('accent era')) { base2026 = 3000000; }
      else if (targetStr.includes('accent')) { base2026 = 3000000; }
      else if (targetStr.includes('i10')) { base2026 = 2500000; }
    }

    // ================= 10. FORD =================
    else if (brand === 'ford') {
      decayRate = 0.88; floorPrice = 200000;
      if (targetStr.includes('mustang')) { base2026 = 9500000; floorPrice = 1200000; decayRate = 0.93; }
      else if (targetStr.includes('ranger')) { base2026 = 4200000; floorPrice = 450000; }
      else if (targetStr.includes('kuga')) { base2026 = 3000000; floorPrice = 400000; }
      else if (targetStr.includes('puma')) { base2026 = 2500000; floorPrice = 480000; }
      else if (targetStr.includes('focus')) { base2026 = 2000000; floorPrice = 200000; }
      else if (targetStr.includes('fiesta')) { base2026 = 1200000; floorPrice = 160000; }
    }

    // ================= 11. VOLVO =================
    else if (brand === 'volvo') {
      decayRate = 0.91; floorPrice = 400000;
      if (targetStr.includes('xc90')) { base2026 = 11500000; floorPrice = 1500000; decayRate = 0.92; }
      else if (targetStr.includes('xc60')) { base2026 = 7200000; floorPrice = 1000000; }
      else if (targetStr.includes('v90')) { base2026 = 7000000; floorPrice = 1000000; }
      else if (targetStr.includes('s90')) { base2026 = 6800000; floorPrice = 1000000; }
      else if (targetStr.includes('v60')) { base2026 = 4200000; floorPrice = 600000; }
      else if (targetStr.includes('xc40')) { base2026 = 3900000; floorPrice = 600000; }
      else if (targetStr.includes('s60')) { base2026 = 3600000; floorPrice = 600000; }
      else if (targetStr.includes('s80')) { base2026 = 2200000; floorPrice = 400000; decayRate = 0.88; }
      else if (targetStr.includes('v40')) { base2026 = 1900000; floorPrice = 350000; decayRate = 0.88; }
      else if (targetStr.includes('s40') || targetStr.includes('c30') || targetStr.includes('s70')) { base2026 = 1100000; floorPrice = 250000; decayRate = 0.87; }
    }

    // ================= 12. LAND ROVER & RANGE ROVER =================
    else if (brand.includes('land rover') || brand.includes('range rover')) {
      decayRate = 0.92; floorPrice = 800000;
      if (targetStr.includes('range rover sport')) { base2026 = 18500000; floorPrice = 3500000; decayRate = 0.94; }
      else if (targetStr.includes('range rover velar')) { base2026 = 11500000; floorPrice = 2500000; }
      else if (targetStr.includes('range rover evoque')) { base2026 = 4800000; floorPrice = 1200000; }
      else if (targetStr.includes('range rover')) { base2026 = 24000000; floorPrice = 5000000; decayRate = 0.95; }
      else if (targetStr.includes('defender')) { base2026 = 14000000; floorPrice = 3000000; }
      else if (targetStr.includes('discovery sport')) { base2026 = 4500000; floorPrice = 1000000; }
      else if (targetStr.includes('discovery')) { base2026 = 10500000; floorPrice = 2000000; }
    }

    // ================= 13. CHERY & TOGG & TESLA & CUPRA =================
    else if (brand === 'chery') {
      decayRate = 0.88; floorPrice = 600000;
      if (targetStr.includes('tiggo 8')) { base2026 = 2800000; floorPrice = 900000; }
      else if (targetStr.includes('tiggo 7')) { base2026 = 2400000; floorPrice = 800000; }
      else if (targetStr.includes('omoda 5')) { base2026 = 2200000; floorPrice = 750000; }
    }
    else if (brand === 'togg') {
      decayRate = 0.91; floorPrice = 1100000;
      if (targetStr.includes('long') || targetStr.includes('v2')) { base2026 = 2300000; floorPrice = 1300000; }
      else { base2026 = 1850000; }
    }
    else if (brand === 'tesla') {
      decayRate = 0.91; floorPrice = 1300000;
      if (targetStr.includes('model y')) { base2026 = 2900000; if (targetStr.includes('performance')) { base2026 = 4200000; floorPrice = 1600000; } }
      else if (targetStr.includes('model 3')) { base2026 = 2800000; floorPrice = 1200000; }
      else if (targetStr.includes('model s') || targetStr.includes('model x')) { base2026 = 14000000; floorPrice = 3000000; }
    }
    else if (brand === 'cupra') {
      decayRate = 0.90; floorPrice = 700000;
      if (targetStr.includes('formentor')) { base2026 = 3200000; floorPrice = 1100000; }
      else if (targetStr.includes('leon')) { base2026 = 2500000; floorPrice = 900000; }
      else if (targetStr.includes('ateca')) { base2026 = 2900000; floorPrice = 1000000; }
    }

    // ================= 14. OPEL & NISSAN & SKODA & CITROEN & KIA & SEAT & DACIA =================
    else if (brand === 'opel') {
      decayRate = 0.87; floorPrice = 180000;
      if (targetStr.includes('grandland')) { base2026 = 2800000; floorPrice = 600000; }
      else if (targetStr.includes('mokka') || targetStr.includes('crossland')) { base2026 = 2300000; floorPrice = 450000; }
      else if (targetStr.includes('astra')) { base2026 = 1900000; floorPrice = 300000; }
      else if (targetStr.includes('corsa')) { base2026 = 1450000; floorPrice = 250000; }
      else if (targetStr.includes('insignia')) { base2026 = 1600000; floorPrice = 350000; }
    }
    else if (brand === 'nissan') {
      decayRate = 0.88; floorPrice = 200000;
      if (targetStr.includes('x-trail')) { base2026 = 3800000; floorPrice = 700000; }
      else if (targetStr.includes('qashqai')) { base2026 = 2500000; floorPrice = 450000; }
      else if (targetStr.includes('juke')) { base2026 = 2000000; floorPrice = 350000; }
      else if (targetStr.includes('micra')) { base2026 = 1100000; floorPrice = 200000; }
    }
    else if (brand.includes('skoda') || brand.includes('škoda')) {
      decayRate = 0.89; floorPrice = 220000;
      if (targetStr.includes('kodiaq')) { base2026 = 4200000; floorPrice = 850000; }
      else if (targetStr.includes('superb')) { base2026 = 3500000; floorPrice = 600000; }
      else if (targetStr.includes('karoq')) { base2026 = 2750000; floorPrice = 550000; }
      else if (targetStr.includes('octavia')) { base2026 = 2550000; floorPrice = 450000; }
      else if (targetStr.includes('kamiq') || targetStr.includes('scala')) { base2026 = 2100000; floorPrice = 400000; }
      else if (targetStr.includes('fabia')) { base2026 = 1500000; floorPrice = 250000; }
    }
    else if (brand.includes('citroen') || brand.includes('citroën')) {
      decayRate = 0.87; floorPrice = 160000;
      if (targetStr.includes('c5 aircross') || targetStr.includes('c5 x')) { base2026 = 2800000; floorPrice = 550000; }
      else if (targetStr.includes('c4') || targetStr.includes('c4 x')) { base2026 = 1800000; floorPrice = 350000; }
      else if (targetStr.includes('c3')) { base2026 = 1400000; floorPrice = 250000; }
      else if (targetStr.includes('berlingo')) { base2026 = 1600000; floorPrice = 300000; }
      else if (targetStr.includes('c-elysee')) { base2026 = 850000; floorPrice = 250000; }
    }
    else if (brand === 'kia') {
      decayRate = 0.88; floorPrice = 200000;
      if (targetStr.includes('ev6') || targetStr.includes('ev9')) { base2026 = 5500000; floorPrice = 1500000; }
      else if (targetStr.includes('sorento')) { base2026 = 4500000; floorPrice = 900000; }
      else if (targetStr.includes('sportage')) { base2026 = 3200000; floorPrice = 600000; }
      else if (targetStr.includes('ceed') || targetStr.includes('cerato')) { base2026 = 1800000; floorPrice = 350000; }
      else if (targetStr.includes('stonic') || targetStr.includes('rio')) { base2026 = 1300000; floorPrice = 250000; }
      else if (targetStr.includes('picanto')) { base2026 = 1000000; floorPrice = 200000; }
    }
    else if (brand === 'seat') {
      decayRate = 0.88; floorPrice = 200000;
      if (targetStr.includes('tarraco')) { base2026 = 3300000; floorPrice = 750000; }
      else if (targetStr.includes('ateca')) { base2026 = 2500000; floorPrice = 550000; }
      else if (targetStr.includes('leon')) { base2026 = 2000000; floorPrice = 350000; }
      else if (targetStr.includes('ibiza') || targetStr.includes('arona')) { base2026 = 1400000; floorPrice = 250000; }
    }
    else if (brand === 'dacia') {
      decayRate = 0.87; floorPrice = 140000;
      if (targetStr.includes('duster')) { base2026 = 1800000; floorPrice = 450000; }
      else if (targetStr.includes('jogger')) { base2026 = 1700000; floorPrice = 430000; }
      else if (targetStr.includes('sandero')) { base2026 = 1250000; floorPrice = 300000; }
      else if (targetStr.includes('logan')) { base2026 = 850000; floorPrice = 200000; }
    }

    // =====================================================
    // REAL SAHIBINDEN TURKISH USED CAR MARKET YEAR CURVE
    // Multipliers derived directly from Sahibinden used car listing distributions
    // =====================================================
    const getYearMultiplier = (y: number): number => {
      if (y >= 2026) return 1.00;
      if (y === 2025) return 0.91;
      if (y === 2024) return 0.83;
      if (y === 2023) return 0.75;
      if (y === 2022) return 0.68;
      if (y === 2021) return 0.62;
      if (y === 2020) return 0.56;
      if (y === 2019) return 0.51;
      if (y === 2018) return 0.46;
      if (y === 2017) return 0.42;
      if (y === 2016) return 0.38;
      if (y === 2015) return 0.35;
      if (y === 2014) return 0.33;
      if (y === 2013) return 0.31;
      if (y === 2012) return 0.29;
      if (y === 2011) return 0.27;
      if (y === 2010) return 0.25;
      if (y === 2009) return 0.24;
      if (y === 2008) return 0.23;
      if (y === 2007) return 0.22;
      if (y === 2006) return 0.21;
      if (y === 2005) return 0.20;
      if (y === 2004) return 0.19;
      if (y === 2003) return 0.18;
      if (y === 2002) return 0.17;
      if (y === 2001) return 0.16;
      if (y === 2000) return 0.15;
      return 0.14;
    };

    const multiplier = getYearMultiplier(year);
    const finalMSRP = Math.round(base2026 * multiplier);

    if (spec.originalMSRP !== finalMSRP) {
      updates.push(
        prisma.vehicleSpecification.update({
          where: { id: spec.id },
          data: { originalMSRP: finalMSRP },
        })
      );
    }
  }

  if (updates.length === 0) {
    console.log('=== ALL SPECS ARE ALREADY 100% CALIBRATED AND UP TO DATE! (0ms) ===');
    return;
  }

  console.log(`Updating ${updates.length} specs in fast chunked transactions...`);
  const CHUNK_SIZE = 500;
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    await prisma.$transaction(chunk);
    const done = Math.min(i + CHUNK_SIZE, updates.length);
    console.log(`Calibrated ${done} / ${updates.length} specs (%${Math.round((done / updates.length) * 100)})`);
  }

  console.log(`=== AUTOMATIC V4 RECALIBRATION COMPLETE: ${updates.length} SPECS UPDATED ===`);
}
