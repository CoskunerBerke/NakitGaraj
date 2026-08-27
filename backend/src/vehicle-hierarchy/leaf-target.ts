/**
 * YAPRAK -> DEGERLEME HEDEFI (TEK COZUMLEYICI).
 *
 * Hiyerarsi kimligi degerlemeye buradan gecer. Kaynak yolu IKINCI bir yerde
 * yeniden ayristirilmaz: sinirlar zaten `hierarchy-tree` tarafindan kaynagin
 * kendi gezinme yapisindan turetildi, burada yalnizca OKUNUR.
 *
 * KIMLIK TAM YOLDUR. "Advanced", "Comfort", "S Line" gibi etiketler onlarca
 * araca tekrar eder; son isme ya da isim benzerligine gore katalog eslesmesi
 * ARANMAZ. Yanlis araci sessizce fiyatlamaktansa istek acikca reddedilir.
 */

/** Segment sayisi degisken oldugu icin ROLLER UCLARDAN okunur, sabit indexten degil. */
export interface LeafTargetIdentity {
  /** Kok segment — daima marka. */
  make: string;
  /** Ikinci segment (seri). Tek segmentli agacta markanin kendisi. */
  model: string;
  /** Motor/versiyon: yeterince derin agaclarda sondan bir onceki segment. */
  engine: string;
  /** Paket/donanim: 3+ segmentli agaclarda son segment. */
  trim: string;
  /** "Audi / A3 / A3 Sportback / 35 TFSI / Advanced" */
  fullPath: string;
  segments: string[];
}

/**
 * Yol segmentlerinden gosterim/kimlik alanlarini turetir.
 *
 * DIKKAT: bunlar GOSTERIM ve mevcut motorun kimlik alanlari icindir.
 * Emsal havuzunun secimi bu adlardan DEGIL, yaprağin kaynak sayfalarindan
 * yapilir — depth degisken oldugu icin rol tahmini fiyatlama kimligi olamaz.
 *
 * Segment sinirlari burada YENIDEN BOLUNMEZ; agactan geldigi gibi kullanilir.
 */
export function identityFromPath(segments: string[], fullPath: string): LeafTargetIdentity {
  const parts = segments.map((s) => String(s || '').trim()).filter(Boolean);
  const make = parts[0] || '';
  const model = parts.length > 1 ? parts[1] : make;
  // 3+ segment: son segment paket/donanim kabul edilir.
  const trim = parts.length >= 3 ? parts[parts.length - 1] : '';
  // 4+ segment: sondan bir onceki motor/versiyon kabul edilir.
  const engine = parts.length >= 4 ? parts[parts.length - 2] : '';
  return { make, model, engine, trim, fullPath, segments: parts };
}

/** Yaprak cozumlemesinin reddetme sebepleri (yanit govdesinde `reason`). */
export type LeafTargetFailure =
  | 'UNKNOWN_HIERARCHY_NODE'
  | 'NOT_A_LEAF'
  /** Kaynak bu kategoriyi ilan etti ama sayfasi hic toplanmadi. */
  | 'NO_COLLECTED_DATA'
  | 'NO_EXACT_MARKET_DATA';
