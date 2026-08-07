import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const DESKTOP_DIR = 'C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan';

async function main() {
  console.log(`\n====================================================================`);
  console.log(`  SADECE MASAÜSTÜNDEKİ GERÇEK ÇEKİLEN MARKALARI BIRAKMA İŞLEMİ`);
  console.log(`====================================================================\n`);

  const dirs = fs.readdirSync(DESKTOP_DIR).filter(d => {
    const fullPath = path.join(DESKTOP_DIR, d);
    return fs.statSync(fullPath).isDirectory() && fs.readdirSync(fullPath).some(f => f.endsWith('.html'));
  });

  console.log(`Masaüstünde Bulunan Gerçek Marka Klasörleri (${dirs.length} adet):`);
  console.log(dirs.join(', '));
  console.log('\n--------------------------------------------------------------------\n');

  const validBrandNamesLower = new Set(dirs.map(d => d.toLowerCase()));
  const allMfg = await prisma.manufacturer.findMany();

  for (const mfg of allMfg) {
    if (!validBrandNamesLower.has(mfg.name.toLowerCase())) {
      console.log(`❌ SİLİNİYOR: ${mfg.name}`);

      // 1. Delete all market prices & evaluations linked to specifications of this manufacturer
      const specs = await prisma.vehicleSpecification.findMany({ where: { manufacturerId: mfg.id }, select: { id: true } });
      const specIds = specs.map(s => s.id);

      if (specIds.length > 0) {
        await prisma.vehicleMarketPrice.deleteMany({ where: { vehicleSpecificationId: { in: specIds } } });
        await prisma.vehicleEvaluation.deleteMany({ where: { vehicleSpecificationId: { in: specIds } } }).catch(() => {});
        await prisma.vehicleSpecification.deleteMany({ where: { id: { in: specIds } } });
      }

      // 2. Delete all packages, variants, models linked to this manufacturer
      const models = await prisma.model.findMany({ where: { manufacturerId: mfg.id }, select: { id: true } });
      const modelIds = models.map(m => m.id);

      if (modelIds.length > 0) {
        const variants = await prisma.variant.findMany({ where: { modelId: { in: modelIds } }, select: { id: true } });
        const variantIds = variants.map(v => v.id);

        if (variantIds.length > 0) {
          await prisma.package.deleteMany({ where: { variantId: { in: variantIds } } });
          await prisma.variant.deleteMany({ where: { id: { in: variantIds } } });
        }

        await prisma.model.deleteMany({ where: { id: { in: modelIds } } });
      }

      // 3. Delete Manufacturer
      await prisma.manufacturer.delete({ where: { id: mfg.id } });
    }
  }

  console.log(`\n✓ İŞLEM TAMAMLANDI! Veritabanındaki markalar sadece masaüstü klasörüyle eşitlendi.\n`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
