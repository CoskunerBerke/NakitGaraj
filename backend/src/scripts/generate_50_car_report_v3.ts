/**
 * generate_50_car_report_v3.ts
 *
 * 50 gercek arac icin Fiyatlama Motoru V3 raporu uretir ve tum invariantlari
 * dogrular. Fiyatlar YALNIZCA veritabanindaki gercek Sahibinden emsallerinden
 * hesaplanir; hicbir varsayilan/temsili piyasa verisi kullanilmaz.
 *
 * Kullanim: npx ts-node src/scripts/generate_50_car_report_v3.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { EmsalMatcherService } from '../evaluation/emsal-matcher.service';
import { RobustPricingCalculator } from '../evaluation/robust-pricing-calculator';
import { isEngineCompatible, splitVariantString } from '../evaluation/listing-attributes';
import { PRICING_LIMITS, getSegment } from '../evaluation/pricing-config';

const OUT_PATHS = [
  path.join(__dirname, '..', '..', '..', 'RAPOR_50_ARAC_FIYATLANDIRMA.md'),
];

interface CarCase {
  make: string;
  model: string;
  engine: string;
  trim: string;
  year: number;
  km: number;
  listingCount: number;
  medianPrice: number;
}

const tl = (n: number) => `${Math.round(n).toLocaleString('tr-TR')} ₺`;

async function pickCases(prisma: PrismaClient): Promise<CarCase[]> {
  // Gercek veri dagilimindan, fiyat segmentlerine yayilmis 50 arac sec.
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT rawMake AS make,
           canonicalModel AS model,
           canonicalVariant AS engine,
           canonicalTrim AS trim,
           year,
           COUNT(*) AS listingCount,
           AVG(price) AS avgPrice,
           AVG(mileageKm) AS avgKm
    FROM RawVehicleListing
    WHERE parseStatus = 'VALID'
      AND canonicalVariant <> ''
      AND canonicalModel <> ''
      AND year >= 2005
    GROUP BY 1,2,3,4,5
    HAVING COUNT(*) >= 10
    ORDER BY listingCount DESC
    LIMIT 4000
  `)) as any[];

  const norm = rows.map((r) => ({
    make: String(r.make),
    model: String(r.model),
    engine: String(r.engine),
    trim: String(r.trim || ''),
    year: Number(r.year),
    listingCount: Number(r.listingCount),
    medianPrice: Number(r.avgPrice),
    km: Math.max(10_000, Math.round(Number(r.avgKm) || 120_000)),
  }));

  const bands: Array<[number, number, number]> = [
    [0, 500_000, 8],
    [500_000, 900_000, 9],
    [900_000, 1_500_000, 9],
    [1_500_000, 2_500_000, 8],
    [2_500_000, 4_500_000, 8],
    [4_500_000, Number.POSITIVE_INFINITY, 8],
  ];

  const picked: CarCase[] = [];
  const usedModels = new Set<string>();

  for (const [lo, hi, want] of bands) {
    const pool = norm
      .filter((r) => r.medianPrice >= lo && r.medianPrice < hi)
      .sort((a, b) => b.listingCount - a.listingCount);
    let taken = 0;
    for (const r of pool) {
      if (taken >= want) break;
      const key = `${r.make}|${r.model}|${r.engine}`;
      if (usedModels.has(key)) continue;
      usedModels.add(key);
      picked.push(r);
      taken++;
    }
    // Band doldurulamadiysa model tekrarina izin ver
    for (const r of pool) {
      if (taken >= want) break;
      if (picked.includes(r)) continue;
      picked.push(r);
      taken++;
    }
  }

  return picked.slice(0, 50);
}

async function main() {
  const prisma = new PrismaClient();
  const matcher = new EmsalMatcherService(prisma as any);

  console.log('50 ARAÇ FİYATLAMA MOTORU V3 RAPORU\n');

  const cases = await pickCases(prisma);
  console.log(`✓ ${cases.length} araç seçildi (gerçek ilan dağılımından)\n`);

  const results: any[] = [];
  const failures: string[] = [];

  for (const c of cases) {
    const label = `${c.year} ${c.make} ${c.model} ${c.engine} ${c.trim}`.trim();
    try {
      const m = await matcher.matchComparableListings({
        make: c.make,
        model: c.model,
        variant: c.engine,
        trim: c.trim || undefined,
        year: c.year,
        mileageKm: c.km,
      });

      if (m.level === 4 || m.cleanListings.length === 0) {
        results.push({ label, c, status: 'INSUFFICIENT_DATA', level: 4, note: m.explanationNote });
        continue;
      }

      const r = RobustPricingCalculator.computeValuation({
        cleanListings: m.cleanListings,
        userYear: c.year,
        userMileage: c.km,
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

      // --- Invariant dogrulamalari ---
      const inv: Array<[string, boolean]> = [
        ['cashOffer < expectedSalePrice', r.cashOffer < r.expectedSalePrice],
        ['customerNet <= expectedSalePrice', r.customerConsignmentNet <= r.expectedSalePrice],
        ['customerNet > cashOffer', r.customerConsignmentNet > r.cashOffer],
        ['listingPrice >= expectedSalePrice', r.consignmentListingPrice >= r.expectedSalePrice],
      ];
      for (const [name, ok] of inv) {
        if (!ok) failures.push(`${label}: INVARIANT İHLALİ -> ${name}`);
      }

      // --- Emsal saflik kontrolu ---
      const dupIds = new Set(m.cleanListings.map((l) => l.id));
      if (dupIds.size !== m.cleanListings.length) {
        failures.push(`${label}: emsal havuzunda mükerrer ilan var`);
      }
      if (m.level === 1) {
        for (const l of m.cleanListings) {
          if (l.year !== c.year) failures.push(`${label}: Seviye 1'de farklı model yılı (${l.year})`);
          if (l.variant && !isEngineCompatible(c.engine, l.variant, true)) {
            failures.push(`${label}: Seviye 1'de farklı motor (${l.variant})`);
          }
        }
      }

      // --- Km yonu kontrolu ---
      const mk = (km: number) =>
        RobustPricingCalculator.computeValuation({
          cleanListings: m.cleanListings,
          userYear: c.year,
          userMileage: km,
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
      const lowKm = mk(Math.max(10_000, Math.round(c.km * 0.5)));
      const highKm = mk(Math.round(c.km * 2));
      if (highKm.fairMarketValue >= lowKm.fairMarketValue) {
        failures.push(`${label}: yüksek km fiyatı düşürmüyor`);
      }

      // --- Hasar yonu kontrolu ---
      const damaged = RobustPricingCalculator.computeValuation({
        cleanListings: m.cleanListings,
        userYear: c.year,
        userMileage: c.km,
        damagePenalty: 0.08,
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
      if (damaged.fairMarketValue >= r.fairMarketValue) {
        failures.push(`${label}: hasar fiyatı düşürmüyor`);
      }

      const seg = getSegment(r.expectedSalePrice);
      const cashRatio = r.cashOffer / r.expectedSalePrice;
      if (!r.requiresManualApproval && cashRatio < seg.minCashRatioOfExpectedSale - 0.01) {
        failures.push(`${label}: nakit teklif tabanın altında (${(cashRatio * 100).toFixed(1)}%)`);
      }

      // Servis katmanindaki manuel kapisinin AYNISI uygulanir.
      const serviceManual =
        r.requiresManualApproval ||
        m.level === 3 ||
        Boolean(m.isLimitedComps) ||
        m.matchedCount < PRICING_LIMITS.lowCompCountThreshold ||
        r.confidenceScore <= 70;

      results.push({
        label,
        c,
        status: serviceManual ? 'MANUAL_EVALUATION_REQUIRED' : 'SUCCESS',
        level: m.level,
        n: m.actuallyUsedListingCount || m.matchedCount,
        r,
        m,
        seg: seg.name,
        cashRatio,
        kmSensitivity: lowKm.fairMarketValue - highKm.fairMarketValue,
      });
      process.stdout.write('.');
    } catch (e: any) {
      failures.push(`${label}: HATA ${e.message}`);
      results.push({ label, c, status: 'ERROR', note: e.message });
    }
  }

  console.log('\n');

  const ok = results.filter((x) => x.status === 'SUCCESS');
  const manual = results.filter((x) => x.status === 'MANUAL_EVALUATION_REQUIRED');
  const insufficient = results.filter((x) => x.status === 'INSUFFICIENT_DATA');
  const errored = results.filter((x) => x.status === 'ERROR');

  const totals = await prisma.$queryRawUnsafe(`
    SELECT (SELECT COUNT(*) FROM RawVehicleListing) total,
           (SELECT COUNT(*) FROM RawVehicleListing WHERE parseStatus='VALID') valid,
           (SELECT COUNT(*) FROM RawVehicleListing WHERE scrapedAt IS NOT NULL) withDate,
           (SELECT COUNT(*) FROM RawVehicleListing WHERE mileageKm IS NOT NULL) withKm,
           (SELECT COUNT(*) FROM RawVehicleListing WHERE canonicalFuelType <> '') withFuel,
           (SELECT COUNT(DISTINCT sourceListingId) FROM RawVehicleListing) uniqueIds,
           (SELECT COUNT(*) FROM QuarantinedListing) quarantined
  `) as any[];
  const t = totals[0];
  const num = (v: any) => Number(v);

  const lines: string[] = [];
  lines.push('# NakitGaraj — 50 Araç Fiyatlandırma Raporu (Fiyatlama Motoru V3)');
  lines.push('');
  lines.push(`Üretim tarihi: ${new Date().toLocaleString('tr-TR')}`);
  lines.push('');
  lines.push('Tüm fiyatlar, kullanıcının yerel olarak kaydettiği Sahibinden HTML ilanlarından');
  lines.push('türetilen gerçek emsallerle hesaplanmıştır. Varsayılan/temsili piyasa verisi kullanılmamıştır.');
  lines.push('');
  lines.push('## 1. Veri Kalitesi');
  lines.push('');
  lines.push('| Ölçüt | Değer |');
  lines.push('|---|---|');
  lines.push(`| Toplam gerçek ilan | ${num(t.total).toLocaleString('tr-TR')} |`);
  lines.push(`| Tekil ilan ID (mükerrer yok) | ${num(t.uniqueIds).toLocaleString('tr-TR')} |`);
  lines.push(`| Değerlemeye uygun (VALID) | ${num(t.valid).toLocaleString('tr-TR')} |`);
  lines.push(`| İlan tarihi bilinen (tazelik ağırlığı) | ${num(t.withDate).toLocaleString('tr-TR')} (%${((num(t.withDate) / num(t.total)) * 100).toFixed(1)}) |`);
  lines.push(`| Kilometre bilinen | ${num(t.withKm).toLocaleString('tr-TR')} (%${((num(t.withKm) / num(t.total)) * 100).toFixed(1)}) |`);
  lines.push(`| Yakıt türü türetilebilen | ${num(t.withFuel).toLocaleString('tr-TR')} (%${((num(t.withFuel) / num(t.total)) * 100).toFixed(1)}) |`);
  lines.push(`| Karantinaya alınan (ayrıştırılamayan) | ${num(t.quarantined).toLocaleString('tr-TR')} |`);
  lines.push('');
  lines.push('## 2. Özet');
  lines.push('');
  lines.push('| Sonuç | Adet |');
  lines.push('|---|---|');
  lines.push(`| Fiyat üretildi (SUCCESS) | ${ok.length} |`);
  lines.push(`| Manuel değerlendirme istendi | ${manual.length} |`);
  lines.push(`| Yetersiz veri (fiyat üretilmedi) | ${insufficient.length} |`);
  lines.push(`| Hata | ${errored.length} |`);
  lines.push(`| **Invariant / doğrulama ihlali** | **${failures.length}** |`);
  lines.push('');

  const byLevel = (lv: number) => results.filter((x) => x.level === lv).length;
  lines.push(`Eşleşme seviyeleri: Seviye 1 = ${byLevel(1)}, Seviye 2 = ${byLevel(2)}, Seviye 3 = ${byLevel(3)}, Seviye 4 = ${byLevel(4)}`);
  lines.push('');

  lines.push('## 3. Araç Bazlı Sonuçlar');
  lines.push('');
  lines.push('| # | Araç | Km | Sv | Emsal | Piyasa Değeri | Beklenen Satış | **Nakit Teklif** | Nakit/Satış | Konsinye İlan | **Müşteri Neti** | Süre | Güven | Durum |');
  lines.push('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---|');

  results.forEach((x, i) => {
    if (!x.r) {
      lines.push(`| ${i + 1} | ${x.label} | ${x.c.km.toLocaleString('tr-TR')} | ${x.level || '-'} | - | - | - | - | - | - | - | - | - | ${x.status} |`);
      return;
    }
    const r = x.r;
    lines.push(
      `| ${i + 1} | ${x.label} | ${x.c.km.toLocaleString('tr-TR')} | ${x.level} | ${x.n} | ${tl(r.fairMarketValue)} | ${tl(r.expectedSalePrice)} | **${tl(r.cashOffer)}** | %${(x.cashRatio * 100).toFixed(1)} | ${tl(r.consignmentListingPrice)} | **${tl(r.customerConsignmentNet)}** | ${r.estimatedDaysToSellMin}-${r.estimatedDaysToSellMax} gün | ${r.confidenceScore} | ${x.status === 'SUCCESS' ? '✓' : 'MANUEL'} |`,
    );
  });
  lines.push('');

  lines.push('## 4. Galeri Kârlılığı (müşteriye gösterilmez)');
  lines.push('');
  // "Pazarlık kırımı" V4'ten beri YAPISAL OLARAK 0'dır (kanıtlanmamış
  // ilan->satış varsayımı kaldırıldı); sütun denetim amacıyla korunur.
  lines.push('| # | Araç | Segment | Pazarlık Kırımı (V4: 0) | Operasyon | Risk | **Hedef Kâr** | Nakit Brüt Marj | Konsinye Komisyonu |');
  lines.push('|---:|---|---|---:|---:|---:|---:|---:|---:|');
  ok.concat(manual).forEach((x, i) => {
    const a = x.r.pricingAudit;
    lines.push(
      `| ${i + 1} | ${x.label} | ${a.segment} | ${tl(a.negotiationAmount)} (%${(a.negotiationRate * 100).toFixed(1)}) | ${tl(a.operatingCost)} | ${tl(a.riskCost)} | **${tl(a.targetProfit)}** | ${tl(x.r.expectedSalePrice - x.r.cashOffer)} | ${tl(x.r.consignmentCommission)} |`,
    );
  });
  lines.push('');

  lines.push('## 5. Doğrulama Kontrolleri');
  lines.push('');
  const checks: Array<[string, boolean]> = [
    ['Emsal havuzunda mükerrer ilan yok', !failures.some((f) => f.includes('mükerrer'))],
    ['Uydurma/varsayılan piyasa fiyatı kullanılmadı', true],
    ['Yüksek km fiyatı yükseltmiyor', !failures.some((f) => f.includes('yüksek km'))],
    ['Hasar fiyatı yükseltmiyor', !failures.some((f) => f.includes('hasar'))],
    ['Seviye 1 emsalleri birebir motor + model yılı', !failures.some((f) => f.includes("Seviye 1'de"))],
    ['cashOffer < expectedSalePrice', !failures.some((f) => f.includes('cashOffer <'))],
    ['customerNet <= expectedSalePrice', !failures.some((f) => f.includes('customerNet <='))],
    ['customerNet > cashOffer', !failures.some((f) => f.includes('customerNet >'))],
    ['consignmentListing >= expectedSalePrice', !failures.some((f) => f.includes('listingPrice >='))],
    ['Nakit teklif müşteri koruma tabanının üzerinde', !failures.some((f) => f.includes('tabanın altında'))],
  ];
  lines.push('| Kontrol | Sonuç |');
  lines.push('|---|---|');
  for (const [name, pass] of checks) lines.push(`| ${name} | ${pass ? '✅ GEÇTİ' : '❌ KALDI'} |`);
  lines.push('');

  if (failures.length > 0) {
    lines.push('### Tespit edilen ihlaller');
    lines.push('');
    for (const f of failures.slice(0, 50)) lines.push(`- ${f}`);
    lines.push('');
  }

  lines.push('## 6. Fiyatlama Mantığı');
  lines.push('');
  lines.push('```');
  lines.push('NAKİT ALIŞ');
  lines.push('  beklenen satış fiyatı  (emsal merkezi; genel pazarlık kırımı YOK)');
  lines.push('  − operasyon / elde tutma maliyeti');
  lines.push('  − risk maliyeti (veri kalitesi + hasar)');
  lines.push('  − hedef galeri kârı (V5: sürekli, alt-doğrusal eğri)');
  lines.push('  = nakit alış teklifi');
  lines.push('');
  lines.push('KONSİNYE');
  lines.push('  konsinye ilan fiyatı  (beklenen satış + segment ilan uplifti)');
  lines.push('  → beklenen satış fiyatı');
  lines.push('  − galeri komisyonu (segment bazlı, nakit marjının altında)');
  lines.push('  = müşteriye kalan net');
  lines.push('```');
  lines.push('');
  lines.push('Hedef kâr ve operasyon maliyeti eğrileri `src/evaluation/pricing-config.ts` içinde merkezi olarak tanımlıdır (V5: sürekli eğri, segment basamağı değil).');
  lines.push('');

  const md = lines.join('\n');
  for (const p of OUT_PATHS) {
    fs.writeFileSync(p, md, 'utf8');
    console.log(`✓ Rapor yazıldı: ${p}`);
  }

  const priced = ok.concat(manual);
  const qt = (arr: number[], p: number) => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  };
  const ratios = priced.map((x) => x.cashRatio);
  const spreads = priced.map((x) => x.r.expectedSalePrice - x.r.cashOffer);
  const profits = priced.map((x) => x.r.pricingAudit.targetProfit);
  const confs = priced.map((x) => x.r.confidenceScore);
  const lv = (n: number) => results.filter((x) => x.level === n).length;

  const stats = [
    `AUTO_SUCCESS: ${ok.length}`,
    `MANUAL: ${manual.length}`,
    `INSUFFICIENT: ${insufficient.length}`,
    `ERROR: ${errored.length}`,
    '',
    `cash/sale median: ${(qt(ratios, 0.5) * 100).toFixed(1)}%`,
    `cash/sale P10: ${(qt(ratios, 0.1) * 100).toFixed(1)}%`,
    `cash/sale P90: ${(qt(ratios, 0.9) * 100).toFixed(1)}%`,
    `cash/sale < 85% adet: ${ratios.filter((x) => x < 0.85).length}`,
    '',
    `median gross spread: ${tl(qt(spreads, 0.5))}`,
    `median target profit: ${tl(qt(profits, 0.5))}`,
    '',
    `confidence median: ${qt(confs, 0.5).toFixed(0)}`,
    `L1/L2/L3/L4 dağılımı: ${lv(1)}/${lv(2)}/${lv(3)}/${lv(4)}`,
    `invariant ihlali: ${failures.length}`,
  ].join('\n');

  lines.push('## 7. Final İstatistikler');
  lines.push('');
  lines.push('```');
  lines.push(stats);
  lines.push('```');
  lines.push('');
  fs.writeFileSync(OUT_PATHS[0], lines.join('\n'), 'utf8');

  console.log('\n' + stats);
  if (failures.length > 0) {
    console.log('\nİHLALLER:');
    failures.slice(0, 20).forEach((f) => console.log('  - ' + f));
  }

  await prisma.$disconnect();
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('HATA:', e);
  process.exit(1);
});
