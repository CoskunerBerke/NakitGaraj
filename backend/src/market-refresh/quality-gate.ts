/**
 * KALITE KAPISI — FELAKET COKMESINI PROMOSYONA UYGUN SAYMAZ.
 *
 * V1'de GERCEK PROMOSYON UYGULANMAZ. Bu kapi yalnizca "promosyona uygun mu"
 * sorusunu yanitlar. Toplama cokerse (ornek: onceki 280.000, yeni 20.000)
 * sonuc FAIL olmalidir; aksi halde eksik korpus gercek korpus sanilir ve
 * fiyat cekirdegi kanit yerine gurultuyle beslenir.
 */

export interface QualityMetrics {
  pagesAttempted: number;
  pagesOk: number;
  recordsExtracted: number;
  parseFailures: number;
  validPrice: number;
  validYear: number;
  validMileage: number;
  duplicates: number;
  /** Snapshot'taki onceki toplam (kapsam icinde). */
  previousTotal: number;
  /** Bu kosuda gozlenen tekil toplam (kapsam icinde). */
  newTotal: number;
}

export interface QualityThresholds {
  minPageSuccessRatio: number;
  minParseSuccessRatio: number;
  minValidPriceRatio: number;
  minValidYearRatio: number;
  minValidMileageRatio: number;
  maxDuplicateRatio: number;
  /** Onceki toplama gore izin verilen en buyuk DUSUS orani (0.35 = %35). */
  maxListingCountDropRatio: number;
  /** Bu sayinin altinda oran testleri anlamsizdir; kapi orani degerlendirmez. */
  minRecordsForRatioChecks: number;
}

export const DEFAULT_THRESHOLDS: QualityThresholds = {
  minPageSuccessRatio: 0.9,
  minParseSuccessRatio: 0.9,
  minValidPriceRatio: 0.9,
  minValidYearRatio: 0.9,
  minValidMileageRatio: 0.7,
  maxDuplicateRatio: 0.2,
  maxListingCountDropRatio: 0.35,
  minRecordsForRatioChecks: 25,
};

export type QualityStatus = 'PASS' | 'FAIL';

export interface QualityResult {
  status: QualityStatus;
  failures: string[];
  ratios: Record<string, number>;
  /** V1: kapi gecse bile promosyon UYGULANMAZ. */
  promotionEligible: boolean;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

export function evaluateQuality(
  metrics: QualityMetrics,
  thresholds: QualityThresholds = DEFAULT_THRESHOLDS,
): QualityResult {
  const failures: string[] = [];

  const pageSuccess = ratio(metrics.pagesOk, metrics.pagesAttempted);
  const attempted = metrics.recordsExtracted + metrics.parseFailures;
  const parseSuccess = ratio(metrics.recordsExtracted, attempted);
  const priceRatio = ratio(metrics.validPrice, metrics.recordsExtracted);
  const yearRatio = ratio(metrics.validYear, metrics.recordsExtracted);
  const mileageRatio = ratio(metrics.validMileage, metrics.recordsExtracted);
  const duplicateRatio = ratio(metrics.duplicates, Math.max(metrics.recordsExtracted, 1));
  const dropRatio =
    metrics.previousTotal > 0
      ? Math.max(0, (metrics.previousTotal - metrics.newTotal) / metrics.previousTotal)
      : 0;

  if (metrics.pagesAttempted > 0 && pageSuccess < thresholds.minPageSuccessRatio) {
    failures.push(
      `page success ratio ${pageSuccess.toFixed(3)} < ${thresholds.minPageSuccessRatio}`,
    );
  }

  // Oran testleri yalnizca anlamli orneklemde uygulanir; kucuk kosuda
  // gurultuyle FAIL uretmek yanlis sinyaldir.
  if (metrics.recordsExtracted >= thresholds.minRecordsForRatioChecks) {
    if (parseSuccess < thresholds.minParseSuccessRatio) {
      failures.push(
        `parse success ratio ${parseSuccess.toFixed(3)} < ${thresholds.minParseSuccessRatio}`,
      );
    }
    if (priceRatio < thresholds.minValidPriceRatio) {
      failures.push(`valid price ratio ${priceRatio.toFixed(3)} < ${thresholds.minValidPriceRatio}`);
    }
    if (yearRatio < thresholds.minValidYearRatio) {
      failures.push(`valid year ratio ${yearRatio.toFixed(3)} < ${thresholds.minValidYearRatio}`);
    }
    if (mileageRatio < thresholds.minValidMileageRatio) {
      failures.push(
        `valid mileage ratio ${mileageRatio.toFixed(3)} < ${thresholds.minValidMileageRatio}`,
      );
    }
    if (duplicateRatio > thresholds.maxDuplicateRatio) {
      failures.push(
        `duplicate ratio ${duplicateRatio.toFixed(3)} > ${thresholds.maxDuplicateRatio}`,
      );
    }
  }

  // Korpus cokmesi HER ZAMAN degerlendirilir — orneklem buyuklugunden bagimsiz.
  if (metrics.previousTotal > 0 && dropRatio > thresholds.maxListingCountDropRatio) {
    failures.push(
      `listing count dropped ${(dropRatio * 100).toFixed(1)}% ` +
        `(${metrics.previousTotal} -> ${metrics.newTotal}), limit ` +
        `${(thresholds.maxListingCountDropRatio * 100).toFixed(1)}%`,
    );
  }

  const status: QualityStatus = failures.length === 0 ? 'PASS' : 'FAIL';
  return {
    status,
    failures,
    ratios: {
      pageSuccess,
      parseSuccess,
      validPrice: priceRatio,
      validYear: yearRatio,
      validMileage: mileageRatio,
      duplicate: duplicateRatio,
      listingCountDrop: dropRatio,
    },
    // V1: promosyon kodu YOK. Uygunluk yalnizca raporlanir.
    promotionEligible: status === 'PASS',
  };
}
