import { PrismaClient } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { CANONICAL_BODY_TYPES, BODY_TYPE_LABELS } from './listing-attributes';
import { VehicleService } from '../vehicle/vehicle.service';
import { VehicleController } from '../vehicle/vehicle.controller';
import { EmsalMatcherService } from './emsal-matcher.service';

const noopCache = { get: async () => null, set: async () => undefined } as any;

describe('Müşteri girdisi bütünlüğü', () => {
  let prisma: PrismaClient;
  beforeAll(() => { prisma = new PrismaClient(); });
  afterAll(async () => { await prisma.$disconnect(); });

  describe('Kasa tipi sözlüğü tektir', () => {
    test('Canonical değerler ile etiketler birebir örtüşür', () => {
      expect(CANONICAL_BODY_TYPES.sort()).toEqual(
        ['CABRIO', 'COUPE', 'GRAN_COUPE', 'HATCHBACK', 'SEDAN', 'SPORTBACK', 'STATION_WAGON', 'SUV'].sort(),
      );
      for (const v of CANONICAL_BODY_TYPES) {
        expect(BODY_TYPE_LABELS[v]).toBeTruthy();
      }
    });
  });

  describe('DTO: observedBodyType doğrulaması', () => {
    const base = {
      year: 2014, manufacturerId: 'm', modelId: 'md', mileage: 100000, color: 'Beyaz',
      damageStatus: 'NO', licensePlate: '34ABC123', firstName: 'A', lastName: 'B',
      phone: '05551112233', sellingTimeline: '1 ay', userDesiredPrice: 1,
    };
    const errorsFor = async (v: any) => {
      const dto = plainToInstance(CreateEvaluationDto, { ...base, observedBodyType: v });
      const errs = await validate(dto);
      return errs.filter((e) => e.property === 'observedBodyType');
    };

    test('Canonical değerler kabul edilir', async () => {
      for (const v of CANONICAL_BODY_TYPES) expect(await errorsFor(v)).toHaveLength(0);
    });

    test('"UNKNOWN" (müşteri bilmiyor) kabul edilir', async () => {
      expect(await errorsFor('UNKNOWN')).toHaveLength(0);
    });

    test('Sözlük dışı değer reddedilir (enjeksiyon/serbest metin yok)', async () => {
      for (const v of ['Hatchback', 'sedan', 'MPV', "'; DROP TABLE", '../../etc']) {
        expect((await errorsFor(v)).length).toBeGreaterThan(0);
      }
    });

    test('Boş/eksik değer isteğe bağlıdır', async () => {
      expect(await errorsFor('')).toHaveLength(0);
      expect(await errorsFor(undefined)).toHaveLength(0);
    });
  });

  describe('Gözlenen kasa seçenekleri gerçek ilanlardan gelir', () => {
    const svc = () => new VehicleService(({} as any), noopCache);

    const options = async (brand: string, model: string, variant?: string, year?: number) => {
      const b = await prisma.manufacturer.findFirst({ where: { name: brand } });
      const m = await prisma.model.findFirst({ where: { name: model, manufacturerId: b?.id } });
      const v = variant ? await prisma.variant.findFirst({ where: { name: variant, modelId: m?.id } }) : null;
      const s = new VehicleService(prisma as any, noopCache);
      return s.getObservedBodyTypes({ brandId: b?.id, modelId: m?.id || '', variantId: v?.id, year });
    };

    test('BMW 4 Serisi 420d: Cabrio / Coupe / Gran Coupe seçilebilir', async () => {
      const out = await options('BMW', '4 Serisi', '420d', 2014);
      const values = out.map((o: any) => o.value);
      expect(values).toEqual(expect.arrayContaining(['CABRIO', 'COUPE', 'GRAN_COUPE']));
      for (const o of out) expect(o.listingCount).toBeGreaterThan(0);
    }, 60_000);

    test('Yalnız izin verilen canonical değerler döner, mükerrer yok', async () => {
      const out = await options('BMW', '4 Serisi', '420d', 2014);
      const values = out.map((o: any) => o.value);
      expect(new Set(values).size).toBe(values.length);
      for (const v of values) expect(CANONICAL_BODY_TYPES).toContain(v);
      expect(values).not.toContain('');
      expect(values).not.toContain('UNKNOWN');
    }, 60_000);

    test('Seçenekler ilan sayısına göre azalan sıralıdır', async () => {
      const out = await options('BMW', '4 Serisi', '420d', 2014);
      const counts = out.map((o: any) => o.listingCount);
      expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    }, 60_000);

    test('Bilinmeyen model için sahte seçenek üretilmez', async () => {
      expect(await svc().getObservedBodyTypes({ modelId: '' })).toEqual([]);
      const s = new VehicleService(prisma as any, noopCache);
      expect(await s.getObservedBodyTypes({ modelId: 'yok-boyle-bir-id' })).toEqual([]);
    }, 60_000);
  });

  describe('Gerçek ilan verisi müşteri kataloğunun kaynağıdır', () => {
    const svc = () => new VehicleService(prisma as any, noopCache);

    test('Katalogda Model kaydı olmayan gerçek araç seçilebilir (Fiat Egea)', async () => {
      // GERCEK BASARISIZLIK: 8.494 ilanlik Fiat Egea'nin katalogda hic Model
      // kaydi yok; musteri formunda arac tamamen kayboluyordu.
      const catalogRows = await prisma.model.count({
        where: { name: { startsWith: 'Egea' }, manufacturer: { name: 'Fiat' } },
      });
      expect(catalogRows).toBe(0);

      const models = await svc().getObservedModels({ make: 'Fiat' });
      const egea = models.find((m: any) => /^egea$/i.test(m.displayLabel));
      expect(egea).toBeDefined();
      expect(egea!.listingCount).toBeGreaterThan(1000);

      const engines = await svc().getObservedEngines({ make: 'Fiat', model: 'Egea' });
      expect(engines.length).toBeGreaterThan(0);
      const trims = await svc().getObservedTrims({ make: 'Fiat', model: 'Egea', engine: engines[0].value });
      expect(trims.length).toBeGreaterThan(0);
      const years = await svc().getObservedYears({ make: 'Fiat', model: 'Egea' });
      expect(years.length).toBeGreaterThan(0);
    }, 90_000);

    test('Katalog listeleri gözlenen seçeneklerle birleşir (marka/model)', async () => {
      const brands = await svc().getBrands();
      const fiat: any = brands.find((b: any) => b.name === 'Fiat');
      expect(fiat).toBeDefined();
      const models = await svc().getModels(fiat.id);
      const egea: any = models.find((m: any) => /^egea$/i.test(m.name));
      expect(egea).toBeDefined();
      expect(egea.id.startsWith('OBS:')).toBe(true);
    }, 90_000);

    test('Gözlenen seçenekler mükerrer üretmez', async () => {
      const models = await svc().getObservedModels({ make: 'Fiat' });
      const labels = models.map((m: any) => m.displayLabel.toLowerCase());
      expect(new Set(labels).size).toBe(labels.length);
    }, 90_000);

    test('Kısa model adı sınır duyarlı eşleşir (A3 -> A3 Sportback), rastgele eşleşmez', async () => {
      const engines = await svc().getObservedEngines({ make: 'Audi', model: 'A3' });
      expect(engines.length).toBeGreaterThan(0);
      const bodies = await svc().getObservedBodyTypes({ make: 'Audi', model: 'A3' });
      expect(bodies.map((b: any) => b.value)).toEqual(expect.arrayContaining(['SPORTBACK']));
      // Alakasiz kisa dize gercek model uretmemeli
      const junk = await svc().getObservedEngines({ make: 'Audi', model: 'zz' });
      expect(junk).toEqual([]);
    }, 90_000);

    test('A3 Sportback ve A3 Hatchback ayrı seçenek olarak kalır', async () => {
      const models = await svc().getObservedModels({ make: 'Audi' });
      const sb = models.find((m: any) => /A3 Sportback/i.test(m.displayLabel));
      const hb = models.find((m: any) => /A3 Hatchback/i.test(m.displayLabel));
      expect(sb).toBeDefined();
      expect(hb).toBeDefined();
      expect(sb!.value).not.toBe(hb!.value);
    }, 90_000);

    test('Geçersiz seçenek düzeyi reddedilir', async () => {
      const ctrl = new VehicleController(svc() as any, {} as any);
      await expect(ctrl.getObservedOptions('dosya-oku' as any)).rejects.toThrow();
      await expect(ctrl.getObservedOptions('' as any)).rejects.toThrow();
    });

    test('Aşırı uzun / bozuk girdi sessizce yok sayılır (enjeksiyon yüzeyi yok)', async () => {
      const ctrl = new VehicleController(svc() as any, {} as any);
      const long = 'x'.repeat(500);
      await expect(ctrl.getObservedOptions('models', long)).resolves.toEqual([]);
      await expect(ctrl.getObservedOptions('engines', "Fiat'; DROP TABLE RawVehicleListing;--", 'Egea')).resolves.toEqual([]);
    }, 90_000);
  });

  describe('Katalogsuz gerçek araç kalıcı olarak kaydedilir', () => {
    // GERCEK BASARISIZLIK: VehicleEvaluation.vehicleSpecificationId ZORUNLU
    // yabanci anahtardi. Katalogda karsiligi olmayan gercek araclar (orn.
    // 8.494 ilanlik Fiat Egea) fiyatlanabiliyor ama KAYDEDILEMIYORDU.
    test('vehicleSpecificationId artık opsiyoneldir', async () => {
      const cols: any[] = await prisma.$queryRawUnsafe('PRAGMA table_info(VehicleEvaluation)');
      const fk = cols.find((c) => c.name === 'vehicleSpecificationId');
      expect(fk).toBeDefined();
      expect(Number(fk.notnull)).toBe(0);
    });

    test('Araç kimliği anlık görüntü alanları mevcuttur', async () => {
      const cols: any[] = await prisma.$queryRawUnsafe('PRAGMA table_info(VehicleEvaluation)');
      const names = cols.map((c) => c.name);
      for (const n of ['vehicleMake', 'vehicleModel', 'vehicleEngine', 'vehicleTrim', 'vehicleYear', 'vehicleBodyType']) {
        expect(names).toContain(n);
      }
    });

    test('Spec olmadan kayıt yazılır ve kimlik geri okunur', async () => {
      const row = await prisma.vehicleEvaluation.create({
        data: {
          vehicleSpecificationId: null,
          vehicleMake: 'Fiat', vehicleModel: 'Egea', vehicleEngine: '1.6 Multijet',
          vehicleTrim: 'Urban', vehicleYear: 2022, vehicleBodyType: 'SEDAN',
          licensePlate: '34TEST99', mileage: 90000, color: 'Beyaz', damageStatus: 'NO',
          estimatedValue: 1, minExpectedValue: 1, maxExpectedValue: 2, quickSaleValue: 1,
          confidenceScore: 90, aiAnalysis: '[]',
        },
      });
      try {
        const back = await prisma.vehicleEvaluation.findUnique({
          where: { id: row.id }, include: { vehicleSpecification: true },
        });
        expect(back!.vehicleSpecificationId).toBeNull();
        expect(back!.vehicleSpecification).toBeNull();
        expect(`${back!.vehicleYear} ${back!.vehicleMake} ${back!.vehicleModel} ${back!.vehicleEngine}`)
          .toBe('2022 Fiat Egea 1.6 Multijet');
      } finally {
        await prisma.vehicleEvaluation.delete({ where: { id: row.id } });
      }
    });

    test('Katalog destekli kayıtların ilişkisi bozulmadı', async () => {
      const spec = await prisma.vehicleSpecification.findFirst({ select: { id: true } });
      expect(spec).toBeTruthy();
      const row = await prisma.vehicleEvaluation.create({
        data: {
          vehicleSpecificationId: spec!.id,
          vehicleMake: 'BMW', vehicleModel: '3 Serisi', vehicleYear: 2014,
          licensePlate: '34TEST98', mileage: 180000, color: 'Beyaz', damageStatus: 'NO',
          estimatedValue: 1, minExpectedValue: 1, maxExpectedValue: 2, quickSaleValue: 1,
          confidenceScore: 90, aiAnalysis: '[]',
        },
      });
      try {
        const back = await prisma.vehicleEvaluation.findUnique({
          where: { id: row.id }, include: { vehicleSpecification: true },
        });
        expect(back!.vehicleSpecificationId).toBe(spec!.id);
        expect(back!.vehicleSpecification).not.toBeNull();
      } finally {
        await prisma.vehicleEvaluation.delete({ where: { id: row.id } });
      }
    });
  });

  describe('Kasa bilinmiyorsa fiyat ayrışması ölçülür (otomasyon güvenliği)', () => {
    test('BMW 420d: kasa belirtilmezse ayrışma yakalanır', async () => {
      const matcher = new EmsalMatcherService(prisma as any);
      const m = await matcher.matchComparableListings({
        make: 'BMW', model: '4 Serisi', variant: '420d', year: 2014, mileageKm: 150000,
      });
      expect(m.bodyAmbiguityRisk).toBe(true);
      expect(m.bodySpread).toBeGreaterThan(0.10);
    }, 60_000);

    test('Kasa BELİRTİLİRSE ayrışma riski oluşmaz', async () => {
      const matcher = new EmsalMatcherService(prisma as any);
      for (const b of ['CABRIO', 'COUPE', 'GRAN_COUPE']) {
        const m = await matcher.matchComparableListings({
          make: 'BMW', model: '4 Serisi', variant: '420d', year: 2014, mileageKm: 150000, bodyType: b,
        });
        expect(m.bodyAmbiguityRisk).toBe(false);
      }
    }, 90_000);

    test('Tek kasalı / ayrışması önemsiz aile manuele düşmez', async () => {
      const matcher = new EmsalMatcherService(prisma as any);
      const m = await matcher.matchComparableListings({
        make: 'Audi', model: 'A3 A3 Sportback', variant: '1.6', year: 2005, mileageKm: 280000,
      });
      expect(m.bodyAmbiguityRisk).toBe(false);
    }, 60_000);
  });

  describe('Müşteri seçimi katalog etiketini ezer (uçtan uca eşleme)', () => {
    const match = async (bodyType?: string) => {
      const matcher = new EmsalMatcherService(prisma as any);
      return matcher.matchComparableListings({
        make: 'BMW', model: '4 Serisi', variant: '420d', year: 2014, mileageKm: 150000, bodyType,
      });
    };

    test('CABRIO seçildiğinde havuzda yanlış kasa kalmaz', async () => {
      const m = await match('CABRIO');
      expect(m.cleanListings.filter((l) => l.bodyType && l.bodyType !== 'CABRIO')).toHaveLength(0);
      expect(m.cleanListings.some((l) => l.bodyType === 'CABRIO')).toBe(true);
    }, 60_000);

    test('COUPE ve GRAN_COUPE ayrı havuz üretir', async () => {
      const coupe = await match('COUPE');
      const gran = await match('GRAN_COUPE');
      expect(coupe.cleanListings.filter((l) => l.bodyType && l.bodyType !== 'COUPE')).toHaveLength(0);
      expect(gran.cleanListings.filter((l) => l.bodyType && l.bodyType !== 'GRAN_COUPE')).toHaveLength(0);
      expect(coupe.matchedCount).not.toBe(gran.matchedCount);
    }, 60_000);

    test('Kasa bilinmiyorsa sahte kesinlik üretilmez (CASE D)', async () => {
      const unknown = await match(undefined);
      const bodies = new Set(unknown.cleanListings.map((l) => l.bodyType).filter(Boolean));
      expect(bodies.size).toBeGreaterThan(1);
    }, 60_000);
  });

  describe('Audi model semantiği korunur', () => {
    test('A3 Sportback havuzuna yabancı kasa girmez', async () => {
      const matcher = new EmsalMatcherService(prisma as any);
      const m = await matcher.matchComparableListings({
        make: 'Audi', model: 'A3 A3 Sportback', variant: '1.6', year: 2005, mileageKm: 280000,
        bodyType: 'SPORTBACK',
      });
      expect(m.cleanListings.filter((l) => l.bodyType && l.bodyType !== 'SPORTBACK')).toHaveLength(0);
      expect(m.matchedCount).toBeGreaterThan(0);
    }, 60_000);
  });
});
