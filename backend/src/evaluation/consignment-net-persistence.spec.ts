/**
 * consignment-net-persistence.spec.ts
 *
 * REGRESYON: konsinyede musteriye kalan net KALICI olarak saklanmalidir.
 *
 * Bulunan sorun: `maxExpectedValue` KONSINYE ILAN (isteme) fiyatidir ve tanim
 * geregi beklenen satisin ustundedir. Musterinin eline gececek tutar ayri bir
 * sayidir (olculen ornek: ilan 1.499.900 TL, net 1.406.580 TL) ve cekirdek onu
 * ZATEN hesapliyordu — ama hicbir yere yazilmiyordu. Bu yuzden galeri paneli
 * musterinin gercekte ne alacagini gosteremiyordu.
 *
 * Net; komisyon, ilan fiyati ya da nakit uzerinden YENIDEN TURETILMEZ.
 */
import { EvaluationService } from './evaluation.service';

function makeService(coreResult: any) {
  const created: any[] = [];
  const notified: any[] = [];
  const prisma: any = {
    vehicleEvaluation: {
      create: async (args: any) => { created.push(args.data); return { id: 'eval-1' }; },
    },
    vehicleRequest: { findFirst: async () => null, create: async () => ({ id: 'lead-1' }) },
    manufacturer: { findUnique: async () => null },
    model: { findUnique: async () => null },
    rawVehicleListing: { findMany: async () => [] },
  };
  const telegram: any = {
    sendEvaluationNotification: async (p: any) => { notified.push(p); },
  };
  const svc = new EvaluationService(prisma, telegram, {} as any);
  (svc as any).calculateValuationCore = async () => coreResult;
  return { svc, created, notified };
}

const BASE_DTO: any = {
  year: 2022, manufacturerId: 'm1', modelId: 'md1', mileage: 55_000, color: 'Beyaz',
  damageStatus: 'NO', licensePlate: '34QA1234', firstName: 'A', lastName: 'B',
  phone: '05551112233', sellingTimeline: 'hemen', userDesiredPrice: 0,
};

/** Bilinen gercek ornek. */
const KNOWN = {
  market: 1_450_082,
  sale: 1_450_082,
  cash: 1_350_000,
  listing: 1_499_900,
  net: 1_406_580,
};

function coreResult(status = 'SUCCESS', netOverride?: number | null) {
  return {
    status,
    confidenceScore: 88,
    vehicle: { year: 2022, brand: 'Peugeot', model: '308', variant: '1.2 PureTech', package: '', bodyType: '', fuelType: '', transmission: '' },
    results: {
      vehicleSpecificationId: null,
      marketReferenceValue: KNOWN.market,
      conditionAdjustedSaleValue: KNOWN.sale,
      expectedSalePrice: KNOWN.sale,
      fairMarketValue: KNOWN.sale,
      cashOffer: KNOWN.cash,
      cashOfferMin: KNOWN.cash - 20_000,
      consignmentListingPrice: KNOWN.listing,
      customerConsignmentNet: netOverride === undefined ? KNOWN.net : netOverride,
      confidenceScore: 88,
      requiresManualApproval: status === 'MANUAL_EVALUATION_REQUIRED',
    },
    aiAnalysis: [],
    comparableListings: [],
  };
}

describe('Konsinye musteri neti — kalici saklama', () => {
  test('Net, cekirdekten geldigi gibi DB alanina yazilir', async () => {
    const { svc, created } = makeService(coreResult());
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(created).toHaveLength(1);
    expect(created[0].customerConsignmentNet).toBe(KNOWN.net);
  });

  test('Ilan fiyati ile net AYRI alanlarda saklanir', async () => {
    const { svc, created } = makeService(coreResult());
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(created[0].maxExpectedValue).toBe(KNOWN.listing);
    expect(created[0].customerConsignmentNet).toBe(KNOWN.net);
    expect(created[0].customerConsignmentNet).not.toBe(created[0].maxExpectedValue);
  });

  test('API sonucu ile DB anlik goruntusu BIREBIR ayni', async () => {
    const { svc, created } = makeService(coreResult());
    const res: any = await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(created[0].customerConsignmentNet).toBe(res.results.customerConsignmentNet);
    expect(created[0].maxExpectedValue).toBe(res.results.consignmentListingPrice);
  });

  test('Net; komisyon/ilan/nakit uzerinden YENIDEN HESAPLANMAZ', async () => {
    // Cekirdek beklenmedik bir deger dondurse bile servis onu OLDUGU GIBI yazar.
    const odd = 1_234_567;
    const { svc, created } = makeService(coreResult('SUCCESS', odd));
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(created[0].customerConsignmentNet).toBe(odd);
  });

  test('Net yoksa NULL yazilir, tahmin URETILMEZ', async () => {
    const { svc, created } = makeService(coreResult('SUCCESS', null));
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(created[0].customerConsignmentNet).toBeNull();
    // Ilan fiyatina ya da nakde DUSULMEZ.
    expect(created[0].customerConsignmentNet).not.toBe(KNOWN.listing);
    expect(created[0].customerConsignmentNet).not.toBe(KNOWN.cash);
  });

  test('MANUAL kayitlarda da net saklanir', async () => {
    const { svc, created } = makeService(coreResult('MANUAL_EVALUATION_REQUIRED'));
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(created[0].evaluationStatus).toBe('MANUAL_EVALUATION_REQUIRED');
    expect(created[0].customerConsignmentNet).toBe(KNOWN.net);
  });

  test('Bildirime hem ilan fiyati hem net AYRI AYRI gecirilir', async () => {
    const { svc, notified } = makeService(coreResult());
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(notified).toHaveLength(1);
    expect(notified[0].finalConsignmentPrice).toBe(KNOWN.listing);
    expect(notified[0].customerConsignmentNet).toBe(KNOWN.net);
  });

  test('Ekonomik siralama korunur: nakit < net < beklenen satis <= ilan', async () => {
    const { svc, created } = makeService(coreResult());
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');
    const row = created[0];

    expect(row.estimatedValue).toBeLessThan(row.customerConsignmentNet);
    expect(row.customerConsignmentNet).toBeLessThan(row.conditionAdjustedSaleValue);
    expect(row.conditionAdjustedSaleValue).toBeLessThanOrEqual(row.maxExpectedValue);
  });
});
