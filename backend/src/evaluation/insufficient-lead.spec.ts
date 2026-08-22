/**
 * insufficient-lead.spec.ts
 *
 * REGRESYON: yeterli piyasa verisi bulunamadiginda musteri KAYBOLMAMALI.
 *
 * Bulunan hata: INSUFFICIENT_DATA `vehicleEvaluation.create` cagrilmadan ONCE
 * donuyordu ve baska hicbir yere de yazilmiyordu. Musterinin ad, telefon ve
 * arac bilgisi tamamen kayboluyordu (olculen: 1.593 hedefin 180'i, %11,3).
 * Musteri kendisi aramazsa galeri bu denemeden HABERSIZ kaliyordu.
 *
 * Cozum: `VehicleEvaluation` YINE ACILMAZ (ortada gercek degerleme yok, fiyat
 * alanlari zorunlu Float ve 0 yazmak PARA UYDURMAK olurdu). Bunun yerine
 * mevcut `VehicleRequest` akisi yeniden kullanilir.
 */
import { EvaluationService } from './evaluation.service';

function makeService(coreResult: any, opts: { existingLead?: any } = {}) {
  const evaluations: any[] = [];
  const leads: any[] = [];
  const leadQueries: any[] = [];

  const prisma: any = {
    vehicleEvaluation: {
      create: async (args: any) => {
        evaluations.push(args.data);
        return { id: 'eval-1' };
      },
    },
    vehicleRequest: {
      findFirst: async (args: any) => {
        leadQueries.push(args.where);
        return opts.existingLead ?? null;
      },
      create: async (args: any) => {
        leads.push(args.data);
        return { id: 'lead-1' };
      },
    },
    manufacturer: { findUnique: async () => ({ name: 'Katalog Marka' }) },
    model: { findUnique: async () => ({ name: 'Katalog Model' }) },
    rawVehicleListing: { findMany: async () => [] },
  };
  const telegram: any = { sendEvaluationNotification: async () => undefined };
  const matcher: any = {};
  const svc = new EvaluationService(prisma, telegram, matcher);
  (svc as any).calculateValuationCore = async () => coreResult;
  return { svc, evaluations, leads, leadQueries };
}

const BASE_DTO: any = {
  year: 2018, manufacturerId: 'm1', modelId: 'md1', mileage: 100_000, color: 'Beyaz',
  damageStatus: 'NO', licensePlate: '34QA1234', firstName: 'Ayşe', lastName: 'Yılmaz',
  phone: '05551112233', sellingTimeline: '1 ay', userDesiredPrice: 0,
};

/** Emsal bulunamayan cekirdek sonucu: arac kimligi DOGRULANMIS haliyle gelir. */
function insufficientWithVehicle() {
  return {
    status: 'INSUFFICIENT_DATA',
    confidenceScore: 0,
    message: 'Yeterli piyasa verisi bulunamadı',
    vehicle: { year: 2018, brand: 'Volkswagen', model: 'Passat', variant: '', package: '', bodyType: '', fuelType: '', transmission: '' },
    results: null,
    aiAnalysis: [],
    comparableListings: [],
  };
}

/** Katalog karsiligi bulunamayan cekirdek sonucu: vehicle NULL doner. */
function insufficientWithoutVehicle() {
  return {
    status: 'INSUFFICIENT_DATA', confidenceScore: 0, message: 'Yeterli piyasa verisi bulunamadı',
    vehicle: null, results: null, aiAnalysis: [], comparableListings: [],
  };
}

function pricedResult(status: string) {
  return {
    status, confidenceScore: 62, message: 'dahili',
    vehicle: { year: 2018, brand: 'Volkswagen', model: 'Passat', variant: '', package: '', bodyType: '', fuelType: '', transmission: '' },
    results: {
      vehicleSpecificationId: null, cashOffer: 900_000, cashOfferMin: 875_000,
      consignmentListingPrice: 1_050_900, confidenceScore: 62, fairMarketValue: 1_000_000,
      requiresManualApproval: status === 'MANUAL_EVALUATION_REQUIRED',
    },
    aiAnalysis: [], comparableListings: [],
  };
}

describe('Yetersiz veri — musteri talebi korunur', () => {
  test('VehicleEvaluation ACILMAZ, VehicleRequest ACILIR', async () => {
    const { svc, evaluations, leads } = makeService(insufficientWithVehicle());
    const res: any = await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(res.status).toBe('INSUFFICIENT_DATA');
    expect(res.results).toBeNull();
    expect(res.evaluationId).toBeUndefined();
    expect(evaluations).toHaveLength(0);
    expect(leads).toHaveLength(1);
  });

  test('Musterinin adi ve telefonu SAKLANIR', async () => {
    const { svc, leads } = makeService(insufficientWithVehicle());
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(leads[0].firstName).toBe('Ayşe');
    expect(leads[0].lastName).toBe('Yılmaz');
    expect(leads[0].phone).toBe('05551112233');
  });

  test('Arac kimligi cekirdegin DOGRULADIGI degerden gelir', async () => {
    const { svc, leads } = makeService(insufficientWithVehicle());
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(leads[0].brand).toBe('Volkswagen');
    expect(leads[0].model).toBe('Passat');
    expect(leads[0].year).toBe(2018);
    expect(leads[0].mileage).toBe(100_000);
  });

  test('Kimlik cozulemezse musterinin gozlenen secimi kullanilir', async () => {
    const { svc, leads } = makeService(insufficientWithoutVehicle());
    await svc.evaluateVehicle(
      { ...BASE_DTO, observedMake: 'Abarth', observedModel: '500e' },
      '127.0.0.1',
    );

    expect(leads[0].brand).toBe('Abarth');
    expect(leads[0].model).toBe('500e');
  });

  test('Gozlenen secim de yoksa KATALOG adlarina dusulur', async () => {
    const { svc, leads } = makeService(insufficientWithoutVehicle());
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(leads[0].brand).toBe('Katalog Marka');
    expect(leads[0].model).toBe('Katalog Model');
  });

  /**
   * EN KRITIK TEST: hesaplanmamis hicbir para/teknik deger yazilmamali.
   */
  test('UYDURMA fiyat/motor/guven alani YAZILMAZ', async () => {
    const { svc, leads } = makeService(insufficientWithVehicle());
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    const forbidden = [
      'estimatedValue', 'cashOffer', 'finalOfferedPrice', 'marketReferenceValue',
      'conditionAdjustedSaleValue', 'consignmentListingPrice', 'confidenceScore',
      'fairMarketValue', 'engine', 'variant', 'trim',
    ];
    for (const key of forbidden) {
      expect(leads[0][key]).toBeUndefined();
    }
    // Sahip olunmayan musteri verisi de UYDURULMAZ.
    expect(leads[0].email).toBeUndefined();
    expect(leads[0].note).toBeUndefined();
  });

  test('Talep, katalog talebinden AYIRT EDILEBILIR kaynak tasir', async () => {
    const { svc, leads } = makeService(insufficientWithVehicle());
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(leads[0].source).toBe('INSUFFICIENT_VALUATION');
  });

  test('Kimlik hicbir yoldan cozulemezse talep ACILMAZ (yer tutucu yazilmaz)', async () => {
    const { svc, leads } = makeService(insufficientWithoutVehicle());
    (svc as any).prisma.manufacturer.findUnique = async () => null;
    (svc as any).prisma.model.findUnique = async () => null;

    const res: any = await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(res.status).toBe('INSUFFICIENT_DATA');
    expect(leads).toHaveLength(0);
  });
});

describe('Yetersiz veri — tekrar denemede kopya olusmaz', () => {
  test('Yakin zamanda ayni bekleyen talep varsa YENISI acilmaz', async () => {
    const { svc, leads } = makeService(insufficientWithVehicle(), {
      existingLead: { id: 'lead-onceki' },
    });
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(leads).toHaveLength(0);
  });

  test('Kopya sorgusu musteri + arac + bekleyen durum + zaman penceresi ile daraltilir', async () => {
    const { svc, leadQueries } = makeService(insufficientWithVehicle());
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    const where = leadQueries[0];
    expect(where.source).toBe('INSUFFICIENT_VALUATION');
    expect(where.status).toBe('PENDING');
    expect(where.phone).toBe('05551112233');
    expect(where.brand).toBe('Volkswagen');
    expect(where.model).toBe('Passat');
    expect(where.year).toBe(2018);
    expect(where.createdAt.gte).toBeInstanceOf(Date);
  });
});

describe('Yetersiz veri — diger durumlar etkilenmedi', () => {
  test('DATA_INTEGRITY_ERROR talep URETMEZ (teknik hata, satis firsati degil)', async () => {
    const { svc, evaluations, leads } = makeService({
      status: 'DATA_INTEGRITY_ERROR', confidenceScore: 0, message: 'ic mesaj',
      vehicle: null, results: null, aiAnalysis: [], comparableListings: [],
    });
    const res: any = await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(res.status).toBe('DATA_INTEGRITY_ERROR');
    expect(evaluations).toHaveLength(0);
    expect(leads).toHaveLength(0);
  });

  test('SUCCESS: degerleme kaydedilir, talep ACILMAZ', async () => {
    const { svc, evaluations, leads } = makeService(pricedResult('SUCCESS'));
    const res: any = await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(res.status).toBe('SUCCESS');
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0].evaluationStatus).toBe('SUCCESS');
    expect(leads).toHaveLength(0);
  });

  test('MANUAL: degerleme kaydedilir, talep ACILMAZ', async () => {
    const { svc, evaluations, leads } = makeService(pricedResult('MANUAL_EVALUATION_REQUIRED'));
    const res: any = await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(res.status).toBe('MANUAL_EVALUATION_REQUIRED');
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0].evaluationStatus).toBe('MANUAL_EVALUATION_REQUIRED');
    expect(leads).toHaveLength(0);
  });

  test('Talep yazimi hata verse bile musteri yaniti BOZULMAZ', async () => {
    const { svc } = makeService(insufficientWithVehicle());
    (svc as any).prisma.vehicleRequest.create = async () => { throw new Error('db down'); };

    const res: any = await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');

    expect(res.status).toBe('INSUFFICIENT_DATA');
    expect(res.results).toBeNull();
  });
});
