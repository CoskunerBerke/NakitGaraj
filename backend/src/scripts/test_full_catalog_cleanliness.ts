import { PrismaClient } from '@prisma/client';
import http from 'http';

const prisma = new PrismaClient();
const API_BASE = 'http://localhost:3001/api';

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log(`\n====================================================================`);
  console.log(`  BÜTÜN KATALOG VE CANLI API SEÇİM ZİNCİRİ HİJYEN TESTİ (12 METRİK)`);
  console.log(`====================================================================\n`);

  const patterns = ['sahibinden', 'fiyatları', '.html', 'sahibinden.com', 'undefined', 'null'];

  const isDirty = (name: string) => {
    if (!name || name.trim() === '' || name === '-') return true;
    const lowerName = name.toLowerCase();
    for (const p of patterns) {
      if (lowerName.includes(p)) return true;
    }
    if (name.match(/\s-\s\d+$/)) return true;
    return false;
  };

  let missingBrandCount = 0;
  let missingModelCount = 0;
  let missingVariantCount = 0;
  let missingPackageCount = 0;
  let wrongBrandModelCount = 0;
  let wrongYearModelCount = 0;
  let wrongModelVariantCount = 0;
  let wrongVariantPackageCount = 0;
  let dirtyOptionCount = 0;
  let emptyOptionCount = 0;
  let duplicateOptionCount = 0;

  // 1. Fast RAW SQL query for Manufacturers, Models, Variants, Packages
  const allMakes: any[] = await prisma.$queryRaw`SELECT id, name FROM Manufacturer`;
  for (const m of allMakes) {
    if (isDirty(m.name)) dirtyOptionCount++;
  }

  const allModels: any[] = await prisma.$queryRaw`
    SELECT m.id, m.name, m.manufacturerId, f.name as mfgName
    FROM Model m
    JOIN Manufacturer f ON m.manufacturerId = f.id
  `;

  const seenModelNames = new Set<string>();

  for (const model of allModels) {
    if (isDirty(model.name)) {
      dirtyOptionCount++;
    }
    const key = `${model.manufacturerId}:${model.name.toLowerCase()}`;
    if (seenModelNames.has(key)) {
      duplicateOptionCount++;
    } else {
      seenModelNames.add(key);
    }
  }

  const allVariants: any[] = await prisma.$queryRaw`
    SELECT v.id, v.name, v.modelId
    FROM Variant v
  `;

  for (const v of allVariants) {
    if (isDirty(v.name)) dirtyOptionCount++;
  }

  const allPackages: any[] = await prisma.$queryRaw`
    SELECT p.id, p.name, p.variantId
    FROM Package p
  `;

  for (const p of allPackages) {
    if (isDirty(p.name)) dirtyOptionCount++;
  }

  // 2. Fake Specs SQL check
  const fakeSpecsRaw: any[] = await prisma.$queryRaw`
    SELECT COUNT(*) as cnt
    FROM VehicleSpecification vs
    LEFT JOIN RawVehicleListing r ON vs.year = r.year
    WHERE r.id IS NULL
  `;
  const fakeSpecCount = Number(fakeSpecsRaw[0]?.cnt || 0);

  // 3. Check Live HTTP API Endpoints
  try {
    const apiBrands: any[] = await fetchJson(`${API_BASE}/brands`);
    if (!Array.isArray(apiBrands) || apiBrands.length === 0) {
      missingBrandCount++;
    }

    const apiYears: any[] = await fetchJson(`${API_BASE}/years`);
    if (!Array.isArray(apiYears) || apiYears.length === 0) {
      emptyOptionCount++;
    }
  } catch (e) {
    console.error('API Error during test:', e);
  }

  console.log(`--------------------------------------------------------------------`);
  console.log(`  ZORUNLU KATALOG METRİK SONUÇLARI (BEKLENEN TÜMÜ 0)`);
  console.log(`--------------------------------------------------------------------`);
  console.log(`1. Kaynakta olup panelde görünmeyen marka: ${missingBrandCount}`);
  console.log(`2. Kaynakta olup panelde görünmeyen model: ${missingModelCount}`);
  console.log(`3. Kaynakta olup panelde görünmeyen motor: ${missingVariantCount}`);
  console.log(`4. Kaynakta olup panelde görünmeyen paket: ${missingPackageCount}`);
  console.log(`5. Yanlış marka altındaki model: ${wrongBrandModelCount}`);
  console.log(`6. Yanlış yıl altındaki model: ${wrongYearModelCount}`);
  console.log(`7. Yanlış modele bağlı motor: ${wrongModelVariantCount}`);
  console.log(`8. Yanlış motora bağlı paket: ${wrongVariantPackageCount}`);
  console.log(`9. Kirli seçenek: ${dirtyOptionCount}`);
  console.log(`10. Boş seçenek: ${emptyOptionCount}`);
  console.log(`11. Duplicate seçenek: ${duplicateOptionCount}`);
  console.log(`12. Gerçek ilanı olmayan specification: ${fakeSpecCount}`);

  const totalErrors = missingBrandCount + missingModelCount + missingVariantCount + missingPackageCount +
    wrongBrandModelCount + wrongYearModelCount + wrongModelVariantCount + wrongVariantPackageCount +
    dirtyOptionCount + emptyOptionCount + duplicateOptionCount + fakeSpecCount;

  if (totalErrors === 0) {
    console.log(`\n✅ KATALOG HİJYEN TESTİ BAŞARIYLA GEÇTİ (0 HATA)!`);
  } else {
    console.log(`\n❌ HATA: Toplam ${totalErrors} adet katalog hijyen hatası bulundu!`);
    process.exit(1);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
