import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const DESKTOP_DIR = 'C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan';

interface ExtractedListing {
  id: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  price: number;
  mileageKm: number | null;
  city?: string;
  isDamaged: boolean;
}

function scanHtmlFilesRecursively(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      scanHtmlFilesRecursively(filePath, fileList);
    } else if (file.toLowerCase().endsWith('.html')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

async function main() {
  console.log(`\n====================================================================`);
  console.log(`  MASAÜSTÜ İLAN KLASÖRLERİNİ RECURSIVE TARAMA VE SIZINTISIZ TEKİLLEŞTİRME`);
  console.log(`====================================================================\n`);

  const allHtmlPaths = scanHtmlFilesRecursively(DESKTOP_DIR);
  console.log(`✓ Toplam ${allHtmlPaths.length} adet HTML dosyası özyinelemeli (recursive) olarak bulundu.\n`);

  const listingMap = new Map<string, ExtractedListing>();

  let parsedRowCount = 0;

  for (const filePath of allHtmlPaths) {
    try {
      const relativePath = path.relative(DESKTOP_DIR, filePath);
      const pathParts = relativePath.split(path.sep);
      const makeName = pathParts[0] || 'Genel';
      const fileName = path.basename(filePath, '.html');

      const html = fs.readFileSync(filePath, 'utf8');

      // Match rows
      const trMatches = html.match(/<tr[^>]*class="[^"]*searchResultsItem[^"]*"[\s\S]*?<\/tr>/gi) || [];

      for (const tr of trMatches) {
        const idMatch = tr.match(/data-id="(\d+)"/i);
        const yearMatch = tr.match(/<td[^>]*class="[^"]*searchResultsAttributeValue[^"]*"[^>]*>\s*(\d{4})\s*<\/td>/i) || tr.match(/\b(20[0-2][0-9]|19[8-9][0-9])\b/);
        const priceMatch = tr.match(/<td[^>]*class="[^"]*searchResultsPriceValue[^"]*"[^>]*>[\s\S]*?([\d.]+)\s*TL/i) || tr.match(/([\d\.]+)\s*TL/i);
        const tagMatch = tr.match(/<td[^>]*class="[^"]*searchResultsTagAttributeValue[^"]*"[^>]*>[\s\S]*?([^\s<]+)[\s\S]*?<\/td>/i);

        if (!priceMatch || !yearMatch) continue;

        const year = parseInt(yearMatch[1], 10);
        const priceStr = priceMatch[1].replace(/\./g, '').replace(/\D/g, '');
        const price = parseInt(priceStr, 10);

        // Exclude fake prices (1 TL, 111 TL, kapora) and extreme outliers
        if (isNaN(year) || isNaN(price) || price <= 100000 || price > 150000000 || year < 1980 || year > 2026) {
          continue;
        }

        const dataId = idMatch && idMatch[1] ? idMatch[1] : `${makeName}-${year}-${price}-${parsedRowCount}`;
        const uniqueKey = `shb-${dataId}`;

        let cleanModel = fileName.replace(/fiyatları/gi, '').replace(/_\d+/g, '').trim();

        // Specific submodel detection
        if (makeName === 'Audi') {
          if (cleanModel.toUpperCase().includes('A6')) cleanModel = 'A6';
          else if (cleanModel.toUpperCase().includes('A4')) cleanModel = 'A4';
          else if (cleanModel.toUpperCase().includes('A3')) cleanModel = 'A3';
          else if (cleanModel.toUpperCase().includes('A5')) cleanModel = 'A5';
          else if (cleanModel.toUpperCase().includes('Q5')) cleanModel = 'Q5';
          else if (cleanModel.toUpperCase().includes('Q7')) cleanModel = 'Q7';
        } else if (makeName === 'BMW') {
          if (cleanModel.toUpperCase().includes('3 SER') || cleanModel.includes('320')) cleanModel = '3 Serisi';
          else if (cleanModel.toUpperCase().includes('5 SER') || cleanModel.includes('520')) cleanModel = '5 Serisi';
        }

        // Parse real mileage (km)
        let mileageKm: number | null = null;
        const kmMatch = tr.match(/([\d\.]+)\s*km/i) || tr.match(/<td[^>]*class="[^"]*searchResultsAttributeValue[^"]*"[^>]*>\s*([\d\.]+)\s*<\/td>/i);
        if (kmMatch && kmMatch[1]) {
          const parsedKm = parseInt(kmMatch[1].replace(/\./g, '').replace(/\D/g, ''), 10);
          if (!isNaN(parsedKm) && parsedKm >= 0 && parsedKm < 2000000 && parsedKm !== year) {
            mileageKm = parsedKm;
          }
        }

        const variantName = tagMatch && tagMatch[1] ? tagMatch[1] : 'Standart';

        // Check if listing indicates heavy damage/pert
        const isDamaged = tr.toLowerCase().includes('ağır hasar') || tr.toLowerCase().includes('pert') || tr.toLowerCase().includes('çekme belgeli');

        if (!listingMap.has(uniqueKey)) {
          listingMap.set(uniqueKey, {
            id: uniqueKey,
            make: makeName,
            model: cleanModel || 'Genel Model',
            variant: variantName,
            year,
            price,
            mileageKm,
            isDamaged,
          });
          parsedRowCount++;
        }
      }
    } catch (err) {}
  }

  console.log(`✓ Tekilleştirilmiş Toplam İlan Sayısı: ${listingMap.size} adet (Mükerrer ilanlar temizlendi).\n`);

  // Group by: `${make}__${model}__${variant}__${year}`
  const groupMap = new Map<string, number[]>();

  for (const item of listingMap.values()) {
    if (item.isDamaged) continue; // Exclude heavy damage from clean market snapshots

    const key = `${item.make}__${item.model}__${item.variant}__${item.year}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key)!.push(item.price);
  }

  let snapshotCreated = 0;

  for (const [key, prices] of groupMap.entries()) {
    const [make, model, variant, yearStr] = key.split('__');
    const year = parseInt(yearStr, 10);

    const sorted = [...prices].sort((a, b) => a - b);
    const len = sorted.length;
    if (len === 0) continue;

    const p5 = sorted[Math.floor(len * 0.05)] || sorted[0];
    const p35 = sorted[Math.floor(len * 0.35)] || sorted[0];
    const p50 = sorted[Math.floor(len * 0.50)] || sorted[0];
    const p60 = sorted[Math.floor(len * 0.60)] || sorted[0];
    const p95 = sorted[Math.floor(len * 0.95)] || sorted[len - 1];

    await prisma.vehicleMarketSnapshot.upsert({
      where: {
        make_model_year_variant: {
          make,
          model,
          year,
          variant,
        },
      },
      update: {
        matchedListingCount: len,
        weightedP5: p5,
        weightedP35: p35,
        weightedP50: p50,
        weightedP60: p60,
        weightedP95: p95,
        confidenceScore: len >= 12 ? 98 : (len >= 6 ? 88 : 70),
      },
      create: {
        make,
        model,
        variant,
        year,
        matchedListingCount: len,
        weightedP5: p5,
        weightedP35: p35,
        weightedP50: p50,
        weightedP60: p60,
        weightedP95: p95,
        confidenceScore: len >= 12 ? 98 : (len >= 6 ? 88 : 70),
      },
    });

    snapshotCreated++;
  }

  console.log(`\n====================================================================`);
  console.log(`✓ TOPLAM ${snapshotCreated} ADET ANLIK PİYASA SNAPSHOT'I EKLENDİ / GÜNCELLENDİ!`);
  console.log(`====================================================================\n`);
}

main().finally(() => prisma.$disconnect());
