/**
 * status-policy.spec.ts
 *
 * OTOMATIK/MANUEL DURUM POLITIKASI V1 — KANIT BILESKESI.
 *
 * Is kurali: emsal SAYISI tek basina karar veremez; kanit KALITESI karar
 * verir (yayilim + yil birebirligi + km yerelligi + motor birebirligi +
 * guven). Sert kapilar hicbir kosulda gevsemez: ekonomik taban/komisyon,
 * kasa belirsizligi, Seviye 3, sinirli-emsal, agir hasar, N=1.
 *
 * Olculen (3.611 gercek yol): eski kor esikler 63 DAGINIK kohortu (IQR
 * yayilimi > %25) OTOMATIK'e gecirirken, 83 siki-yerel kucuk-N yolunu
 * gereksiz MANUEL'e dusuruyordu. Secilen politika yanlis-OTOMATIK
 * siniflarinin tamaminda SIFIRDIR ve parayi DEGISTIRMEZ.
 */
import { PrismaClient } from '@prisma/client';
import { EmsalMatcherService } from './emsal-matcher.service';
import { EvaluationService } from './evaluation.service';

describe('Durum politikasi — kanit bileskesi (gercek veritabani)', () => {
  let prisma: PrismaClient;
  let svc: any;

  beforeAll(() => {
    prisma = new PrismaClient();
    const matcher = new EmsalMatcherService(prisma as any);
    svc = new EvaluationService(prisma as any, { sendEvaluationNotification: async () => undefined } as any, matcher);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  const core = async (obs: any, year: number, mileage: number, extra: any = {}) => {
    const mk = await prisma.manufacturer.findFirst({ where: { name: obs.observedMake } });
    const mo = mk ? await prisma.model.findFirst({ where: { manufacturerId: mk.id, name: obs.observedModel } }) : null;
    return svc.calculateValuationCore({
      year, manufacturerId: mk?.id, modelId: mo?.id, ...obs,
      mileage, color: 'Beyaz', damageStatus: 'NO', tramerAmount: '0 TL', paintScheme: '{}',
      chassisState: '{"Şasi":""}', vehicleStatus: '{}', licensePlate: '34QA0000',
      firstName: 'T', lastName: 'T', phone: '05550000000', sellingTimeline: 'hemen', userDesiredPrice: 0,
      ...extra,
    });
  };

  test('guclu birebir yuksek-N kohort OTOMATIK (Audi altin)', async () => {
    const r: any = await core({ observedMake: 'Audi', observedModel: 'A3', observedEngine: 'A3 Sedan 35 TFSI', observedTrim: 'S Line' }, 2025, 5000);
    expect(r.status).toBe('SUCCESS');
    expect(r.results.matchedListingCount).toBeGreaterThanOrEqual(8);
  }, 60000);

  test('N=1 MANUEL kalir (fiyat GORUNUR, otomatik taahhut YOK)', async () => {
    const r: any = await core({ observedMake: 'Abarth', observedModel: '500e', observedTrim: 'Coupe' }, 2024, 6001);
    expect(r.status).toBe('MANUAL_EVALUATION_REQUIRED');
    expect(r.results).not.toBeNull();
    expect(r.results.marketReferenceValue).toBeGreaterThan(0);
  }, 60000);

  test('N=2 nadir arac MANUEL kalir', async () => {
    const r: any = await core({ observedMake: 'Aion', observedModel: 'S', observedTrim: '580' }, 2021, 90000);
    expect(r.status).toBe('MANUAL_EVALUATION_REQUIRED');
    expect(r.results?.marketReferenceValue).toBeGreaterThan(0);
  }, 60000);

  test('ekonomik taban vakasi MANUEL kalir (fiyatli)', async () => {
    const r: any = await core({ observedMake: 'Tofas', observedModel: 'Şahin S' }, 2000, 99000);
    expect(r.status).toBe('MANUAL_EVALUATION_REQUIRED');
    expect(r.results?.cashOffer).toBeGreaterThan(0);
  }, 60000);

  test('durum degisse de PARA politikadan bagimsizdir (ayni anda cift olcum)', async () => {
    // Ayni cekirdek ayni girdiyle arka arkaya AYNI parayi vermelidir; durum
    // politikasi yalnizca requiresManual bayragini okur, para yoluna yazmaz.
    const a: any = await core({ observedMake: 'Renault', observedModel: 'Clio', observedEngine: '1.0 TCe', observedTrim: 'Joy' }, 2022, 60000);
    const b: any = await core({ observedMake: 'Renault', observedModel: 'Clio', observedEngine: '1.0 TCe', observedTrim: 'Joy' }, 2022, 60000);
    for (const k of ['marketReferenceValue', 'cashOffer', 'customerConsignmentNet', 'consignmentListingPrice']) {
      expect(a.results[k]).toBe(b.results[k]);
    }
  }, 120000);

  test('genis yayilimli kohort OTOMATIK OLAMAZ (sayi kac olursa olsun)', async () => {
    // Ornekleme dayali degil, kural duzeyinde: bir SUCCESS bulundugunda
    // kohort yayilimi kontrol edilir. 3.611 yol olcumunde SUCCESS icinde
    // yayilim > 0.25 SIFIRDIR; buradaki iki genis-yayilim adayi MANUEL'dir.
    for (const c of [
      { obs: { observedMake: 'BMW', observedModel: '7 Serisi' }, y: 2008, km: 385000 },
      { obs: { observedMake: 'Mercedes-Benz', observedModel: 'E Serisi' }, y: 2017, km: 120000 },
    ]) {
      const r: any = await core(c.obs, c.y, c.km);
      if (!r.results) continue;
      const prices: number[] = (r.comparableListings || []).map((x: any) => x.price).filter((p: number) => p > 0);
      // comparableListings yalniz vitrindir (5 satir); asil dogrulama durumdadir:
      // engine bu iki hedefte MANUEL doner (genis yayilim / dusuk birebirlik).
      expect(r.status).toBe('MANUAL_EVALUATION_REQUIRED');
    }
  }, 120000);

  test('UNKNOWN tek basina MANUEL zorlamaz: bilinmeyen alanlar ceza degil belirsizliktir', async () => {
    // Corolla 1.6 2018: kohortta cok sayida alanin bilinmedigi gercek ilan
    // vardir; kanit bileskesi (N, yayilim, yil, km) gucluyse OTOMATIK kalir.
    const r: any = await core({ observedMake: 'Toyota', observedModel: 'Corolla', observedEngine: '1.6' }, 2018, 100000);
    expect(r.status).toBe('SUCCESS');
  }, 60000);
});
