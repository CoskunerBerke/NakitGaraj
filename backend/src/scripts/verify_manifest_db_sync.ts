/**
 * Manifest-DB Senkronizasyon Doğrulama Scripti
 * 
 * Kontrol eder:
 * 1. Her manifest dosyasının HTML kaynak dizininde var olup olmadığı
 * 2. DB'deki her sourceFile kaydının manifest'te karşılığı olup olmadığı  
 * 3. extractedRowCount vs DB'deki gerçek kayıt sayısı tutarlılığı
 * 4. Orphaned DB kayıtları (manifest'te karşılığı olmayan)
 */
import * as path from 'path';
import * as fs from 'fs';

try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.endsWith('dev.db')) {
  process.env.DATABASE_URL = 'file:' + path.resolve(__dirname, '../../prisma/dev.db');
}

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const MANIFEST_PATH = path.join(__dirname, '../../data/import-state/sahibinden-import-manifest.json');
const SOURCE_DIR = process.env.SAHIBINDEN_HTML_DIR || 'C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan';

async function main() {
  console.log('=== MANIFEST-DB SENKRONİZASYON DOĞRULAMASI ===\n');

  // 1. Load manifest
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const manifestFiles = Object.keys(manifest.files || {});
  console.log(`Manifest dosya sayısı: ${manifestFiles.length}`);

  // 2. Check manifest files exist on disk
  let missingOnDisk = 0;
  let existOnDisk = 0;
  for (const relP of manifestFiles) {
    const absP = path.join(SOURCE_DIR, relP);
    if (fs.existsSync(absP)) {
      existOnDisk++;
    } else {
      missingOnDisk++;
      if (missingOnDisk <= 5) {
        console.log(`  ❌ Manifest'te var ama diskte yok: ${relP}`);
      }
    }
  }
  console.log(`Diskte mevcut: ${existOnDisk} / ${manifestFiles.length}`);
  if (missingOnDisk > 0) console.log(`Diskte eksik: ${missingOnDisk}`);

  // 3. Check DB sourceFile values
  const dbSourceFiles: { sourceFile: string; count: number }[] = await prisma.$queryRaw`
    SELECT sourceFile, COUNT(*) as count 
    FROM RawVehicleListing 
    GROUP BY sourceFile 
    ORDER BY count DESC
  `;
  console.log(`\nDB'de benzersiz sourceFile sayısı: ${dbSourceFiles.length}`);

  // 4. Cross-check: DB sourceFiles vs manifest
  const manifestFileNames = new Set(manifestFiles.map(f => path.basename(f)));
  let dbFilesNotInManifest = 0;
  let dbFilesInManifest = 0;
  const unmatchedDbFiles: string[] = [];

  for (const row of dbSourceFiles) {
    if (manifestFileNames.has(row.sourceFile)) {
      dbFilesInManifest++;
    } else {
      dbFilesNotInManifest++;
      if (unmatchedDbFiles.length < 10) {
        unmatchedDbFiles.push(`${row.sourceFile} (${Number(row.count)} records)`);
      }
    }
  }
  console.log(`DB sourceFile manifest'te var: ${dbFilesInManifest}`);
  if (dbFilesNotInManifest > 0) {
    console.log(`DB sourceFile manifest'te YOK: ${dbFilesNotInManifest}`);
    console.log(`  Örnekler: ${unmatchedDbFiles.join(', ')}`);
  }

  // 5. Check extracted row counts vs DB counts per file
  let mismatchCount = 0;
  let matchCount = 0;
  const mismatches: { file: string; manifestRows: number; dbRows: number }[] = [];

  const dbFileCountMap = new Map(dbSourceFiles.map(r => [r.sourceFile, Number(r.count)]));

  for (const relP of manifestFiles) {
    const entry = manifest.files[relP];
    const fileName = path.basename(relP);
    const dbCount = dbFileCountMap.get(fileName) || 0;
    const manifestExtracted = entry.extractedRowCount || 0;

    // Allow some variance due to dedup
    if (Math.abs(dbCount - manifestExtracted) > manifestExtracted * 0.5 && manifestExtracted > 0) {
      mismatchCount++;
      if (mismatches.length < 10) {
        mismatches.push({ file: fileName, manifestRows: manifestExtracted, dbRows: dbCount });
      }
    } else {
      matchCount++;
    }
  }

  console.log(`\nManifest extractedRowCount vs DB count:`);
  console.log(`  Tutarlı (±50%): ${matchCount}`);
  console.log(`  Uyumsuz: ${mismatchCount}`);
  if (mismatches.length > 0) {
    console.log(`  İlk ${mismatches.length} uyumsuzluk:`);
    for (const m of mismatches) {
      console.log(`    ${m.file}: manifest=${m.manifestRows}, DB=${m.dbRows}`);
    }
  }

  // 6. DB totals
  const totalRaw = await prisma.rawVehicleListing.count();
  const totalValid = await prisma.rawVehicleListing.count({ where: { parseStatus: 'VALID' } });
  const totalIncomplete = await prisma.rawVehicleListing.count({ where: { parseStatus: 'INCOMPLETE_ATTRIBUTES' } });
  const totalQuarantined = await prisma.quarantinedListing.count();

  console.log(`\nDB Toplam Durum:`);
  console.log(`  RawVehicleListing: ${totalRaw}`);
  console.log(`  VALID: ${totalValid}`);
  console.log(`  INCOMPLETE_ATTRIBUTES: ${totalIncomplete}`);
  console.log(`  QuarantinedListing: ${totalQuarantined}`);

  // 7. Check for duplicate sourceListingId
  const dupeCheck: any[] = await prisma.$queryRaw`
    SELECT sourceListingId, COUNT(*) as cnt 
    FROM RawVehicleListing 
    GROUP BY sourceListingId 
    HAVING cnt > 1 
    LIMIT 10
  `;
  if (dupeCheck.length > 0) {
    console.log(`\n⚠️ Duplicate sourceListingId bulundu: ${dupeCheck.length} adet`);
    for (const d of dupeCheck) {
      console.log(`  ${d.sourceListingId}: ${d.cnt} kayıt`);
    }
  } else {
    console.log(`\n✅ Duplicate sourceListingId yok - tüm kayıtlar benzersiz`);
  }

  // 8. Summary
  console.log(`\n=== SONUÇ ===`);
  const issues: string[] = [];
  if (missingOnDisk > 0) issues.push(`${missingOnDisk} manifest dosyası diskte yok`);
  if (dbFilesNotInManifest > 0) issues.push(`${dbFilesNotInManifest} DB sourceFile manifest'te yok`);
  if (mismatchCount > 0) issues.push(`${mismatchCount} dosya için extractedRowCount uyumsuz`);
  if (dupeCheck.length > 0) issues.push(`Duplicate sourceListingId var`);

  if (issues.length === 0) {
    console.log('✅ MANIFEST-DB SENKRONİZASYONU BAŞARILI');
  } else {
    console.log(`⚠️ ${issues.length} sorun tespit edildi:`);
    for (const i of issues) console.log(`  - ${i}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
