/**
 * KAYNAK KATEGORI YOLU — AYRISTIRMA (SAF).
 *
 * KOK NEDEN (kanitlanmis): toplanan ilanlarin kategori kimligi
 * `RawVehicleListing.sourceFile` icinde TAM olarak duruyor:
 *
 *   "...\\Audi\\Audi A3 A3 Sportback 35 TFSI Advanced Fiyatlari & Modelleri
 *    sahibinden.com'da - 3.html"
 *
 * Ama normalizasyon bu dizeyi bosluktan naif bicimde bolup SABIT uc alana
 * sikistirmis:
 *
 *   canonicalModel   = "A3 A3 Sportback 35"   <- "35 TFSI" ORTADAN IKIYE BOLUNMUS
 *   canonicalVariant = "TFSI"
 *   canonicalTrim    = "Advanced"
 *
 * Boylece "A3" ile "A3 Sportback" arasindaki sinir ve "35 TFSI" seviyesi
 * kaybolmus. Bu modul dizeyi YENIDEN BOLMEZ; yalnizca gurultuyu temizler.
 * Seviye sinirlari `hierarchy-tree` icinde, GOZLENEN dizelerin onek
 * iliskilerinden turetilir — tahminle degil.
 */

/** Kaynagin liste sayfasi basliklarina ekledigi pazarlama kuyruklari. */
const LISTING_SUFFIXES: RegExp[] = [
  /\s*Fiyatlar[ıi]\s*&\s*Modelleri\b.*$/i,
  /\s*2\s*\.?\s*El\s+Arabalar\b.*$/i,
  /\s*Sat[ıi]l[ıi]k\s+S[ıi]f[ıi]r\s+Km\b.*$/i,
  /\s*sahibinden\.com'?da\b.*$/i,
];

/** Kaydedilen dosyanin "- 3" gibi kopya numarasi ve uzantisi. */
const FILE_NOISE: RegExp[] = [/\.html?$/i, /\s*-\s*\d+\s*$/, /\s*\(\d+\)\s*$/];

/**
 * Tamamen pazarlama metni olan, hicbir arac kategorisi tasimayan sayfalar.
 * (Sitenin kok vitrin sayfasi bu bicimde kaydedilmis.)
 */
export function isNonCategoryPage(raw: string): boolean {
  const value = String(raw || '').trim();
  if (!value) return true;
  return /^2\s*\.?\s*El\s+Arabalar\b/i.test(value) || /^sahibinden\.com/i.test(value);
}

/** Dosya adindan kategori dizesini cikarir. Cozulemezse bos dize. */
export function categoryStringFromSourceFile(sourceFile: string | null | undefined): string {
  const base = String(sourceFile || '')
    .split(/[\\/]/)
    .pop();
  if (!base) return '';

  let value = base;
  for (const noise of FILE_NOISE) value = value.replace(noise, '');
  for (const suffix of LISTING_SUFFIXES) value = value.replace(suffix, '');
  // Kuyruk temizliginden sonra tekrar olusabilen kopya numarasi.
  for (const noise of FILE_NOISE) value = value.replace(noise, '');

  value = value.replace(/\s+/g, ' ').trim();
  return isNonCategoryPage(value) ? '' : value;
}

/**
 * MARKA KOKUNU AYIR — ILK SOZCUKLE DEGIL, BILINEN MARKA LISTESIYLE.
 *
 * "Alfa Romeo", "Aston Martin", "DS Automobiles", "Land Rover" gibi cok
 * sozcuklu markalar ilk sozcuge bakan bir kural tarafindan ikiye bolunur ve
 * agac yanlis koke baglanir. Bu yuzden bilinen marka adlari UZUNDAN KISAYA
 * denenir; hicbiri tutmazsa marka BILINMIYOR sayilir ve dize disarida kalir
 * (uydurma kok URETILMEZ).
 */
export function splitMakeAndRest(
  categoryString: string,
  knownMakes: string[],
): { make: string; rest: string } | null {
  const value = String(categoryString || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return null;

  const sorted = [...knownMakes]
    .map((m) => String(m || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const make of sorted) {
    if (value.toLocaleLowerCase('tr') === make.toLocaleLowerCase('tr')) {
      return { make, rest: '' };
    }
    const prefix = `${make} `;
    if (value.toLocaleLowerCase('tr').startsWith(prefix.toLocaleLowerCase('tr'))) {
      return { make, rest: value.slice(prefix.length).trim() };
    }
  }
  return null;
}

/**
 * Dugum kimligi: TAM YOLDAN turetilen kararli slug.
 *
 * Son isim TEK BASINA kimlik OLAMAZ — "Advanced", "Comfort", "Premium" gibi
 * paket adlari onlarca araca tekrar eder. Kimlik daima kokten yaprağa
 * TUM yolu tasir.
 */
export function nodeIdFromPath(segments: string[]): string {
  return segments
    .map((s) =>
      String(s)
        .toLocaleLowerCase('tr')
        .replace(/ç/g, 'c')
        .replace(/ğ/g, 'g')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ş/g, 's')
        .replace(/ü/g, 'u')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
    .join('/');
}

/** Insan-okur tam yol: "Audi / A3 / A3 Sportback / 35 TFSI / Advanced". */
export function fullPathLabel(segments: string[]): string {
  return segments.join(' / ');
}
