/**
 * MUSTERIYE SUNULAN TICARI TUTARLARIN MERKEZI YUVARLAMASI.
 *
 * Istatistiksel cekirdek hassas degerler uretir (809.797 / 783.883 / 835.900).
 * Musteriye, bayiye ve panele giden TEK kanonik teklif ise temiz 5.000 TL
 * adimlarinda olmalidir (810.000 / 785.000 / 840.000). Yuvarlama BURADA ve
 * yalnizca burada yapilir; on yuz, Telegram ve panel ayni sayilari oldugu gibi
 * gosterir (ikinci bir aritmetik YOK). Hassas degerler denetim alaninda
 * korunur (pricingAudit.*Raw).
 *
 * Ekonomik invariantlar yuvarlama SONRASINDA da gecerlidir:
 *   nakit < musteri neti < beklenen satis <= ilan fiyati
 *   komisyon >= bir adim (asla 0 ya da negatif)
 *
 * Nakit teklifte en yakin adima yuvarlama, asagi yuvarlamaya gore en fazla
 * +5.000 TL rekabet payi demektir; bu pay YALNIZCA isletme maliyeti, risk
 * maliyeti ve minimum kar korunuyorsa verilir, aksi halde asagi yuvarlanir.
 * Yuzde bazli hicbir artis YOKTUR.
 */

export const QUOTE_STEP = 5_000;

export const roundToStep = (v: number, step = QUOTE_STEP): number => Math.round(v / step) * step;
export const floorToStep = (v: number, step = QUOTE_STEP): number => Math.floor(v / step) * step;
export const ceilToStep = (v: number, step = QUOTE_STEP): number => Math.ceil(v / step) * step;

export interface CommercialQuoteInput {
  /** Hassas beklenen (gerceklesen) satis degeri. */
  expectedSalePrice: number;
  /** Hassas temiz piyasa referansi. */
  fairMarketValue: number;
  /** Cekirdegin urettigi nakit teklif (taban/kar mantigi uygulanmis). */
  cashOffer: number;
  /** Hassas konsinye musteri neti. */
  customerConsignmentNet: number;
  /** Hassas konsinye ilan fiyati. */
  consignmentListingPrice: number;
  /** Nakit rekabet payi korumasi icin maliyet/kar bilesenleri. */
  operatingCost: number;
  riskCost: number;
  minimumProfit: number;
}

export interface CommercialQuote {
  expectedSalePrice: number;
  fairMarketValue: number;
  cashOffer: number;
  customerConsignmentNet: number;
  consignmentListingPrice: number;
  /** Yuvarlanmis satis - yuvarlanmis net (>= bir adim). */
  consignmentCommission: number;
  /** Siralamayi korumak icin yapilan duzeltmeler (denetim). */
  adjustments: string[];
}

export function finalizeCommercialQuote(i: CommercialQuoteInput): CommercialQuote {
  const step = QUOTE_STEP;
  const adjustments: string[] = [];

  const expectedSalePrice = roundToStep(i.expectedSalePrice);
  const fairMarketValue = roundToStep(i.fairMarketValue);

  // NAKIT: en yakin adim; ama minimum kar korunmuyorsa asagi adim.
  let cashOffer = roundToStep(i.cashOffer);
  const cashCeiling = i.expectedSalePrice - i.operatingCost - i.riskCost - i.minimumProfit;
  if (cashOffer > i.cashOffer && cashOffer > cashCeiling) {
    cashOffer = floorToStep(i.cashOffer);
    adjustments.push('cash: rekabet payi minimum kari asacagi icin asagi yuvarlandi');
  }
  // Siralama fizibilitesi: nakit ile satis arasinda net icin en az bir adim.
  if (cashOffer > expectedSalePrice - 2 * step) {
    const feasible = expectedSalePrice - 2 * step;
    if (feasible > 0) {
      cashOffer = Math.min(cashOffer, feasible);
      adjustments.push('cash: satis ile arada net icin yer acildi');
    }
  }

  // ILAN: yukari adim; beklenen satisin altina DUSMEZ.
  const consignmentListingPrice = ceilToStep(Math.max(i.consignmentListingPrice, expectedSalePrice));

  // NET: en yakin adim; satisin ALTINDA ve nakdin USTUNDE kalir.
  let customerConsignmentNet = roundToStep(i.customerConsignmentNet);
  if (customerConsignmentNet >= expectedSalePrice) {
    customerConsignmentNet = expectedSalePrice - step;
    adjustments.push('net: satisin altina cekildi (komisyon en az bir adim)');
  }
  if (customerConsignmentNet <= cashOffer) {
    customerConsignmentNet = cashOffer + step;
    adjustments.push('net: nakdin ustune cekildi');
  }
  if (customerConsignmentNet >= expectedSalePrice) {
    // Yalnizca nakit/satis araligi bir adimdan dar oldugunda olur; yukarida
    // fizibilite acildigi icin pratikte erisilmez. Savunma amacli.
    customerConsignmentNet = expectedSalePrice - step;
    adjustments.push('net: siralama savunmasi');
  }

  const consignmentCommission = expectedSalePrice - customerConsignmentNet;

  return {
    expectedSalePrice,
    fairMarketValue,
    cashOffer,
    customerConsignmentNet,
    consignmentListingPrice,
    consignmentCommission,
    adjustments,
  };
}

/** Yuvarlanmis teklifin ekonomik siralamasini dogrular. */
export function commercialQuoteOrdered(q: {
  cashOffer: number;
  customerConsignmentNet: number;
  expectedSalePrice: number;
  consignmentListingPrice: number;
}): boolean {
  return (
    q.cashOffer < q.customerConsignmentNet &&
    q.customerConsignmentNet < q.expectedSalePrice &&
    q.expectedSalePrice <= q.consignmentListingPrice
  );
}
