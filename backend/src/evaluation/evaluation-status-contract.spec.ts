/**
 * evaluation-status-contract.spec.ts
 *
 * REGRESYON: /vehicle-evaluation yaniti, guvenlik katmaninin hesapladigi
 * DURUMU aynen tasimalidir.
 *
 * Bulunan hata: `evaluateVehicle` donen nesnede `status: 'SUCCESS'` SABIT
 * yaziliyordu. Cekirdek (`calculateValuationCore`) yapisal hasar, airbag,
 * motor/sanziman arizasi, Tramer >= %20, 3+ degisen panel, kasa belirsizligi,
 * Seviye 3, dusuk emsal/guven ya da musteri tabani catismasi nedeniyle
 * 'MANUAL_EVALUATION_REQUIRED' uretse bile istemciye 'SUCCESS' gidiyordu.
 * Istemci yalnizca `status` alanina baktigi icin manuel ekrani hic acilmiyor,
 * manuel kapisina takilan araca TAMAMLANMIS OTOMATIK TEKLIF gosteriliyordu.
 *
 * Olculen etki (1.593 gercek hedef, temiz kondisyon): fiyatlanan 1.376
 * degerlemenin 978'i (%71) manuel kapisindaydi.
 */
import { EvaluationService } from './evaluation.service';

function makeService(coreResult: any) {
  const prisma: any = {
    vehicleEvaluation: { create: async () => ({ id: 'eval-1' }) },
    rawVehicleListing: { findMany: async () => [] },
  };
  const telegram: any = { sendEvaluationNotification: async () => undefined };
  const matcher: any = {};
  const svc = new EvaluationService(prisma, telegram, matcher);
  (svc as any).calculateValuationCore = async () => coreResult;
  return svc;
}

const BASE_DTO: any = {
  year: 2018, manufacturerId: 'm1', modelId: 'md1', mileage: 100_000, color: 'Beyaz',
  damageStatus: 'NO', licensePlate: '34QA1234', firstName: 'A', lastName: 'B',
  phone: '05551112233', sellingTimeline: '1 ay', userDesiredPrice: 0,
};

function coreResult(status: string) {
  return {
    status,
    confidenceScore: 62,
    message: 'dahili mesaj',
    vehicle: { year: 2018, brand: 'Volkswagen', model: 'Passat', variant: '', package: '1.6 TDI Comfortline', bodyType: '', fuelType: 'Dizel', transmission: '' },
    results: {
      vehicleSpecificationId: null,
      cashOffer: 900_000, cashOfferMin: 875_000, consignmentListingPrice: 1_050_900,
      confidenceScore: 62, fairMarketValue: 1_000_000,
      requiresManualApproval: status === 'MANUAL_EVALUATION_REQUIRED',
    },
    aiAnalysis: ['not'],
    comparableListings: [],
  };
}

describe('Degerleme yaniti — durum sozlesmesi', () => {
  test('MANUEL kapisina takilan arac istemciye MANUAL_EVALUATION_REQUIRED doner', async () => {
    const svc = makeService(coreResult('MANUAL_EVALUATION_REQUIRED'));
    const res: any = await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');
    expect(res.status).toBe('MANUAL_EVALUATION_REQUIRED');
  });

  test('Guvenli arac SUCCESS doner', async () => {
    const svc = makeService(coreResult('SUCCESS'));
    const res: any = await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');
    expect(res.status).toBe('SUCCESS');
  });

  test('Durum ne olursa olsun degerleme KAYDEDILIR ve evaluationId doner', async () => {
    for (const s of ['SUCCESS', 'MANUAL_EVALUATION_REQUIRED']) {
      const svc = makeService(coreResult(s));
      const res: any = await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');
      expect(res.evaluationId).toBe('eval-1');
      expect(res.persisted).toBe(true);
      expect(res.vehicle).toBeTruthy();
      expect(res.results).toBeTruthy();
    }
  });

  test('results.requiresManualApproval ile ust duzey status TUTARLI', async () => {
    for (const s of ['SUCCESS', 'MANUAL_EVALUATION_REQUIRED']) {
      const svc = makeService(coreResult(s));
      const res: any = await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');
      expect(res.results.requiresManualApproval).toBe(res.status === 'MANUAL_EVALUATION_REQUIRED');
    }
  });

  test('INSUFFICIENT_DATA ve DATA_INTEGRITY_ERROR eskisi gibi kayit YAPMADAN doner', async () => {
    for (const s of ['INSUFFICIENT_DATA', 'DATA_INTEGRITY_ERROR']) {
      const svc = makeService({ status: s, confidenceScore: 0, message: 'yok', results: null, vehicle: null, aiAnalysis: [], comparableListings: [] });
      const res: any = await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');
      expect(res.status).toBe(s);
      expect(res.evaluationId).toBeUndefined();
      expect(res.results).toBeNull();
    }
  });

  test('Dahili cekirdek mesaji musteriye SIZDIRILMAZ', async () => {
    const svc = makeService(coreResult('MANUAL_EVALUATION_REQUIRED'));
    const res: any = await svc.evaluateVehicle(BASE_DTO, '127.0.0.1');
    expect(res.message).toBeUndefined();
  });
});
