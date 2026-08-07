const { PrismaClient } = require('@prisma/client');
const { VehicleService } = require('./backend/dist/src/vehicle/vehicle.service');
const prisma = new PrismaClient();

(async () => {
  console.log('=== IDEMPOTENCY & DATABASE CLEANUP VERIFICATION TEST ===\n');

  const testEngine = '340i M-Performance';
  const testTrim = 'M Performance Line';
  const testYear = 2015;
  const testMake = 'BMW';
  const testModel = '3 Serisi';

  const vehicleService = new VehicleService(prisma, {});

  // Pre-test: Ensure clean slate for test fixture
  const preVar = await prisma.variant.findFirst({ where: { name: testEngine } });
  if (preVar) {
    await prisma.vehicleSpecification.deleteMany({ where: { variantId: preVar.id } });
    await prisma.package.deleteMany({ where: { variantId: preVar.id } });
    await prisma.variant.delete({ where: { id: preVar.id } });
  }

  const rawItem = {
    year: testYear,
    canonicalMake: testMake,
    canonicalModel: testModel,
    canonicalVariant: testEngine,
    canonicalTrim: testTrim,
  };

  // -------------------------------------------------------------
  // STEP 1: First Ingestion
  // -------------------------------------------------------------
  console.log('[Step 1] Ingesting item for the FIRST time...');
  const firstPass = await vehicleService.upsertVehicleSpecificationsForRawListings([rawItem]);
  console.log('First Pass Result:', firstPass);

  if (firstPass.upsertedSpecsCount !== 1) {
    throw new Error(`Expected firstPass.upsertedSpecsCount === 1, got ${firstPass.upsertedSpecsCount}`);
  }
  console.log('✓ First pass created 1 VehicleSpecification record.');

  // -------------------------------------------------------------
  // STEP 2: Verify DB Record Exists
  // -------------------------------------------------------------
  const createdVariant = await prisma.variant.findFirst({ where: { name: testEngine } });
  const createdPackage = await prisma.package.findFirst({ where: { name: testTrim } });
  if (!createdVariant || !createdPackage) {
    throw new Error('FAILED: Variant or Package record not found after first pass!');
  }
  console.log('✓ DB verification: Created Variant ID:', createdVariant.id, '| Package ID:', createdPackage.id);

  // -------------------------------------------------------------
  // STEP 3 & 4: Second Ingestion (Idempotency Test)
  // -------------------------------------------------------------
  console.log('\n[Step 3 & 4] Ingesting identical item for the SECOND time (Idempotency Check)...');
  const secondPass = await vehicleService.upsertVehicleSpecificationsForRawListings([rawItem]);
  console.log('Second Pass Result:', secondPass);

  if (secondPass.upsertedSpecsCount !== 0) {
    throw new Error(`Idempotency Failed! Expected secondPass.upsertedSpecsCount === 0, got ${secondPass.upsertedSpecsCount}`);
  }
  console.log('✓ Second pass upsertedSpecsCount === 0 (no duplicate created).');

  // Verify DB count of Variant & Package remains 1
  const variantCount = await prisma.variant.count({ where: { name: testEngine } });
  const packageCount = await prisma.package.count({ where: { name: testTrim } });
  console.log(`DB Count check -> Variant count: ${variantCount}, Package count: ${packageCount}`);

  if (variantCount !== 1 || packageCount !== 1) {
    throw new Error(`Idempotency Failed! Duplicate records found: Variant count=${variantCount}, Package count=${packageCount}`);
  }
  console.log('✓ Idempotency verified: NO DUPLICATE RECORDS FORMED IN DATABASE!');

  // -------------------------------------------------------------
  // STEP 5: Fixture Cleanup
  // -------------------------------------------------------------
  console.log('\n[Step 5] Performing Fixture Cleanup...');
  await prisma.vehicleSpecification.deleteMany({ where: { variantId: createdVariant.id } });
  await prisma.package.deleteMany({ where: { variantId: createdVariant.id } });
  await prisma.variant.delete({ where: { id: createdVariant.id } });
  console.log('✓ Fixture cleanup executed.');

  // -------------------------------------------------------------
  // STEP 6: Database Verification After Cleanup (Prisma Count)
  // -------------------------------------------------------------
  console.log('\n[Step 6] Verifying Database is ZERO for test fixtures...');
  const postCleanVariantCount = await prisma.variant.count({ where: { name: testEngine } });
  const postCleanPackageCount = await prisma.package.count({ where: { name: testTrim } });

  console.log(`Post-cleanup Prisma Count -> Variant "${testEngine}": ${postCleanVariantCount}`);
  console.log(`Post-cleanup Prisma Count -> Package "${testTrim}": ${postCleanPackageCount}`);

  if (postCleanVariantCount !== 0 || postCleanPackageCount !== 0) {
    throw new Error(`Cleanup Failed! Non-zero records remain in DB: Variant=${postCleanVariantCount}, Package=${postCleanPackageCount}`);
  }

  console.log('\n=============================================================');
  console.log('✓ ALL IDEMPOTENCY & DATABASE CLEANUP VERIFICATIONS PASSED 100%');
  console.log('=============================================================');

  process.exit(0);
})();
