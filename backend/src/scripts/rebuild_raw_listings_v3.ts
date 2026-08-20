/**
 * rebuild_raw_listings_v3.ts
 *
 * Sahibinden HTML klasorunu yeniden tarar ve RawVehicleListing tablosunu
 * DETERMINISTIK, tek semantikli bir sekilde yeniden kurar.
 *
 * Neden gerekli:
 *  - Tabloda birden fazla eski importer'in birakti farkli semantikler vardi
 *    (bir markada rawModel = tam sayfa basligi, digerinde rawModel = paket adi).
 *    Bu yuzden bazi modeller (orn. Hyundai i20) emsal eslemede hic bulunamiyordu.
 *  - Ilan tarihi (searchResultsDateValue) ve sehir (searchResultsLocationValue)
 *    hic okunmuyordu -> tazelik agirligi uygulanamiyordu.
 *  - Yakit / sanziman alanlari hicbir kayitta dolu degildi -> emsal eslemede
 *    yakit ve sanziman filtreleri fiilen devre disiydi.
 *
 * Kurallar:
 *  - Fiyat YALNIZCA ilan satirindaki td.searchResultsPriceValue hucresinden alinir.
 *    Sayfadaki diger TL rakamlari (reklam, filtre, kredi tutari) havuza giremez.
 *  - Ilan kimligi tr[data-id] -> mukerrer kayit olusamaz.
 *  - Ayristirilamayan kayit icin UYDURMA deger uretilmez; QuarantinedListing'e yazilir.
 *
 * Kullanim:
 *   npx ts-node src/scripts/rebuild_raw_listings_v3.ts [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { PrismaClient } from '@prisma/client';
import {
  deriveBodyTypeFromSources,
  deriveFromSource,
  parseLocation,
  parseTurkishListingDate,
  foldTurkish,
} from '../evaluation/listing-attributes';

const DESKTOP_DIR = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'OneDrive',
  'Masaüstü',
  'sahibindne ilan',
);

const PRICE_MIN = 50_000;
const PRICE_MAX = 150_000_000;
const YEAR_MIN = 1980;
const YEAR_MAX = new Date().getFullYear() + 1;
const KM_MAX = 2_000_000;

const DAMAGE_TOKENS = ['agir hasar', 'agir hasarli', 'pert', 'hasar kayitli'];

interface ParsedListing {
  sourceListingId: string;
  sourceFile: string;
  rawMake: string;
  rawModel: string;
  rawVariant: string;
  rawTitle: string;
  canonicalMake: string;
  canonicalModel: string;
  canonicalVariant: string;
  canonicalTrim: string;
  canonicalFuelType: string;
  canonicalTransmission: string;
  canonicalBodyType: string;
  year: number;
  mileageKm: number | null;
  price: number;
  city: string | null;
  isDamaged: boolean;
  scrapedAt: Date | null;
  parseStatus: string;
  parseWarnings: string | null;
  missingFields: string | null;
}

interface Quarantined {
  rawListingId: string;
  rawMake: string | null;
  rawModel: string | null;
  rawVariant: string | null;
  rawTitle: string | null;
  sourceFile: string;
  reason: string;
}

function scanHtmlFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.html')) out.push(full);
    }
  };
  walk(dir);
  return out;
}

function parseIntSafe(text: string): number {
  const digits = (text || '').replace(/[^\d]/g, '');
  if (!digits) return NaN;
  return parseInt(digits, 10);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaClient();

  console.log('====================================================================');
  console.log('  RAW LISTING REBUILD V3  (deterministik tek-semantik yeniden kurulum)');
  console.log('====================================================================\n');

  if (!fs.existsSync(DESKTOP_DIR)) {
    throw new Error(`Kaynak klasör bulunamadı: ${DESKTOP_DIR}`);
  }

  // Marka klasorleri DINAMIK kesfedilir: yeni bir marka klasoru eklendiginde
  // kodda hicbir liste guncellemesi gerekmez.
  const discoveredMakes = fs
    .readdirSync(DESKTOP_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name.trim())
    .filter(Boolean);
  console.log(`✓ ${discoveredMakes.length} marka klasörü keşfedildi (dinamik)`);

  const files = scanHtmlFiles(DESKTOP_DIR);
  console.log(`✓ ${files.length} HTML dosyası tarandı: ${DESKTOP_DIR}\n`);
  if (files.length === 0) throw new Error('NO_HTML_FILES_FOUND');

  const byId = new Map<string, ParsedListing>();
  const quarantined: Quarantined[] = [];

  const stats = {
    rowsSeen: 0,
    noDataId: 0,
    badPrice: 0,
    badYear: 0,
    duplicateSameId: 0,
    promoSuperSkipped: 0,
    derivationFailed: 0,
    withDate: 0,
    withCity: 0,
    withFuel: 0,
    withTransmission: 0,
    withKm: 0,
    damaged: 0,
  };

  let fileIdx = 0;
  for (const filePath of files) {
    fileIdx++;
    if (fileIdx % 500 === 0) console.log(`  ... ${fileIdx}/${files.length} dosya`);

    const relative = path.relative(DESKTOP_DIR, filePath);
    const folderMake = relative.split(path.sep)[0] || '';
    const fileName = path.basename(filePath, '.html');

    let html: string;
    try {
      html = fs.readFileSync(filePath, 'utf8');
    } catch (err: any) {
      quarantined.push({
        rawListingId: `FILE_${fileName}`,
        rawMake: folderMake,
        rawModel: fileName,
        rawVariant: null,
        rawTitle: null,
        sourceFile: filePath,
        reason: `DOSYA_OKUNAMADI: ${err.message || String(err)}`,
      });
      continue;
    }

    try {
      // Yalnizca sonuc tablosu yuklenir; sayfadaki reklam/filtre TL rakamlari
      // bu sayede fiyat havuzuna hic girmez.
      const tableMatch =
        html.match(/<table[^>]*id=["']searchResultsTable["'][\s\S]*?<\/table>/i) ||
        html.match(/<table[^>]*>[\s\S]*?<\/table>/i);
      const $ = cheerio.load(tableMatch ? tableMatch[0] : html);
      const rows = $('tr[data-id]');

      rows.each((_, el) => {
        stats.rowsSeen++;
        const tr = $(el);
        const dataId = (tr.attr('data-id') || '').trim();
        if (!dataId) {
          stats.noDataId++;
          return;
        }

        // "Vitrin" (searchResultsPromoSuper) satirlari ORGANIK sonuc DEGILDIR:
        // Sahibinden bunlari farkli kategorilerdeki sayfalara reklam olarak
        // enjekte eder ve ayni data-id farkli sayfalarda BASKA bir araci
        // gosterir. Sayfanin model/motor/paket bilgisiyle etiketlenirlerse
        // fiyat havuzuna yanlis arac girer.
        // Olculen: 872 PromoSuper id'sinin 646'si (%74) celisen arac verisi
        // tasiyor. PromoHighlight/PromoBold ise gercek organik ilanlardir
        // (yalnizca one cikarilmis) ve KORUNUR.
        const rowClass = tr.attr('class') || '';
        if (/searchResultsPromoSuper/i.test(rowClass)) {
          stats.promoSuperSkipped++;
          return;
        }

        const title = tr.find('td.searchResultsTitleValue').text().trim();
        const priceText = tr.find('td.searchResultsPriceValue').first().text().trim();
        const price = parseIntSafe(priceText);

        if (!Number.isFinite(price) || price < PRICE_MIN || price > PRICE_MAX) {
          stats.badPrice++;
          quarantined.push({
            rawListingId: dataId,
            rawMake: folderMake,
            rawModel: fileName,
            rawVariant: null,
            rawTitle: title || null,
            sourceFile: filePath,
            reason: `GECERSIZ_FIYAT: "${priceText}"`,
          });
          return;
        }

        const attrs = tr
          .find('td.searchResultsAttributeValue')
          .map((__, cell) => $(cell).text().trim())
          .get();

        const year = parseIntSafe(attrs[0] || '');
        if (!Number.isFinite(year) || year < YEAR_MIN || year > YEAR_MAX) {
          stats.badYear++;
          quarantined.push({
            rawListingId: dataId,
            rawMake: folderMake,
            rawModel: fileName,
            rawVariant: null,
            rawTitle: title || null,
            sourceFile: filePath,
            reason: `GECERSIZ_YIL: "${attrs[0] || ''}"`,
          });
          return;
        }

        let mileageKm: number | null = null;
        const kmParsed = parseIntSafe(attrs[1] || '');
        if (
          Number.isFinite(kmParsed) &&
          kmParsed >= 0 &&
          kmParsed <= KM_MAX &&
          kmParsed !== year &&
          kmParsed !== price
        ) {
          mileageKm = kmParsed;
          stats.withKm++;
        }

        // Sahibinden MARKA duzeyindeki sayfalarda satir IKI tag hucresi tasir:
        //   [0] model            (orn. "Giulietta")
        //   [1] motor + paket    (orn. "1.4 TB MultiAir Distinctive")
        // MODEL duzeyindeki sayfalarda ise tek hucre vardir ve model sayfa
        // basligindan gelir. Ilk hucreyi kosulsuz "paket" saymak, marka duzeyi
        // sayfalarin TAMAMINI karantinaya dusuruyordu (MODEL_TESPIT_EDILEMEDI).
        const tagCells = tr
          .find('td.searchResultsTagAttributeValue')
          .map((__, cell) => $(cell).text().trim())
          .get()
          .filter(Boolean);
        // Ilk hucre HER ZAMAN model adayidir; deriveFromSource bunu YALNIZCA
        // sayfa basligi model vermediginde kullanir. Bazi marka duzeyi
        // sayfalarda (orn. Kuba, Regal Raptor) tek hucre bulunur ve o hucre
        // motor/paket degil MODELDIR.
        const listingRowModel = tagCells[0] || '';
        const tagTrim = (tagCells.length > 1 ? tagCells.slice(1).join(' ') : tagCells[0]) || '';

        const dateText = tr.find('td.searchResultsDateValue').first().text().trim();
        const scrapedAt = parseTurkishListingDate(dateText.replace(/\s+/g, ' '));
        if (scrapedAt) stats.withDate++;

        const locHtml = tr.find('td.searchResultsLocationValue').first().html() || '';
        const locText = locHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
        const { city } = parseLocation(locText);
        if (city) stats.withCity++;

        const derived = deriveFromSource({
          folderMake,
          pageTitleOrFileName: fileName,
          listingTagTrim: tagTrim,
          listingTitle: title,
          listingRowModel,
          knownMakes: discoveredMakes,
        });

        if (!derived.isValid) {
          stats.derivationFailed++;
          quarantined.push({
            rawListingId: dataId,
            rawMake: folderMake,
            rawModel: fileName,
            rawVariant: tagTrim || null,
            rawTitle: title || null,
            sourceFile: filePath,
            reason: derived.rejectReason || 'TURETME_BASARISIZ',
          });
          return;
        }

        const rowText = foldTurkish(tr.text());
        const isDamaged = DAMAGE_TOKENS.some((t) => rowText.includes(t));
        if (isDamaged) stats.damaged++;
        if (derived.fuelType) stats.withFuel++;
        if (derived.transmission) stats.withTransmission++;

        const missing: string[] = [];
        if (mileageKm === null) missing.push('mileageKm');
        if (!derived.engineCode) missing.push('engineCode');
        if (!derived.fuelType) missing.push('fuelType');
        if (!derived.transmission) missing.push('transmission');
        if (!scrapedAt) missing.push('listingDate');

        const record: ParsedListing = {
          sourceListingId: dataId,
          sourceFile: filePath,
          rawMake: derived.make,
          rawModel: derived.model,
          rawVariant: derived.engineCode,
          rawTitle: title,
          canonicalMake: derived.make,
          canonicalModel: derived.model,
          canonicalVariant: derived.engineCode,
          canonicalTrim: derived.trim,
          canonicalFuelType: derived.fuelType,
          canonicalTransmission: derived.transmission,
          // Kasa tipi ICE AKTARIMDA turetilir. Aksi halde her rebuild
          // canonicalBodyType alanini sifirlar ve kasa bilgisi ancak ayri bir
          // backfill calistirilirsa geri gelir (import idempotent olmaz).
          // Yalniz ACIK metin sinyali kullanilir; sinyal yoksa '' (UNKNOWN).
          canonicalBodyType: deriveBodyTypeFromSources(derived.model, title),
          year,
          mileageKm,
          price,
          city: city || null,
          isDamaged,
          scrapedAt,
          // Marka/model/yil/fiyat ayristirilabildiyse ilan gecerlidir.
          // Motor kodu eksikse ilan yok sayilmaz; emsal esleme motoru zaten
          // hedef aracin motoru bilindiginde motorsuz ilanlari havuza almaz.
          parseStatus: 'VALID',
          parseWarnings: missing.length ? `Eksik alan: ${missing.join(', ')}` : null,
          missingFields: missing.length ? missing.join(',') : null,
        };

        const existing = byId.get(dataId);
        if (existing) {
          stats.duplicateSameId++;
          // Ayni ilan birden fazla sayfada yer alabilir; en guncel tarihli kaydi tut.
          const a = existing.scrapedAt ? existing.scrapedAt.getTime() : 0;
          const b = scrapedAt ? scrapedAt.getTime() : 0;
          if (b > a) byId.set(dataId, record);
          return;
        }
        byId.set(dataId, record);
      });
    } catch (err: any) {
      quarantined.push({
        rawListingId: `PARSE_ERROR_${fileName}`,
        rawMake: folderMake,
        rawModel: fileName,
        rawVariant: null,
        rawTitle: null,
        sourceFile: filePath,
        reason: `PARSER_EXCEPTION: ${err.message || String(err)}`,
      });
    }
  }

  // Ayni araca ait yeniden yayinlanmis ilanlari (farkli data-id, ayni imza) ele
  const signature = new Map<string, string>();
  const relistDuplicates: string[] = [];
  for (const [id, rec] of byId) {
    const sig = [
      foldTurkish(rec.rawTitle || ''),
      rec.price,
      rec.year,
      rec.mileageKm ?? 'x',
      foldTurkish(rec.rawMake),
      foldTurkish(rec.rawModel),
    ].join('|');
    if (!rec.rawTitle) continue;
    const prev = signature.get(sig);
    if (prev) {
      relistDuplicates.push(id);
      quarantined.push({
        rawListingId: id,
        rawMake: rec.rawMake,
        rawModel: rec.rawModel,
        rawVariant: rec.rawVariant,
        rawTitle: rec.rawTitle,
        sourceFile: rec.sourceFile,
        reason: `MUKERRER_YENIDEN_YAYIN (asıl ilan: ${prev})`,
      });
    } else {
      signature.set(sig, id);
    }
  }
  for (const id of relistDuplicates) byId.delete(id);

  const records = Array.from(byId.values());
  const validCount = records.filter((r) => r.parseStatus === 'VALID').length;
  const cov = {
    date: records.filter((r) => r.scrapedAt).length,
    city: records.filter((r) => r.city).length,
    km: records.filter((r) => r.mileageKm !== null).length,
    fuel: records.filter((r) => r.canonicalFuelType).length,
    body: records.filter((r) => r.canonicalBodyType).length,
    trans: records.filter((r) => r.canonicalTransmission).length,
    engine: records.filter((r) => r.rawVariant).length,
  };

  console.log('\n--- AYRIŞTIRMA ÖZETİ ---');
  console.log(`  Taranan ilan satırı        : ${stats.rowsSeen}`);
  console.log(`  Tekil ilan (data-id)       : ${records.length}`);
  console.log(`    - VALID                  : ${validCount}`);
  console.log(`    - motor kodu olmayan     : ${records.filter((r) => !r.rawVariant).length}`);
  console.log(`  Aynı data-id tekrarı       : ${stats.duplicateSameId}`);
  console.log(`  Vitrin (PromoSuper) elenen : ${stats.promoSuperSkipped}`);
  console.log(`  Yeniden yayın mükerrer     : ${relistDuplicates.length}`);
  console.log(`  Karantina                  : ${quarantined.length}`);
  console.log(`    - geçersiz fiyat         : ${stats.badPrice}`);
  console.log(`    - geçersiz yıl           : ${stats.badYear}`);
  console.log(`    - marka/model türetilemedi: ${stats.derivationFailed}`);
  console.log(`  Ağır hasarlı işaretli      : ${stats.damaged}`);
  console.log('\n--- ALAN DOLULUĞU ---');
  const pct = (n: number) => `${((n / Math.max(1, records.length)) * 100).toFixed(1)}%`;
  console.log(`  ilan tarihi : ${cov.date} (${pct(cov.date)})`);
  console.log(`  şehir       : ${cov.city} (${pct(cov.city)})`);
  console.log(`  kilometre   : ${cov.km} (${pct(cov.km)})`);
  console.log(`  motor kodu  : ${cov.engine} (${pct(cov.engine)})`);
  console.log(`  yakıt       : ${cov.fuel} (${pct(cov.fuel)})`);
  console.log(`  şanzıman    : ${cov.trans} (${pct(cov.trans)})`);
  console.log(`  kasa tipi   : ${cov.body} (${pct(cov.body)})`);

  if (dryRun) {
    console.log('\n[--dry-run] Veritabanı değiştirilmedi.');
    await prisma.$disconnect();
    return;
  }

  console.log('\n--- VERİTABANI YAZIMI ---');
  try { await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 60000;'); } catch { /* pragma opsiyoneldir */ }

  const before = await prisma.rawVehicleListing.count();
  console.log(`  Mevcut kayıt: ${before} -> yeniden kurulacak`);

  await prisma.rawVehicleListing.deleteMany({});
  await prisma.quarantinedListing.deleteMany({});

  const CHUNK = 1000;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK).map((r) => ({
      source: 'SAHIBINDEN_HTML',
      sourceListingId: r.sourceListingId,
      sourceFile: r.sourceFile,
      rawMake: r.rawMake,
      rawModel: r.rawModel,
      rawVariant: r.rawVariant,
      rawTitle: r.rawTitle,
      canonicalMake: r.canonicalMake,
      canonicalModel: r.canonicalModel,
      canonicalVariant: r.canonicalVariant,
      canonicalTrim: r.canonicalTrim,
      canonicalBodyType: r.canonicalBodyType,
      canonicalFuelType: r.canonicalFuelType,
      canonicalTransmission: r.canonicalTransmission,
      year: r.year,
      mileageKm: r.mileageKm,
      price: r.price,
      city: r.city,
      isDamaged: r.isDamaged,
      parseStatus: r.parseStatus,
      parseWarnings: r.parseWarnings,
      missingFields: r.missingFields,
      scrapedAt: r.scrapedAt,
    }));
    await prisma.rawVehicleListing.createMany({ data: chunk });
    if ((i / CHUNK) % 20 === 0) console.log(`  ... ${Math.min(i + CHUNK, records.length)}/${records.length}`);
  }

  const qSeen = new Set<string>();
  const qRecords = quarantined.filter((q) => {
    const k = `${q.rawListingId}|${q.reason}`;
    if (qSeen.has(k)) return false;
    qSeen.add(k);
    return true;
  });
  for (let i = 0; i < qRecords.length; i += CHUNK) {
    await prisma.quarantinedListing.createMany({
      data: qRecords.slice(i, i + CHUNK).map((q) => ({
        source: 'SAHIBINDEN_HTML',
        rawListingId: q.rawListingId,
        rawMake: q.rawMake,
        rawModel: q.rawModel,
        rawVariant: q.rawVariant,
        rawTitle: q.rawTitle,
        sourceFile: q.sourceFile,
        reason: q.reason,
      })),
    });
  }

  const after = await prisma.rawVehicleListing.count();
  const afterQ = await prisma.quarantinedListing.count();
  console.log(`\n✓ RawVehicleListing: ${after} kayıt`);
  console.log(`✓ QuarantinedListing: ${afterQ} kayıt`);

  await prisma.$disconnect();
  console.log('\n✓ TAMAMLANDI.\n');
}

main().catch((e) => {
  console.error('\n❌ HATA:', e);
  process.exit(1);
});
