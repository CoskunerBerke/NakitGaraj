/**
 * Optional DEMO data for local development, screenshots and CI.
 *
 * The real market snapshots are built from scraped listing pages, which are
 * not part of the repository, so a fresh install answers every valuation with
 * "insufficient data". This script generates clearly synthetic listings
 * (source DEMO_SYNTHETIC, derived from the catalogue prices of `prisma db
 * seed`) and aggregates them into market snapshots the same way the listing
 * import does, so the valuation wizard returns results locally.
 *
 * Run after `npx prisma db seed`:  npm run seed:demo
 * It refuses to run when NODE_ENV=production and only touches DEMO_SYNTHETIC
 * listings and the snapshots built from them.
 */
import { PrismaClient } from '@prisma/client';
import { RobustPricingCalculator } from '../src/evaluation/robust-pricing-calculator';

const prisma = new PrismaClient();

const DEMO_SOURCE = 'DEMO_SYNTHETIC';
const LISTINGS_PER_GROUP = 14;
const YEARS_BACK = 12;
const CITIES = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Konya'];

// Small deterministic PRNG so every run produces the same demo data.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-demo writes synthetic market data and must not run with NODE_ENV=production.');
  }

  const currentYear = new Date().getFullYear();
  const specs = await prisma.vehicleSpecification.findMany({
    where: { year: { gte: currentYear - YEARS_BACK, lte: currentYear - 1 } },
    include: {
      manufacturer: true,
      model: true,
      variant: true,
      package: true,
      bodyType: true,
      fuelType: true,
      transmissionType: true,
      marketPrices: true,
    },
    orderBy: [{ manufacturerId: 'asc' }, { modelId: 'asc' }, { variantId: 'asc' }, { year: 'asc' }],
  });
  if (specs.length === 0) {
    throw new Error('No catalogue found. Run `npx prisma db seed` first.');
  }

  // One group per make + model + variant + year, like the listing import.
  const groups = new Map<string, typeof specs>();
  for (const spec of specs) {
    const key = `${spec.manufacturer.name}__${spec.model.name}__${spec.variant.name}__${spec.year}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(spec);
  }

  // Replace the previous demo listings and the snapshots built from them.
  await prisma.rawVehicleListing.deleteMany({ where: { source: DEMO_SOURCE } });
  await prisma.vehicleMarketSnapshot.deleteMany({ where: { snapshotDataJson: { contains: '"demo":true' } } });

  const rand = mulberry32(20260930);
  let listingCount = 0;
  let snapshotCount = 0;

  for (const [key, groupSpecs] of groups) {
    const [make, model, variant, yearStr] = key.split('__');
    const year = Number(yearStr);
    const prices = groupSpecs
      .flatMap((s) => s.marketPrices.map((p) => p.averageListingPrice))
      .filter((p) => p > 0);
    if (prices.length === 0) continue;
    const basePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const age = Math.max(1, currentYear - year);

    const listings = Array.from({ length: LISTINGS_PER_GROUP }, (_, i) => {
      const mileageKm = Math.round((age * 15000 * (0.55 + rand() * 0.9)) / 1000) * 1000;
      // Higher mileage -> lower price, plus +-7% noise.
      const mileageFactor = 1 - ((mileageKm - age * 15000) / 10000) * 0.004;
      const price = Math.round((basePrice * mileageFactor * (0.93 + rand() * 0.14)) / 1000) * 1000;
      return {
        source: DEMO_SOURCE,
        sourceListingId: `demo-${key.replace(/[^A-Za-z0-9]+/g, '-')}-${i + 1}`,
        sourceFile: 'prisma/seed-demo.ts',
        rawMake: make,
        rawModel: model,
        rawVariant: variant,
        rawTitle: `DEMO ${year} ${make} ${model} ${variant}`,
        canonicalMake: make,
        canonicalModel: model,
        canonicalVariant: variant,
        year,
        mileageKm,
        price,
        city: CITIES[Math.floor(rand() * CITIES.length)],
        parseStatus: 'VALID',
      };
    });
    await prisma.rawVehicleListing.createMany({ data: listings });
    listingCount += listings.length;

    const cleaned = RobustPricingCalculator.cleanOutliersIQR(listings.map((l) => l.price));
    const pct = RobustPricingCalculator.calculatePercentiles(cleaned);
    const kms = listings.map((l) => l.mileageKm).sort((a, b) => a - b);
    const medianMileage = kms[Math.floor(kms.length / 2)];
    const averageMileage = Math.round(kms.reduce((a, b) => a + b, 0) / kms.length);

    // Technical metadata comes from the catalogue, as in the listing import.
    const spec = groupSpecs[0];
    const canonical = {
      canonicalMake: make,
      canonicalModel: model,
      canonicalVariant: variant,
      canonicalTrim: spec.package?.name || '',
      canonicalBodyType: spec.bodyType?.name || '',
      canonicalFuelType: spec.fuelType?.name || '',
      canonicalTransmission: spec.transmissionType?.name || '',
    };

    await prisma.vehicleMarketSnapshot.upsert({
      where: {
        canonicalMake_canonicalModel_canonicalVariant_canonicalTrim_year_canonicalBodyType_canonicalFuelType_canonicalTransmission_snapshotVersion:
          { ...canonical, year, snapshotVersion: 'v2.0' },
      },
      update: {},
      create: {
        ...canonical,
        make,
        model,
        variant,
        trim: canonical.canonicalTrim,
        year,
        bodyType: canonical.canonicalBodyType,
        fuelType: canonical.canonicalFuelType,
        transmission: canonical.canonicalTransmission,
        snapshotVersion: 'v2.0',
        isActive: true,
        matchedListingCount: listings.length,
        uniqueListingCount: listings.length,
        weightedP5: pct.p5,
        weightedP35: pct.p35,
        weightedP50: pct.p50,
        weightedP60: pct.p60,
        weightedP95: pct.p95,
        medianMileage,
        averageMileage,
        mileageSampleCount: listings.length,
        mileageAdjustmentSource: 'DEMO_SYNTHETIC',
        kmDecayPer10k: 0.004,
        confidenceScore: 88,
        dataQualityScore: 80,
        snapshotDataJson: JSON.stringify({
          demo: true,
          uniqueListingIds: listings.map((l) => l.sourceListingId),
          medianMileage,
          averageMileage,
          mileageSampleCount: listings.length,
          kmDecayPer10k: 0.004,
          mileageAdjustmentSource: 'DEMO_SYNTHETIC',
        }),
      },
    });
    snapshotCount++;
  }

  console.log(
    `Demo data ready: ${listingCount} synthetic listings, ${snapshotCount} market snapshots ` +
      `(${currentYear - YEARS_BACK}-${currentYear - 1}). Not real market data.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
