import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { deriveBodyType, deriveBodyTypeFromSources, normalizeBodyType } from './listing-attributes';
import { EmsalMatcherService } from './emsal-matcher.service';

/** Importer'daki Vitrin eleme kurali ile AYNI predicate. */
const isPromoSuper = (cls: string) => /searchResultsPromoSuper/i.test(cls);

describe('İçe aktarma bütünlüğü', () => {
  describe('Vitrin (PromoSuper) reklam satırları', () => {
    // Gercek HTML'de gozlenen sinif dizeleri
    const REAL_CLASSES = {
      normal: 'searchResultsItem',
      promoSuper: 'searchResultsItem searchResultsPromoSuper',
      promoSuperCombo: 'searchResultsItem searchResultsPromoSuper  searchResultsPromoHighlight searchResultsPromoBold',
      highlight: 'searchResultsItem searchResultsPromoHighlight searchResultsPromoBold',
      fireSale: 'searchResultsItem    searchResultsFireSale',
    };

    test('Vitrin satırları elenir (farklı kategoriden enjekte edilen reklam)', () => {
      expect(isPromoSuper(REAL_CLASSES.promoSuper)).toBe(true);
      expect(isPromoSuper(REAL_CLASSES.promoSuperCombo)).toBe(true);
    });

    test('Öne çıkarılmış GERÇEK ilanlar elenmez (veri kaybı olmamalı)', () => {
      // PromoHighlight/PromoBold = organik sonuc, yalnizca vurgulanmis.
      expect(isPromoSuper(REAL_CLASSES.highlight)).toBe(false);
      expect(isPromoSuper(REAL_CLASSES.normal)).toBe(false);
      expect(isPromoSuper(REAL_CLASSES.fireSale)).toBe(false);
    });

    test('Üretim importer’ı Vitrin filtresini içerir', () => {
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'scripts', 'rebuild_raw_listings_v3.ts'),
        'utf8',
      );
      expect(src).toMatch(/searchResultsPromoSuper/);
      expect(src).toMatch(/promoSuperSkipped/);
    });

    test('Kasa tipi İÇE AKTARIMDA türetilir (rebuild alanı sıfırlamaz)', () => {
      // GERCEK BASARISIZLIK: importer canonicalBodyType alanina her zaman ''
      // yaziyordu ve tablo her rebuild'de silinip yeniden kuruluyordu; kasa
      // bilgisi ancak ayrica backfill calistirilirsa geri geliyordu.
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'scripts', 'rebuild_raw_listings_v3.ts'),
        'utf8',
      );
      expect(src).toMatch(/canonicalBodyType: deriveBodyTypeFromSources\(/);
      expect(src).not.toMatch(/canonicalBodyType: '',/);
    });
  });

  describe('Eski güvensiz HTML fiyat içe aktarıcıları devre dışıdır', () => {
    // Bu iki script fiyati ilan satirinin kendi hucresinden DEGIL, sayfanin
    // TAMAMINDAN bir TL regex'i ile topluyordu (reklam/vitrin fiyati, kredi
    // taksiti, kapora, baska araclarin fiyatlari). Dosyalar gecmis referansi
    // icin saklaniyor; dogrudan calistirilirsa DB'ye hicbir sey yazmadan
    // hata verip cikmalilar.
    const LEGACY = ['force_sync_desktop_folders_to_db.ts', 'import_all_26_desktop_brands.ts'];

    for (const name of LEGACY) {
      const src = () => fs.readFileSync(path.join(__dirname, '..', 'scripts', name), 'utf8');

      test(`${name} doğrudan çalıştırılamaz`, () => {
        const s = src();
        expect(s).toMatch(/if \(require\.main === module\)/);
        expect(s).toMatch(/DEPRECATED/);
        expect(s).toMatch(/process\.exit\(1\)/);
      });

      test(`${name} engeli, veritabanı erişiminden ÖNCE gelir`, () => {
        const s = src();
        const guard = s.indexOf('process.exit(1)');
        const firstDbUse = Math.min(
          ...['new PrismaClient(', 'prisma.'].map((t) => {
            const i = s.indexOf(t);
            return i === -1 ? Number.MAX_SAFE_INTEGER : i;
          }),
        );
        expect(guard).toBeGreaterThan(-1);
        expect(guard).toBeLessThan(firstDbUse);
      });
    }

    test('Üretim npm script’leri yalnız V3 içe aktarıcısını çağırır', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
      const importScripts = Object.values(pkg.scripts as Record<string, string>)
        .filter((v) => /import|rebuild/i.test(v));
      expect(importScripts.length).toBeGreaterThan(0);
      for (const cmd of importScripts) {
        expect(cmd).not.toMatch(/force_sync_desktop_folders_to_db|import_all_26_desktop_brands/);
      }
    });
  });

  describe('Kasa tipi (body type) türetme', () => {
    test('Yalnızca AÇIK sinyalden türetilir; model adından tahmin YAPILMAZ', () => {
      expect(deriveBodyType('3 Serisi', '320i M Sport')).toBe(''); // sedan varsayimi YOK
      expect(deriveBodyType('Focus', '1.6 TDCi Titanium')).toBe(''); // hatchback varsayimi YOK
      expect(deriveBodyType('A3 A3 Sportback')).toBe('SPORTBACK');
      expect(deriveBodyType('4 Serisi', '420d Cabrio')).toBe('CABRIO');
    });

    test('Gran Coupe, Coupe ile karıştırılmaz', () => {
      expect(deriveBodyType('4 Serisi 420i Gran Coupe')).toBe('GRAN_COUPE');
      expect(deriveBodyType('4 Serisi 420i Coupe')).toBe('COUPE');
    });

    test('Sportback körü körüne Hatchback’e birleştirilmez', () => {
      expect(deriveBodyType('A3 Sportback')).toBe('SPORTBACK');
      expect(deriveBodyType('A3 Hatchback')).toBe('HATCHBACK');
      expect(deriveBodyType('A3 Sportback')).not.toBe(deriveBodyType('A3 Hatchback'));
    });

    test('Çelişen sinyal UNKNOWN bırakılır (yanlış canonical üretilmez)', () => {
      expect(deriveBodyType('Golf', 'sedan mi hatchback mi belirsiz')).toBe('');
    });

    test('Kısa tokenlar yalnız bağımsız kelime olarak kabul edilir', () => {
      expect(deriveBodyType('', 'A6 SW 2.0 TDI')).toBe('STATION_WAGON');
      expect(deriveBodyType('', 'A3 HB otomatik')).toBe('HATCHBACK');
      // substring false-positive olmamali
      expect(deriveBodyType('', 'Swift')).toBe('');
      expect(deriveBodyType('', 'Highbrid')).toBe('');
    });

    test('Model metni ilan başlığına göre önceliklidir', () => {
      // "A3 Hatchback" modelindeki ilan, basliginda "coupe" gecse bile COUPE olamaz
      expect(deriveBodyTypeFromSources('A3 A3 Hatchback', 'ORJİNAL S-line COUPE TASARIM')).toBe('HATCHBACK');
    });

    test('"Cross" bir kasa adı değildir (donanım paketi) — SUV üretmez', () => {
      // GERCEK BASARISIZLIK: /(suv|cross)/ deseni Fiat 500L "Cross Plus",
      // Egea Cross gibi hatchback araclari SUV etiketliyordu.
      expect(deriveBodyType('500 Ailesi', '500L CROSS PLUS FULL 2021 ÇIKIŞLI')).toBe('');
      expect(deriveBodyType('Egea', 'Egea Cross 1.6 Multijet')).toBe('');
      expect(deriveBodyType('', 'Volkswagen Polo Cross')).toBe('');
      // Acikca SUV yaziyorsa kabul edilir
      expect(deriveBodyType('', 'Tucson SUV 1.6 CRDi')).toBe('SUV');
    });

    test('Katalog/müşteri kasa adı normalize edilir', () => {
      expect(normalizeBodyType('Station Wagon')).toBe('STATION_WAGON');
      expect(normalizeBodyType('Sedan')).toBe('SEDAN');
      expect(normalizeBodyType('')).toBe('');
      expect(normalizeBodyType('Bilinmiyor')).toBe('');
    });
  });

  describe('Veritabanı bütünlük invariantları', () => {
    let prisma: PrismaClient;
    beforeAll(() => { prisma = new PrismaClient(); });
    afterAll(async () => { await prisma.$disconnect(); });

    test('sourceListingId tekildir (mükerrer ilan ağırlığı yok)', async () => {
      const r = (await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) t, COUNT(DISTINCT sourceListingId) u FROM RawVehicleListing`,
      )) as any[];
      expect(Number(r[0].t)).toBe(Number(r[0].u));
    });

    test('Uydurma sentinel değerler yok', async () => {
      const r = (await prisma.$queryRawUnsafe(`SELECT
        SUM(CASE WHEN canonicalTrim='Standart Paket' THEN 1 ELSE 0 END) a,
        SUM(CASE WHEN canonicalVariant='Standart' THEN 1 ELSE 0 END) b,
        SUM(CASE WHEN canonicalFuelType NOT IN ('','Dizel','Benzin','Hibrit','Elektrik','LPG') THEN 1 ELSE 0 END) c
        FROM RawVehicleListing`)) as any[];
      expect(Number(r[0].a)).toBe(0);
      expect(Number(r[0].b)).toBe(0);
      expect(Number(r[0].c)).toBe(0);
    });

    test('Katalogta olup ilanlarda hiç görülmeyen kasa etiketi emsalleri SİLMEZ', async () => {
      // GERCEK BASARISIZLIK: BMW 4 Serisi katalogta "Hatchback"/"Coupe" olarak
      // durur; ilanlarda ise GRAN_COUPE / COUPE / CABRIO gorunur. "Hatchback"
      // etiketiyle KATI eleme yapilinca kasasi BILINEN tum emsaller havuzdan
      // atiliyordu (Cabrio sahibi 4 Serisi icin gercek emsalleri kayboluyordu).
      const matcher = new EmsalMatcherService(prisma as any);
      const withCatalogLabel = await matcher.matchComparableListings({
        make: 'BMW', model: '4 Serisi', variant: '420d', year: 2014, mileageKm: 150000,
        bodyType: 'Hatchback',
      });
      const knownBodyComps = withCatalogLabel.cleanListings.filter((l) => l.bodyType);
      expect(knownBodyComps.length).toBeGreaterThan(0);
    }, 60_000);

    test('İlanlarda GERÇEKTEN görülen kasa etiketi farklı kasaları eler', async () => {
      const matcher = new EmsalMatcherService(prisma as any);
      const cabrio = await matcher.matchComparableListings({
        make: 'BMW', model: '4 Serisi', variant: '420d', year: 2014, mileageKm: 150000,
        bodyType: 'Cabrio',
      });
      const wrongBody = cabrio.cleanListings.filter((l) => l.bodyType && l.bodyType !== 'CABRIO');
      expect(wrongBody.length).toBe(0);
      expect(cabrio.cleanListings.some((l) => l.bodyType === 'CABRIO')).toBe(true);
    }, 60_000);

    test('canonicalBodyType yalnız izinli sınıflardan biri veya boş', async () => {
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT DISTINCT canonicalBodyType b FROM RawVehicleListing`,
      )) as any[];
      const allowed = ['', 'SEDAN', 'HATCHBACK', 'SPORTBACK', 'COUPE', 'GRAN_COUPE', 'CABRIO', 'STATION_WAGON', 'SUV'];
      for (const r of rows) expect(allowed).toContain(String(r.b ?? ''));
    });
  });
});
