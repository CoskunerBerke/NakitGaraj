/**
 * observed-catalog.spec.ts
 *
 * Musteri katalogu (okuma katmani) GERCEK ilanlardan gelen hicbir modeli
 * sessizce elememelidir.
 *
 * Gercek regresyon: model adinin sonundaki "-<rakam>" sayfa numarasi
 * artigi sanilip eleniyordu; Saab 9-3 / 9-5 ve Proton Gen-2 musteri
 * formunda hic gorunmuyordu (DB'de dogru duruyorlardi).
 *
 * Testler VERI GUDUMLUDUR: belirli bir marka/model adi PRODUCTION mantiginda
 * ozel durum degildir; asagida yalnizca ornek olarak kullanilir.
 */
import { PrismaClient } from '@prisma/client';
import { VehicleService, isUnusableModelName } from './vehicle.service';

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
    del: async (k: string) => { store.delete(k); },
  } as any;
};

describe('Gozlenen musteri katalogu — model adi korunmasi', () => {
  describe('isUnusableModelName yalniz ayristirma artigini eler', () => {
    test('tireli/rakamli gercek model adlari KULLANILABILIR', () => {
      for (const name of ['9-3', '9-5', 'Gen-2', '900', '9000', 'Waja', 'C-Max', 'Mazda 3', '3 Serisi', 'ID.3']) {
        expect(isUnusableModelName(name)).toBe(false);
      }
    });

    test('ayristirma artiklari ELENIR', () => {
      for (const name of ["Passat Fiyatları & Modelleri sahibinden.com'da", 'Golf Modelleri', 'Clio.html', '_ -', '   ', '']) {
        expect(isUnusableModelName(name)).toBe(true);
      }
    });

    test('marka/model ozel istisnasi YOKTUR', () => {
      const src = require('fs').readFileSync(__dirname + '/vehicle.service.ts', 'utf8');
      expect(src).not.toMatch(/['"]9-3['"]|['"]9-5['"]|['"]Gen-2['"]/);
      expect(src).not.toMatch(/===\s*['"]Saab['"]|===\s*['"]Proton['"]/);
    });
  });

  describe('DB ↔ katalog model paritesi (gercek veri)', () => {
    let prisma: PrismaClient;
    beforeAll(() => { prisma = new PrismaClient(); });
    afterAll(async () => { await prisma.$disconnect(); });

    test('hicbir ilan musteri katalogundan dusmez (ilan sayisi paritesi)', async () => {
      // Ayni modelin yazim varyantlari TEK secenekte BIRLESTIRILEBILIR
      // (orn. "C Serisi C 200 200" -> "C Serisi C 200"); bu kayip degildir.
      // Kayip olmadigini kanitlayan degismez: seceneklerin ilan sayisi
      // toplami, markanin DEGERLEMEYE KABUL EDILEBILIR ilan sayisina esit
      // olmalidir. Kabul edilebilirlik, model kapisiyla AYNIDIR: VALID +
      // fiyat akil-siniri + hasarsiz (baslik varsa metin kazanir). Emsal
      // cekirdeginin havuza almayacagi bir ilan, secenek de SAYILMAZ.
      const svc = new VehicleService(prisma as any, noopCache());
      const { PRICING_LIMITS } = require('../evaluation/pricing-config');
      const { hasStrongDamageSignal } = require('../evaluation/listing-attributes');
      const raw = await prisma.rawVehicleListing.findMany({
        where: {
          canonicalMake: { not: '' }, canonicalModel: { not: '' }, parseStatus: 'VALID',
          price: { gte: PRICING_LIMITS.priceSanityRange[0], lte: PRICING_LIMITS.priceSanityRange[1] },
        },
        select: { canonicalMake: true, canonicalModel: true, rawTitle: true, isDamaged: true },
      });
      if (raw.length === 0) return; // DB bos ise atla

      const expected = new Map<string, number>();
      for (const r of raw) {
        if (isUnusableModelName(r.canonicalModel)) continue;
        const title = (r.rawTitle || '').trim();
        if (title ? hasStrongDamageSignal(title) : r.isDamaged === true) continue;
        expected.set(r.canonicalMake, (expected.get(r.canonicalMake) || 0) + 1);
      }

      const mismatches: string[] = [];
      for (const [mk, total] of expected) {
        const options = await svc.getObservedModels({ make: mk });
        const shown = (options || []).reduce((s: number, o: any) => s + Number(o.listingCount || 0), 0);
        if (shown !== total) mismatches.push(`${mk}: katalog ${shown} != DB ${total}`);
      }
      expect(mismatches).toEqual([]);
    }, 180_000);

    test('sonu "-<rakam>" ile biten gercek modeller katalogda gorunur', async () => {
      const svc = new VehicleService(prisma as any, noopCache());
      const pairs = (await prisma.$queryRawUnsafe(
        "SELECT DISTINCT canonicalMake AS mk, canonicalModel AS m FROM RawVehicleListing WHERE canonicalMake <> '' AND canonicalModel <> ''",
      )) as Array<{ mk: string; m: string }>;
      // Desen kodda DEGIL, VERIDE aranir: hangi markada varsa o test edilir.
      const hyphenated = pairs.filter((p) => /-\s*\d+$/.test(p.m));
      if (hyphenated.length === 0) return; // korpusta boyle model yoksa atla

      for (const p of hyphenated) {
        const options = await svc.getObservedModels({ make: p.mk });
        const shown = (options || []).map((o: any) => String(o.value));
        expect(shown).toContain(p.m);
      }
    }, 180_000);

    test('tireli model secildikten sonra alt secenek zinciri calisir', async () => {
      const svc = new VehicleService(prisma as any, noopCache());
      const pairs = (await prisma.$queryRawUnsafe(
        "SELECT DISTINCT canonicalMake AS mk, canonicalModel AS m FROM RawVehicleListing WHERE canonicalMake <> '' AND canonicalModel <> ''",
      )) as Array<{ mk: string; m: string }>;
      const hyphenated = pairs.filter((p) => /-\s*\d+$/.test(p.m)).slice(0, 3);
      if (hyphenated.length === 0) return;

      for (const p of hyphenated) {
        const years = await svc.getObservedYears({ make: p.mk, model: p.m });
        const trims = await svc.getObservedTrims({ make: p.mk, model: p.m });
        // Yil her ilanda vardir; paket/motor UNKNOWN olabilir ama UYDURULMAZ.
        expect(Array.isArray(years)).toBe(true);
        expect(years.length).toBeGreaterThan(0);
        expect(Array.isArray(trims)).toBe(true);
      }
    }, 180_000);
  });
});

describe('Katalog paket kapisi — gozlenen iliski (gercek veri)', () => {
  let prisma: PrismaClient;
  beforeAll(() => { prisma = new PrismaClient(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('ayristirma artigi paket ("TI") sunulmaz; gercek paket ("S Line") baslik kanitiyla korunur', async () => {
    const svc = new VehicleService(prisma as any, noopCache());
    const b = await prisma.manufacturer.findFirst({ where: { name: 'Audi' } });
    if (!b) return;
    const ms = await svc.getModels(b.id, 2025);
    const a3 = ms.find((m: any) => (m.name ?? m.value) === 'A3');
    if (!a3) return;
    const vs = await svc.getVariants(a3.id, b.id, 2025);
    const sedan = vs.find((v: any) => /Sedan 35 TFSI/i.test(String(v.name ?? v.value ?? '')));
    if (!sedan) return;
    const pks = await svc.getPackages(sedan.id, a3.id, b.id, 2025);
    const names = pks.map((p: any) => String(p.name ?? p.value ?? ''));
    // Katalogda 143 kez gecen "TI" artigi hicbir gercek ilan donanimida/
    // basliginda sinir-duyarli gecmez: SUNULMAZ.
    expect(names.includes('TI')).toBe(false);
    // "S Line" kaniti bu ailede yalnizca BASLIKTA yazilidir: SUNULUR.
    expect(names.some((n) => /s line/i.test(n))).toBe(true);
  }, 120_000);

  test('degerlemenin kabul etmeyecegi tek-ilanli model o yilda SUNULMAZ (hasarli tek destek)', async () => {
    // Volvo 460 (1991) tek ilanlidir ve o ilan hasar isaretlidir: emsal
    // cekirdegi onu havuza almaz, katalog da secenek uretmez.
    const svc = new VehicleService(prisma as any, noopCache());
    const b = await prisma.manufacturer.findFirst({ where: { name: 'Volvo' } });
    if (!b) return;
    const ms = await svc.getModels(b.id, 1991);
    expect(ms.some((m: any) => (m.name ?? m.value) === '460')).toBe(false);
    // Ayni model, temiz destegi olan yilda GORUNUR kalir (asiri budama yok).
    const ms07 = await svc.getModels(b.id, 2007);
    expect(ms07.some((m: any) => (m.name ?? m.value) === 'S80')).toBe(true);
  }, 120_000);
});

