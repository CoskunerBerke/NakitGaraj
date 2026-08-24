/**
 * BILINEN ILAN HIZLI YOLU — HAFIF PARMAK IZI.
 *
 * Liste kartinda gorunen hafif alanlardan (id, fiyat, km, baslik) deterministik
 * bir parmak izi turetilir ve referansla karsilastirilir. Amac: 280k bilinen
 * ve DEGISMEMIS ilan icin pahali detay cikarimini ATLAMAK.
 *
 *   ID yok referansta                 -> NEW           (kart verisini al)
 *   ID var, parmak izi ayni           -> KNOWN_UNCHANGED (DETAY ACMA)
 *   ID var, parmak izi farkli         -> CHANGED        (degisen veriyi al)
 *
 * CHANGED alt-siniflari (fiyat tek basina degil, hepsi):
 *   PRICE_CHANGED / MILEAGE_CHANGED / TITLE_CHANGED / MULTIPLE_CHANGED
 *
 * Baslik gurultusune karsi normalize edilir (bosluk/kucuk harf); fiyat ve km
 * sayisal karsilastirilir. Kanoniklestirme YOK.
 */

export interface CardFingerprintFields {
  sourceListingId: string;
  price: number | null;
  mileage: number | null;
  title: string;
}

export interface ReferenceFingerprint {
  price: number | null;
  mileage: number | null;
  title: string;
}

export type FastPathDecision = 'NEW' | 'KNOWN_UNCHANGED' | 'CHANGED';

export type ChangeKind =
  | 'PRICE_CHANGED'
  | 'MILEAGE_CHANGED'
  | 'TITLE_CHANGED'
  | 'MULTIPLE_CHANGED'
  | null;

export interface FastPathResult {
  decision: FastPathDecision;
  change: ChangeKind;
  /** Detay sayfasi acilmali mi? KNOWN_UNCHANGED'da HER ZAMAN false. */
  shouldOpenDetail: boolean;
}

/**
 * Baslik parmak izi: tekil bosluk + YERELDEN BAGIMSIZ kucuk harf.
 *
 * Turkce yerel kucuk-harf donusumu ASCII "I" -> noktasiz "ı" yaptigi icin
 * "AUDI" ile "audi" esitsiz olur ve SAHTE baslik-degisti uretir. Parmak izi
 * bir basligi ZAMAN icinde KENDISIYLE karsilastirir; kararli olmasi gerekir,
 * bu yuzden yerelden bagimsiz toLowerCase kullanilir.
 */
export function normalizeTitle(title: string): string {
  return String(title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Karti referansa gore siniflandirir.
 *
 * @param reference  ID referansta yoksa null/undefined gecilir -> NEW.
 */
export function classifyCard(
  card: CardFingerprintFields,
  reference: ReferenceFingerprint | null | undefined,
): FastPathResult {
  if (!reference) {
    return { decision: 'NEW', change: null, shouldOpenDetail: true };
  }

  const priceChanged = card.price !== null && reference.price !== null && card.price !== reference.price;
  const mileageChanged =
    card.mileage !== null && reference.mileage !== null && card.mileage !== reference.mileage;
  const titleChanged = normalizeTitle(card.title) !== normalizeTitle(reference.title);

  const changedCount = [priceChanged, mileageChanged, titleChanged].filter(Boolean).length;

  if (changedCount === 0) {
    // Bilinen ve degismemis: DETAY ACILMAZ (pahali cikarim atlanir).
    return { decision: 'KNOWN_UNCHANGED', change: null, shouldOpenDetail: false };
  }

  let change: ChangeKind;
  if (changedCount > 1) change = 'MULTIPLE_CHANGED';
  else if (priceChanged) change = 'PRICE_CHANGED';
  else if (mileageChanged) change = 'MILEAGE_CHANGED';
  else change = 'TITLE_CHANGED';

  return { decision: 'CHANGED', change, shouldOpenDetail: true };
}

/**
 * KURESEL ID TEKILLESTIRME.
 *
 * Ayni ilan iki farkli kaynak yapraginda gorulebilir (orn. hem "A3" hem
 * "A3 Sportback" kategorisinde). sourceListingId kuresel anahtardir: ilk
 * gorulen kazanir, ikincisi yok sayilir. Boylece tek ilan icin TEK kayit.
 */
export class GlobalListingDeduper {
  private readonly seen = new Set<string>();

  /** true = ilk kez goruldu (islenmeli); false = zaten gorulmus (atla). */
  observe(sourceListingId: string): boolean {
    const key = String(sourceListingId || '').trim();
    if (!key) return false;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }

  get size(): number {
    return this.seen.size;
  }
}
