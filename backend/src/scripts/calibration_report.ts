/**
 * calibration_report.ts
 *
 * GERCEK SAHA KALIBRASYONU - YALNIZCA OLCUM
 *
 * Bu script uretim fiyat motorunu DEGISTIRMEZ, ondan OGRENMEZ ve hicbir
 * konfigurasyonu guncellemez. Yaptigi tek sey:
 *   1. Senin doldurdugun gercek arac verisini okumak
 *   2. Ayni araci uretimdeki motorla (read-only) degerlemek
 *   3. Sistem ile gerceklesen degerler arasindaki sapmayi raporlamak
 *
 * Veritabanina HICBIR yazma islemi yapilmaz.
 *
 * Kullanim:
 *   npm run calibration:init     -> bos sablon CSV olusturur
 *   npm run calibration:report   -> sapma raporunu uretir
 *
 * KURAL: 20 gercek arac tamamlanmadan pricing-config veya kar basamagi
 * yeniden optimize EDILMEZ. Rapor bu esigin altinda oneri uretmez.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { EmsalMatcherService } from '../evaluation/emsal-matcher.service';
import { RobustPricingCalculator } from '../evaluation/robust-pricing-calculator';
import { deriveFuelFromEngineCode, splitVariantString } from '../evaluation/listing-attributes';

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'calibration');
const CSV_PATH = path.join(DATA_DIR, 'calibration_cases.csv');
const REPORT_PATH = path.join(__dirname, '..', '..', '..', 'RAPOR_KALIBRASYON.md');

/** Kalibrasyon sonuclarinin anlamli sayilmasi icin gereken minimum arac sayisi */
export const MIN_CASES_FOR_CALIBRATION = 20;

export const CSV_COLUMNS = [
  // --- ARAC KIMLIGI (sen doldur) ---
  'id',
  'make',
  'model',
  'engine',
  'trim',
  'year',
  'km',
  'damage',
  // --- GERCEK SAHA VERISI (sen doldur; bilinmiyorsa bos birak) ---
  'dealerMarketValue',
  'dealerCashOffer',
  'realisticListingPrice',
  'actualSalePrice',
  'actualDaysToSell',
  'notes',
] as const;

export interface CalibrationCase {
  id: string;
  make: string;
  model: string;
  engine: string;
  trim: string;
  year: number;
  km: number;
  damage: number;
  dealerMarketValue: number | null;
  dealerCashOffer: number | null;
  realisticListingPrice: number | null;
  actualSalePrice: number | null;
  actualDaysToSell: number | null;
  notes: string;
}

/** "1.250.000", "1,250,000", "1250000 TL", "" -> number | null */
export function parseMoney(raw: string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const t = String(raw).trim();
  if (!t || t === '-' || t.toLowerCase() === 'yok') return null;
  const digits = t.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Basit CSV satir ayirici (tirnakli alanlari destekler) */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(content: string): CalibrationCase[] {
  const lines = content
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);

  const cases: CalibrationCase[] = [];
  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);
    const get = (name: string) => (idx(name) >= 0 ? f[idx(name)] || '' : '');

    const make = get('make');
    const model = get('model');
    const year = parseInt(get('year'), 10);
    if (!make || !model || !Number.isFinite(year)) continue;

    cases.push({
      id: get('id') || `case-${i}`,
      make,
      model,
      engine: get('engine'),
      trim: get('trim'),
      year,
      km: parseMoney(get('km')) ?? 0,
      damage: parseFloat(get('damage')) || 0,
      // 'dealerMarketEstimate' takma adi da kabul edilir.
      dealerMarketValue: parseMoney(get('dealerMarketValue') || get('dealerMarketEstimate')),
      dealerCashOffer: parseMoney(get('dealerCashOffer')),
      realisticListingPrice: parseMoney(get('realisticListingPrice')),
      actualSalePrice: parseMoney(get('actualSalePrice')),
      actualDaysToSell: parseMoney(get('actualDaysToSell')),
      notes: get('notes'),
    });
  }
  return cases;
}

export interface ErrorMetrics {
  marketValueErrorTl: number | null;
  marketValueErrorPct: number | null;
  cashErrorTl: number | null;
  cashErrorPct: number | null;
  listingErrorTl: number | null;
  listingErrorPct: number | null;
  salePriceErrorTl: number | null;
  salePriceErrorPct: number | null;
  dealerMarginDiff: number | null;
  customerOfferDiff: number | null;
  /** Sistemin beklediği galeri brüt marjı (beklenen satış − nakit teklif) */
  systemExpectedDealerSpread: number;
  /** Galericinin gerçekleşen brüt marjı (gerçek satış − galericinin nakit alışı) */
  realizedDealerSpread: number | null;
  systemCashRatio: number;
  dealerCashRatio: number | null;
  /** Sistem teklifi galericinin teklifinden %5+ düşük veya oran < 0.88 */
  customerLossRisk: boolean;
  /** Sistem teklifi belirgin yüksek ve gerçekleşen marj hedefin altında */
  dealerMarginRisk: boolean;
}

export const SEGMENT_BANDS: Array<[string, number, number]> = [
  ['<600k', 0, 600_000],
  ['600k-1.2M', 600_000, 1_200_000],
  ['1.2M-2M', 1_200_000, 2_000_000],
  ['2M-4M', 2_000_000, 4_000_000],
  ['4M-8M', 4_000_000, 8_000_000],
  ['8M+', 8_000_000, Number.POSITIVE_INFINITY],
];

export const CONFIDENCE_BANDS: Array<[string, number, number]> = [
  ['90+', 90, 200],
  ['80-89', 80, 90],
  ['71-79', 71, 80],
  ['<=70', -1, 71],
];

export function segmentOf(expectedSalePrice: number): string {
  for (const [name, lo, hi] of SEGMENT_BANDS) {
    if (expectedSalePrice >= lo && expectedSalePrice < hi) return name;
  }
  return SEGMENT_BANDS[SEGMENT_BANDS.length - 1][0];
}

export function confidenceBandOf(confidence: number): string {
  for (const [name, lo, hi] of CONFIDENCE_BANDS) {
    if (confidence >= lo && confidence < hi) return name;
  }
  return '<=70';
}

/** Medyan; bos dizide null */
export function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Ortalama mutlak hata */
export function mae(arr: number[]): number | null {
  if (!arr.length) return null;
  return arr.reduce((t, v) => t + Math.abs(v), 0) / arr.length;
}

/**
 * Segment bias karari. Yeterli veri yoksa asla bias iddia edilmez.
 * Esik: medyan sapma |%3| ustu ve en az 3 vaka.
 */
export function biasVerdict(medianPct: number | null, n: number): string {
  if (n < 3 || medianPct === null) return 'INSUFFICIENT DATA';
  if (medianPct <= -3) return 'SYSTEM TOO LOW';
  if (medianPct >= 3) return 'SYSTEM TOO HIGH';
  return 'NO CLEAR BIAS';
}

/**
 * Sapma hesaplari. Pozitif deger = SISTEM daha yuksek.
 *  - marketValue : sistem fairMarketValue     vs galericinin piyasa tahmini
 *  - cash        : sistem cashOffer           vs galericinin nakit alis fiyati
 *  - salePrice   : sistem expectedSalePrice   vs gerceklesen satis (yoksa gercekci ilan fiyati)
 *  - dealerMargin: sistem brut marji          vs galericinin gerceklesen brut marji
 *  - customerOffer: sistemin musteriye verdigi nakit - galericinin verdigi nakit
 */
export function computeErrors(
  sys: {
    fairMarketValue: number;
    expectedSalePrice: number;
    cashOffer: number;
    consignmentListingPrice?: number;
  },
  real: Pick<
    CalibrationCase,
    'dealerMarketValue' | 'dealerCashOffer' | 'realisticListingPrice' | 'actualSalePrice'
  >,
): ErrorMetrics {
  const diff = (a: number, b: number | null) => (b === null ? null : a - b);
  const pctOf = (d: number | null, b: number | null) =>
    d === null || b === null || b === 0 ? null : (d / b) * 100;

  const saleRef = real.actualSalePrice ?? real.realisticListingPrice;

  const marketValueErrorTl = diff(sys.fairMarketValue, real.dealerMarketValue);
  const cashErrorTl = diff(sys.cashOffer, real.dealerCashOffer);
  const listingErrorTl =
    sys.consignmentListingPrice === undefined
      ? null
      : diff(sys.consignmentListingPrice, real.realisticListingPrice);
  const salePriceErrorTl = diff(sys.expectedSalePrice, saleRef);

  const systemExpectedDealerSpread = sys.expectedSalePrice - sys.cashOffer;
  const realizedDealerSpread =
    real.actualSalePrice !== null && real.dealerCashOffer !== null
      ? real.actualSalePrice - real.dealerCashOffer
      : null;

  // Eski davranis korunur: gerceklesen satis yoksa gercekci ilan fiyati referans.
  const dealerMarginBase =
    saleRef !== null && real.dealerCashOffer !== null ? saleRef - real.dealerCashOffer : null;

  const systemCashRatio =
    sys.expectedSalePrice > 0 ? sys.cashOffer / sys.expectedSalePrice : 0;
  const dealerCashRatio =
    real.dealerCashOffer !== null && real.dealerMarketValue !== null && real.dealerMarketValue > 0
      ? real.dealerCashOffer / real.dealerMarketValue
      : null;

  // Musteri kabul riski: sistem teklifi galericininkinden %5+ dusuk VEYA oran < 0.88
  const cashBelowDealerPct =
    real.dealerCashOffer !== null && real.dealerCashOffer > 0
      ? ((sys.cashOffer - real.dealerCashOffer) / real.dealerCashOffer) * 100
      : null;
  const customerLossRisk =
    (cashBelowDealerPct !== null && cashBelowDealerPct < -5) || systemCashRatio < 0.88;

  // Galeri riski: sistem teklifi galericininkinden belirgin yuksek VE gerceklesen
  // satisa gore kalan marj, sistemin bekledigi marjin altinda.
  const marginIfSystemBought =
    saleRef !== null ? saleRef - sys.cashOffer : null;
  const dealerMarginRisk =
    cashBelowDealerPct !== null &&
    cashBelowDealerPct > 5 &&
    marginIfSystemBought !== null &&
    marginIfSystemBought < systemExpectedDealerSpread;

  return {
    marketValueErrorTl,
    marketValueErrorPct: pctOf(marketValueErrorTl, real.dealerMarketValue),
    cashErrorTl,
    cashErrorPct: pctOf(cashErrorTl, real.dealerCashOffer),
    listingErrorTl,
    listingErrorPct: pctOf(listingErrorTl, real.realisticListingPrice),
    salePriceErrorTl,
    salePriceErrorPct: pctOf(salePriceErrorTl, saleRef),
    dealerMarginDiff:
      dealerMarginBase === null ? null : systemExpectedDealerSpread - dealerMarginBase,
    customerOfferDiff: cashErrorTl,
    systemExpectedDealerSpread,
    realizedDealerSpread,
    systemCashRatio,
    dealerCashRatio,
    customerLossRisk,
    dealerMarginRisk,
  };
}

/** Gercek saha verisi girilmis mi? */
export function hasRealData(c: CalibrationCase): boolean {
  return (
    c.dealerMarketValue !== null ||
    c.dealerCashOffer !== null ||
    c.realisticListingPrice !== null ||
    c.actualSalePrice !== null
  );
}

const TEMPLATE_HEADER = `# NakitGaraj gercek saha kalibrasyon dosyasi
# Her satir, galericiden veya gercek piyasadan DOGRULADIGIN bir aractir.
#
# SEN DOLDUR (arac kimligi): id, make, model, engine, trim, year, km, damage
#   engine : motor kodu ("320i", "1.6 Multijet", "1.5 TDCi") - katalogdaki gibi
#   trim   : paket ("M Sport", "Urban") - bilinmiyorsa bos birak
#   damage : 0 = hatasiz, 0.08 = boyali/hasarli, 0.25 = agir hasarli
#
# SEN DOLDUR (gercek saha verisi) - bilmediklerini BOS birak:
#   dealerMarketValue     : galericinin gercek piyasa degeri tahmini
#   dealerCashOffer       : galericinin verdigi nakit alis fiyati
#   realisticListingPrice : gercekci ilan fiyati
#   actualSalePrice       : gerceklesen satis fiyati (varsa)
#   actualDaysToSell      : satis suresi, gun (varsa)
#
# Sistem degerleri ve sapmalar OTOMATIK hesaplanir; bu dosyaya yazilmaz.
# Rakamlari "1.250.000" veya "1250000" olarak yazabilirsin.
#
`;

function writeTemplate() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(CSV_PATH)) {
    console.log(`Şablon zaten var, korunuyor: ${CSV_PATH}`);
    return;
  }
  const example =
    '# ornek satir (basindaki # isaretini kaldirinca aktif olur):\n' +
    '# ORN-1,BMW,3 Serisi,320i,M Sport,2019,85000,0,2750000,2500000,2850000,2790000,26,galeriden teyit\n';
  fs.writeFileSync(CSV_PATH, TEMPLATE_HEADER + CSV_COLUMNS.join(',') + '\n' + example, 'utf8');
  console.log(`✓ Şablon oluşturuldu: ${CSV_PATH}`);
  console.log('  Doldurduktan sonra: npm run calibration:report');
}

const tl = (n: number | null) => (n === null ? '—' : `${Math.round(n).toLocaleString('tr-TR')} ₺`);
const pc = (n: number | null) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`);
const sg = (n: number | null) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${Math.round(n).toLocaleString('tr-TR')} ₺`);

async function report() {
  if (!fs.existsSync(CSV_PATH)) {
    console.log(`Kalibrasyon dosyası yok. Önce: npm run calibration:init`);
    process.exit(1);
  }

  const cases = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
  const withReal = cases.filter(hasRealData);

  console.log(`Toplam satır: ${cases.length}  |  gerçek saha verisi girilmiş: ${withReal.length}`);

  const prisma = new PrismaClient();
  const matcher = new EmsalMatcherService(prisma as any);

  const rows: any[] = [];
  for (const c of cases) {
    // NOT: bu yol tamamen READ-ONLY'dir; uretim motoru degistirilmez.
    const m = await matcher.matchComparableListings({
      make: c.make,
      model: c.model,
      variant: c.engine,
      trim: c.trim || undefined,
      year: c.year,
      mileageKm: c.km,
    });

    if (m.level === 4 || !m.cleanListings.length) {
      rows.push({ c, status: 'INSUFFICIENT_DATA', m });
      continue;
    }

    const r = RobustPricingCalculator.computeValuation({
      cleanListings: m.cleanListings,
      userYear: c.year,
      userMileage: c.km,
      damagePenalty: c.damage,
      matchedLevel: m.level,
      baseConfidenceScore: m.confidenceScore,
      realMatchedListingCount: m.actuallyUsedListingCount || m.matchedCount,
      listingWeights: m.listingWeights,
      freshnessScore: m.freshnessScore,
      engineExactShare: m.engineExactShare,
      fuelKnownShare: m.fuelKnownShare,
      transmissionKnownShare: m.transmissionKnownShare,
      targetEngineKnown: Boolean(splitVariantString(c.engine).engineCode),
    });

    const manualGate =
      r.requiresManualApproval ||
      m.level === 3 ||
      Boolean(m.isLimitedComps) ||
      m.matchedCount < 8 ||
      r.confidenceScore <= 70;

    rows.push({
      c,
      m,
      r,
      status: manualGate ? 'MANUAL_EVALUATION_REQUIRED' : 'SUCCESS',
      err: computeErrors(r, c),
    });
  }

  const priced = rows.filter((x) => x.r);
  const measured = priced.filter((x) => hasRealData(x.c));

  const L: string[] = [];
  L.push('# NakitGaraj — Gerçek Saha Kalibrasyon Raporu');
  L.push('');
  L.push(`Üretim tarihi: ${new Date().toLocaleString('tr-TR')}`);
  L.push('');
  L.push('> Bu rapor **yalnızca ölçüm** yapar. Fiyat motoruna geri besleme uygulamaz,');
  L.push('> `pricing-config.ts` dosyasını değiştirmez ve otomatik öğrenme içermez.');
  L.push('');
  L.push('## 1. Durum');
  L.push('');
  L.push('| | |');
  L.push('|---|---|');
  L.push(`| Dosyadaki araç | ${cases.length} |`);
  L.push(`| Gerçek saha verisi girilmiş | ${withReal.length} |`);
  L.push(`| Sistem fiyat üretebildi | ${priced.length} |`);
  L.push(`| Karşılaştırılabilir (ikisi de var) | ${measured.length} |`);
  L.push(`| Kalibrasyon eşiği | ${MIN_CASES_FOR_CALIBRATION} |`);
  L.push('');

  if (measured.length < MIN_CASES_FOR_CALIBRATION) {
    L.push(`> ⏳ **Kalibrasyon için yetersiz veri: ${measured.length}/${MIN_CASES_FOR_CALIBRATION}.**`);
    L.push('> Bu eşik dolmadan kâr basamağı veya fiyat konfigürasyonu hakkında sonuç çıkarılmaz.');
    L.push('');
  }

  L.push('## 2. Sistem Değerleri');
  L.push('');
  L.push('| # | Araç | Yıl | Km | Yakıt | Vites | Sv | Emsal | Güven | kmExtrap | Piyasa Değeri | Beklenen Satış | Nakit Teklif | Konsinye İlan | Müşteri Neti | Durum |');
  L.push('|---:|---|---:|---:|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---|');
  rows.forEach((x, i) => {
    const c = x.c;
    const name = `${c.make} ${c.model} ${c.engine} ${c.trim}`.trim();
    if (!x.r) {
      L.push(`| ${i + 1} | ${name} | ${c.year} | ${c.km.toLocaleString('tr-TR')} | — | — | 4 | 0 | — | — | — | — | — | — | — | YETERSİZ VERİ |`);
      return;
    }
    const fuel = deriveFuelFromEngineCode(c.engine) || '—';
    const trans =
      x.m.transmissionKnownShare && x.m.transmissionKnownShare >= 0.5 ? 'biliniyor' : 'bilinmiyor';
    const kmEx = x.r.pricingAudit?.kmExtrapolated
      ? `EVET (+${Math.round(x.r.pricingAudit.distanceOutsideObservedRange / 1000)}k)`
      : 'hayır';
    L.push(
      `| ${i + 1} | ${name} | ${c.year} | ${c.km.toLocaleString('tr-TR')} | ${fuel} | ${trans} | ${x.m.level} | ${x.m.actuallyUsedListingCount || x.m.matchedCount} | ${x.r.confidenceScore} | ${kmEx} | ${tl(x.r.fairMarketValue)} | ${tl(x.r.expectedSalePrice)} | ${tl(x.r.cashOffer)} | ${tl(x.r.consignmentListingPrice)} | ${tl(x.r.customerConsignmentNet)} | ${x.status === 'SUCCESS' ? '✓' : 'MANUEL'} |`,
    );
  });
  L.push('');

  L.push('## 3. Sapma (sistem − gerçek)');
  L.push('');
  L.push('Pozitif değer = sistem daha yüksek diyor.');
  L.push('');
  L.push('| # | Araç | Piyasa Değeri | Nakit | İlan Fiyatı | Satış Fiyatı | Sistem Marjı | Gerçekleşen Marj | Sistem c/s | Galeri c/s | Risk |');
  L.push('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  if (measured.length === 0) {
    L.push('| — | *(henüz gerçek saha verisi girilmemiş)* | — | — | — | — | — | — | — | — | — |');
  }
  measured.forEach((x, i) => {
    const c = x.c;
    const e: ErrorMetrics = x.err;
    const risk = [
      e.customerLossRisk ? 'CUSTOMER_LOSS_RISK' : '',
      e.dealerMarginRisk ? 'DEALER_MARGIN_RISK' : '',
    ].filter(Boolean).join(' + ') || '—';
    L.push(
      `| ${i + 1} | ${c.make} ${c.model} ${c.engine} ${c.year} | ${sg(e.marketValueErrorTl)} (${pc(e.marketValueErrorPct)}) | ${sg(e.cashErrorTl)} (${pc(e.cashErrorPct)}) | ${sg(e.listingErrorTl)} (${pc(e.listingErrorPct)}) | ${sg(e.salePriceErrorTl)} (${pc(e.salePriceErrorPct)}) | ${tl(e.systemExpectedDealerSpread)} | ${tl(e.realizedDealerSpread)} | ${(e.systemCashRatio * 100).toFixed(1)}% | ${e.dealerCashRatio === null ? '—' : (e.dealerCashRatio * 100).toFixed(1) + '%'} | ${risk} |`,
    );
  });
  L.push('');

  if (measured.length > 0) {
    const mv = measured.map((x) => x.err.marketValueErrorPct).filter((v: any) => v !== null) as number[];
    const cs = measured.map((x) => x.err.cashErrorPct).filter((v: any) => v !== null) as number[];
    const sp = measured.map((x) => x.err.salePriceErrorPct).filter((v: any) => v !== null) as number[];
    const dm = measured.map((x) => x.err.dealerMarginDiff).filter((v: any) => v !== null) as number[];

    L.push('## 4. Özet Sapma');
    L.push('');
    L.push('| Ölçüt | n | Medyan sapma | Ortalama mutlak sapma |');
    L.push('|---|---:|---:|---:|');
    const summarize = (label: string, arr: number[], unit: '%' | 'TL') => {
      if (!arr.length) { L.push(`| ${label} | 0 | — | — |`); return; }
      const med = median(arr)!;
      const mae = arr.reduce((s, v) => s + Math.abs(v), 0) / arr.length;
      L.push(
        unit === '%'
          ? `| ${label} | ${arr.length} | ${pc(med)} | ${mae.toFixed(1)}% |`
          : `| ${label} | ${arr.length} | ${sg(med)} | ${tl(mae)} |`,
      );
    };
    summarize('Piyasa değeri sapması', mv, '%');
    summarize('Nakit teklif sapması', cs, '%');
    summarize('Satış fiyatı sapması', sp, '%');
    summarize('Galeri marj farkı', dm, 'TL');
    L.push('');

    // ---- Segment bias ----
    L.push('## 5. Segment Bazlı Bias');
    L.push('');
    L.push('| Segment | n | med piyasa % | med nakit % | med satış % | MAE piyasa % | MAE nakit % | MAE satış % | BIAS |');
    L.push('|---|---:|---:|---:|---:|---:|---:|---:|---|');
    for (const [name] of SEGMENT_BANDS) {
      const sub = measured.filter((x) => segmentOf(x.r.expectedSalePrice) === name);
      const pick = (f: (e: ErrorMetrics) => number | null) =>
        sub.map((x) => f(x.err)).filter((v): v is number => v !== null);
      const mv = pick((e) => e.marketValueErrorPct);
      const cs = pick((e) => e.cashErrorPct);
      const sp = pick((e) => e.salePriceErrorPct);
      // Bias karari nakit sapmasi uzerinden verilir (musteriye giden rakam).
      const verdict = biasVerdict(median(cs), cs.length);
      L.push(
        `| ${name} | ${sub.length} | ${pc(median(mv))} | ${pc(median(cs))} | ${pc(median(sp))} | ` +
        `${mae(mv) === null ? '—' : mae(mv)!.toFixed(1) + '%'} | ${mae(cs) === null ? '—' : mae(cs)!.toFixed(1) + '%'} | ` +
        `${mae(sp) === null ? '—' : mae(sp)!.toFixed(1) + '%'} | ${verdict} |`,
      );
    }
    L.push('');

    // ---- Confidence kalibrasyonu ----
    L.push('## 6. Confidence Gerçekten Anlamlı mı?');
    L.push('');
    L.push('Beklenti: yüksek güven bandındaki araçların hata oranı daha düşük olmalı.');
    L.push('');
    L.push('| Güven bandı | n | MAE nakit % | MAE piyasa % | med nakit % |');
    L.push('|---|---:|---:|---:|---:|');
    const bandMae: Array<[string, number | null, number]> = [];
    for (const [name] of CONFIDENCE_BANDS) {
      const sub = measured.filter((x) => confidenceBandOf(x.r.confidenceScore) === name);
      const cs = sub.map((x) => x.err.cashErrorPct).filter((v: any): v is number => v !== null);
      const mv = sub.map((x) => x.err.marketValueErrorPct).filter((v: any): v is number => v !== null);
      bandMae.push([name, mae(cs), sub.length]);
      L.push(
        `| ${name} | ${sub.length} | ${mae(cs) === null ? '—' : mae(cs)!.toFixed(1) + '%'} | ` +
        `${mae(mv) === null ? '—' : mae(mv)!.toFixed(1) + '%'} | ${pc(median(cs))} |`,
      );
    }
    L.push('');
    const usable = bandMae.filter((b) => b[1] !== null && b[2] >= 3);
    if (usable.length >= 2) {
      const ordered = [...usable].sort((a, b) => CONFIDENCE_BANDS.findIndex((c) => c[0] === a[0]) - CONFIDENCE_BANDS.findIndex((c) => c[0] === b[0]));
      let monotone = true;
      for (let i = 1; i < ordered.length; i++) if (ordered[i][1]! < ordered[i - 1][1]!) monotone = false;
      L.push(monotone
        ? '> ✅ Yüksek güven bandı daha düşük hata üretiyor: confidence anlamlı.'
        : '> ⚠️ Güven bandı ile hata oranı ters/karışık: confidence kalibrasyonu sorgulanmalı.');
    } else {
      L.push('> ⏳ Güven bandı başına en az 3 vaka yok; confidence kalibrasyonu değerlendirilemiyor.');
    }
    L.push('');

    // ---- Risk ozeti ----
    const clr = measured.filter((x) => x.err.customerLossRisk);
    const dmr = measured.filter((x) => x.err.dealerMarginRisk);
    L.push('## 7. Risk Bayrakları (RISK FLAG — hüküm değil)');
    L.push('');
    L.push('> Aşağıdakiler **analitik etikettir**: incelenmeye değer vakaları işaretler.');
    L.push('> Bir bayrak, sistemin fiyatının YANLIŞ olduğunun kanıtı DEĞİLDİR — galericinin');
    L.push('> tahmini de yanlış olabilir, araç özel durumda olabilir veya örneklem küçük olabilir.');
    L.push('');
    L.push(`- **CUSTOMER_LOSS_RISK**: ${clr.length} araç (sistem nakit teklifi galericininkinden %5+ düşük veya cash/sale < %88)`);
    for (const x of clr) L.push(`  - ${x.c.make} ${x.c.model} ${x.c.engine} ${x.c.year} — sistem ${tl(x.r.cashOffer)} / galeri ${tl(x.c.dealerCashOffer)}`);
    L.push(`- **DEALER_MARGIN_RISK**: ${dmr.length} araç (sistem belirgin yüksek alıyor, gerçekleşen satışa göre marj hedefin altında)`);
    for (const x of dmr) L.push(`  - ${x.c.make} ${x.c.model} ${x.c.engine} ${x.c.year} — sistem ${tl(x.r.cashOffer)} / galeri ${tl(x.c.dealerCashOffer)}`);
    L.push('');
    L.push('> Bu bayraklar yalnızca ÖLÇÜMDÜR. Hiçbir fiyat otomatik değiştirilmez ve');
    L.push('> hiçbir konfigürasyon önerisi üretilmez.');
    L.push('');

    if (measured.length >= MIN_CASES_FOR_CALIBRATION) {
      L.push(`> ✅ ${measured.length} araç ile kalibrasyon eşiği doldu. Bu tablo artık`);
      L.push('> `pricing-config.ts` üzerinde **elle** yapılacak ayarlama için girdi olarak kullanılabilir.');
      L.push('> Otomatik güncelleme yapılmaz; değişiklik kararı sana aittir.');
      L.push('');
    }
  }

  fs.writeFileSync(REPORT_PATH, L.join('\n'), 'utf8');
  console.log(`✓ Rapor yazıldı: ${REPORT_PATH}`);
  console.log(`  karşılaştırılabilir araç: ${measured.length}/${MIN_CASES_FOR_CALIBRATION}`);

  await prisma.$disconnect();
}

if (require.main === module) {
  const mode = process.argv[2] === '--init' ? 'init' : 'report';
  (mode === 'init' ? Promise.resolve(writeTemplate()) : report()).catch((e) => {
    console.error('HATA:', e);
    process.exit(1);
  });
}
