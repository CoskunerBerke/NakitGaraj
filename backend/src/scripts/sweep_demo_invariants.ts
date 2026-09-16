/**
 * DEMO INVARIANT TARAMASI — demoda GOSTERILEN her fiyat tutarli mi?
 *
 * Demoda ziyaretci istedigi araci ve istedigi kilometreyi girer; backend yok,
 * fiyati tarayici hesaplar. Bu yuzden tek tek teklifleri elle denemek yerine
 * veri setinin tamami taranir ve iki ayri soru ayri ayri yanitlanir:
 *
 *  1) SIRALAMA (sert kural): ekranda fiyat gorunuyorsa
 *         nakit teklif < konsinye net <= beklenen satis <= konsinye ilan fiyati
 *     olmak ZORUNDA. Bir tek ihlal bile demoyu yaniltici yapar -> exit 1.
 *
 *  2) MANUEL DEGERLENDIRME (beklenen davranis): ucuz/eski araclarda sabit
 *     maliyet + asgari kar, nakit teklifi musteri koruma tabaninin altina
 *     indirir; motor bilerek fiyat URETMEZ. Hata degildir, ama demoda ne
 *     siklikta bos ekran cikacagini onceden bilmek gerekir.
 *
 * Tarama demonun gercekten calistirdigi fonksiyonu (frontend'deki `quote`)
 * cagirir — kopya bir matematik degil. Her (havuz, yil) satiri once gercekci
 * kilometrelerde (motorun orneklendigi uc nokta + medyanin yarisi/bir bucugu),
 * sonra iki ucta (1 km / 1.000.000 km) denenir. Rastgele ornekleme YOK: sonuc
 * tekrarlanabilir ve tarama veri seti kadar surer.
 *
 * Kullanim: npx ts-node --transpile-only src/scripts/sweep_demo_invariants.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  quote,
  hasEnoughEvidence,
  type DemoQuote,
} from '../../../frontend/src/lib/demo-pricing';

/** [km1, km2, km3, fmv1, fmv2, fmv3, oYilinIlanSayisi] */
type YearRow = [number, number, number, number, number, number, number];

interface Pool {
  label: string;
  n: number;
  years: Record<string, YearRow>;
}

interface Bucket {
  evaluations: number;
  manual: number;
}

const newBucket = (): Bucket => ({ evaluations: 0, manual: 0 });

/** Ziyaretcinin gercekten girebilecegi kilometreler. */
function realisticMileages(row: YearRow): number[] {
  const [k1, k2, k3] = row;
  const points = [Math.round(k2 * 0.5), k1, k2, k3, Math.round(k2 * 1.5)];
  return [...new Set(points.filter((km) => km > 0))].sort((a, b) => a - b);
}

/** Formulun sinirlarini zorlayan, gercekci olmayan girdiler. */
const EDGE_MILEAGES = [1, 1_000_000];

/**
 * Ekranda fiyat gorunuyorsa saglanmasi ZORUNLU siralama. `quote` bunu kendi
 * icinde de kontrol eder; burada bagimsiz olarak bir kez daha dogrulanir, ki
 * kontrolun kendisi bozulursa tarama yine de yakalasin.
 */
function orderingBreach(q: DemoQuote): string | null {
  if (!(q.cashOffer > 0)) return 'nakit teklif <= 0';
  if (!(q.cashOffer < q.customerConsignmentNet)) return 'nakit >= konsinye net';
  if (!(q.customerConsignmentNet <= q.fairMarketValue)) {
    return 'konsinye net > beklenen satis';
  }
  if (!(q.consignmentListingPrice >= q.fairMarketValue)) {
    return 'ilan fiyati < beklenen satis';
  }
  return null;
}

function main(): void {
  const demoPath = path.resolve(
    __dirname,
    '../../../frontend/public/demo-market.json',
  );
  const demo = JSON.parse(fs.readFileSync(demoPath, 'utf-8')) as {
    poolCount: number;
    pools: Record<string, Pool>;
  };

  let rowsTotal = 0;
  let rowsBelowEvidence = 0;
  let rowsManualAtMedian = 0;
  let shownPrices = 0;

  const realistic = newBucket();
  const edge = newBucket();
  const reasons = new Map<string, number>();
  const breaches: string[] = [];

  for (const [poolKey, pool] of Object.entries(demo.pools)) {
    for (const [year, row] of Object.entries(pool.years)) {
      rowsTotal += 1;

      const yearListingCount = row[6];
      if (!hasEnoughEvidence(yearListingCount)) {
        rowsBelowEvidence += 1;
        continue;
      }

      const medianKm = row[1];
      const runs: Array<[number, Bucket]> = [
        ...realisticMileages(row).map(
          (km) => [km, realistic] as [number, Bucket],
        ),
        ...EDGE_MILEAGES.map((km) => [km, edge] as [number, Bucket]),
      ];

      for (const [mileageKm, bucket] of runs) {
        const result = quote({
          kmPoints: [row[0], row[1], row[2]],
          fmvPoints: [row[3], row[4], row[5]],
          mileageKm,
          yearListingCount,
          poolListingCount: pool.n,
        });

        bucket.evaluations += 1;

        if (result.requiresManualApproval) {
          bucket.manual += 1;
          const reason = result.manualApprovalReason || '(sebep yok)';
          reasons.set(reason, (reasons.get(reason) || 0) + 1);
          if (mileageKm === medianKm) rowsManualAtMedian += 1;
          continue;
        }

        // Fiyat GORUNUYOR: siralama artik pazarlik konusu degil.
        shownPrices += 1;
        const breach = orderingBreach(result);
        if (breach && breaches.length < 20) {
          breaches.push(
            `${poolKey} ${year} @ ${mileageKm} km — ${breach} ` +
              `(nakit ${result.cashOffer}, net ${result.customerConsignmentNet}, ` +
              `FMV ${result.fairMarketValue}, ilan ${result.consignmentListingPrice})`,
          );
        }
      }
    }
  }

  const priceableRows = rowsTotal - rowsBelowEvidence;
  const pct = (part: number, whole: number): string =>
    whole === 0 ? '0.00' : ((part / whole) * 100).toFixed(2);

  console.log('\nDEMO INVARIANT TARAMASI');
  console.log(`  havuz                      : ${demo.poolCount}`);
  console.log(`  (havuz, yil) satiri        : ${rowsTotal}`);
  console.log(
    `  emsal esigi altinda        : ${rowsBelowEvidence} (%${pct(rowsBelowEvidence, rowsTotal)}) — demo zaten fiyat URETMEZ`,
  );
  console.log(`  fiyatlanabilir satir       : ${priceableRows}`);

  console.log('\n  1) SIRALAMA INVARIANTI (gosterilen fiyatlar)');
  console.log(`     gosterilen fiyat        : ${shownPrices}`);
  console.log(`     ihlal                   : ${breaches.length}`);
  for (const b of breaches) console.log(`       ${b}`);

  console.log('\n  2) MANUEL DEGERLENDIRME (beklenen davranis)');
  console.log(
    `     gercekci km             : ${realistic.manual} / ${realistic.evaluations} (%${pct(realistic.manual, realistic.evaluations)})`,
  );
  console.log(
    `     uc km (1 / 1.000.000)   : ${edge.manual} / ${edge.evaluations} (%${pct(edge.manual, edge.evaluations)})`,
  );
  console.log(
    `     medyan km'de            : ${rowsManualAtMedian} / ${priceableRows} satir (%${pct(rowsManualAtMedian, priceableRows)})`,
  );

  if (reasons.size > 0) {
    console.log('\n     SEBEPLER');
    for (const [reason, count] of [...reasons.entries()].sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`       ${count.toString().padStart(6)}  ${reason}`);
    }
  }

  console.log('');
  if (breaches.length > 0) {
    console.log('  SONUC: BASARISIZ — gosterilen bir fiyat tutarsiz.\n');
    process.exitCode = 1;
    return;
  }
  console.log('  SONUC: gosterilen her fiyat tutarli.\n');
}

main();
