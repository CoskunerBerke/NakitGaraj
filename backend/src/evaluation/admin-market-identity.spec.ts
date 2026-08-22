/**
 * admin-market-identity.spec.ts
 *
 * GALERI PANELI SOZLESMESI.
 *
 * P2-2 — ARAC KIMLIGI
 *   Panel kimligi YALNIZCA `vehicleSpecification` iliskisinden okuyordu.
 *   Katalogda karsiligi olmayan gercek araclarda bu iliski NULL'dur (olculen:
 *   1.413 fiyatlanan degerlemenin %57,1'i) ve galeri listede "Araç" + bos
 *   model/yil goruyordu; musteriye giden WhatsApp sablonunda arac adi BOS
 *   gidiyordu. Kimlik artik degerleme anindaki DEGISMEZ snapshot alanlarindan
 *   okunur; spec yalnizca ESKI kayitlar icin yedektir.
 *
 * P2-3 — GERCEK PIYASA DEGERI
 *   Panel piyasa degerlerini nakit teklifden SABIT carpanlarla uretiyordu
 *   (cash / 0,88 · cash * 0,94 · cash * 0,96-1,30). Olculen gercek nakit/piyasa
 *   orani bantlara gore 0,843-0,942 arasinda degisir; sabit carpan yanlis bir
 *   "Sahibinden piyasa degeri" gosteriyordu. Fiyatlama V5'in GERCEK ciktilari
 *   artik degerleme aninda saklanir ve panel onlari okur. Eski kayitlarda alan
 *   NULL'dur ve GERIYE DOLDURULMAZ.
 */
import * as fs from 'fs';
import * as path from 'path';
import { EmsalMatcherService } from './emsal-matcher.service';
import { EvaluationService } from './evaluation.service';

const ADMIN_PAGE = path.resolve(
  __dirname, '../../../frontend/src/app/admin_panel/dashboard/valuations/page.tsx',
);

function adminSource(): string {
  expect(fs.existsSync(ADMIN_PAGE)).toBe(true);
  return fs.readFileSync(ADMIN_PAGE, 'utf8');
}

describe('Galeri paneli — arac kimligi', () => {
  test('Kimlik TEK bir cozumleyiciden okunur; dogrudan spec okumasi kalmadi', () => {
    const src = adminSource();
    expect(src).toContain('const vehicleIdentity =');
    // Cozumleyicinin KENDI govdesi disinda vehicleSpecification okunmamali.
    const reads = src.split('\n').filter(
      (l) => l.includes('vehicleSpecification') && !l.trim().startsWith('*') && !l.includes('const spec = item?.vehicleSpecification'),
    );
    expect(reads).toEqual([]);
  });

  test('Snapshot alanlari kimlik icin ONCELIKLIDIR', () => {
    const src = adminSource();
    for (const field of ['vehicleMake', 'vehicleModel', 'vehicleEngine', 'vehicleTrim', 'vehicleYear']) {
      expect(src).toContain(field);
    }
    // Oncelik sirasi: snapshot || spec  (tersi DEGIL)
    expect(src).toMatch(/item\?\.vehicleMake\s*\|\|\s*spec\?\.manufacturer\?\.name/);
    expect(src).toMatch(/item\?\.vehicleModel\s*\|\|\s*spec\?\.model\?\.name/);
  });

  test('Kimlik hic yoksa BOS degil, ACIK etiket gosterilir', () => {
    const src = adminSource();
    expect(src).toContain('Araç bilgisi bulunamadı');
  });

  test('WhatsApp sablonu kimligi ayni cozumleyiciden alir', () => {
    const src = adminSource();
    const wa = src.split('\n').find((l) => l.includes('wa.me/'));
    expect(wa).toBeTruthy();
    expect(wa!).toContain('vehicleIdentity(selectedEval)');
  });
});

describe('Galeri paneli — gercek piyasa degeri', () => {
  test('Sentetik nakit-turevi formuller KALDIRILDI', () => {
    const src = adminSource();
    // cash / 0.88 · cash * 0.94 · cash * 0.96 · cash * 1.30
    expect(src).not.toMatch(/estimatedValue\s*\)\s*\/\s*0\.88/);
    expect(src).not.toMatch(/\*\s*0\.94/);
    expect(src).not.toMatch(/\*\s*0\.96/);
    expect(src).not.toMatch(/\*\s*1\.30/);
    expect(src).not.toContain('Sahibinden Piyasa Satış Değeri');
  });

  test('Panel SAKLANAN gercek alanlari okur', () => {
    const src = adminSource();
    expect(src).toContain('selectedEval.marketReferenceValue');
    expect(src).toContain('selectedEval.conditionAdjustedSaleValue');
  });

  test('Eski kayitta (NULL) uydurma yerine acik metin gosterilir', () => {
    const src = adminSource();
    expect(src).toContain('Eski kayıtta piyasa değeri saklanmamış');
  });
});

describe('Degerleme kaydi — API ile DB anlik goruntusu AYNI', () => {
  function svcWithCapture(capture: { data?: any }) {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      sourceListingId: 'L' + i, rawMake: 'Fiat', rawModel: 'Egea', canonicalModel: 'Egea',
      rawVariant: null, canonicalVariant: '1.6 Multijet', canonicalTrim: 'Urban',
      canonicalBodyType: '', canonicalFuelType: 'Dizel', canonicalTransmission: 'Otomatik',
      rawTitle: 'Fiat Egea 1.6 Multijet Urban', year: 2022,
      mileageKm: 100_000 + i * 1_000, price: 1_000_000 + i * 10_000,
      city: 'İstanbul', isDamaged: false, scrapedAt: new Date(),
    }));
    const prisma: any = {
      rawVehicleListing: { findMany: async () => rows },
      manufacturer: { findUnique: async () => ({ name: 'Fiat' }) },
      model: { findUnique: async () => ({ name: 'Egea' }), findFirst: async () => ({ id: 'md1' }) },
      vehicleSpecification: { findFirst: async () => null },
      vehicleEvaluation: { create: async (a: any) => { capture.data = a.data; return { id: 'e1' }; } },
    };
    return new EvaluationService(prisma, { sendEvaluationNotification: async () => undefined } as any, new EmsalMatcherService(prisma));
  }

  const DTO: any = {
    year: 2022, manufacturerId: 'mf1', modelId: 'md1',
    observedMake: 'Fiat', observedModel: 'Egea',
    observedEngine: '1.6 Multijet', observedTrim: 'Urban',
    mileage: 105_000, color: 'Beyaz', damageStatus: 'NO', tramerAmount: '0 TL',
    licensePlate: '34QA1234', firstName: 'A', lastName: 'B', phone: '05551112233',
    sellingTimeline: '1 ay', userDesiredPrice: 0,
  };

  test('marketReferenceValue ve conditionAdjustedSaleValue SAKLANIR', async () => {
    const cap: { data?: any } = {};
    const res: any = await svcWithCapture(cap).evaluateVehicle(DTO);
    expect(res.results.marketReferenceValue).toBeGreaterThan(0);
    expect(cap.data.marketReferenceValue).toBe(res.results.marketReferenceValue);
    expect(cap.data.conditionAdjustedSaleValue).toBe(res.results.conditionAdjustedSaleValue);
  });

  test('Temiz aracta piyasa referansi = kondisyon sonrasi deger', async () => {
    const cap: { data?: any } = {};
    const res: any = await svcWithCapture(cap).evaluateVehicle(DTO);
    expect(res.results.marketReferenceValue).toBe(res.results.conditionAdjustedSaleValue);
  });

  test('Hasar beyaninda kondisyon sonrasi deger piyasa referansindan DUSUKTUR', async () => {
    const cap: { data?: any } = {};
    const res: any = await svcWithCapture(cap).evaluateVehicle({
      ...DTO, damageStatus: 'YES',
      paintScheme: JSON.stringify({ 'Sol Ön Kapı': 'BOYALI' }),
      chassisState: JSON.stringify({ 'Şasi': '' }),
      vehicleStatus: JSON.stringify({ heavyDamage: false, airbagDeployed: false, engineProblem: false, transmissionProblem: false }),
    });
    expect(res.results.conditionAdjustedSaleValue).toBeLessThan(res.results.marketReferenceValue);
    expect(cap.data.conditionAdjustedSaleValue).toBe(res.results.conditionAdjustedSaleValue);
  });

  test('Saklanan degerler nakit teklifden TURETILMEZ (sabit oran yok)', async () => {
    const cap: { data?: any } = {};
    const res: any = await svcWithCapture(cap).evaluateVehicle(DTO);
    const ratio = res.results.cashOffer / res.results.marketReferenceValue;
    // Sabit 0,88 varsayimi gercek dagilimla ortusmez; oran serbesttir.
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1);
    expect(res.results.marketReferenceValue).not.toBe(Math.round(res.results.cashOffer / 0.88));
  });
});
