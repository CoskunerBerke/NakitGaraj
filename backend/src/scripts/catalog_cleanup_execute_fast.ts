import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';

const prisma = new PrismaClient();
const db = new Database('prisma/dev.db');

async function main() {
  console.log("Deleting orphaned specs directly via SQLite...");

  const rawListings = await prisma.rawVehicleListing.findMany({
    select: {
      canonicalMake: true,
      canonicalModel: true,
      canonicalVariant: true,
      canonicalTrim: true,
      year: true
    },
    distinct: ['canonicalMake', 'canonicalModel', 'canonicalVariant', 'canonicalTrim', 'year']
  });

  const rawSet = new Set(rawListings.map(r => 
    `${r.canonicalMake?.toLowerCase()}|${r.canonicalModel?.toLowerCase()}|${r.canonicalVariant?.toLowerCase() || ''}|${r.canonicalTrim?.toLowerCase() || ''}|${r.year}`
  ));

  const specs = await prisma.vehicleSpecification.findMany({
    include: {
      manufacturer: true,
      model: true,
      variant: true,
      package: true,
    }
  });

  const specsToDelete: string[] = [];
  const keptSpecs = new Set<string>();
  
  for (const spec of specs) {
    const rawKey = `${spec.manufacturer.name.toLowerCase()}|${spec.model.name.toLowerCase()}|${spec.variant.name.toLowerCase()}|${spec.package?.name?.toLowerCase() || ''}|${spec.year}`;
    
    if (!rawSet.has(rawKey)) {
      specsToDelete.push(spec.id);
    } else {
      const specKey = `${spec.manufacturerId}-${spec.modelId}-${spec.variantId}-${spec.packageId}-${spec.year}`;
      if (keptSpecs.has(specKey)) {
         specsToDelete.push(spec.id);
      } else {
         keptSpecs.add(specKey);
      }
    }
  }

  console.log(`Found ${specsToDelete.length} specs to delete.`);

  if (specsToDelete.length > 0) {
    db.pragma('journal_mode = WAL');
    
    // SQLite has a parameter limit (usually 999 or 32766). We'll chunk the ids and use better-sqlite3 which is synchronous and fast.
    const chunkSize = 999;
    
    const stmtMarketPrice = db.prepare(`DELETE FROM VehicleMarketPrice WHERE vehicleSpecificationId IN (${Array(chunkSize).fill('?').join(',')})`);
    const stmtEval = db.prepare(`DELETE FROM VehicleEvaluation WHERE vehicleSpecificationId IN (${Array(chunkSize).fill('?').join(',')})`);
    const stmtSpec = db.prepare(`DELETE FROM VehicleSpecification WHERE id IN (${Array(chunkSize).fill('?').join(',')})`);
    
    const stmtMarketPriceRem = (len: number) => db.prepare(`DELETE FROM VehicleMarketPrice WHERE vehicleSpecificationId IN (${Array(len).fill('?').join(',')})`);
    const stmtEvalRem = (len: number) => db.prepare(`DELETE FROM VehicleEvaluation WHERE vehicleSpecificationId IN (${Array(len).fill('?').join(',')})`);
    const stmtSpecRem = (len: number) => db.prepare(`DELETE FROM VehicleSpecification WHERE id IN (${Array(len).fill('?').join(',')})`);

    let deleted = 0;
    
    const runInTransaction = db.transaction(() => {
      for (let i = 0; i < specsToDelete.length; i += chunkSize) {
        const chunk = specsToDelete.slice(i, i + chunkSize);
        if (chunk.length === chunkSize) {
          stmtMarketPrice.run(chunk);
          stmtEval.run(chunk);
          stmtSpec.run(chunk);
        } else {
          stmtMarketPriceRem(chunk.length).run(chunk);
          stmtEvalRem(chunk.length).run(chunk);
          stmtSpecRem(chunk.length).run(chunk);
        }
        deleted += chunk.length;
      }
    });
    
    runInTransaction();
    console.log(`Successfully deleted ${deleted} orphaned specs directly!`);
  }

  db.close();
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
