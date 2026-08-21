/**
 * exact-identity.spec.ts
 *
 * Araç kimliğinin BİREBİR (L1) ayrımını koruyan kurallar.
 *
 * Kapsanan gerçek vakalar (korpustan ölçülmüştür):
 *  - Saab 9-3 / 9-5, Proton Gen-2  : satır model hücresi kırpılmamalı
 *  - km == fiyat                    : gerçek kilometre silinmemeli
 *  - 1.0 TCe != 1.0 SCe             : aynı hacim, farklı motor ailesi
 *  - Trend != Trend X               : tam model substring ile birleşmemeli
 *  - Emotion != Emotion Plus        : aynı
 *  - EKSPERTİZ != pert              : hasar filtresi kelime sınırlı olmalı
 *  - VW tam modeli motor taşıyorsa canonicalEngine boş olsa da kimlik güçlüdür
 */
import {
  cleanPageTitle,
  cleanRowModel,
  composeFullModel,
  deriveFromSource,
  engineKey,
  explicitEngineSignature,
  fullModelExact,
  hasStrongDamageSignal,
  isEngineCompatible,
  normalizeFullModel,
  parseMileageCell,
} from './listing-attributes';

describe('Birebir araç kimliği (L1) güvenliği', () => {
  describe('BUG-1: satır model hücresi sayfa numarası gibi kırpılmaz', () => {
    const brandPage = (make: string) =>
      `${make} Fiyatları & Modelleri sahibinden.com'da - 3`;

    const derive = (make: string, rowModel: string) =>
      deriveFromSource({
        folderMake: make,
        pageTitleOrFileName: brandPage(make),
        listingRowModel: rowModel,
        listingTagTrim: '1.9 TiD Vector',
        knownMakes: [make],
      });

    test('Saab 9-3 ve 9-5 ayrı model kalır', () => {
      expect(derive('Saab', '9-3').model).toBe('9-3');
      expect(derive('Saab', '9-5').model).toBe('9-5');
      expect(derive('Saab', '9-3').model).not.toBe(derive('Saab', '9-5').model);
    });

    test('Proton Gen-2 kırpılmaz', () => {
      expect(derive('Proton', 'Gen-2').model).toBe('Gen-2');
    });

    test('cleanRowModel gerçek "-<rakam>" tokenını korur, cleanPageTitle sayfa ekini atar', () => {
      expect(cleanRowModel('9-3')).toBe('9-3');
      expect(cleanRowModel('Gen-2')).toBe('Gen-2');
      expect(cleanPageTitle("Saab 9-3 Fiyatları & Modelleri sahibinden.com'da - 3")).toBe('Saab 9-3');
    });
  });

  describe('BUG-5: km hücresi fiyata eşit diye silinmez', () => {
    test('km == fiyat olsa bile kilometre korunur', () => {
      expect(parseMileageCell('350.000', 2015)).toBe(350000);
    });

    test('yıl ile karışma koruması ve üst sınır korunur', () => {
      expect(parseMileageCell('2015', 2015)).toBeNull();
      expect(parseMileageCell('9.000.000', 2015)).toBeNull();
      expect(parseMileageCell('', 2015)).toBeNull();
    });
  });

  describe('BUG-2a: strict motor kimliği aile tokenını korur', () => {
    test('1.0 TCe ile 1.0 SCe birebir aynı motor DEĞİLDİR', () => {
      expect(engineKey('1.0 TCe')).not.toBe(engineKey('1.0 SCe'));
      expect(isEngineCompatible('1.0 TCe', '1.0 SCe', true)).toBe(false);
    });

    test('1.6 TDI ile 1.6 TSI birebir aynı motor DEĞİLDİR', () => {
      expect(isEngineCompatible('1.6 TDI', '1.6 TSI', true)).toBe(false);
    });

    test('aynı motorun farklı yazımı hâlâ eşittir', () => {
      expect(engineKey('1.6 i-DTEC')).toBe(engineKey('1.6i DTEC'));
      expect(isEngineCompatible('1.6 i-DTEC', '1.6i DTEC', true)).toBe(true);
    });

    test('birebir aynı motor kodu eşittir', () => {
      expect(isEngineCompatible('1.0 TCe', '1.0 TCe', true)).toBe(true);
    });
  });

  describe('BUG-2b: tam model birebir eşitlik ister, substring DEĞİL', () => {
    test('Trend ile Trend X birebir aynı değildir', () => {
      expect(fullModelExact('1.6 TDCi Trend', '1.6 TDCi Trend X')).toBe(false);
    });

    test('Emotion ile Emotion Plus birebir aynı değildir', () => {
      expect(fullModelExact('1.6 Multijet Emotion', '1.6 Multijet Emotion Plus')).toBe(false);
    });

    test('Active ile Active Plus birebir aynı değildir', () => {
      expect(fullModelExact('1.3 Multijet Active', '1.3 Multijet Active Plus')).toBe(false);
    });

    test('yalnız yazım farkları eşitliği bozmaz', () => {
      expect(fullModelExact('1.6 TDI BlueMotion Highline', '1.6 tdi  bluemotion   highline')).toBe(true);
      expect(normalizeFullModel('1.6 TDI  BlueMotion')).toBe('1.6 tdi bluemotion');
    });

    test('taraflardan biri boşsa sahte birebir kimlik üretilmez', () => {
      expect(fullModelExact('', '1.6 TDI')).toBe(false);
      expect(fullModelExact('1.6 TDI', null)).toBe(false);
    });

    test('gerçek teknik tokenlar normalizasyonda silinmez', () => {
      for (const tok of ['1.6', 'tdi', 'tce', 'sce', 'dsg', 'tct', 'bluemotion', 'r-line']) {
        expect(normalizeFullModel(`X ${tok} Y`)).toContain(tok);
      }
    });
  });

  describe('Tam modelin kendi içindeki açık motor imzası', () => {
    test('baştaki açık motor imzası çıkarılır', () => {
      expect(explicitEngineSignature('1.6 TDI BlueMotion Highline')).toBe('1.6 TDI');
      expect(explicitEngineSignature('1.0 TCe Joy')).toBe('1.0 TCe');
      expect(explicitEngineSignature('2.0 TDI Comfortline DSG')).toBe('2.0 TDI');
    });

    test('paket adı motor sanılmaz', () => {
      expect(explicitEngineSignature('Joy')).toBe('');
      expect(explicitEngineSignature('Active Plus')).toBe('');
      expect(explicitEngineSignature('Trend X')).toBe('');
      expect(explicitEngineSignature('')).toBe('');
    });

    test('VW örneği: motor alanı boş olsa da tam model motoru taşır', () => {
      const trim = '1.6 TDI BlueMotion Comfortline';
      expect(composeFullModel('', trim)).toBe(trim);
      expect(explicitEngineSignature(composeFullModel('', trim))).toBe('1.6 TDI');
      // Aynı seri, farklı motor: birebir kimlik ayrışmalı
      expect(fullModelExact(trim, '2.0 TDI BlueMotion Comfortline')).toBe(false);
      expect(fullModelExact(trim, '1.4 TSI Comfortline')).toBe(false);
    });

    test('motor + paket tekrarsız birleştirilir', () => {
      expect(composeFullModel('1.6 TDCi', 'Trend')).toBe('1.6 TDCi Trend');
      expect(composeFullModel('1.6 TDCi', '1.6 TDCi Trend')).toBe('1.6 TDCi Trend');
      expect(composeFullModel('', 'Joy')).toBe('Joy');
    });
  });

  describe('BUG-3/4: ağır hasar yalnız AÇIK sinyalden', () => {
    test('EKSPERTİZ ilanı hasarlı sayılmaz', () => {
      expect(hasStrongDamageSignal('İLK SAHİBİNDEN EKSPERTİZLİ 2019 AUDİ A3')).toBe(false);
      expect(hasStrongDamageSignal('Masrafsız Ekspertize Açık')).toBe(false);
      expect(hasStrongDamageSignal('EXPERTİZ RAPORU MEVCUT')).toBe(false);
    });

    test('açık ağır hasar ifadeleri yakalanır', () => {
      expect(hasStrongDamageSignal('AĞIR HASAR KAYITLI')).toBe(true);
      expect(hasStrongDamageSignal('pert kayıtlı araç')).toBe(true);
      expect(hasStrongDamageSignal('[ ÇEKME BELGELİ ] KLİMALI ALFA ROMEO 156')).toBe(true);
      expect(hasStrongDamageSignal('CEKME BELGELI BMW E30')).toBe(true);
      expect(hasStrongDamageSignal('Hurda Fiyatına Acil Satış')).toBe(true);
      expect(hasStrongDamageSignal('ağır kazalı')).toBe(true);
    });

    test('Türkçe ekli yazımlar da yakalanır (korpustan gerçek başlıklar)', () => {
      expect(hasStrongDamageSignal('Aracım agır hasarlıdır')).toBe(true);
      expect(hasStrongDamageSignal('2010 model 110.000 km ağır hasarı var')).toBe(true);
      expect(hasStrongDamageSignal('Ağır hasarkayıtlıları bu fiyat pazarlık yok')).toBe(true);
      expect(hasStrongDamageSignal('pertini almış')).toBe(true);
      expect(hasStrongDamageSignal('hurdaya ayrılmış')).toBe(true);
      expect(hasStrongDamageSignal('ağır kazası var')).toBe(true);
    });

    test('"HASARSIZ"/"KAZASIZ" ağır hasar sayılmaz (ters anlam)', () => {
      expect(hasStrongDamageSignal('2015 Audi A3 S Tronic Cam Tavan Recaro Ağır Hasarsız')).toBe(false);
      expect(hasStrongDamageSignal('düşük km ağır hasarsız focus 3.5 kasa')).toBe(false);
      expect(hasStrongDamageSignal('ağır kazasız bakımlı')).toBe(false);
    });

    test('normal ikinci el ifadeleri ağır hasar sayılmaz', () => {
      expect(hasStrongDamageSignal('2 parça boyalı 1 değişen')).toBe(false);
      expect(hasStrongDamageSignal('lokal boyalı bakımlı')).toBe(false);
      expect(hasStrongDamageSignal('hasar kayıtlı')).toBe(false);
      expect(hasStrongDamageSignal('')).toBe(false);
      expect(hasStrongDamageSignal('TRAMERSİZ HATASIZ')).toBe(false);
    });
  });
});
