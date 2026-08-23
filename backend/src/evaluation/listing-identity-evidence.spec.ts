/**
 * listing-identity-evidence.spec.ts
 *
 * ACIK ILAN KIMLIGI KANITI — ilanin KENDI metni, zayif zenginlestirmeyi yener.
 *
 * Bulunan hata (Audi A3 Sedan 35 TFSI S Line 2025, 5.000 km): 137 Sedan
 * ilaninin 46'sinda "S Line" yalnizca ilan basliginda yazili; yapisal donanim
 * alani kaynak model dizgesini ("A3 Sedan 35 TFSI") tasiyor. Eslestirici bunu
 * paket UYUSMAZLIGI sayiyor, pakete sadik kademe bosa dusuyor ve 62 ucuz
 * paketli ilan merkezi 2,90 mn'a cekiyordu (S Line alt kume medyani 3,57 mn).
 *
 * Ikinci hata: "Hibrit" (MHEV) etiketli ama AYNI motor kodunu ("35 TFSI")
 * tasiyan ilanlar yakit kapisindan dusuyordu; `fuelOf` bunun celiski
 * olmadigini zaten belgeliyordu.
 *
 * Ucuncu hata: kasa sozlugu yil penceresinden turetildigi icin, hedef yilda
 * satista olmayan bir kasa "sozluk disi" sayilip kapi dusuruluyor ve Coupe
 * hedefine acik Cabrio ilanlari giriyordu.
 *
 * Kurallar markadan bagimsizdir; fiyat SABITLENMEZ.
 */
import { PrismaClient } from '@prisma/client';
import { EmsalMatcherService } from './emsal-matcher.service';
import { hasExplicitPackageEvidence, packageKey } from './listing-attributes';

describe('Acik paket kaniti (saf fonksiyon)', () => {
  test('baslik/dizgedeki acik paket tokeni taninir; yazim farklari esittir', () => {
    expect(hasExplicitPackageEvidence('S Line', 'ÖZER OTO 2025 A3 SEDAN TFSI S-LINE BLACK STYLE')).toBe(true);
    expect(hasExplicitPackageEvidence('S Line', '2025 AUDİ A3 35 TFSİ S-LİNE (İÇ-DIŞ)')).toBe(true);
    expect(hasExplicitPackageEvidence('S Line', 'SAHİBİNDEN A3 S LINE HATASIZ')).toBe(true);
    expect(hasExplicitPackageEvidence('S Line', '2025 AUDI A3 35TFSI MHEV Sline')).toBe(true);
    expect(hasExplicitPackageEvidence('AMG', 'MERCEDES C 200 AMG 2023')).toBe(true);
    expect(hasExplicitPackageEvidence('M Sport', 'BMW 320i M-SPORT HATASIZ')).toBe(true);
    expect(hasExplicitPackageEvidence('Joy', 'CLIO 1.0 TCe JOY 2022')).toBe(true);
  });

  test('kanit YOKSA bilinmiyor (uydurma yok); sinir duyarlidir', () => {
    expect(hasExplicitPackageEvidence('S Line', 'Yamanlar Otomotivden')).toBe(false);
    expect(hasExplicitPackageEvidence('S Line', 'A3 Sedan 35 TFSI')).toBe(false);
    // "Joy" sozcugu baska bir sozcugun ICINDE gecerse kanit degildir.
    expect(hasExplicitPackageEvidence('Joy', 'ENJOYABLE DRIVE')).toBe(false);
    expect(hasExplicitPackageEvidence('', 'S LINE')).toBe(false);
  });

  test('packageKey: Turkce katlama, tire/bosluk esitligi', () => {
    expect(packageKey('S-LİNE')).toBe('s line');
    expect(packageKey('S  Line')).toBe('s line');
  });
});

describe('Ilan kimligi kaniti (gercek veritabani)', () => {
  let prisma: PrismaClient;
  let matcher: EmsalMatcherService;
  beforeAll(() => { prisma = new PrismaClient(); matcher = new EmsalMatcherService(prisma as any); });
  afterAll(async () => { await prisma.$disconnect(); });

  const AUDI = { make: 'Audi', model: 'A3', variant: 'A3 Sedan 35 TFSI', trim: 'S Line', year: 2025, mileageKm: 5_000 };
  const sLineTitle = (t: string) => /s[\s\-]?l[iİı]ne/i.test(t);

  test('acik S Line kaniti taninir: pakete sadik kohort kurulur', async () => {
    const m = await matcher.matchComparableListings(AUDI);
    expect(m.level).toBeLessThan(4);
    expect(m.matchedCount).toBeGreaterThanOrEqual(5);
    const ids = (m.cleanListings as any[]).map((c) => c.id);
    const rows = await prisma.rawVehicleListing.findMany({ where: { sourceListingId: { in: ids } }, select: { sourceListingId: true, rawTitle: true, canonicalTrim: true } });
    // Kohortun TAMAMI acik S Line kaniti tasir (baslik ya da yapisal alan).
    for (const r of rows) expect(sLineTitle(r.rawTitle || '') || /s line/i.test(r.canonicalTrim || '')).toBe(true);
  }, 60000);

  test('gercek Sportback, Sedan kohortuna GIRMEZ (acik kasa kimligi)', async () => {
    const m = await matcher.matchComparableListings(AUDI);
    const ids = (m.cleanListings as any[]).map((c) => c.id);
    const rows = await prisma.rawVehicleListing.findMany({ where: { sourceListingId: { in: ids } }, select: { canonicalModel: true, canonicalBodyType: true } });
    for (const r of rows) {
      expect(r.canonicalBodyType === 'SPORTBACK').toBe(false);
      expect(/sportback/i.test(r.canonicalModel || '')).toBe(false);
    }
  }, 60000);

  test('Hibrit (MHEV) etiketi, ayni yanma motoru koduyla CELISMEZ', async () => {
    const m = await matcher.matchComparableListings(AUDI);
    const ids = new Set((m.cleanListings as any[]).map((c) => c.id));
    // 35 TFSI MHEV S-LINE, 6.005 km: kohortta olmali (yakit kapisi dusurmemeli).
    const mhev = await prisma.rawVehicleListing.findFirst({ where: { canonicalMake: 'Audi', year: 2025, mileageKm: 6005, price: 3_675_000 }, select: { sourceListingId: true, canonicalFuelType: true } });
    if (mhev) {
      expect(mhev.canonicalFuelType).toBe('Hibrit');
      expect(ids.has(mhev.sourceListingId)).toBe(true);
    }
  }, 60000);

  test('paket kaniti UNKNOWN olan ilan CELISKI sayilmaz (gevsek kademede kabul)', async () => {
    // Paketi hic belirtilmeyen hedef: UNKNOWN ilanlar havuza girer.
    const m = await matcher.matchComparableListings({ ...AUDI, trim: '' });
    expect(m.matchedCount).toBeGreaterThanOrEqual(5);
  }, 60000);

  test('acik FARKLI kasa (Cabrio), Coupe hedefine GIRMEZ - hedef yilda Coupe yoksa bile', async () => {
    const m = await matcher.matchComparableListings({ make: 'Abarth', model: '500e', variant: 'Standart', trim: 'Coupe', year: 2025, mileageKm: 6_001 });
    for (const c of m.cleanListings as any[]) expect(/cabrio/i.test((c.bodyType || '') + ' ' + (c.trim || ''))).toBe(false);
  }, 60000);

  test('N=1 Abarth 500e Coupe 2024 sozlesmesi DEGISMEDI', async () => {
    const m = await matcher.matchComparableListings({ make: 'Abarth', model: '500e', variant: 'Standart', trim: 'Coupe', year: 2024, mileageKm: 6_001 });
    expect(m.matchedCount).toBe(1);
    expect(m.cleanListings[0].price).toBe(3_500_000);
  }, 60000);
});
