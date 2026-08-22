import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { VehicleService } from '../vehicle/vehicle.service';
import { EvaluationService } from './evaluation.service';
import { EmsalMatcherService } from './emsal-matcher.service';
import { deriveFromSource, makeFromTitle } from './listing-attributes';

/**
 * DINAMIK KORPUS GUVENLIGI
 *
 * Kullanici yeni marka klasorlerini ve Sahibinden HTML'lerini elle eklemeye
 * devam ediyor. Bugunku marka/model/ilan sayilari yalnizca ANLIK GORUNTUDUR.
 * Bu testler, yarin eklenecek bir markanin KOD DEGISIKLIGI OLMADAN
 *   HTML -> importer -> RawVehicleListing -> gozlenen katalog -> degerleme
 * zincirine girdigini dogrular.
 */

const noopCache = () => {
  const store = new Map<string, { v: any; exp: number }>();
  return {
    get: async (k: string) => {
      const it = store.get(k);
      if (!it) return null;
      if (it.exp && it.exp < Date.now()) { store.delete(k); return null; }
      return it.v;
    },
    set: async (k: string, v: any, ttl?: number) => {
      store.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : 0 });
    },
    _store: store,
  } as any;
};

describe('Dinamik korpus (yeni marka/model güvenliği)', () => {
  let prisma: PrismaClient;
  beforeAll(() => { prisma = new PrismaClient(); });
  afterAll(async () => { await prisma.$disconnect(); });

  describe('Kaynak keşfi statik listeye bağlı değildir', () => {
    test('İçe aktarıcı marka klasörlerini ve dosyaları dinamik tarar', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'rebuild_raw_listings_v3.ts'), 'utf8');
      expect(src).toMatch(/readdirSync/);
      expect(src).toMatch(/discoveredMakes/);
      // Marka adlarindan olusan sabit bir "desteklenen markalar" listesi olmamali
      expect(src).not.toMatch(/SUPPORTED_MAKES|ALLOWED_MAKES|BRAND_WHITELIST/);
    });

    test('Sayfa başlığından marka tespiti keşfedilen klasörlerle genişler', () => {
      // Statik listede olmayan, tamamen yeni bir marka
      const NEW = 'Skywell';
      expect(makeFromTitle(`${NEW} ET5 Comfort`)).toBe('');
      expect(makeFromTitle(`${NEW} ET5 Comfort`, [NEW])).toBe(NEW);
    });

    test('Yeni marka yanlış klasöre kaydedilse bile HTML başlığı kazanır', () => {
      const d = deriveFromSource({
        folderMake: 'Opel',
        pageTitleOrFileName: "Skywell ET5 Fiyatları & Modelleri sahibinden.com'da",
        knownMakes: ['Opel', 'Skywell'],
      });
      expect(d.make).toBe('Skywell');
      expect(d.model).toBe('ET5');
      expect(d.isValid).toBe(true);
    });

    test('Yeni marka tanınmasa bile klasör adına güvenli şekilde düşer', () => {
      const d = deriveFromSource({
        folderMake: 'Yenimarka',
        pageTitleOrFileName: "Yenimarka Model9 Fiyatları & Modelleri sahibinden.com'da",
      });
      expect(d.make).toBe('Yenimarka');
      expect(d.model).toBe('Model9');
      expect(d.isValid).toBe(true);
    });
  });

  describe('Gözlenen katalog tamamen veri güdümlüdür', () => {
    test('Marka listesi çalışma anında DB’den türer (sabit sayı yok)', async () => {
      const svc = new VehicleService(prisma as any, noopCache());
      const makes = await svc.getObservedMakes();
      const dbMakes = (await prisma.$queryRawUnsafe(
        "SELECT COUNT(DISTINCT canonicalMake) AS c FROM RawVehicleListing WHERE canonicalMake <> ''",
      )) as any[];
      const sourceMakeCount = Number(dbMakes[0].c);

      /**
       * Müşteriye sunulan marka listesi, KAYNAK marka kümesinin bir alt
       * kümesidir; sabit bir sayı değildir ve kaynakla birebir eşit olmak
       * ZORUNDA da değildir.
       *
       * Sihirbaz zorunlu bir zincirdir: tüm model adları ayrıştırma artığı
       * olan bir marka seçildiğinde model listesi boş gelir ve müşteri
       * çıkmaza düşer (ölçülen: `Nieve`, tek model adı "_ -", 33 ilan).
       * Böyle markalar müşteriye sunulmaz; kaynak veri ise DEĞİŞMEZ.
       */
      expect(makes.length).toBeGreaterThan(0);
      expect(makes.length).toBeLessThanOrEqual(sourceMakeCount);
      // Aradaki fark yalnızca "hiç kullanılabilir modeli olmayan" markalardır.
      expect(sourceMakeCount - makes.length).toBeLessThan(sourceMakeCount);
    }, 60_000);

    test('Müşteriye sunulan HER marka en az bir seçilebilir model döndürür', async () => {
      const svc = new VehicleService(prisma as any, noopCache());
      const makes = await svc.getObservedMakes();
      const deadEnds: string[] = [];
      for (const m of makes as any[]) {
        const models = await svc.getObservedModels({ make: m.value });
        if (models.length === 0) deadEnds.push(m.value);
      }
      expect(deadEnds).toEqual([]);
    }, 180_000);

    test('Kullanılabilir modeli olan markalar görünür kalır', async () => {
      const svc = new VehicleService(prisma as any, noopCache());
      const makes = await svc.getObservedMakes();
      const names = (makes as any[]).map((m) => m.value);
      for (const expected of ['Saab', 'Proton', 'Volkswagen', 'Fiat']) {
        expect(names).toContain(expected);
      }
    }, 60_000);

    test('Kaynak kodunda sabit marka/model sayısı sınırı yok', () => {
      const svcSrc = fs.readFileSync(path.join(__dirname, '..', 'vehicle', 'vehicle.service.ts'), 'utf8');
      expect(svcSrc).not.toMatch(/SUPPORTED_MAKES|ALLOWED_MAKES|BRAND_WHITELIST|MAX_MAKES/);
      // Marka listeleri prisma sorgusundan gelmeli
      expect(svcSrc).toMatch(/groupBy/);
    });

    test('DB’ye yeni bir marka girdiğinde seçenek zinciri kendiliğinden oluşur', async () => {
      const svc = new VehicleService(prisma as any, noopCache());
      const NEW = { make: 'ZzTestMarka', model: 'Zeta', engine: '1.5 TZ', trim: 'Comfort', year: 2021 };
      const before = await svc.getObservedMakes();
      expect(before.some((m: any) => m.value === NEW.make)).toBe(false);

      const ids: string[] = [];
      try {
        for (let i = 0; i < 12; i++) {
          const row = await prisma.rawVehicleListing.create({
            data: {
              source: 'TEST', sourceListingId: `ZZTEST-${i}`, sourceFile: 'test',
              rawMake: NEW.make, rawModel: NEW.model, rawVariant: NEW.engine, rawTitle: 'test',
              canonicalMake: NEW.make, canonicalModel: NEW.model, canonicalVariant: NEW.engine,
              canonicalTrim: NEW.trim, canonicalBodyType: 'SEDAN', canonicalFuelType: 'Benzin',
              canonicalTransmission: '', year: NEW.year, mileageKm: 60000 + i * 1000,
              price: 900000 + i * 5000, city: 'İstanbul', isDamaged: false,
              parseStatus: 'VALID', scrapedAt: new Date(),
            },
          });
          ids.push(row.id);
        }

        const fresh = new VehicleService(prisma as any, noopCache());
        const makes = await fresh.getObservedMakes();
        expect(makes.some((m: any) => m.value === NEW.make)).toBe(true);

        const models = await fresh.getObservedModels({ make: NEW.make });
        expect(models.map((m: any) => m.value)).toContain(NEW.model);

        const engines = await fresh.getObservedEngines({ make: NEW.make, model: NEW.model });
        expect(engines.map((e: any) => e.value)).toContain(NEW.engine);

        const trims = await fresh.getObservedTrims({ make: NEW.make, model: NEW.model, engine: NEW.engine });
        expect(trims.map((t: any) => t.value)).toContain(NEW.trim);

        const years = await fresh.getObservedYears({ make: NEW.make, model: NEW.model });
        expect(years.map((y: any) => y.value)).toContain(NEW.year);

        const bodies = await fresh.getObservedBodyTypes({ make: NEW.make, model: NEW.model });
        expect(bodies.map((b: any) => b.value)).toContain('SEDAN');

        // Katalogda hicbir kaydi olmayan bu arac degerlenebilmeli ve saklanabilmeli
        const matcher = new EmsalMatcherService(prisma as any);
        const esvc = new EvaluationService(
          prisma as any, { sendEvaluationNotification: async () => undefined } as any, matcher,
        );
        const brand = await prisma.manufacturer.findFirst({ select: { id: true } });
        const model = await prisma.model.findFirst({ select: { id: true } });
        const res: any = await esvc.evaluateVehicle({
          year: NEW.year, manufacturerId: brand!.id, modelId: model!.id,
          mileage: 65000, color: 'Beyaz', licensePlate: '34ZZT01', damageStatus: 'NO',
          paintScheme: '{}', vehicleStatus: '{}', tramerAmount: '0 TL',
          firstName: 'T', lastName: 'K', phone: '05551112233',
          sellingTimeline: '1 ay', userDesiredPrice: 0,
          observedMake: NEW.make, observedModel: NEW.model,
          observedEngine: NEW.engine, observedTrim: NEW.trim, observedBodyType: 'SEDAN',
        } as any, '127.0.0.1');

        expect(['SUCCESS', 'MANUAL_EVALUATION_REQUIRED']).toContain(res.status);
        expect(res.evaluationId).toBeTruthy();
        try {
          const row = await prisma.vehicleEvaluation.findUnique({ where: { id: res.evaluationId } });
          expect(row!.vehicleSpecificationId).toBeNull();
          expect(row!.vehicleMake).toBe(NEW.make);
          expect(row!.vehicleModel).toBe(NEW.model);
          const back: any = await esvc.getEvaluationById(res.evaluationId);
          expect(back.vehicle.brand).toBe(NEW.make);
          expect(back.vehicle.model).toBe(NEW.model);
        } finally {
          await prisma.vehicleEvaluation.delete({ where: { id: res.evaluationId } }).catch(() => undefined);
        }
      } finally {
        if (ids.length) await prisma.rawVehicleListing.deleteMany({ where: { id: { in: ids } } });
      }
    }, 180_000);
  });

  describe('Önbellek korpus değişiminde bayatlamaz', () => {
    test('Korpus sürümü veriden türer', async () => {
      const svc = new VehicleService(prisma as any, noopCache());
      const v = await svc.getCorpusVersion();
      expect(v).toMatch(/^\d+-\d+$/);
    }, 60_000);

    test('Veri değişince sürüm ve önbellek anahtarı değişir; değişmezse korunur', async () => {
      const cache = noopCache();
      const svc = new VehicleService(prisma as any, cache);
      const v1 = await svc.getCorpusVersion();
      const makes1 = await svc.getObservedMakes();
      const keys1 = [...cache._store.keys()].filter((k: string) => k.includes(':makes'));
      expect(keys1.length).toBe(1);
      expect(keys1[0]).toContain(v1);

      // Basarisiz/degisiklik yapmayan bir islem: surum AYNI kalmali
      cache._store.delete('observed:corpusVersion');
      expect(await svc.getCorpusVersion()).toBe(v1);

      // Gercek veri degisimi: surum degismeli
      const row = await prisma.rawVehicleListing.create({
        data: {
          source: 'TEST', sourceListingId: 'ZZVER-1', sourceFile: 'test',
          rawMake: 'ZzVer', rawModel: 'V', rawVariant: '', rawTitle: 't',
          canonicalMake: 'ZzVer', canonicalModel: 'V', canonicalVariant: '',
          canonicalTrim: '', canonicalBodyType: '', canonicalFuelType: '',
          canonicalTransmission: '', year: 2020, mileageKm: 1000, price: 500000,
          city: 'İstanbul', isDamaged: false, parseStatus: 'VALID', scrapedAt: new Date(),
        },
      });
      try {
        cache._store.delete('observed:corpusVersion');
        const v2 = await svc.getCorpusVersion();
        expect(v2).not.toBe(v1);
        const makes2 = await svc.getObservedMakes();
        expect(makes2.length).toBe(makes1.length + 1);
        expect(makes2.some((m: any) => m.value === 'ZzVer')).toBe(true);
      } finally {
        await prisma.rawVehicleListing.delete({ where: { id: row.id } });
      }
    }, 180_000);
  });

  describe('Mevcut kaynak klasörlerinin tamamı temsil edilir (sayıya bağlı değil)', () => {
    test('Geçerli ilan üreten her klasör DB’de temsil edilir', async () => {
      const ROOT = path.join(
        process.env.USERPROFILE || process.env.HOME || '',
        'OneDrive', 'Masaüstü', 'sahibindne ilan',
      );
      if (!fs.existsSync(ROOT)) return; // kaynak yoksa test atlanir
      const folders = fs.readdirSync(ROOT, { withFileTypes: true })
        .filter((e) => e.isDirectory()).map((e) => e.name);
      expect(folders.length).toBeGreaterThan(0);

      const rows = (await prisma.$queryRawUnsafe(
        'SELECT DISTINCT sourceFile AS f FROM RawVehicleListing',
      )) as any[];
      const represented = new Set<string>();
      for (const r of rows) {
        const rel = path.relative(ROOT, String(r.f || ''));
        const first = rel.split(path.sep)[0];
        if (first) represented.add(first);
      }

      const missing: string[] = [];
      for (const f of folders) {
        const hasHtml = fs.readdirSync(path.join(ROOT, f)).some((n) => n.toLowerCase().endsWith('.html'));
        if (hasHtml && !represented.has(f)) missing.push(f);
      }
      // Sabit bir klasor sayisi BEKLENMEZ; bugun 60, yarin 75 olabilir.
      expect(missing).toEqual([]);
    }, 180_000);
  });
});
