import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Starting catalog analysis...");

  const patterns = ['sahibinden', 'fiyatları', '.html', 'sahibinden.com'];
  
  const isDirty = (name: string) => {
    if (!name || name.trim() === '' || name === '-') return true;
    
    const lowerName = name.toLowerCase();
    for (const p of patterns) {
      if (lowerName.includes(p)) return true;
    }
    
    // Match " - 2", " - 5" (with leading space, optionally followed by .html etc)
    // Sahibinden pages often have " - 2" at the end of the title
    if (name.match(/\s-\s\d+$/)) return true;
    return false;
  };

  const models = await prisma.model.findMany({ include: { manufacturer: true } });
  const dirtyModels = models.filter(m => isDirty(m.name));
  console.log(`Found ${dirtyModels.length} dirty models.`);
  dirtyModels.slice(0, 10).forEach(m => console.log(` - Model ID: ${m.id}, Name: "${m.name}"`));

  const variants = await prisma.variant.findMany();
  const dirtyVariants = variants.filter(v => isDirty(v.name));
  console.log(`Found ${dirtyVariants.length} dirty variants.`);
  dirtyVariants.slice(0, 10).forEach(v => console.log(` - Variant ID: ${v.id}, Name: "${v.name}"`));

  const packages = await prisma.package.findMany();
  const dirtyPackages = packages.filter(p => isDirty(p.name));
  console.log(`Found ${dirtyPackages.length} dirty packages.`);
  dirtyPackages.slice(0, 10).forEach(p => console.log(` - Package ID: ${p.id}, Name: "${p.name}"`));

  // Duplicates
  const duplicateModels: any[] = [];
  const modelsByManufacturer = new Map();
  models.forEach(m => {
    const key = `${m.manufacturerId}-${m.name.toLowerCase()}`;
    if (modelsByManufacturer.has(key)) {
      duplicateModels.push({ existing: modelsByManufacturer.get(key), duplicate: m });
    } else {
      modelsByManufacturer.set(key, m);
    }
  });
  console.log(`Found ${duplicateModels.length} duplicate models.`);
  duplicateModels.slice(0, 10).forEach(d => console.log(` - Duplicate: "${d.duplicate.name}" (ID: ${d.duplicate.id}) conflicts with "${d.existing.name}" (ID: ${d.existing.id})`));

  // Orphaned specs
  const specs = await prisma.vehicleSpecification.findMany({
    include: {
      manufacturer: true,
      model: true,
      variant: true,
      package: true,
    }
  });

  console.log(`Total VehicleSpecifications: ${specs.length}`);
  
  // To avoid memory issues, let's just do a distinct query on RawVehicleListing
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

  let orphanedCount = 0;
  for (const spec of specs) {
    const key = `${spec.manufacturer.name.toLowerCase()}|${spec.model.name.toLowerCase()}|${spec.variant.name.toLowerCase()}|${spec.package?.name?.toLowerCase() || ''}|${spec.year}`;
    if (!rawSet.has(key)) {
      orphanedCount++;
    }
  }

  console.log(`Found ${orphanedCount} orphaned specs.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
