/**
 * quote-fallback.spec.ts
 *
 * P0 REGRESYON: GERCEK EMSAL VARKEN MUSTERI "YETERLI VERI YOK" GORMEMELI.
 *
 * Bulunan hata (gercek musteri testi): Audi A3 / "A3 Sedan 35 TFSI" / S Line /
 * 2025. Korpusta bu aileden 578 gercek ilan (2025 icin 137) varken sonuc
 * INSUFFICIENT_DATA ve results=null idi. Izlenen ilk kotu filtre: L2/L3
 * (269 -> 0, 464 -> 0). Uc kok neden:
 *
 *   1) "35 TFSI" (guc endeksi + aile, hacimsiz) motor imzasi sayilmiyordu ve
 *      imza yalnizca dizgenin BASINDA araniyordu; "A3 Sedan 35 TFSI" gibi tam
 *      model etiketlerinde motor ortada/sondadir -> hedefin motoru "bilinmiyor".
 *   2) Alt kademeler (L2/L3) motor KANITINA degil yalniz ayri motor ALANINA
 *      bakiyordu; ilanlarda bu alan bos, motor etikette yazili -> hepsi dustu.
 *   3) Motor bilinmeyince paket korumasi tek ayirt edici oldu: "S Line" ile
 *      ilanin "A3 Sedan 35 TFSI" etiketi eslesmedi -> tum aile elendi.
 *
 * Ayrica: 1-3 gercek emsal "veri yok"a cevriliyordu (DUSUK SAYI != VERI YOK).
 *
 * Testler VERI GUDUMLUDUR: Audi yalnizca ornektir; production mantiginda
 * marka/model ozel durumu YOKTUR (if make === 'Audi' gibi bir dal yok).
 */
import { PrismaClient } from '@prisma/client';
import { EmsalMatcherService } from './emsal-matcher.service';
import { explicitEngineSignature, deriveBodyType } from './listing-attributes';
import { EvaluationService } from './evaluation.service';

const ordered = (r: any) =>
  r.cashOffer < r.customerConsignmentNet &&
  r.customerConsignmentNet < r.expectedSalePrice &&
  r.expectedSalePrice <= r.consignmentListingPrice;

describe('Motor kaniti — yazim sinifi tanima (marka sabiti yok)', () => {
  test('guc endeksi + aile kodu motor imzasidir, dizgenin ortasinda olsa bile', () => {
    expect(explicitEngineSignature('A3 Sedan 35 TFSI')).toBe('35 TFSI');
    expect(explicitEngineSignature('A3 Sedan 35 TFSI S Line')).toBe('35 TFSI');
    expect(explicitEngineSignature('Q5 40 TDI quattro')).toBe('40 TDI');
  });

  test('ayri yazilmis premium kod motor imzasidir', () => {
    expect(explicitEngineSignature('180 d AMG')).toBe('180 d');
    expect(explicitEngineSignature('CLS 350 CDI')).toBe('350 CDI');
    expect(explicitEngineSignature('740d xDrive M Sport')).toBe('740d');
  });

  test('paket adlari ve sayisal artiklar motor DEGILDIR', () => {
    for (const s of ['S Line', 'Joy', 'Attraction', 'Trend X', 'Premium 2019', 'e-tron 55 quattro']) {
      expect(explicitEngineSignature(s)).toBe('');
    }
  });

  test('kasa, musterinin sectigi etiketten turer (uydurma degil)', () => {
    expect(deriveBodyType('A3 Sedan 35 TFSI')).toBe('SEDAN');
    expect(deriveBodyType('A3 Hatchback 1.6')).toBe('HATCHBACK');
    expect(deriveBodyType('S Line')).toBe('');
  });
});

describe('Gercek emsal varken fiyat uretilir (gercek veritabani)', () => {
  let prisma: PrismaClient;
  let matcher: EmsalMatcherService;

  beforeAll(() => {
    prisma = new PrismaClient();
    matcher = new EmsalMatcherService(prisma as any);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('Audi A3 Sedan 35 TFSI + S Line (2025): 464 adaydan 0 yerine onlarca emsal', async () => {
    const raw = await prisma.rawVehicleListing.count({
      where: { canonicalMake: 'Audi', canonicalModel: 'A3', canonicalTrim: { contains: 'Sedan 35 TFSI' } },
    });
    expect(raw).toBeGreaterThan(100); // ham destek gercekten var

    const m = await matcher.matchComparableListings({
      make: 'Audi', model: 'A3', variant: 'A3 Sedan 35 TFSI', trim: 'S Line', year: 2025, mileageKm: 15_000,
    });
    expect(m.level).toBeLessThan(4);
    expect(m.matchedCount).toBeGreaterThanOrEqual(50);
    expect(m.cleanListings.length).toBeGreaterThanOrEqual(50);
    // Motor kaniti etiketten geldi; uydurulmadi.
    expect(m.engineEvidence?.strong).toBe(true);
    expect(m.engineEvidence?.signature).toBe('35 TFSI');
    // Havuz AYNI motor ailesidir: baska Audi modeli/motoru karismaz.
    const engines = Object.keys(m.usedEngineDistribution || {});
    expect(engines).toEqual(['35 TFSI']);
  }, 60000);

  test('kasa kaniti: Sedan hedefine Sportback/Hatchback ilani KARISMAZ', async () => {
    const m = await matcher.matchComparableListings({
      make: 'Audi', model: 'A3', variant: 'A3 Sedan 35 TFSI', trim: 'S Line', year: 2025, mileageKm: 15_000,
    });
    const bodies = new Set(m.cleanListings.map((c: any) => c.bodyType).filter(Boolean));
    for (const b of bodies) expect(['SEDAN']).toContain(b);
  }, 60000);

  test('paket gevsetmesi ayni arac ailesinde kalir (trim gevser, motor/seri gevsemez)', async () => {
    const m = await matcher.matchComparableListings({
      make: 'Audi', model: 'A3', variant: 'A3 Sedan 35 TFSI', trim: 'S Line', year: 2025, mileageKm: 15_000,
    });
    for (const c of m.cleanListings as any[]) {
      expect(c.model).toBe('A3');
      expect(/35 tfsi/i.test(c.trim || '')).toBe(true);
    }
  }, 60000);

  /**
   * DONANIM ONCELIGI, ARTIK TEK YONLU YIL PENCERESI ICINDE OLCULUR.
   *
   * Kural: donanim yalnizca GERCEKTEN kitken gevsetilir. "Gercekten kit"in
   * olcusu, hedef yil ve DAHA YENISI icindeki birebir donanim sayisidir;
   * daha ESKI yillardaki donanim kayitlari artik hicbir kademede kanit
   * sayilmaz. Bu test sayiyi sabitlemez, KURALI veriden dogrular.
   */
  test('donanim onceligi: birebir donanim YETERLIYSE gevsetilmez (Passat 1.5 TSI Elegance)', async () => {
    const YEAR = 2021;
    // AYNI arac: 'Passat Variant' (station wagon) baska bir kasadir ve
    // eslesticinin kimlik kapisindan zaten gecmez; arz olcusune de girmez.
    const inWindow = await prisma.rawVehicleListing.count({
      where: {
        canonicalMake: 'Volkswagen', canonicalModel: 'Passat',
        year: { gte: YEAR, lte: YEAR + 2 }, parseStatus: 'VALID', price: { gt: 0 },
        canonicalTrim: { contains: 'Elegance' },
      },
    });
    const m = await matcher.matchComparableListings({
      make: 'Volkswagen', model: 'Passat', trim: '1.5 TSI  Elegance', year: YEAR, mileageKm: 101_000,
    });
    expect(m.level).toBeLessThan(4);
    expect(m.matchedCount).toBeGreaterThanOrEqual(5);
    // HER durumda: hedeften eski model yili havuza GIREMEZ.
    for (const c of m.cleanListings as any[]) expect(c.year).toBeGreaterThanOrEqual(YEAR);
    if (inWindow >= 5) {
      // Yeterli birebir Elegance emsali varken Business/Impression girmez.
      for (const c of m.cleanListings as any[]) expect(/elegance/i.test(c.trim || '')).toBe(true);
    } else {
      // Birebir donanim GERCEKTEN kit: gevsetme mesru, ama ayni arac ailesinde kalir.
      expect(inWindow).toBeLessThan(5);
      for (const c of m.cleanListings as any[]) expect(/1\.5 TSI/i.test(c.trim || '')).toBe(true);
    }
  }, 60000);

  test('DUSUK SAYI != VERI YOK: 1-3 gercek emsal fiyat uretir (Abarth 500e)', async () => {
    const raw = await prisma.rawVehicleListing.count({ where: { canonicalMake: 'Abarth', canonicalModel: '500e' } });
    expect(raw).toBeGreaterThan(0);
    const m = await matcher.matchComparableListings({
      make: 'Abarth', model: '500e', variant: 'Standart', trim: 'Coupe', year: 2024, mileageKm: 6_001,
    });
    expect(m.level).toBeLessThan(4);
    expect(m.matchedCount).toBeGreaterThanOrEqual(1);
    expect(m.cleanListings.length).toBeGreaterThanOrEqual(1);
    expect(m.isLimitedComps).toBe(true);
  }, 60000);

  test('gercekten veri yoksa yine fiyat URETILMEZ (uydurma yok)', async () => {
    const m = await matcher.matchComparableListings({
      make: 'Audi', model: 'KurguModelYok', variant: '35 TFSI', year: 2025, mileageKm: 10_000,
    });
    expect(m.level).toBe(4);
    expect(m.cleanListings.length).toBe(0);
  }, 60000);

  test('yogun birebir kohort bozulmadi (Renault Clio 1.0 TCe Joy 2022 -> L1)', async () => {
    const m = await matcher.matchComparableListings({
      make: 'Renault', model: 'Clio', variant: '1.0 TCe', trim: 'Joy', year: 2022, mileageKm: 60_000,
    });
    expect(m.level).toBe(1);
    // KOHORT ARTIK YEREL: ayni yil + hedef km ve alti. Onceki surumde ayni
    // sorgu 6.350-224.850 km araligindan 502 ilan topluyordu; 502'nin 361'i
    // hedefin UZERINDEYDI. Sayi kucuruldu, KANIT yerellesti.
    expect(m.matchedCount).toBeGreaterThanOrEqual(100);
    for (const c of m.cleanListings as any[]) {
      expect(c.year).toBe(2022);
      if (c.mileageKm > 0) expect(c.mileageKm).toBeLessThanOrEqual(60_000);
    }
  }, 60000);
});

describe('Servis katmani — sonuc sozlesmesi', () => {
  test('Audi yolu INSUFFICIENT_DATA donmez; sayisal sonuc ve ekonomik siralama vardir', async () => {
    const prisma = new PrismaClient();
    const matcher = new EmsalMatcherService(prisma as any);
    const telegram: any = { sendEvaluationNotification: async () => undefined };
    const svc: any = new EvaluationService(prisma as any, telegram, matcher);

    const audi = await prisma.manufacturer.findUnique({ where: { name: 'Audi' } });
    const a3 = await prisma.model.findFirst({ where: { manufacturerId: audi!.id, name: 'A3' } });
    const variant = await prisma.variant.findFirst({ where: { modelId: a3!.id, name: 'A3 Sedan 35 TFSI' } });
    const pkg = variant ? await prisma.package.findFirst({ where: { variantId: variant.id, name: 'S Line' } }) : null;
    expect(audi && a3 && variant).toBeTruthy();

    const res = await svc.calculateValuationCore({
      year: 2025, manufacturerId: audi!.id, modelId: a3!.id, variantId: variant!.id, packageId: pkg?.id,
      mileage: 15_000, color: 'Siyah', damageStatus: 'NO', tramerAmount: '0 TL', paintScheme: '{}',
      chassisState: '{"Şasi":""}', vehicleStatus: '{}', licensePlate: '34QA0001',
      firstName: 'T', lastName: 'T', phone: '05550000000', sellingTimeline: 'hemen', userDesiredPrice: 0,
    });
    await prisma.$disconnect();

    expect(res.status).not.toBe('INSUFFICIENT_DATA');
    expect(res.results).not.toBeNull();
    const r = res.results;
    for (const k of ['marketReferenceValue', 'cashOffer', 'customerConsignmentNet', 'consignmentListingPrice']) {
      expect(typeof r[k]).toBe('number');
      expect(Number.isFinite(r[k])).toBe(true);
      expect(r[k]).toBeGreaterThan(0);
    }
    expect(ordered(r)).toBe(true);
  }, 60000);
});
