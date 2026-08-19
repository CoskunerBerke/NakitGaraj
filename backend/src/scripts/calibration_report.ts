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
import { splitVariantString } from '../evaluation/listing-attributes';

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
      dealerMarketValue: parseMoney(get('dealerMarketValue')),
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
  salePriceErrorTl: number | null;
  salePriceErrorPct: number | null;
  dealerMarginDiff: number | null;
  customerOfferDiff: number | null;
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
  const salePriceErrorTl = diff(sys.expectedSalePrice, saleRef);

  // Galericinin gerceklesen brut marji: sattigi fiyat - aldigi fiyat
  const dealerMargin =
    saleRef !== null && real.dealerCashOffer !== null ? saleRef - real.dealerCashOffer : null;
  const systemMargin = sys.expectedSalePrice - sys.cashOffer;

  return {
    marketValueErrorTl,
    marketValueErrorPct: pctOf(marketValueErrorTl, real.dealerMarketValue),
    cashErrorTl,
    cashErrorPct: pctOf(cashErrorTl, real.dealerCashOffer),
    salePriceErrorTl,
    salePriceErrorPct: pctOf(salePriceErrorTl, saleRef),
    dealerMarginDiff: dealerMargin === null ? null : systemMargin - dealerMargin,
    customerOfferDiff: cashErrorTl,
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

function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

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
  L.push('| # | Araç | Yıl | Km | Sv | Emsal | Güven | Piyasa Değeri | Beklenen Satış | Nakit Teklif | Konsinye İlan | Müşteri Neti | Durum |');
  L.push('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  rows.forEach((x, i) => {
    const c = x.c;
    const name = `${c.make} ${c.model} ${c.engine} ${c.trim}`.trim();
    if (!x.r) {
      L.push(`| ${i + 1} | ${name} | ${c.year} | ${c.km.toLocaleString('tr-TR')} | 4 | 0 | — | — | — | — | — | — | YETERSİZ VERİ |`);
      return;
    }
    L.push(
      `| ${i + 1} | ${name} | ${c.year} | ${c.km.toLocaleString('tr-TR')} | ${x.m.level} | ${x.m.actuallyUsedListingCount || x.m.matchedCount} | ${x.r.confidenceScore} | ${tl(x.r.fairMarketValue)} | ${tl(x.r.expectedSalePrice)} | ${tl(x.r.cashOffer)} | ${tl(x.r.consignmentListingPrice)} | ${tl(x.r.customerConsignmentNet)} | ${x.status === 'SUCCESS' ? '✓' : 'MANUEL'} |`,
    );
  });
  L.push('');

  L.push('## 3. Sapma (sistem − gerçek)');
  L.push('');
  L.push('Pozitif değer = sistem daha yüksek diyor.');
  L.push('');
  L.push('| # | Araç | Piyasa Değeri Sapması | Nakit Sapması | Satış Fiyatı Sapması | Galeri Marj Farkı | Müşteri Teklif Farkı |');
  L.push('|---:|---|---:|---:|---:|---:|---:|');
  if (measured.length === 0) {
    L.push('| — | *(henüz gerçek saha verisi girilmemiş)* | — | — | — | — | — |');
  }
  measured.forEach((x, i) => {
    const c = x.c;
    const e: ErrorMetrics = x.err;
    L.push(
      `| ${i + 1} | ${c.make} ${c.model} ${c.engine} ${c.year} | ${sg(e.marketValueErrorTl)} (${pc(e.marketValueErrorPct)}) | ${sg(e.cashErrorTl)} (${pc(e.cashErrorPct)}) | ${sg(e.salePriceErrorTl)} (${pc(e.salePriceErrorPct)}) | ${sg(e.dealerMarginDiff)} | ${sg(e.customerOfferDiff)} |`,
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
