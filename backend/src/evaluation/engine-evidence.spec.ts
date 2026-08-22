/**
 * engine-evidence.spec.ts
 *
 * MOTOR KIMLIGI KANITI TEK KAYNAKTAN OKUNUR.
 *
 * Emsal motoru hedefin motorunu iki yoldan taniyabilir:
 *   CUSTOMER_FIELD        musterinin sectigi motor alani acik imza tasiyor
 *   FULL_MODEL_SIGNATURE  alan bos ama TAM MODEL acik imza tasiyor
 *                         ("1.5 BlueHDi Performance Line")
 *   NONE                  guvenilir motor kimligi yok
 *
 * Bulunan hata: fiyat/guven katmani (`computePricing`) ayni gercegi ikinci kez,
 * yalnizca motor ALANINA bakarak turetiyordu. Alan bos oldugunda kanit gercekte
 * VARKEN "motor bilinmiyor" sayiliyor, guven 60'a tavanlaniyor ve arac MANUEL'e
 * gidiyordu. Olculen: 1.413 fiyatlanan hedefin 349'u (%24,7); 349/349 MANUAL,
 * 205'i L1 birebir, 140'i L1 + >=8 emsal.
 *
 * Bu test kanit kuralini sabitler. Kanit YOKSA eski guvenlik davranisi aynen
 * korunmalidir; kanit tek basina AUTO URETMEZ.
 */
import { EmsalMatcherService } from './emsal-matcher.service';
import { EvaluationService } from './evaluation.service';
import { explicitEngineSignature, isEngineCompatible } from './listing-attributes';

function listing(over: Partial<any> = {}) {
  return {
    sourceListingId: 'L' + Math.random().toString(36).slice(2, 10),
    rawMake: 'DS Automobiles', rawModel: 'DS 4', canonicalModel: 'DS 4',
    rawVariant: null, canonicalVariant: null,
    canonicalTrim: '1.5 BlueHDi Performance Line',
    canonicalBodyType: '', canonicalFuelType: 'Dizel', canonicalTransmission: 'Otomatik',
    rawTitle: 'DS 4 1.5 BlueHDi Performance Line', year: 2023,
    mileageKm: 60_000, price: 1_800_000, city: 'İstanbul',
    isDamaged: false, scrapedAt: new Date(),
    ...over,
  };
}

function matcherWith(rows: any[]) {
  const prisma: any = { rawVehicleListing: { findMany: async () => rows } };
  return new EmsalMatcherService(prisma);
}

const POOL_FULLMODEL = Array.from({ length: 20 }, (_, i) =>
  listing({ price: 1_700_000 + i * 10_000, mileageKm: 50_000 + i * 2_000 }),
);

describe('Motor kimligi kaniti — tek dogru kaynak', () => {
  test('1) Musterinin ACIK motor alani kanit sayilir (CUSTOMER_FIELD)', async () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      listing({ canonicalVariant: '1.5 dCi', canonicalTrim: 'Touch', rawTitle: 'Megane 1.5 dCi Touch', price: 900_000 + i * 5_000 }),
    );
    const res: any = await matcherWith(rows).matchComparableListings({
      make: 'DS Automobiles', model: 'DS 4', variant: '1.5 dCi', trim: 'Touch',
      year: 2023, mileageKm: 60_000,
    });
    expect(res.engineEvidence.source).toBe('CUSTOMER_FIELD');
    expect(res.engineEvidence.strong).toBe(true);
    expect(res.engineEvidence.signature).toContain('1.5');
  });

  test('2) Motor alani BOS ama TAM MODEL acik imza tasiyor (FULL_MODEL_SIGNATURE)', async () => {
    const res: any = await matcherWith(POOL_FULLMODEL).matchComparableListings({
      make: 'DS Automobiles', model: 'DS 4',
      variant: undefined, trim: '1.5 BlueHDi Performance Line',
      year: 2023, mileageKm: 60_000,
    });
    expect(res.engineEvidence.source).toBe('FULL_MODEL_SIGNATURE');
    expect(res.engineEvidence.strong).toBe(true);
    expect(res.engineEvidence.signature).toBe('1.5 BlueHDi');
  });

  test('3a) Musteri MOTOR ALANI hacimsiz olsa da kanittir (EKLEMELI kural)', async () => {
    // "TDI" / "CDI" / "CVVT": hacim MODEL adinda ("Rio 1.25", "A6 40", "C 180").
    // Bunlar paket terimi degil, musterinin MOTOR beyanidir; emsal motoru
    // eslemeyi zaten bunlarla kisitlar. Kanit sayilmazsa 37 arac gereksiz yere
    // AUTO -> MANUAL'e duser (olculdu).
    for (const eng of ['TDI', 'CDI', 'CVVT', 'TFSI', 'BlueEfficiency']) {
      const rows = Array.from({ length: 20 }, () =>
        listing({ canonicalVariant: eng, canonicalTrim: 'Comfort', rawTitle: 'X ' + eng }));
      const res: any = await matcherWith(rows).matchComparableListings({
        make: 'DS Automobiles', model: 'DS 4', variant: eng, trim: 'Comfort',
        year: 2023, mileageKm: 60_000,
      });
      expect(res.engineEvidence.source).toBe('CUSTOMER_FIELD');
      expect(res.engineEvidence.strong).toBe(true);
    }
  });

  test('3) PAKET-ONLY metin motor kaniti DEGILDIR', async () => {
    for (const pkg of ['AMG', 'M', 'Sport', 'Premium', 'Luxury', 'Comfort', 'Highline']) {
      expect(explicitEngineSignature(pkg)).toBe('');
      const rows = Array.from({ length: 20 }, () => listing({ canonicalTrim: pkg, rawTitle: 'X ' + pkg }));
      const res: any = await matcherWith(rows).matchComparableListings({
        make: 'DS Automobiles', model: 'DS 4', variant: undefined, trim: pkg,
        year: 2023, mileageKm: 60_000,
      });
      expect(res.engineEvidence.source).toBe('NONE');
      expect(res.engineEvidence.strong).toBe(false);
    }
  });

  test('4) Hic motor sinyali yoksa eski guvenlik davranisi KORUNUR', async () => {
    const rows = Array.from({ length: 20 }, () => listing({ canonicalVariant: null, canonicalTrim: '' }));
    const res: any = await matcherWith(rows).matchComparableListings({
      make: 'DS Automobiles', model: 'DS 4', variant: undefined, trim: undefined,
      year: 2023, mileageKm: 60_000,
    });
    expect(res.engineEvidence.source).toBe('NONE');
    expect(res.engineEvidence.strong).toBe(false);
    // Emsal motorunun kendi tavani da aynen calisir
    expect(res.confidenceScore).toBeLessThanOrEqual(70);
    expect(res.isLimitedComps).toBe(true);
  });

  test('5) TAM MODEL kaniti KALICI sahte musteri motoru URETMEZ', async () => {
    const created: any[] = [];
    const prisma: any = {
      rawVehicleListing: { findMany: async () => POOL_FULLMODEL },
      manufacturer: { findUnique: async () => ({ name: 'DS Automobiles' }) },
      model: { findUnique: async () => ({ name: 'DS 4' }), findFirst: async () => ({ id: 'md1' }) },
      vehicleSpecification: { findFirst: async () => null },
      vehicleEvaluation: { create: async (a: any) => { created.push(a.data); return { id: 'e1' }; } },
    };
    const svc = new EvaluationService(prisma, { sendEvaluationNotification: async () => undefined } as any, new EmsalMatcherService(prisma));
    const res: any = await svc.evaluateVehicle({
      year: 2023, manufacturerId: 'mf1', modelId: 'md1',
      observedMake: 'DS Automobiles', observedModel: 'DS 4',
      observedTrim: '1.5 BlueHDi Performance Line',
      mileage: 60_000, color: 'Beyaz', damageStatus: 'NO', tramerAmount: '0 TL',
      licensePlate: '34QA1234', firstName: 'A', lastName: 'B', phone: '05551112233',
      sellingTimeline: '1 ay', userDesiredPrice: 0,
    } as any);
    // Musteri motor SECMEDI -> kimlik alani bos kalir, "1.5 BlueHDi" UYDURULMAZ
    expect(res.vehicle.variant).toBeFalsy();
    expect(created[0].vehicleEngine).toBeFalsy();
    // ...ama paket (musterinin gercek secimi) korunur
    expect(res.vehicle.package).toBe('1.5 BlueHDi Performance Line');
  });

  test('6) Yanlis motor karisimi olusmaz (TCe != SCe, TDI != TSI)', async () => {
    expect(isEngineCompatible('1.0 TCe', '1.0 SCe', true)).toBe(false);
    expect(isEngineCompatible('1.6 TDI', '1.6 TSI', true)).toBe(false);
    const mixed = [
      ...Array.from({ length: 12 }, () => listing({ canonicalTrim: '1.5 BlueHDi Performance Line' })),
      ...Array.from({ length: 12 }, () => listing({ canonicalTrim: '1.2 Puretech Performance Line', rawTitle: 'DS 4 1.2 Puretech' })),
    ];
    const res: any = await matcherWith(mixed).matchComparableListings({
      make: 'DS Automobiles', model: 'DS 4', variant: undefined,
      trim: '1.5 BlueHDi Performance Line', year: 2023, mileageKm: 60_000,
    });
    expect(res.level).toBe(1);
    const wrong = res.cleanListings.filter(
      (l: any) => !isEngineCompatible('1.5 BlueHDi', explicitEngineSignature(l.trim || ''), true),
    );
    expect(wrong.length).toBe(0);
  });

  test('7) Motor kaniti BASKA bir manuel sebebi EZEMEZ', async () => {
    const prisma: any = {
      rawVehicleListing: { findMany: async () => POOL_FULLMODEL },
      manufacturer: { findUnique: async () => ({ name: 'DS Automobiles' }) },
      model: { findUnique: async () => ({ name: 'DS 4' }), findFirst: async () => ({ id: 'md1' }) },
      vehicleSpecification: { findFirst: async () => null },
      vehicleEvaluation: { create: async () => ({ id: 'e1' }) },
    };
    const svc = new EvaluationService(prisma, { sendEvaluationNotification: async () => undefined } as any, new EmsalMatcherService(prisma));
    const base: any = {
      year: 2023, manufacturerId: 'mf1', modelId: 'md1',
      observedMake: 'DS Automobiles', observedModel: 'DS 4',
      observedTrim: '1.5 BlueHDi Performance Line',
      mileage: 60_000, color: 'Beyaz',
      licensePlate: '34QA1234', firstName: 'A', lastName: 'B', phone: '05551112233',
      sellingTimeline: '1 ay', userDesiredPrice: 0,
    };
    // Yapisal hasar beyani: motor kaniti guclu olsa da MANUEL kalmali
    const structural: any = await svc.evaluateVehicle({
      ...base, damageStatus: 'YES', tramerAmount: '0 TL', paintScheme: '{}',
      chassisState: JSON.stringify({ 'Şasi': 'Düzeltme yapıldı' }),
      vehicleStatus: JSON.stringify({ heavyDamage: false, airbagDeployed: false, engineProblem: false, transmissionProblem: false }),
    });
    expect(structural.status).toBe('MANUAL_EVALUATION_REQUIRED');
    expect(structural.results.requiresManualApproval).toBe(true);

    // Airbag
    const airbag: any = await svc.evaluateVehicle({
      ...base, damageStatus: 'YES', tramerAmount: '0 TL', paintScheme: '{}',
      chassisState: JSON.stringify({ 'Şasi': '' }),
      vehicleStatus: JSON.stringify({ heavyDamage: false, airbagDeployed: true, engineProblem: false, transmissionProblem: false }),
    });
    expect(airbag.status).toBe('MANUAL_EVALUATION_REQUIRED');
  });
});
