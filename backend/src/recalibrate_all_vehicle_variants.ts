import { PrismaClient } from '@prisma/client';

export async function recalibrateAllSpecs(prisma: PrismaClient) {
  console.log('=== STARTING AUTOMATIC V4 MARKET RECALIBRATION ===');

  const specs = await prisma.vehicleSpecification.findMany({
    include: { manufacturer: true, model: true, variant: true, marketPrices: true },
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
    let priceTier: 'exotic' | 'luxury' | 'standard' | 'economy' = 'standard';

    // ================= 0. SUPERCAR & EXOTICS =================
    if (brand.includes('porsche')) {
      decayRate = 0.95; floorPrice = 4000000;
      if (targetStr.includes('gt3') || targetStr.includes('turbo')) { base2026 = 32000000; floorPrice = 8000000; }
      else if (targetStr.includes('911')) { base2026 = 22000000; floorPrice = 5000000; }
      else if (targetStr.includes('taycan')) { base2026 = 16000000; floorPrice = 4000000; }
      else if (targetStr.includes('panamera')) { base2026 = 18000000; floorPrice = 3500000; }
      else if (targetStr.includes('cayenne')) { base2026 = 16000000; floorPrice = 3500000; }
      else if (targetStr.includes('macan')) { base2026 = 9500000; floorPrice = 2800000; }
      priceTier = 'exotic';
    } else if (brand.includes('ferrari')) { base2026 = 45000000; floorPrice = 15000000; decayRate = 0.96; priceTier = 'exotic'; }
    else if (brand.includes('lamborghini')) { base2026 = 45000000; floorPrice = 15000000; decayRate = 0.96; priceTier = 'exotic'; }
    else if (brand.includes('bentley')) { base2026 = 35000000; floorPrice = 8000000; decayRate = 0.95; priceTier = 'exotic'; }
    else if (brand.includes('rolls')) { base2026 = 55000000; floorPrice = 18000000; decayRate = 0.96; priceTier = 'exotic'; }
    else if (brand.includes('maserati')) { base2026 = 18000000; floorPrice = 3500000; decayRate = 0.92; priceTier = 'exotic'; }
    else if (brand.includes('aston')) { base2026 = 32000000; floorPrice = 8000000; decayRate = 0.95; priceTier = 'exotic'; }
    else if (brand.includes('mclaren')) { base2026 = 35000000; floorPrice = 9000000; decayRate = 0.95; priceTier = 'exotic'; }

    // ================= 1. AUDI =================
    else if (brand === 'audi') {
      priceTier = 'luxury';
      decayRate = 0.92; floorPrice = 450000;
      if (targetStr.includes('r8')) { base2026 = 22000000; floorPrice = 5000000; decayRate = 0.95; priceTier = 'exotic'; }
      else if (targetStr.includes('rs6') || targetStr.includes('rs7') || targetStr.includes('rsq8')) { base2026 = 28000000; floorPrice = 5000000; decayRate = 0.95; priceTier = 'exotic'; }
      else if (targetStr.includes('rs3') || targetStr.includes('rs4') || targetStr.includes('rs5') || targetStr.includes('rs')) { base2026 = 17000000; floorPrice = 3500000; decayRate = 0.94; priceTier = 'exotic'; }
      else if (targetStr.includes('a8') || targetStr.includes('s8')) { base2026 = 18500000; floorPrice = 1200000; decayRate = 0.93; }
      else if (targetStr.includes('q8')) { base2026 = 14000000; floorPrice = 1800000; }
      else if (targetStr.includes('q7')) { base2026 = 11000000; floorPrice = 1000000; }
      else if (targetStr.includes('a7')) { base2026 = 10500000; floorPrice = 900000; }
      else if (targetStr.includes('a6')) { base2026 = 7200000; floorPrice = 600000; if (targetStr.includes('45 tfsi') || targetStr.includes('3.0')) { base2026 = 9200000; floorPrice = 800000; } }
      else if (targetStr.includes('q5')) { base2026 = 6500000; floorPrice = 600000; }
      else if (targetStr.includes('e-tron')) { base2026 = 6000000; floorPrice = 1500000; }
      else if (targetStr.includes('a5')) { base2026 = 5500000; floorPrice = 600000; }
      else if (targetStr.includes('a4')) { base2026 = 5200000; floorPrice = 550000; }
      else if (targetStr.includes('q3')) { base2026 = 4800000; floorPrice = 500000; }
      else if (targetStr.includes('a3')) { base2026 = 4300000; floorPrice = 450000; }
      else if (targetStr.includes('q2')) { base2026 = 3800000; floorPrice = 400000; }
      else if (targetStr.includes('a1')) { base2026 = 3200000; floorPrice = 350000; }
    }

    // ================= 2. BMW =================
    else if (brand === 'bmw') {
      priceTier = 'luxury';
      decayRate = 0.92; floorPrice = 400000;
      if (targetStr.includes('m5') || targetStr.includes('m 5')) { base2026 = 26500000; floorPrice = 8000000; decayRate = 0.95; priceTier = 'exotic'; }
      else if (targetStr.includes('m8') || targetStr.includes('m 8')) { base2026 = 28500000; floorPrice = 9000000; decayRate = 0.95; priceTier = 'exotic'; }
      else if (targetStr.includes('m4') || targetStr.includes('m 4')) { base2026 = 18000000; floorPrice = 4500000; decayRate = 0.95; priceTier = 'exotic'; }
      else if (targetStr.includes('m3') || targetStr.includes('m 3')) { base2026 = 17500000; floorPrice = 4500000; decayRate = 0.95; priceTier = 'exotic'; }
      else if (targetStr.includes('m2') || targetStr.includes('m 2')) { base2026 = 12500000; floorPrice = 3000000; decayRate = 0.94; }
      else if (targetStr.includes('xm')) { base2026 = 25000000; floorPrice = 8000000; decayRate = 0.95; }
      else if (targetStr.includes('x5 m') || targetStr.includes('x6 m')) { base2026 = 24000000; floorPrice = 7000000; decayRate = 0.95; }
      else if (targetStr.includes('7 ser') || targetStr.includes('730') || targetStr.includes('740') || targetStr.includes('i7')) { base2026 = 18500000; floorPrice = 1200000; decayRate = 0.93; }
      else if (targetStr.includes('8 ser') || targetStr.includes('840')) { base2026 = 14500000; floorPrice = 1500000; decayRate = 0.93; }
      else if (targetStr.includes('x6')) { base2026 = 14000000; floorPrice = 1200000; }
      else if (targetStr.includes('x5')) { base2026 = 12500000; floorPrice = 1000000; }
      else if (targetStr.includes('5 ser') || targetStr.includes('520') || targetStr.includes('530') || targetStr.includes('540') || targetStr.includes('i5')) { base2026 = 8500000; floorPrice = 600000; }
      else if (targetStr.includes('x3') || targetStr.includes('ix3')) { base2026 = 7200000; floorPrice = 600000; }
      else if (targetStr.includes('z4')) { base2026 = 6800000; floorPrice = 600000; }
      else if (targetStr.includes('4 ser') || targetStr.includes('420') || targetStr.includes('430') || targetStr.includes('i4')) { base2026 = 6000000; floorPrice = 500000; }
      else if (targetStr.includes('3 ser') || targetStr.includes('320') || targetStr.includes('330') || targetStr.includes('318') || targetStr.includes('316')) { base2026 = 5400000; floorPrice = 400000; }
      else if (targetStr.includes('x1') || targetStr.includes('ix1')) { base2026 = 4500000; floorPrice = 450000; }
      else if (targetStr.includes('2 ser')) { base2026 = 4000000; floorPrice = 350000; }
      else if (targetStr.includes('1 ser')) { base2026 = 3600000; floorPrice = 300000; }
    }

    // ================= 3. MERCEDES-BENZ =================
    else if (brand.includes('mercedes')) {
      priceTier = 'luxury';
      decayRate = 0.91; floorPrice = 400000;
      if (targetStr.includes('g 63') || targetStr.includes('g 500') || targetStr.includes('g ser') || targetStr.includes('g-class') || targetStr.includes('g serisi')) { base2026 = 27000000; floorPrice = 5000000; decayRate = 0.96; priceTier = 'exotic'; }
      else if (targetStr.includes('amg gt') || targetStr.includes('gt 63') || targetStr.includes('gt 53')) { base2026 = 25000000; floorPrice = 5000000; decayRate = 0.95; priceTier = 'exotic'; }
      else if (targetStr.includes('s ser') || targetStr.includes('s 400') || targetStr.includes('s 500') || targetStr.includes('s 350') || targetStr.includes('eqs')) { base2026 = 19500000; floorPrice = 1200000; decayRate = 0.93; }
      else if (targetStr.includes('gle')) { base2026 = 14000000; floorPrice = 1200000; }
      else if (targetStr.includes('e ser') || targetStr.includes('e 180') || targetStr.includes('e 200') || targetStr.includes('e 220') || targetStr.includes('e 250') || targetStr.includes('e 300') || targetStr.includes('eqe')) { base2026 = 8500000; floorPrice = 600000; }
      else if (targetStr.includes('glc')) { base2026 = 7500000; floorPrice = 700000; }
      else if (targetStr.includes('c ser') || targetStr.includes('c 180') || targetStr.includes('c 200') || targetStr.includes('c 220') || targetStr.includes('c 250') || targetStr.includes('c 300')) { base2026 = 5800000; floorPrice = 400000; }
      else if (targetStr.includes('cla')) { base2026 = 4500000; floorPrice = 400000; }
      else if (targetStr.includes('gla')) { base2026 = 4200000; floorPrice = 450000; }
      else if (targetStr.includes('a ser') || targetStr.includes('a 180') || targetStr.includes('a 200')) { base2026 = 3800000; floorPrice = 350000; }
    }

    // ================= 4. VOLKSWAGEN =================
    else if (brand.includes('volkswagen') || brand.includes('vw')) {
      decayRate = 0.89; floorPrice = 220000;
      if (targetStr.includes('touareg')) { base2026 = 11500000; floorPrice = 800000; decayRate = 0.92; }
      else if (targetStr.includes('arteon')) { base2026 = 4800000; floorPrice = 550000; }
      else if (targetStr.includes('passat')) { base2026 = 4200000; floorPrice = 300000; }
      else if (targetStr.includes('tiguan')) { base2026 = 4000000; floorPrice = 450000; }
      else if (targetStr.includes('t-roc')) { base2026 = 3300000; floorPrice = 500000; }
      else if (targetStr.includes('golf')) { base2026 = 3100000; floorPrice = 250000; }
      else if (targetStr.includes('polo')) { base2026 = 2200000; floorPrice = 200000; }
    }

    // ================= 5. FIAT =================
    else if (brand === 'fiat') {
      priceTier = 'economy';
      if (targetStr.includes('egea')) { base2026 = 1450000; if (targetStr.includes('cross')) { base2026 = 1650000; } }
      else if (targetStr.includes('linea')) { base2026 = 2700000; }
      else if (targetStr.includes('punto')) { base2026 = 2600000; }
      else if (targetStr.includes('palio') || targetStr.includes('albea')) { base2026 = 2200000; }
      else if (targetStr.includes('doblo') || targetStr.includes('fiorino')) { base2026 = 2300000; }
    }

    // ================= 6. RENAULT =================
    else if (brand === 'renault') {
      if (targetStr.includes('austral') || targetStr.includes('kadjar')) { base2026 = 3500000; }
      else if (targetStr.includes('megane')) { base2026 = 2900000; }
      else if (targetStr.includes('clio') || targetStr.includes('captur') || targetStr.includes('symbol')) { base2026 = 1900000; }
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
      else if (targetStr.includes('corolla')) { base2026 = 2400000; }
      else if (targetStr.includes('yaris')) { base2026 = 2100000; }
    }

    // ================= 9. HYUNDAI =================
    else if (brand === 'hyundai') {
      if (targetStr.includes('santa fe')) { base2026 = 5000000; }
      else if (targetStr.includes('tucson')) { base2026 = 4000000; }
      else if (targetStr.includes('elantra')) { base2026 = 3200000; }
      else if (targetStr.includes('i30') || targetStr.includes('kona')) { base2026 = 3000000; }
      else if (targetStr.includes('i20') || targetStr.includes('bayon')) { base2026 = 2400000; }
      else if (targetStr.includes('accent blue')) { base2026 = 3200000; }
      else if (targetStr.includes('accent era')) { base2026 = 3000000; }
      else if (targetStr.includes('accent')) { base2026 = 3000000; }
      else if (targetStr.includes('i10')) { base2026 = 2000000; }
    }

    // ================= 10. FORD =================
    else if (brand === 'ford') {
      decayRate = 0.88; floorPrice = 200000;
      if (targetStr.includes('mustang')) { base2026 = 9500000; floorPrice = 1200000; decayRate = 0.93; }
      else if (targetStr.includes('ranger')) { base2026 = 4200000; floorPrice = 450000; }
      else if (targetStr.includes('kuga')) { base2026 = 3800000; floorPrice = 400000; }
      else if (targetStr.includes('puma')) { base2026 = 3000000; floorPrice = 480000; }
      else if (targetStr.includes('focus')) { base2026 = 2650000; floorPrice = 200000; }
      else if (targetStr.includes('fiesta')) { base2026 = 2000000; floorPrice = 160000; }
    }

    // ================= 11. HONDA =================
    else if (brand === 'honda') {
      if (targetStr.includes('cr-v')) { base2026 = 4500000; }
      else if (targetStr.includes('hr-v')) { base2026 = 3200000; }
      else if (targetStr.includes('civic')) { base2026 = 2950000; }
      else if (targetStr.includes('city') || targetStr.includes('jazz')) { base2026 = 2200000; }
    }

    // ================= 12. VOLVO =================
    else if (brand === 'volvo') {
      priceTier = 'luxury';
      decayRate = 0.91; floorPrice = 400000;
      if (targetStr.includes('xc90')) { base2026 = 11500000; floorPrice = 1500000; decayRate = 0.92; }
      else if (targetStr.includes('xc60')) { base2026 = 8500000; floorPrice = 1000000; }
      else if (targetStr.includes('v90')) { base2026 = 8300000; floorPrice = 1000000; }
      else if (targetStr.includes('s90')) { base2026 = 8100000; floorPrice = 1000000; }
      else if (targetStr.includes('v60')) { base2026 = 5800000; floorPrice = 600000; }
      else if (targetStr.includes('s60')) { base2026 = 5500000; floorPrice = 600000; }
      else if (targetStr.includes('xc40')) { base2026 = 4500000; floorPrice = 600000; }
      else if (targetStr.includes('s60')) { base2026 = 3600000; floorPrice = 600000; }
      else if (targetStr.includes('s80')) { base2026 = 2200000; floorPrice = 400000; decayRate = 0.88; }
      else if (targetStr.includes('v40')) { base2026 = 1900000; floorPrice = 350000; decayRate = 0.88; }
      else if (targetStr.includes('s40') || targetStr.includes('c30') || targetStr.includes('s70')) { base2026 = 1100000; floorPrice = 250000; decayRate = 0.87; }
    }

    // ================= 12. LAND ROVER & RANGE ROVER =================
    else if (brand.includes('land rover') || brand.includes('range rover')) {
      priceTier = 'luxury';
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
      priceTier = 'economy';
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
      priceTier = 'economy';
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
      priceTier = 'economy';
      decayRate = 0.88; floorPrice = 250000;
      if (targetStr.includes('duster')) { base2026 = 1850000; floorPrice = 450000; }
      else if (targetStr.includes('jogger')) { base2026 = 1750000; floorPrice = 430000; }
      else if (targetStr.includes('stepway')) { base2026 = 1500000; floorPrice = 350000; }
      else if (targetStr.includes('sandero')) { base2026 = 1300000; floorPrice = 320000; }
      else if (targetStr.includes('logan')) { base2026 = 950000; floorPrice = 250000; }
    }

    // =====================================================
    // TIER-SPECIFIC SAHIBINDEN TURKISH USED CAR MARKET YEAR CURVES
    // Multipliers derived directly from Sahibinden used car listing distributions
    // =====================================================
    const getYearMultiplier = (y: number, tier: 'exotic' | 'luxury' | 'standard' | 'economy'): number => {
      // Exotic/Supercar: Very slow depreciation (Ferrari, Porsche, RS6, M5, G63)
      const exoticCurve: Record<number, number> = {
        2026: 1.00, 2025: 0.96, 2024: 0.91, 2023: 0.86, 2022: 0.81,
        2021: 0.76, 2020: 0.71, 2019: 0.67, 2018: 0.63, 2017: 0.59,
        2016: 0.55, 2015: 0.52, 2014: 0.49, 2013: 0.46, 2012: 0.43,
        2011: 0.41, 2010: 0.39, 2009: 0.37, 2008: 0.35, 2007: 0.33,
        2006: 0.32, 2005: 0.31
      };
      // Luxury/Premium: Moderate depreciation (BMW, Mercedes, Audi, Volvo)
      const luxuryCurve: Record<number, number> = {
        2026: 1.00, 2025: 0.93, 2024: 0.87, 2023: 0.81, 2022: 0.75,
        2021: 0.69, 2020: 0.64, 2019: 0.59, 2018: 0.54, 2017: 0.50,
        2016: 0.46, 2015: 0.43, 2014: 0.40, 2013: 0.37, 2012: 0.35,
        2011: 0.33, 2010: 0.31, 2009: 0.29, 2008: 0.27, 2007: 0.25,
        2006: 0.24, 2005: 0.23
      };
      // Standard: Normal depreciation (VW, Toyota, Honda, Hyundai)
      const standardCurve: Record<number, number> = {
        2026: 1.00, 2025: 0.91, 2024: 0.83, 2023: 0.76, 2022: 0.69,
        2021: 0.63, 2020: 0.58, 2019: 0.53, 2018: 0.49, 2017: 0.45,
        2016: 0.42, 2015: 0.39, 2014: 0.36, 2013: 0.34, 2012: 0.32,
        2011: 0.30, 2010: 0.28, 2009: 0.26, 2008: 0.24, 2007: 0.22,
        2006: 0.21, 2005: 0.20
      };
      // Economy: Faster depreciation (Fiat, Dacia, Opel, Citroën)
      const economyCurve: Record<number, number> = {
        2026: 1.00, 2025: 0.88, 2024: 0.78, 2023: 0.70, 2022: 0.63,
        2021: 0.57, 2020: 0.52, 2019: 0.47, 2018: 0.43, 2017: 0.40,
        2016: 0.37, 2015: 0.34, 2014: 0.32, 2013: 0.30, 2012: 0.28,
        2011: 0.26, 2010: 0.24, 2009: 0.22, 2008: 0.21, 2007: 0.20,
        2006: 0.19, 2005: 0.18
      };

      const curves = { exotic: exoticCurve, luxury: luxuryCurve, standard: standardCurve, economy: economyCurve };
      const curve = curves[tier];
      if (y >= 2026) return 1.00;
      if (y <= 2004) return curve[2005] * 0.9;
      return curve[y] || curve[2005];
    };

    const multiplier = getYearMultiplier(year, priceTier);
    const finalMSRP = Math.round(base2026 * multiplier);

    const targetMarketAverage = Math.round(finalMSRP / 1.2);

    if (spec.originalMSRP !== finalMSRP) {
      updates.push(
        prisma.vehicleSpecification.update({
          where: { id: spec.id },
          data: { originalMSRP: finalMSRP },
        })
      );
    }

    const dbMarket = (spec as any).marketPrices && (spec as any).marketPrices.length > 0 ? (spec as any).marketPrices[0] : null;
    if (dbMarket) {
      if (
        dbMarket.currentMarketAverage !== targetMarketAverage ||
        dbMarket.minPrice !== Math.round(targetMarketAverage * 0.92) ||
        dbMarket.maxPrice !== Math.round(targetMarketAverage * 1.08)
      ) {
        updates.push(
          prisma.vehicleMarketPrice.update({
            where: { id: dbMarket.id },
            data: {
              currentMarketAverage: targetMarketAverage,
              cleanMarketAverage: Math.round(targetMarketAverage * 1.05),
              averageListingPrice: Math.round(targetMarketAverage * 1.03),
              minPrice: Math.round(targetMarketAverage * 0.92),
              maxPrice: Math.round(targetMarketAverage * 1.08),
            }
          })
         );
      }
    } else {
      updates.push(
        prisma.vehicleMarketPrice.create({
          data: {
            vehicleSpecificationId: spec.id,
            currentMarketAverage: targetMarketAverage,
            cleanMarketAverage: Math.round(targetMarketAverage * 1.05),
            averageListingPrice: Math.round(targetMarketAverage * 1.03),
            minPrice: Math.round(targetMarketAverage * 0.92),
            maxPrice: Math.round(targetMarketAverage * 1.08),
            regionalPriceDifferences: JSON.stringify({ Istanbul: 1.0, Ankara: 0.98, Izmir: 0.99 }),
            averageSellingTime: priceTier === 'economy' ? 12 : 20,
          }
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
