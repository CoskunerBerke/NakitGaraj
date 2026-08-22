/**
 * catalog-artifact.spec.ts
 *
 * REGRESYON: sayfa basligi kalintilari musteri model listesinde GORUNMEZ,
 * mesru modeller ise KAYBOLMAZ.
 *
 * Bulunan kirlilik (koken: eski katalog tohumlama yolu; ham ilan verisi
 * TEMIZDIR — ayni araclar RawVehicleListing.canonicalModel'de dogru adla
 * durur):
 *   Abarth  "500e 2.El Arabalar ve S"                        (baslik kirpigi)
 *   Abarth  "500e 2.El Arabalar ve Satılık Sıfır Km Otomobil" (tam baslik eki)
 *   Abarth  "500e ve"                                        (baglactan kirpik)
 *   Bajaj   "Qute RE 60 ve"                                  (baglactan kirpik)
 *   Abarth  "Coupe"  — farkli sinif: 500e'nin DONANIMI model sanilmis
 *            (ham veride model olarak 0 ilan; donanim olarak mevcut)
 *
 * KRITIK KARSI ORNEK: Fiat "Coupe" GERCEK tarihi bir modeldir (ham veride 8
 * ilan). Bu yuzden "Coupe" adi uzerinden korleme eleme YAPILMAZ; kural veri
 * gudumludur (gercek ilan destegi olmayan kasa-adli katalog modeli gizlenir).
 *
 * Asagidaki marka/model adlari yalnizca ORNEKTIR; production mantiginda
 * hicbir marka/model ozel durumu yoktur.
 */
import { PrismaClient } from '@prisma/client';
import {
  VehicleService,
  isUnusableModelName,
  isBodyTypeOnlyModelName,
} from './vehicle.service';
import { foldTurkish } from '../evaluation/listing-attributes';

const noopCache = () => {
  const store = new Map<string, { v: any; exp: number }>();
  return {
    get: async (k: string) => {
      const it = store.get(k);
      if (!it) return null;
      if (it.exp && it.exp < Date.now()) { store.delete(k); return null; }
      return it.v;
    },
    set: async (k: string, v: any, ttl?: number) => {
      store.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : 0 });
    },
    del: async (k: string) => { store.delete(k); },
  } as any;
};

/** Kanitlanmis kalinti imzalari — test tarafinda TAM dizgi serbesttir. */
const KNOWN_ARTIFACTS = [
  '500e 2.El Arabalar ve S',
  '500e 2.El Arabalar ve Satılık Sıfır Km Otomobil',
  '500e ve',
  'Qute RE 60 ve',
];

/** Mesru adlar — hicbiri ELENMEMELI (eski tireli-model regresyonu dahil). */
const LEGITIMATE = [
  '500e', 'Qute RE 60',
  '9-3', '9-5', '900', '9000',           // Saab
  'Gen-2', 'Waja', '415',                 // Proton
  'Passat', 'Golf', 'Polo', 'Jetta',      // VW
  'Egea', 'Clio', 'Megane',
];

describe('isUnusableModelName — sayfa basligi kalinti sinifi', () => {
  test('bilinen 4 baslik kalintisi ELENIR', () => {
    for (const a of KNOWN_ARTIFACTS) {
      expect(isUnusableModelName(a)).toBe(true);
    }
  });

  test('mesru adlar KULLANILABILIR kalir', () => {
    for (const n of LEGITIMATE) {
      expect(isUnusableModelName(n)).toBe(false);
    }
  });

  test('"Coupe" AD kurali ile ELENMEZ (Fiat Coupe gercek modeldir)', () => {
    expect(isUnusableModelName('Coupe')).toBe(false);
  });

  test('sondaki yalin baglac elenir; "ve" ile BITEN kelimeler elenmez', () => {
    expect(isUnusableModelName('X5 ve')).toBe(true);      // kirpik baglac
    expect(isUnusableModelName('A3 &')).toBe(true);       // kirpik baglac
    expect(isUnusableModelName('Vectra')).toBe(false);    // -ve ile bitmiyor ama kontrol
    expect(isUnusableModelName('Evoque')).toBe(false);    // token esitligi aranir
    // Tek tokenli ad bu kurala takilmaz (kural COK tokenli ad ister).
    expect(isUnusableModelName('ve')).toBe(false);
  });

  test('baslik sozlugu imzalari buyuk/kucuk harf ve Turkce katlamadan bagimsiz', () => {
    expect(isUnusableModelName('Focus 2.EL ARABALAR')).toBe(true);
    expect(isUnusableModelName('Corsa Satılık')).toBe(true);
    expect(isUnusableModelName('Astra sıfır km')).toBe(true);
  });
});

describe('isBodyTypeOnlyModelName — tek basina karar VERMEZ', () => {
  test('kasa etiketleri tanimlanir', () => {
    for (const b of ['Coupe', 'Sedan', 'Cabrio', 'SUV', 'Hatchback', 'Station Wagon']) {
      expect(isBodyTypeOnlyModelName(b)).toBe(true);
    }
  });
  test('gercek model adlari kasa etiketi sayilmaz', () => {
    for (const n of ['500e', 'Passat', 'Gran Turismo', 'Coupe S']) {
      expect(isBodyTypeOnlyModelName(n)).toBe(false);
    }
  });
});

describe('Musteri katalogu (gercek veri) — kalinti gorunmez, mesru kayip yok', () => {
  const prisma = new PrismaClient();
  const svc = new VehicleService(prisma as any, noopCache());
  let brands: any[] = [];
  const brandByName = (n: string) => brands.find((b) => b.name === n);

  beforeAll(async () => {
    brands = await svc.getBrands();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const modelNames = async (brandName: string, year?: number) => {
    const b = brandByName(brandName);
    expect(b).toBeTruthy();
    const models = await svc.getModels(b.id, year);
    return models.map((m: any) => String(m.name ?? m.displayLabel ?? m.value));
  };

  test('Abarth: 500e KALIR, 4 kalinti ve donanim-kokenli "Coupe" GORUNMEZ', async () => {
    const names = await modelNames('Abarth');
    expect(names).toContain('500e');
    for (const a of KNOWN_ARTIFACTS) expect(names).not.toContain(a);
    expect(names).not.toContain('Coupe');
  });

  test('Fiat: gercek "Coupe" modeli KORUNUR (8 ham ilan)', async () => {
    const names = await modelNames('Fiat');
    expect(names).toContain('Coupe');
  });

  test('Bajaj: "Qute RE 60" KALIR, kirpik baglac satiri GORUNMEZ', async () => {
    const names = await modelNames('Bajaj');
    expect(names).toContain('Qute RE 60');
    expect(names).not.toContain('Qute RE 60 ve');
  });

  test('Saab 9-3 / 9-5 ve VW Passat / Golf katalogda gorunur (tireli regresyon)', async () => {
    const saab = await modelNames('Saab');
    expect(saab).toEqual(expect.arrayContaining(['9-3', '9-5']));
    const vw = await modelNames('Volkswagen');
    expect(vw).toEqual(expect.arrayContaining(['Passat', 'Golf']));
  });

  test('Proton Gen-2 katalogda gorunur', async () => {
    const proton = await modelNames('Proton');
    expect(proton).toContain('Gen-2');
  });

  test('Abarth 500e sihirbaz zinciri calisir (yetersiz-veri QA yolu)', async () => {
    const b = brandByName('Abarth');
    const models = await svc.getModels(b.id, 2024);
    const m500e = models.find((m: any) => (m.name ?? m.displayLabel) === '500e');
    expect(m500e).toBeTruthy();
    const variants = await svc.getVariants(m500e.id, b.id, 2024);
    expect(variants.length).toBeGreaterThan(0);
  }, 30000);

  test('TUM gorunur modellerde kalinti imzasi YOK ve hicbir marka cikmaza dusmez', async () => {
    let total = 0;
    for (const b of brands) {
      const models = await svc.getModels(b.id);
      const names = models.map((m: any) => String(m.name ?? m.displayLabel ?? m.value));
      // Cikmaz marka yasagi: gorunur her markanin >=1 kullanilabilir modeli olmali.
      expect(names.length).toBeGreaterThan(0);
      for (const n of names) {
        const t = foldTurkish(n);
        expect(t.includes('2.el') || t.includes('satilik') || t.includes('sifir km') || t.includes('arabalar')).toBe(false);
        const toks = t.trim().split(/\s+/);
        expect(toks.length > 1 && (toks[toks.length - 1] === 've' || toks[toks.length - 1] === '&')).toBe(false);
      }
      total += names.length;
    }
    // Olculen taban: temizlik oncesi 977, sonrasi 972 (yalniz 5 kanitli kalinti).
    // Mesru kayip olursa bu sinirin belirgin altina duser.
    expect(total).toBeGreaterThanOrEqual(970);
  }, 120000);
});
