/**
 * evaluation-status-persistence.spec.ts
 *
 * REGRESYON: degerleme kaydedilirken arka ucun hesapladigi GERCEK durum
 * (`evaluationStatus`) veritabanina AYNEN yazilmalidir.
 *
 * Bulunan hata: durum hicbir yerde saklanmiyordu. Galeri paneli her kaydi
 * "otomatik teklif" gibi gosteriyordu; manuel incelemeye dusen arac (yapisal
 * hasar, airbag, motor/sanziman arizasi, Tramer >= %20, 3+ degisen panel)
 * ile gercekten otomatik teklif alan arac panelde AYIRT EDILEMIYORDU.
 *
 * Durum `aiAnalysis`, `confidenceScore` ya da fiyat alanlarindan TURETILMEZ:
 * bunlar durumun NEDENI olabilir ama durumun kendisi degildir.
 *
 * Eski kayitlar icin GERIYE DOLDURMA YOK: alan NULL kalir ve NULL dogru
 * cevaptir (bkz. 20260822180000_add_evaluation_status_snapshot).
 */
import { EvaluationService } from './evaluation.service';

/** `vehicleEvaluation.create` cagrilarini yakalayan servis kurulumu. */
function makeService(coreResult: any) {
  const created: any[] = [];
  const prisma: any = {
    vehicleEvaluation: {
      create: async (args: any) => {
        created.push(args.data);
        return { id: 'eval-1' };
      },
    },
    rawVehicleListing: { findMany: async () => [] },
  };
  const telegram: any = { sendEvaluationNotification: async () => undefined };
  const matcher: any = {};
  const svc = new EvaluationService(prisma, telegram, matcher);
  (svc as any).calculateValuationCore = async () => coreResult;
  return { svc, created };
}

const BASE_DTO: any = {
  year: 2018, manufacturerId: 'm1', modelId: 'md1', mileage: 100_000, color: 'Beyaz',
  damageStatus: 'NO', licensePlate: '34QA1234', firstName: 'A', lastName: 'B',
  phone: '05551112233', sellingTimeline: '1 ay', userDesiredPrice: 0,
};

function coreResult(status: string, aiAnalysis: string[] = ['not']) {
  return {
    status,
    confidenceScore: 62,
    message: 'dahili mesaj',
    vehicle: { year: 2018, brand: 'Volkswagen', model: 'Passat', variant: '', package: '1.6 TDI Comfortline', bodyType: '', fuelType: 'Dizel', transmission: '' },
    results: {
      vehicleSpecificationId: null,
      cashOffer: 900_000, cashOfferMin: 875_000, consignmentListingPrice: 1_050_900,
      confidenceScore: 62, fairMarketValue: 1_000_000,
      marketReferenceValue: 1_000_000, conditionAdjustedSaleValue: 980_000,
      requiresManualApproval: status === 'MANUAL_EVALUATION_REQUIRED',
    },
    aiAnalysis,
    comparableListings: [],
  };
}

describe('Degerleme durumu — kalici saklama', () => {
  test('SUCCESS veritabanina SUCCESS olarak yazilir', async () => {
    const { svc, created } = makeService(coreResult('SUCCESS'));
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');
    expect(created).toHaveLength(1);
    expect(created[0].evaluationStatus).toBe('SUCCESS');
  });

  test('MANUAL_EVALUATION_REQUIRED veritabanina AYNEN yazilir', async () => {
    const { svc, created } = makeService(coreResult('MANUAL_EVALUATION_REQUIRED'));
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');
    expect(created).toHaveLength(1);
    expect(created[0].evaluationStatus).toBe('MANUAL_EVALUATION_REQUIRED');
  });

  test('Istemciye donen durum ile VERITABANINA yazilan durum AYNIDIR', async () => {
    for (const s of ['SUCCESS', 'MANUAL_EVALUATION_REQUIRED']) {
      const { svc, created } = makeService(coreResult(s));
      const res: any = await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');
      expect(created[0].evaluationStatus).toBe(res.status);
    }
  });

  /**
   * YAPISAL HASAR ve YUKSEK TRAMER cekirdekte MANUEL kapisina takilir.
   * Servis katmani bu durumu yeniden YORUMLAMAZ; API ile DB birebir esittir.
   */
  test('Yapisal hasar: API MANUAL ise DB de MANUAL', async () => {
    const core = coreResult('MANUAL_EVALUATION_REQUIRED', ['Yapisal/sasi hasari tespit edildi']);
    const { svc, created } = makeService(core);
    const res: any = await svc.evaluateVehicle({ ...BASE_DTO, damageStatus: 'YES' }, '127.0.0.1');
    expect(res.status).toBe('MANUAL_EVALUATION_REQUIRED');
    expect(created[0].evaluationStatus).toBe('MANUAL_EVALUATION_REQUIRED');
  });

  test('Yuksek Tramer: API MANUAL ise DB de MANUAL', async () => {
    const core = coreResult('MANUAL_EVALUATION_REQUIRED', ['Tramer orani %20 uzerinde']);
    const { svc, created } = makeService(core);
    const res: any = await svc.evaluateVehicle({ ...BASE_DTO, damageStatus: 'YES' }, '127.0.0.1');
    expect(res.status).toBe('MANUAL_EVALUATION_REQUIRED');
    expect(created[0].evaluationStatus).toBe('MANUAL_EVALUATION_REQUIRED');
  });

  /**
   * Durum METINDEN turetilirse bu test kirilir: aiAnalysis manuel gibi
   * okunsa da cekirdek SUCCESS dediyse SUCCESS saklanir.
   */
  test('Durum aiAnalysis metninden TURETILMEZ', async () => {
    const misleading = [
      'Yapisal hasar', 'airbag acilmis', 'uzman incelemesi gerekiyor',
      'MANUAL_EVALUATION_REQUIRED',
    ];
    const { svc, created } = makeService(coreResult('SUCCESS', misleading));
    const res: any = await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');
    expect(res.status).toBe('SUCCESS');
    expect(created[0].evaluationStatus).toBe('SUCCESS');
  });

  test('Durum confidenceScore veya fiyat alanlarindan TURETILMEZ', async () => {
    const core = coreResult('SUCCESS');
    core.confidenceScore = 0;
    core.results.confidenceScore = 0;
    const { svc, created } = makeService(core);
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');
    expect(created[0].evaluationStatus).toBe('SUCCESS');
  });

  /**
   * INSUFFICIENT_DATA ve DATA_INTEGRITY_ERROR eskisi gibi HIC KAYIT ACMADAN
   * doner; bu yuzden bu durumlar sutunda hic olusmaz. Davranis DEGISMEDI.
   */
  test('Kayit acmayan durumlar icin hicbir satir yazilmaz', async () => {
    for (const s of ['INSUFFICIENT_DATA', 'DATA_INTEGRITY_ERROR']) {
      const { svc, created } = makeService({
        status: s, confidenceScore: 0, message: 'yok',
        results: null, vehicle: null, aiAnalysis: [], comparableListings: [],
      });
      const res: any = await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');
      expect(res.status).toBe(s);
      expect(created).toHaveLength(0);
    }
  });

  /** Eski kayitlar icin uydurma bir varsayilan YAZILMAZ. */
  test('Sabit varsayilan durum yazilmaz — deger her zaman cekirdekten gelir', async () => {
    const { svc, created } = makeService(coreResult('MANUAL_EVALUATION_REQUIRED'));
    await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');
    expect(created[0].evaluationStatus).not.toBe('SUCCESS');
  });
});
