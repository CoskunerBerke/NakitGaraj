import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log(`\n====================================================================`);
  console.log(`  MODEL VE VARİANT İSİMLERİNDEKİ SAHİBİNDEN EKLERİNİ TEMİZLEME`);
  console.log(`====================================================================\n`);

  const models = await prisma.model.findMany();
  let cleanedCount = 0;

  for (const m of models) {
    let cleanName = m.name
      .replace(/& Modelleri sahibinden\.com'da.*/gi, '')
      .replace(/& Modelleri sa.*/gi, '')
      .replace(/& Modelle.*/gi, '')
      .replace(/sahibinden\.com'da.*/gi, '')
      .replace(/Fiyatları.*/gi, '')
      .replace(/-\s*\d+$/g, '')
      .trim();

    // Strip leading Brand name if present in Model (e.g. "Audi A6" -> "A6")
    const mfg = await prisma.manufacturer.findUnique({ where: { id: m.manufacturerId } });
    if (mfg && cleanName.toLowerCase().startsWith(mfg.name.toLowerCase() + ' ')) {
      cleanName = cleanName.substring(mfg.name.length + 1).trim();
    }

    if (cleanName && cleanName !== m.name) {
      try {
        await prisma.model.update({
          where: { id: m.id },
          data: { name: cleanName }
        });
        cleanedCount++;
      } catch (e) {
        // If unique constraint conflicts, delete duplicate model
        try {
          await prisma.model.delete({ where: { id: m.id } });
        } catch (delErr) {}
      }
    }
  }

  console.log(`✓ ${cleanedCount} adet Model ismi tamamen temizlendi.`);

  const finalModels = await prisma.model.findMany({
    where: { manufacturer: { name: 'Audi' } },
    select: { name: true }
  });
  console.log(`\nTemizlenen Örnek Audi Modelleri:`);
  console.log([...new Set(finalModels.map(m => m.name))].slice(0, 15).join(', '));
  console.log(`====================================================================\n`);
}

main().finally(() => prisma.$disconnect());
