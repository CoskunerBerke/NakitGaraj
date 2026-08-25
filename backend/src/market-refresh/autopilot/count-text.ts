/**
 * KAYNAK SAYIM METNI AYRISTIRMA — TEK VE TEST EDILMIS DOGRU.
 *
 * CANLI KOSUDA KANITLANAN HATA:
 *   Gercek baslik su bicimdedir:
 *     "Audi A3 Fiyatları & Modelleri" aramanızda 6.559 ilan bulundu.
 *   Metindeki ILK sayi dizisini almak "A3" icindeki 3'u yakaliyordu. Dugum
 *   3 ilanli sanildi, <=1000 oldugu icin YAPRAK yapildi ve 6.559 ilanlik
 *   EBEVEYN sayfalandi. Sessiz veri kaybinin ta kendisi.
 *
 * KURAL: sayi TEK BASINA aranmaz; "ilan" sozcugune BAGLANIR. Kaynagin
 * cumlesinde sayimi tasiyan sey "<sayi> ilan"dir; kategori adindaki rakamlar
 * ("A3", "3 Serisi", "316i") sayim DEGILDIR.
 *
 * BINLIK AYRACI: Turkcede nokta binlik ayracidir. "6.559" -> 6559, ondalik
 * DEGIL. Gruplar dogrulanir: "6.5" gecerli bir binlik gosterimi degildir ve
 * 65'e cevrilmez — null doner ve dugum UNKNOWN_COUNT olur.
 */

/** Gecerli Turkce tam sayi gosterimi: "6.559", "3.132", "948", "11". */
const TURKISH_INTEGER = /^\d{1,3}(?:\.\d{3})*$|^\d+$/;

/**
 * Bir sayi METNINI tam sayiya cevirir. Bicim gecerli degilse null.
 * TAHMIN YOK: "6.5" ya da "1.23" gibi belirsiz bicimler null doner.
 */
export function parseTurkishInteger(raw: string | null | undefined): number | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (!TURKISH_INTEGER.test(value)) return null;
  const parsed = Number(value.replace(/\./g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Sonuc sayisini "ilan" sozcugune BAGLI olarak cikarir.
 *
 * Desteklenen gercek bicimler:
 *   '"Audi A3 Fiyatları & Modelleri" aramanızda 6.559 ilan bulundu.'
 *   "6.559 ilan"
 *   "Toplam 6.559 ilan bulundu"
 *   "1 - 50 arası, toplam 6.559 ilan"   -> 6559 (bastaki 1 ve 50 DEGIL)
 *
 * Birden fazla "<sayi> ilan" varsa EN BUYUGU secilir: kaynak bazen once
 * bir alt kirilim sayisini yazabilir; toplam sayim daima en buyuktur ve
 * bolumleme kararinin dogru tarafinda kalmak icin buyugu almak gerekir.
 */
export function extractReportedCount(raw: string | null | undefined): number | null {
  const text = String(raw ?? '').replace(/\s+/g, ' ');
  if (!text) return null;

  const matches = text.matchAll(/(\d[\d.]*)\s*(?:adet\s*)?ilan\b/gi);
  let best: number | null = null;
  for (const match of matches) {
    const value = parseTurkishInteger(match[1]);
    if (value === null) continue;
    if (best === null || value > best) best = value;
  }
  return best;
}

/** Parantezli sayim: "A3 Sportback (2.960)". */
const PARENTHESISED_COUNT = /\((\d[\d.]*)\)\s*$/;

/**
 * Sondaki sayim, ONUNDE metin olmak sartiyla: "A3 Sedan 3.132".
 *
 * Onceki sozcuk ZORUNLUDUR, cunku kaynak model kodlarinin cogu zaten sayidir
 * ("315", "318", "3 Serisi"). Sart konmazsa "315" etiketi 315 ilanlik bir
 * kategori sanilir ve dugum tamamen yanlis boyutlandirilir — sayiyi yanlis
 * yerden okumak bu dosyanin var olma sebebi olan hatanin ta kendisidir.
 */
const TRAILING_COUNT = /[^\d.\s]\s+(\d{1,3}(?:\.\d{3})+|\d+)\s*$/;

/**
 * Bir alt kategori etiketindeki sayimi cikarir.
 *
 * Gercek taksonomi bicimleri:
 *   "A3 Sportback (2.960)"  -> 2960
 *   "A3 Sedan 3.132"        -> 3132  (sayim ayri elemanda, metin birlesmis)
 *   "315"                   -> null  (model kodu, sayim DEGIL)
 *   "316i"                  -> null
 */
export function extractChildCount(raw: string | null | undefined): number | null {
  const text = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;

  const parenthesised = text.match(PARENTHESISED_COUNT);
  if (parenthesised) return parseTurkishInteger(parenthesised[1]);

  const trailing = text.match(TRAILING_COUNT);
  if (trailing) return parseTurkishInteger(trailing[1]);

  return null;
}

/** Etiketten sondaki sayimi temizler: "A3 Sedan (3.132)" -> "A3 Sedan". */
export function stripTrailingCount(raw: string | null | undefined): string {
  const text = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (PARENTHESISED_COUNT.test(text)) {
    return text.replace(PARENTHESISED_COUNT, '').trim();
  }
  if (TRAILING_COUNT.test(text)) {
    return text.replace(/\s+(\d{1,3}(?:\.\d{3})+|\d+)\s*$/, '').trim();
  }
  return text;
}
