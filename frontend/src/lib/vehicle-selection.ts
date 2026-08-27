/**
 * ARAC SECIMI TAMAMLANDI MI — TEK KURAL.
 *
 * KOK NEDEN (olculdu): ayni soruya iki yerde farkli cevap veriliyordu.
 * Sihirbaz "Araç seçiminiz tamamlandı" rozetini gosterip 578 ilanı yazarken,
 * "Devam Et" butonu kapali kaliyordu. Ikisi ayri ifade hesapliyordu ve buton
 * fazladan `node.isLeaf === true` istiyordu.
 *
 * `isLeaf` bir KANIT bayragidir: yalnizca dugumun KENDI kategori sayfasi
 * kaydedilmisse true olur. "Audi / A3 / A3 Sedan / 35 TFSI" sayfasi hic
 * kaydedilmemis (derived), ama ust sayfalarin satirlarindan 578 ilan KESIN
 * olarak bu dugume cozulmus ve dugumun hicbir alt kategorisi yok. Yani secim
 * gercekten bitmistir ve fiyatlanabilir. Sayfanin kaydedilmis olmasi
 * KULLANICININ arac seciminin bittiginin sarti DEGILDIR.
 *
 * Dogru kural iki maddedir ve derinlikten BAGIMSIZDIR:
 *
 *   1. dugumun YAPISAL COCUGU YOK  -> daha derine sorulacak soru kalmadi
 *   2. KESIN ilan kaniti var       -> bu dugum fiyatlanabilir
 *
 * Sabit sayida secim BEKLENMEZ: bir dal 2. seviyede, bir digeri 5. seviyede
 * biter. "Her aracin paketi vardir" varsayimi da yanlistir.
 */

/** Kapinin ihtiyac duydugu asgari dugum yuzeyi. */
export interface SelectableNode {
  /** Agacta bu dugumun altinda baska kategori var mi. */
  hasChildren: boolean;
  /** Bu dugume KESIN olarak cozulmus ilan sayisi. */
  marketListingCount: number;
}

/**
 * Bu dugum bir secim sonu mu?
 *
 * Cocugu varsa HAYIR: kullaniciya sorulacak bir soru daha var ve devam
 * ettirmek ona ust kategorinin ortalamasini gostermek olurdu.
 * Kaniti yoksa HAYIR: fiyatlayacak veri yok (fail-closed).
 */
export function isTerminalAndPriceable(node: SelectableNode | null | undefined): boolean {
  if (!node) return false;
  return !node.hasChildren && node.marketListingCount > 0;
}

/**
 * "Devam Et" acilabilir mi: arac secimi bitmis VE model yili secilmis.
 *
 * Yil ayri bir zorunlu girdidir; degerleme motoru onsuz calismaz.
 */
export function canContinueFromVehicleStep(
  node: SelectableNode | null | undefined,
  year: number | '' | null | undefined,
): boolean {
  return isTerminalAndPriceable(node) && year !== '' && year !== null && year !== undefined;
}
