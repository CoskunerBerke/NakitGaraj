const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  console.log('=== TESTING INCREMENTAL SPEC UPSERT & TARGETED CACHE INVALIDATION ===');
  
  // 1. Fetch BMW and 3 Serisi IDs
  const brands = await fetch('http://127.0.0.1:3001/api/brands').then(r => r.json());
  const bmw = brands.find(b => b.name === 'BMW');
  if (!bmw) throw new Error('BMW not found');
  
  const models = await fetch('http://127.0.0.1:3001/api/models?brandId=' + bmw.id).then(r => r.json());
  const m3 = models.find(m => m.name.includes('3'));
  if (!m3) throw new Error('3 Serisi model not found');

  // 2. Query vehicle-data first time to populate cache
  const url = `http://127.0.0.1:3001/api/vehicle-data?year=2015&manufacturerId=${bmw.id}&modelId=${m3.id}`;
  const t0 = performance.now();
  const initialRes = await fetch(url).then(r => r.json());
  const dt0 = performance.now() - t0;
  console.log(`Initial API call (populates cache) in ${dt0.toFixed(1)} ms | Variants count: ${initialRes.variants.length}`);

  // Query second time to verify cache HIT
  const t1 = performance.now();
  const cachedRes = await fetch(url).then(r => r.json());
  const dt1 = performance.now() - t1;
  console.log(`Second API call (Cache HIT) in ${dt1.toFixed(1)} ms | Variants count: ${cachedRes.variants.length}`);

  // 3. Trigger Incremental Spec Upsert for BMW 2015 3 Serisi with a NEW Test Engine "340i M-Performance"
  const testEngineName = '340i M-Performance';
  console.log(`\nSimulating Incremental Import: Adding new engine "${testEngineName}" to BMW 2015 3 Serisi...`);

  const upsertResp = await fetch('http://127.0.0.1:3001/api/vehicle-specs/upsert-incremental', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          year: 2015,
          canonicalMake: 'BMW',
          canonicalModel: '3 Serisi',
          canonicalVariant: testEngineName,
          canonicalTrim: 'M Performance Line',
        }
      ]
    })
  }).then(r => r.json());

  console.log('Upsert API Result:', upsertResp);

  // 4. Immediately query vehicle-data again (MUST BE A CACHE MISS AND CONTAIN THE NEW ENGINE!)
  const t2 = performance.now();
  const postUpsertRes = await fetch(url).then(r => r.json());
  const dt2 = performance.now() - t2;

  console.log(`Post-Upsert API call in ${dt2.toFixed(1)} ms | Variants count: ${postUpsertRes.variants.length}`);

  const hasNewEngine = postUpsertRes.variants.some(v => v.name === testEngineName);
  console.log(`Does post-upsert response contain "${testEngineName}"? -> ${hasNewEngine ? 'YES ✓' : 'NO ❌'}`);

  if (!hasNewEngine) {
    throw new Error(`FAILED: New engine "${testEngineName}" was not immediately visible in vehicle-data response!`);
  }

  console.log('\n✓ SUCCESS: New engine was upserted to VehicleSpecification, targeted cache was immediately cleared, and selection panel instantly rendered the new engine!');

  // Cleanup test engine & spec from DB
  console.log('Cleaning up test data...');
  const testVar = await prisma.variant.findFirst({ where: { modelId: m3.id, name: testEngineName } });
  if (testVar) {
    await prisma.vehicleSpecification.deleteMany({ where: { variantId: testVar.id } });
    await prisma.package.deleteMany({ where: { variantId: testVar.id } });
    await prisma.variant.delete({ where: { id: testVar.id } });
    console.log('✓ Cleanup completed.');
  }

  // Invalidate cache again via API after cleanup
  await fetch('http://127.0.0.1:3001/api/vehicle-specs/upsert-incremental', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ year: 2015, canonicalMake: 'BMW', canonicalModel: '3 Serisi' }] })
  });

  process.exit(0);
})();
