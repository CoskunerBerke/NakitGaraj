/**
 * catalog-contract.spec.ts
 *
 * KATALOG SOZLESMESI: sihirbazin sundugu her uc secim GERCEK ilan iliskisine
 * dayanmali. Bagimsiz acilir listelerin carpimi ("motor bir satirda, paket
 * baska satirda") hic gorulmemis bir arac kimligi URETMEZ.
 *
 * Olculen (26.607 uc yaprak, duzeltme oncesi):
 *   - motor tasimayan katalog etiketleri ("Standart", "147 5 Kapi",
 *     "Eco Elegance") x hic gorulmemis genel paketler -> 2.000+ fiyatlanamaz yaprak
 *   - katalog motoru x modelin TUM gozlenen paketleri (Audi A3 Sedan 35 TFSI
 *     icin 38 ilgisiz secenek) -> 4.400+ sifir destekli yaprak
 *
 * Kural veri gudumludur; marka/model ozel durumu YOKTUR.
 */
import { PrismaClient } from '@prisma/client';
import { VehicleService } from './vehicle.service';
import { explicitEngineSignature, splitVariantString, foldTurkish } from '../evaluation/listing-attributes';

const noopCache = () => {
  const store = new Map<string, any>();
  return {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: any) => { store.set(k, v); },
    del: async (k: string) => { store.delete(k); },
  } as any;
};

const evidence = (name: string) => splitVariantString(name).engineCode || explicitEngineSignature(name);
const label = (o: any) => String(o.name ?? o.displayLabel ?? o.value ?? '');

describe('Katalog sozlesmesi — gozlenen iliski kapisi (gercek veri)', () => {
  const prisma = new PrismaClient();
  const svc = new VehicleService(prisma as any, noopCache());
  let brands: any[] = [];
  const brand = (n: string) => brands.find((b) => b.name === n);
  const modelOf = async (b: any, name: string, year: number) =>
    (await svc.getModels(b.id, year)).find((m: any) => label(m) === name);

  beforeAll(async () => { brands = await svc.getBrands(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('Audi A3 2025: her motor secenegi ailede gercek karsiligi olan bir motordur', async () => {
    const b = brand('Audi'); const m = await modelOf(b, 'A3', 2025);
    expect(m).toBeTruthy();
    const variants = await svc.getVariants(m.id, b.id, 2025);
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) {
      const name = label(v);
      // Motor tasimayan katalog etiketi (aile gercek motorlar icerirken) SUNULMAZ.
      if (!String(v.id).startsWith('OBS:') && v.id !== 'UNKNOWN') {
        expect(evidence(name)).not.toBe('');
      }
      // Sayfa basligi/tohumlama artigi motor secenegi olarak gorunmez.
      expect(/^audi /i.test(name)).toBe(false);
    }
    expect(variants.map(label)).toContain('A3 Sedan 35 TFSI');
  }, 60000);

  test('Audi A3 Sedan 35 TFSI: paketler bu motorla BIRLIKTE gorulen ilanlardan gelir', async () => {
    const b = brand('Audi'); const m = await modelOf(b, 'A3', 2025);
    const variants = await svc.getVariants(m.id, b.id, 2025);
    const v = variants.find((x: any) => label(x) === 'A3 Sedan 35 TFSI');
    expect(v).toBeTruthy();
    const pkgs = await svc.getPackages(v.id, m.id, b.id, 2025);
    const names = pkgs.map(label);
    expect(names).toContain('S Line');
    // Baska motor/kasa etiketleri (Hatchback 1.6, Sportback 35 TFSI, Cabrio...) karismaz.
    for (const n of names) {
      if (!String(pkgs.find((p: any) => label(p) === n)?.id).startsWith('OBS:')) continue;
      const e = evidence(n);
      if (e) expect(foldTurkish(e)).toBe('35 tfsi');
      expect(/hatchback|sportback|cabrio/i.test(n)).toBe(false);
    }
    expect(names.length).toBeLessThan(12);
  }, 60000);

  test('Renault Clio 2022 1.0 TCe: farkli motorun donanim etiketi paket olarak sunulmaz', async () => {
    const b = brand('Renault'); const m = await modelOf(b, 'Clio', 2022);
    const variants = await svc.getVariants(m.id, b.id, 2022);
    const v = variants.find((x: any) => label(x) === '1.0 TCe');
    expect(v).toBeTruthy();
    const names = (await svc.getPackages(v.id, m.id, b.id, 2022)).map(label);
    expect(names).toContain('Joy');
    for (const n of names) expect(/0\.9 tce|1\.3 tce|1\.5 dci/i.test(n)).toBe(false);
  }, 60000);

  test('Abarth 500e 2024: ailede motor kaniti yoksa yer tutucu versiyon ve gercek donanimlar kalir', async () => {
    const b = brand('Abarth'); const m = await modelOf(b, '500e', 2024);
    expect(m).toBeTruthy();
    const variants = await svc.getVariants(m.id, b.id, 2024);
    expect(variants.length).toBeGreaterThan(0);
    const pkgs = (await svc.getPackages(variants[0].id, m.id, b.id, 2024)).map(label);
    expect(pkgs).toEqual(expect.arrayContaining(['Coupe']));
  }, 60000);

  test('motor bilinmeyen secimde katalog paketi ancak gozlenen donanimla ortusuyorsa sunulur', async () => {
    // Ornek aile: motor kaniti olmayan bir sihirbaz yolu bulunursa dogrulanir.
    const b = brand('Abarth'); const m = await modelOf(b, '500e', 2024);
    const variants = await svc.getVariants(m.id, b.id, 2024);
    const v = variants.find((x: any) => !evidence(label(x)));
    if (!v) return;
    const pkgs = await svc.getPackages(v.id, m.id, b.id, 2024);
    const observed = new Set(pkgs.filter((p: any) => String(p.id).startsWith('OBS:')).map((p: any) => foldTurkish(label(p))));
    for (const p of pkgs) {
      if (String(p.id).startsWith('OBS:')) continue;
      const n = foldTurkish(label(p));
      expect([...observed].some((o) => o === n || o.includes(n) || n.includes(o))).toBe(true);
    }
  }, 60000);
});
