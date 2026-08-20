import { assessCondition, parseTramer, CONDITION_CONFIG, PART_CLASS, UI_PART_NAMES } from './condition-assessment';

const base = { vehicleYear: 2018, currentYear: 2026, cleanMarketValue: 1_000_000 };
const paint = (o: Record<string, string>) => JSON.stringify(o);

describe('Kondisyon değerlendirme katmanı', () => {
  describe('Ölçek: clean < minor < medium < major', () => {
    const clean = assessCondition({ ...base, damageStatus: 'NO' });
    const localPaint = assessCondition({ ...base, damageStatus: 'YES', paintScheme: paint({ 'Sol Ön Çamurluk': 'LOKAL' }) });
    const onePainted = assessCondition({ ...base, damageStatus: 'YES', paintScheme: paint({ 'Sol Ön Çamurluk': 'BOYALI' }) });
    const oneChanged = assessCondition({ ...base, damageStatus: 'YES', paintScheme: paint({ 'Sol Ön Kapı': 'DEGISEN' }) });
    const many = assessCondition({
      ...base, damageStatus: 'YES',
      paintScheme: paint({ 'Sol Ön Kapı': 'DEGISEN', 'Sağ Ön Kapı': 'BOYALI', 'Motor Kaputu': 'BOYALI', 'Bagaj Kapağı': 'BOYALI' }),
    });

    test('Temiz araçta kesinti yok', () => {
      expect(clean.penalty).toBe(0);
      expect(clean.requiresManualReview).toBe(false);
    });

    test('Hasar arttıkça kesinti artar (monoton)', () => {
      expect(localPaint.penalty).toBeGreaterThan(clean.penalty);
      expect(onePainted.penalty).toBeGreaterThan(localPaint.penalty);
      expect(oneChanged.penalty).toBeGreaterThan(onePainted.penalty);
      expect(many.penalty).toBeGreaterThan(oneChanged.penalty);
    });

    test('Minor/medium hasar otomatik fiyatı engellemez', () => {
      expect(localPaint.requiresManualReview).toBe(false);
      expect(onePainted.requiresManualReview).toBe(false);
    });
  });

  describe('Kör toplama ve çifte ceza yasağı', () => {
    test('Çok parçalı hasar, tek parça cezasının katı KADAR olmaz (azalan getiri)', () => {
      const one = assessCondition({ ...base, damageStatus: 'YES', paintScheme: paint({ 'Motor Kaputu': 'BOYALI' }) });
      const six = assessCondition({
        ...base, damageStatus: 'YES',
        paintScheme: paint({
          'Motor Kaputu': 'BOYALI', 'Bagaj Kapağı': 'BOYALI', 'Sol Ön Kapı': 'BOYALI',
          'Sağ Ön Kapı': 'BOYALI', 'Sol Arka Kapı': 'BOYALI', 'Sağ Arka Kapı': 'BOYALI',
        }),
      });
      expect(six.penalty).toBeGreaterThan(one.penalty);
      expect(six.penalty).toBeLessThan(one.penalty * 6); // kor toplama YOK
    });

    test('Aynı parça için en ağır durum baskındır (changed + painted çifte sayılmaz)', () => {
      const r = assessCondition({
        ...base, damageStatus: 'YES',
        paintScheme: paint({ 'Sol Ön Kapı': 'DEGISEN' }),
      });
      const counted = r.breakdown.countedParts.filter((c) => c.part === 'Sol Ön Kapı');
      expect(counted).toHaveLength(1);
      expect(counted[0].status).toBe('DEGISEN');
    });

    test('Toplam kesinti mutlak tavanı aşamaz', () => {
      const worst = assessCondition({
        ...base, damageStatus: 'YES',
        paintScheme: paint(Object.fromEntries(Object.keys(PART_CLASS).map((k) => [k, 'DEGISEN']))),
        vehicleStatus: JSON.stringify({ heavyDamage: true, engineProblem: true, transmissionProblem: true }),
        chassisState: JSON.stringify({ 'Şasi': 'Onarım görmüş' }),
        tramerAmount: '400.000 TL',
      });
      expect(worst.penalty).toBeLessThanOrEqual(CONDITION_CONFIG.maxTotalPenalty);
    });
  });

  describe('Ağır durumlar MANUEL kapısına düşer', () => {
    const cases: Array<[string, any]> = [
      ['ağır hasar', { vehicleStatus: JSON.stringify({ heavyDamage: true }) }],
      ['şasi onarımı', { chassisState: JSON.stringify({ 'Şasi': 'Onarım görmüş' }) }],
      ['airbag', { vehicleStatus: JSON.stringify({ airbagDeployed: true }) }],
      ['motor arızası', { vehicleStatus: JSON.stringify({ engineProblem: true }) }],
      ['şanzıman arızası', { vehicleStatus: JSON.stringify({ transmissionProblem: true }) }],
    ];
    test.each(cases)('%s -> MANUAL', (_name, extra) => {
      const r = assessCondition({ ...base, damageStatus: 'YES', ...extra });
      expect(r.requiresManualReview).toBe(true);
      expect(r.manualReason).toBeTruthy();
    });

    test('Manuel gerekçesi müşteriye uygundur (dahili kâr/risk sızmaz)', () => {
      const r = assessCondition({ ...base, damageStatus: 'YES', vehicleStatus: JSON.stringify({ heavyDamage: true }) });
      expect(r.manualReason).not.toMatch(/kâr|kar marj|rezerv|risk maliyeti|operasyon/i);
    });
  });

  describe('Tramer doğrusal TL kırımı DEĞİLDİR', () => {
    test('Aynı Tramer tutarı, farklı değerdeki araçta farklı oran üretir', () => {
      const cheap = assessCondition({ ...base, damageStatus: 'YES', cleanMarketValue: 400_000, tramerAmount: '50.000 TL' });
      const expensive = assessCondition({ ...base, damageStatus: 'YES', cleanMarketValue: 4_000_000, tramerAmount: '50.000 TL' });
      expect(cheap.breakdown.tramerPenalty).toBeGreaterThan(expensive.breakdown.tramerPenalty);
    });

    test('Tramer cezası TL olarak birebir düşülmez ve tavanlıdır', () => {
      const r = assessCondition({ ...base, damageStatus: 'YES', cleanMarketValue: 1_000_000, tramerAmount: '500.000 TL' });
      expect(r.breakdown.tramerPenalty).toBeLessThanOrEqual(CONDITION_CONFIG.tramer.maxPenalty);
      expect(r.breakdown.tramerPenalty).toBeLessThan(0.5); // 500k/1M = %50 degil
    });

    test('Tramer tutarı bilinmiyorsa uydurulmaz', () => {
      expect(parseTramer('Bilinmiyor')).toBeNull();
      expect(parseTramer('Var')).toBeNull();
      expect(parseTramer('0 TL')).toBe(0);
      expect(parseTramer('45.000 TL')).toBe(45000);
      const r = assessCondition({ ...base, damageStatus: 'YES', tramerAmount: 'Var' });
      expect(r.breakdown.tramerPenalty).toBe(0);
      expect(r.breakdown.flags).toContain('TRAMER_UNKNOWN_AMOUNT');
    });
  });

  describe('Aynı kusur her araçta aynı etkiyi yapmaz', () => {
    test('Yeni araçta bir boya, eski araçtakinden daha çok konuşur', () => {
      const young = assessCondition({ ...base, vehicleYear: 2025, currentYear: 2026, damageStatus: 'YES', paintScheme: paint({ 'Motor Kaputu': 'BOYALI' }) });
      const old = assessCondition({ ...base, vehicleYear: 2005, currentYear: 2026, damageStatus: 'YES', paintScheme: paint({ 'Motor Kaputu': 'BOYALI' }) });
      expect(young.penalty).toBeGreaterThan(old.penalty);
    });

    test('Yapısal parça (tavan), kozmetik panelden ağır basar', () => {
      const roof = assessCondition({ ...base, damageStatus: 'YES', paintScheme: paint({ 'Tavan': 'DEGISEN' }) });
      const fender = assessCondition({ ...base, damageStatus: 'YES', paintScheme: paint({ 'Sol Ön Çamurluk': 'DEGISEN' }) });
      expect(roof.penalty).toBeGreaterThan(fender.penalty);
    });
  });

  describe('Yapısal parça beyanı otomatik fiyat üretmez (regresyon)', () => {
    // GERCEK BASARISIZLIK: "Podye: DEĞİŞEN" beyani yalnizca %4,2 kesinti
    // uretiyor ve MANUEL kapisi acilmiyordu; musteriye otomatik teklif
    // veriliyordu. Tavan/sasi/podye/direk yapisal parcalardir.
    for (const part of ['Podye', 'Şasi', 'Tavan', 'Direk']) {
      test(`${part} DEĞİŞEN -> manuel değerlendirme`, () => {
        const r = assessCondition({ ...base, damageStatus: 'YES', paintScheme: paint({ [part]: 'DEGISEN' }) });
        expect(r.requiresManualReview).toBe(true);
        expect(r.breakdown.flags).toContain('STRUCTURAL_PART');
      });
      test(`${part} BOYALI -> manuel değerlendirme`, () => {
        const r = assessCondition({ ...base, damageStatus: 'YES', paintScheme: paint({ [part]: 'BOYALI' }) });
        expect(r.requiresManualReview).toBe(true);
      });
    }

    test('Yapısal parçada LOKAL rötuş tek başına manuel gerektirmez', () => {
      const r = assessCondition({ ...base, damageStatus: 'YES', paintScheme: paint({ 'Tavan': 'LOKAL' }) });
      expect(r.requiresManualReview).toBe(false);
      expect(r.breakdown.flags).not.toContain('STRUCTURAL_PART');
    });

    test('Kaporta parçaları (kapı/kaput) yapısal sayılmaz', () => {
      const r = assessCondition({ ...base, damageStatus: 'YES', paintScheme: paint({ 'Sol Ön Kapı': 'DEGISEN', 'Motor Kaputu': 'DEGISEN' }) });
      expect(r.breakdown.flags).not.toContain('STRUCTURAL_PART');
    });
  });

  describe('Tramer üretim zincirinde gerçekten uygulanır (regresyon)', () => {
    // GERCEK BASARISIZLIK: evaluation.service, assessCondition'a
    // cleanMarketValue=0 gonderiyordu; bu yuzden Tramer cezasi HER ZAMAN 0'di.
    // 1.000.000 TL'lik araca 450.000 TL Tramer yazilmasi fiyati hic degistirmiyordu.
    test('cleanMarketValue verildiğinde Tramer fiyatı gerçekten etkiler', () => {
      const r = assessCondition({ ...base, damageStatus: 'YES', tramerAmount: '150.000 TL' });
      expect(r.breakdown.tramerPenalty).toBeGreaterThan(0);
      expect(r.penalty).toBeGreaterThan(0);
    });

    test('Doğrusal TL kırımı yapılmaz; araç değerine oranlanır', () => {
      const ucuz = assessCondition({ ...base, cleanMarketValue: 500_000, damageStatus: 'YES', tramerAmount: '50.000 TL' });
      const pahali = assessCondition({ ...base, cleanMarketValue: 3_000_000, damageStatus: 'YES', tramerAmount: '50.000 TL' });
      expect(ucuz.breakdown.tramerPenalty).toBeGreaterThan(pahali.breakdown.tramerPenalty);
      // TL kirimi olsaydi ucuz aracta 50.000 TL (%10) duserdi
      expect(ucuz.breakdown.tramerPenalty).toBeLessThan(0.10);
    });

    test('Model kendi tavanına dayanan Tramer -> otomatik fiyat yok', () => {
      const r = assessCondition({ ...base, damageStatus: 'YES', tramerAmount: '900.000 TL' });
      expect(r.breakdown.tramerPenalty).toBeLessThanOrEqual(CONDITION_CONFIG.tramer.maxPenalty);
      expect(r.breakdown.flags).toContain('TRAMER_ABOVE_MODEL_RANGE');
      expect(r.requiresManualReview).toBe(true);
    });

    test('Tutarı bilinmeyen Tramer için rakam uydurulmaz', () => {
      const r = assessCondition({ ...base, damageStatus: 'YES', tramerAmount: 'Var' });
      expect(r.breakdown.tramerPenalty).toBe(0);
      expect(r.breakdown.flags).toContain('TRAMER_UNKNOWN_AMOUNT');
    });
  });

  describe('Detay verilmediğinde yürürlükteki taban korunur', () => {
    // Saha kalibrasyonu olmadan bu oranlar degistirilmez.
    test('Hasar VAR + detay yok -> %8', () => {
      const r = assessCondition({ ...base, damageStatus: 'YES' });
      expect(r.penalty).toBeCloseTo(CONDITION_CONFIG.declaredNoDetailPenalty, 5);
      expect(CONDITION_CONFIG.declaredNoDetailPenalty).toBe(0.08);
    });

    test('Hasar durumu BİLİNMİYOR -> %4', () => {
      const r = assessCondition({ ...base, damageStatus: 'UNKNOWN' });
      expect(r.penalty).toBeCloseTo(CONDITION_CONFIG.unknownDamagePenalty, 5);
      expect(CONDITION_CONFIG.unknownDamagePenalty).toBe(0.04);
    });

    test('Detay verildiyse taban devreye girmez (çifte ceza yok)', () => {
      const r = assessCondition({ ...base, damageStatus: 'YES', paintScheme: paint({ 'Sol Ön Çamurluk': 'LOKAL' }) });
      expect(r.penalty).toBeLessThan(CONDITION_CONFIG.declaredNoDetailPenalty);
      expect(r.breakdown.flags).not.toContain('DAMAGE_DECLARED_NO_DETAIL');
    });
  });

  describe('Arayüz sözleşmesi ile backend yorumu birebir uyuşur', () => {
    // GERCEK BASARISIZLIK: kaporta semasi bagaj kapagini 'Bagaj', tamponlari
    // 'Ön/Arka Tampon' adiyla gonderiyor; backend'de bu adlar tanimli olmadigi
    // icin hepsi varsayilan MINOR sinifina dusuyordu (bagaj eksik, tampon fazla
    // cezalandiriliyordu).
    test('Arayüzün gönderebildiği her parça açıkça sınıflandırılmıştır', () => {
      for (const part of UI_PART_NAMES) {
        expect(PART_CLASS[part]).toBeDefined();
      }
    });

    test('Bagaj ve Bagaj Kapağı aynı sınıftadır', () => {
      expect(PART_CLASS['Bagaj']).toBe(PART_CLASS['Bagaj Kapağı']);
      const a = assessCondition({ ...base, damageStatus: 'YES', paintScheme: paint({ 'Bagaj': 'DEGISEN' }) });
      const b = assessCondition({ ...base, damageStatus: 'YES', paintScheme: paint({ 'Bagaj Kapağı': 'DEGISEN' }) });
      expect(a.penalty).toBeCloseTo(b.penalty, 10);
    });

    test('Tampon, kapıdan daha az etkiler', () => {
      const tampon = assessCondition({ ...base, damageStatus: 'YES', paintScheme: paint({ 'Ön Tampon': 'DEGISEN' }) });
      const kapi = assessCondition({ ...base, damageStatus: 'YES', paintScheme: paint({ 'Sol Ön Kapı': 'DEGISEN' }) });
      expect(tampon.penalty).toBeLessThan(kapi.penalty);
    });
  });

  describe('Aşırı çok panel değişimi otomatik fiyatlandırılmaz (BUG #8)', () => {
    // KANITLANMIS VAKA: 1.000.000 TL temiz degerli aracta 10 panelin tamami
    // DEGISEN -> matematiksel kesinti %12,25 (manuel esigi %15'in ALTINDA)
    // -> AUTO 750.000 TL teklif. Bu bir fiyat orani sorunu degil, otomasyon
    // guvenlik kapisi eksikligidir.
    const panels = ['Motor Kaputu', 'Bagaj', 'Sol Ön Kapı', 'Sağ Ön Kapı', 'Sol Arka Kapı',
      'Sağ Arka Kapı', 'Sol Ön Çamurluk', 'Sağ Ön Çamurluk', 'Sol Arka Çamurluk', 'Sağ Arka Çamurluk'];
    const changed = (n: number) =>
      assessCondition({ ...base, damageStatus: 'YES', paintScheme: paint(Object.fromEntries(panels.slice(0, n).map((p) => [p, 'DEGISEN']))) });

    test('10 panel DEĞİŞEN -> MANUEL (kesinti eşiğin altında olsa bile)', () => {
      const r = changed(10);
      expect(r.penalty).toBeLessThan(CONDITION_CONFIG.manualReviewThreshold);
      expect(r.breakdown.changedPanelCount).toBe(10);
      expect(r.breakdown.flags).toContain('EXTREME_MULTI_PANEL');
      expect(r.requiresManualReview).toBe(true);
    });

    test('1 ve 2 değişen panel AUTO kalır (regresyon)', () => {
      expect(changed(1).requiresManualReview).toBe(false);
      expect(changed(2).requiresManualReview).toBe(false);
      expect(changed(2).breakdown.flags).not.toContain('EXTREME_MULTI_PANEL');
    });

    test(`${'Eşik'}: ${'maxAutoChangedPanels'} üstü ilk değer manuel olur`, () => {
      expect(CONDITION_CONFIG.maxAutoChangedPanels).toBe(2);
      expect(changed(3).requiresManualReview).toBe(true);
      expect(changed(3).breakdown.flags).toContain('EXTREME_MULTI_PANEL');
    });

    test('Çok sayıda BOYALI panel bu kapıyı açmaz (yalnız DEĞİŞEN sayılır)', () => {
      const allPainted = assessCondition({
        ...base, damageStatus: 'YES',
        paintScheme: paint(Object.fromEntries(panels.map((p) => [p, 'BOYALI']))),
      });
      expect(allPainted.breakdown.changedPanelCount).toBe(0);
      expect(allPainted.breakdown.paintedPanelCount).toBe(10);
      expect(allPainted.breakdown.flags).not.toContain('EXTREME_MULTI_PANEL');
    });

    test('Tamponlar rutin değişim kalemidir; kapıya sayılmaz', () => {
      const r = assessCondition({
        ...base, damageStatus: 'YES',
        paintScheme: paint({ 'Ön Tampon': 'DEGISEN', 'Arka Tampon': 'DEGISEN', 'Sol Ön Kapı': 'DEGISEN' }),
      });
      expect(r.breakdown.changedPanelCount).toBe(1);
      expect(r.requiresManualReview).toBe(false);
    });

    test('Normal çoklu işlem (1 değişen + 4 boyalı) AUTO kalır', () => {
      const r = assessCondition({
        ...base, damageStatus: 'YES',
        paintScheme: paint({ 'Motor Kaputu': 'DEGISEN', 'Sol Ön Kapı': 'BOYALI', 'Sağ Ön Kapı': 'BOYALI', 'Sol Ön Çamurluk': 'BOYALI', 'Bagaj': 'BOYALI' }),
      });
      expect(r.requiresManualReview).toBe(false);
    });
  });

  describe('Belirsizlik uydurulmaz', () => {
    test('Hasar VAR ama detay yoksa muhafazakâr taban uygulanır', () => {
      const r = assessCondition({ ...base, damageStatus: 'YES' });
      expect(r.penalty).toBeGreaterThan(0);
      expect(r.breakdown.flags).toContain('DAMAGE_DECLARED_NO_DETAIL');
    });

    test('Hasar durumu bilinmiyorsa küçük belirsizlik payı bırakılır', () => {
      const r = assessCondition({ ...base, damageStatus: 'UNKNOWN' });
      expect(r.penalty).toBeGreaterThan(0);
      expect(r.breakdown.flags).toContain('DAMAGE_UNKNOWN');
    });

    test('Bozuk JSON çökmeye yol açmaz', () => {
      const r = assessCondition({ ...base, damageStatus: 'YES', paintScheme: '{bozuk', vehicleStatus: 'null' });
      expect(Number.isFinite(r.penalty)).toBe(true);
    });
  });
});
