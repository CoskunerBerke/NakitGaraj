/**
 * target-identity-evidence.spec.ts
 *
 * REGRESYON: Degerlemenin HEDEF KIMLIGI yalnizca musterinin GERCEKTEN
 * yaptigi secimden gelir. Katalog (VehicleSpecification) teknik zenginlestirme
 * icindir; musteri secmediyse motor/paket/yakit/sanziman KANIT DEGILDIR.
 *
 * Bulunan hata: musteri motor secmediginde (arayuzdeki "Motor bilgisi
 * belirtilmemis" secenegi -> variantId gonderilmez) `calculateValuationCore`
 * katalogtan RASTGELE bir spec satiri cekiyordu
 *   Fallback 3: findFirst({ manufacturerId, modelId })
 * ve o satirin variant/package/fuel/transmission degerlerini musterinin
 * aracinin kimligi gibi kullaniyordu. Sonuclar (olculmus, gercek veri):
 *   - Renault Megane 2017 (1.243 ilan) -> musteriye "Megane E-Tech Electric"
 *     motoru gosteriliyor ve 937.707 TL piyasa / 860.000 TL nakit uretiliyordu.
 *   - Hyundai i20 / Citroen C-Elysee / Tesla Model Y -> paket "AMG / M / Sport Line"
 *   - Opel Astra 2012 (1.498 gercek ilan) -> INSUFFICIENT_DATA, cunku uydurma
 *     etiket TUM gercek emsalleri havuzdan eliyordu.
 * Korpusta >=20 emsali olan 146 hedefin %47,3'u bu yuzden fiyat alamiyordu.
 *
 * Emsal motoru ayni korumayi KASA TIPI icin zaten uyguluyor
 * (emsal-matcher.service.ts: `bodySignalDropped` — "havuzda gorulmeyen etiket
 * kanit degildir"). Bu test ayni ilkeyi motor/paket/yakit/sanziman icin sabitler.
 */
import { EvaluationService } from './evaluation.service';

const SPEC_FROM_CATALOG = {
  id: 'spec-1',
  manufacturer: { name: 'Renault' },
  model: { name: 'Megane' },
  // Katalogtaki RASTGELE satir: musteri bunu SECMEDI
  variant: { name: 'Megane E-Tech Electric', engineSize: '', horsepower: 0 },
  package: { name: 'Joy' },
  bodyType: { name: 'Sedan' },
  fuelType: { name: 'Elektrik' },
  transmissionType: { name: 'Otomatik' },
  driveType: null,
  marketPrices: [],
  originalMSRP: null,
  year: 2017,
};

function makeService(capture: { args?: any }) {
  const prisma: any = {
    manufacturer: { findUnique: async () => ({ name: 'Renault' }) },
    model: { findUnique: async () => ({ name: 'Megane' }), findFirst: async () => ({ id: 'md1' }) },
    vehicleSpecification: { findFirst: async () => SPEC_FROM_CATALOG },
    rawVehicleListing: { findMany: async () => [] },
    vehicleEvaluation: { create: async () => ({ id: 'e1' }) },
  };
  const matcher: any = {
    matchComparableListings: async (args: any) => {
      capture.args = args;
      return {
        level: 4, matchedCount: 0, cleanListings: [], confidenceScore: 0,
        isLimitedComps: true, explanationNote: 'yok', uniqueListingIds: [],
      };
    },
  };
  return new EvaluationService(prisma, { sendEvaluationNotification: async () => undefined } as any, matcher);
}

const BASE: any = {
  year: 2017, manufacturerId: 'mf1', modelId: 'md1',
  mileage: 120_000, color: 'Beyaz', damageStatus: 'NO', tramerAmount: '0 TL',
  licensePlate: '34QA1234', firstName: 'A', lastName: 'B', phone: '05551112233',
  sellingTimeline: '1 ay', userDesiredPrice: 0,
};

describe('Hedef kimligi yalniz MUSTERI KANITINDAN gelir', () => {
  test('motor SECILMEDIYSE katalog variant adi hedefe UYDURULMAZ', async () => {
    const cap: { args?: any } = {};
    const svc = makeService(cap);
    await (svc as any).calculateValuationCore({ ...BASE });
    expect(cap.args.variant).toBeFalsy();
  });

  test('paket SECILMEDIYSE katalog package adi hedefe UYDURULMAZ', async () => {
    const cap: { args?: any } = {};
    const svc = makeService(cap);
    await (svc as any).calculateValuationCore({ ...BASE });
    expect(cap.args.trim).toBeFalsy();
  });

  test('yakit/sanziman SECILMEDIYSE katalogtan hedefe UYDURULMAZ', async () => {
    const cap: { args?: any } = {};
    const svc = makeService(cap);
    await (svc as any).calculateValuationCore({ ...BASE });
    expect(cap.args.fuelType).toBeFalsy();
    expect(cap.args.transmission).toBeFalsy();
  });

  test('musteriye donen arac kimliginde de uydurma motor/paket YOK', async () => {
    const svc = makeService({});
    const res: any = await (svc as any).calculateValuationCore({ ...BASE });
    expect(res.vehicle.variant).toBeFalsy();
    expect(res.vehicle.package).toBeFalsy();
    // marka/model katalogtan gelmeye devam eder (musteri bunlari SECTI)
    expect(res.vehicle.brand).toBe('Renault');
    expect(res.vehicle.model).toBe('Megane');
  });

  test('musteri GERCEKTEN katalog motorunu sectiyse o motor KULLANILIR', async () => {
    const cap: { args?: any } = {};
    const svc = makeService(cap);
    await (svc as any).calculateValuationCore({ ...BASE, variantId: 'v-catalog-1', packageId: 'p-catalog-1' });
    expect(cap.args.variant).toBe('Megane E-Tech Electric');
    expect(cap.args.trim).toBe('Joy');
  });

  test('gozlenen (OBS) secim her zaman oncelikli', async () => {
    const cap: { args?: any } = {};
    const svc = makeService(cap);
    await (svc as any).calculateValuationCore({
      ...BASE, modelId: 'OBS:Megane', variantId: 'OBS:1.5 dCi', packageId: 'OBS:Touch',
    });
    expect(cap.args.variant).toBe('1.5 dCi');
    expect(cap.args.trim).toBe('Touch');
  });
});
