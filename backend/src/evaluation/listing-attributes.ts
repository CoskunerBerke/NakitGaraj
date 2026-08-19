/**
 * listing-attributes.ts
 *
 * Sahibinden HTML ilanlarindan marka / model / motor / paket / yakit / sanziman
 * bilgisini DETERMINISTIK olarak turetir.
 *
 * Tek gercek kaynak (single source of truth): hem import scriptleri hem de
 * emsal esleme motoru bu modulu kullanir. Boylece "import baska semantik,
 * esleme baska semantik" kaynakli capraz kontaminasyon olusamaz.
 *
 * KURAL: Burada asla uydurma (fabricated) deger uretilmez. Bilinmeyen alan
 * bos string / null olarak doner ve cagiran taraf bunu UNKNOWN olarak isler.
 */

export type FuelType = 'Dizel' | 'Benzin' | 'Hibrit' | 'Elektrik' | 'LPG' | '';
export type TransmissionType = 'Otomatik' | 'Manuel' | '';

export interface DerivedListingAttributes {
  make: string;
  model: string;
  engineCode: string;
  trim: string;
  fuelType: FuelType;
  transmission: TransmissionType;
  isValid: boolean;
  rejectReason?: string;
}

export function foldTurkish(s: string): string {
  if (!s) return '';
  return s
    .replace(/[İIı]/g, 'i')
    .replace(/[Şş]/g, 's')
    .replace(/[Ğğ]/g, 'g')
    .replace(/[Üü]/g, 'u')
    .replace(/[Öö]/g, 'o')
    .replace(/[Çç]/g, 'c')
    .toLowerCase();
}

/** Sahibinden sayfa basligi / dosya adi artiklari (fold edilmis metne uygulanir) */
const TITLE_JUNK: RegExp[] = [
  /\s*-\s*\d+\s*$/g,
  /2\s*\.?\s*el\s+arabalar\s+ve\s+satilik\s+sifir\s+km\s+otomobil/g,
  /fiyatlari\s*&?\s*modelleri/g,
  /fiyatlari\s*&?\s*modleri/g,
  /sahibinden\s*\.?\s*com\s*'?\s*da/g,
  /sahibinden\s*\.?\s*com/g,
  /\bfiyatlari\b/g,
  /\bmodelleri\b/g,
  /\bmodleri\b/g,
  /2\s*\.?\s*el\b/g,
  /\bsatilik\b/g,
  /\bsifir\s*km\b/g,
  /\botomobil\b/g,
  /\bikinci\s*el\b/g,
  /\barama\s*sonucu\b/g,
];

/**
 * Sayfa basligini/dosya adini temizler.
 * Konum eslesmesi fold edilmis metin uzerinden yapilir, silme islemi orijinal
 * metinde ayni indislerde uygulanir (fold karakter sayisini degistirmez).
 */
export function cleanPageTitle(raw: string): string {
  if (!raw) return '';
  let workOrig = ' ' + raw + ' ';
  let workFolded = foldTurkish(workOrig);

  for (const pat of TITLE_JUNK) {
    pat.lastIndex = 0;
    const spans: Array<[number, number]> = [];
    let m: RegExpExecArray | null;
    while ((m = pat.exec(workFolded)) !== null) {
      if (m[0].length === 0) break;
      spans.push([m.index, m.index + m[0].length]);
    }
    for (let i = spans.length - 1; i >= 0; i--) {
      const [s, e] = spans[i];
      const blank = ' '.repeat(e - s);
      workOrig = workOrig.slice(0, s) + blank + workOrig.slice(e);
      workFolded = workFolded.slice(0, s) + blank + workFolded.slice(e);
    }
  }

  return workOrig.replace(/&/g, ' ').replace(/\s+/g, ' ').trim();
}

const MAKE_ALIASES: Array<[RegExp, string]> = [
  [/^alfa/i, 'Alfa Romeo'],
  [/^aston/i, 'Aston Martin'],
  [/^ds(\s|$)|^ds automobiles/i, 'DS Automobiles'],
  [/^land\s*rover/i, 'Land Rover'],
  [/^mercedes/i, 'Mercedes-Benz'],
  [/^rolls/i, 'Rolls Royce'],
  [/^citro/i, 'Citroen'],
  [/^sko|^Ško/i, 'Skoda'],
  [/^vw$|^volkswagen/i, 'Volkswagen'],
  [/^bmw/i, 'BMW'],
  [/^byd/i, 'BYD'],
  [/^mg$/i, 'MG'],
];

/** Turkiye pazarindaki yaygin markalar (yanlis klasore atilmis sayfalari yakalamak icin) */
const KNOWN_MAKES = [
  'Alfa Romeo', 'Aston Martin', 'Audi', 'BMW', 'BYD', 'Bentley', 'Cadillac', 'Chery',
  'Chevrolet', 'Chrysler', 'Citroen', 'Cupra', 'DS Automobiles', 'Dacia', 'Daewoo',
  'Daihatsu', 'Dodge', 'Ferrari', 'Fiat', 'Ford', 'Geely', 'Honda', 'Hyundai',
  'Infiniti', 'Isuzu', 'Iveco', 'Jaguar', 'Jeep', 'Kia', 'Lada', 'Lamborghini',
  'Lancia', 'Land Rover', 'Lexus', 'Maserati', 'Mazda', 'Mercedes-Benz', 'MG', 'Mini',
  'Mitsubishi', 'Nissan', 'Opel', 'Peugeot', 'Porsche', 'Proton', 'Renault',
  'Rolls Royce', 'Rover', 'Saab', 'Seat', 'Skoda', 'Smart', 'SsangYong', 'Subaru',
  'Suzuki', 'Tesla', 'Tofas', 'Toyota', 'Volkswagen', 'Volvo',
];

/**
 * Temizlenmis sayfa basliginin basindaki marka adini bulur.
 * Kullanici bir sayfayi yanlis marka klasorune kaydettiginde (orn. Honda
 * klasorunde "Hyundai Accent Era" sayfasi) dogru markayi geri kazandirir.
 */
export function makeFromTitle(cleanTitle: string): string {
  const folded = foldTurkish(cleanTitle || '').trim();
  if (!folded) return '';
  let best = '';
  for (const m of KNOWN_MAKES) {
    const fm = foldTurkish(m);
    if (folded === fm || folded.startsWith(fm + ' ')) {
      if (fm.length > foldTurkish(best).length) best = m;
    }
  }
  return best;
}

export function normalizeMake(rawMake: string): string {
  const t = (rawMake || '').trim();
  if (!t) return '';
  for (const [re, name] of MAKE_ALIASES) if (re.test(t)) return name;
  return t.replace(/\s+/g, ' ');
}

/* ------------------------------------------------------------------ */
/* Motor kodu tespiti                                                  */
/* ------------------------------------------------------------------ */

const RE_DISPLACEMENT = /^\d\.\d$/;

const ENGINE_WORDS = new Set([
  'tdi', 'tsi', 'etsi', 'tfsi', 'fsi', 'gti', 'gtd', 'multijet', 'multiair', 'jtd', 'jtdm',
  'hdi', 'bluehdi', 'ehdi', 'dci', 'crdi', 'cdti', 'tdci', 'ecoboost',
  'tivct', 'vti', 'thp', 'puretech', 'mpi', 'cvvt', 'dcvvt',
  'gdi', 'tgdi', 'gtdi', 'crdi', 'vvt', 'vvti', 'd4d', 'cdi', 'bluetec',
  'dtec', 'idtec', 'vtec', 'ivtec', 'sidi', 'ddis', 'vgt',
  'turbo', 'tce', 'mhev', 'hybrid', 'hibrit', 'phev', 'hev',
  'blueefficiency', 'ecotec', 'sce', 'digt', 'skyactiv', 'dizel', 'benzin',
]);

/** Sadece bir hacim tokeni HEMEN oncesinde geldiginde motor sayilan ekler (1.4 T Multiair) */
const SUFFIX_ENGINE_TOKENS = new Set(['t', 'ti', 'td', 'tt', 'i', 'd']);

function normToken(tok: string): string {
  return foldTurkish(tok).replace(/[(),."]/g, (c) => (c === '.' ? '.' : '')).replace(/-/g, '');
}

export function isEngineToken(tok: string): boolean {
  const t = normToken(tok);
  if (!t) return false;
  if (RE_DISPLACEMENT.test(t)) return true;
  if (ENGINE_WORDS.has(t)) return true;
  if (/^\d{3}[a-z]{1,3}$/.test(t)) return true;
  if (SUFFIX_ENGINE_TOKENS.has(t)) return true;
  if (/^[a-z]{1,3}\d{3}[a-z]{0,3}$/.test(t)) return true;
  if (/^\d\.\d[a-z]{1,8}$/.test(t)) return true;
  if (/^\d{4}$/.test(t) && Number(t) >= 1000 && Number(t) <= 6500) return true;
  return false;
}

/**
 * Temizlenmis sayfa basligindan model / motor / paket ayirir.
 *   "BMW 3 Serisi 318i Luxury Plus" -> model "3 Serisi", motor "318i",        paket "Luxury Plus"
 *   "Hyundai Accent 1.3 1.3i"       -> model "Accent",   motor "1.3 1.3i",    paket ""
 *   "Fiat Egea 1.6 Multijet Urban"  -> model "Egea",     motor "1.6 Multijet",paket "Urban"
 */
export function splitModelEngineTrim(cleanTitle: string, make: string): {
  model: string;
  engineCode: string;
  trim: string;
} {
  let rest = cleanTitle || '';
  const foldedMake = foldTurkish(make || '');
  if (foldedMake && foldTurkish(rest).startsWith(foldedMake)) {
    rest = rest.slice(make.length).trim();
  }
  const tokens = rest.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { model: '', engineCode: '', trim: '' };

  let firstEngineIdx = -1;
  for (let i = 1; i < tokens.length; i++) {
    if (isEngineToken(tokens[i]) && !SUFFIX_ENGINE_TOKENS.has(normToken(tokens[i]))) {
      firstEngineIdx = i;
      break;
    }
  }

  if (firstEngineIdx === -1) {
    return { model: tokens.join(' '), engineCode: '', trim: '' };
  }

  let lastEngineIdx = firstEngineIdx;
  for (let i = firstEngineIdx + 1; i < tokens.length; i++) {
    if (isEngineToken(tokens[i])) lastEngineIdx = i;
    else break;
  }

  return {
    model: tokens.slice(0, firstEngineIdx).join(' '),
    engineCode: tokens.slice(firstEngineIdx, lastEngineIdx + 1).join(' '),
    trim: tokens.slice(lastEngineIdx + 1).join(' '),
  };
}

/**
 * Katalogdaki variant adi motor + paket bilgisini birlikte tasiyabilir
 * ("1.0 EcoBoost GTDi Titanium"). Bunu emsal tablosuyla ayni semantige indirger.
 *   "1.0 EcoBoost GTDi Titanium" -> { engineCode: "1.0 EcoBoost GTDi", trim: "Titanium" }
 *   "320i"                        -> { engineCode: "320i",             trim: "" }
 *   "Urban"                       -> { engineCode: "",                 trim: "Urban" }
 */
export function splitVariantString(variant: string): { engineCode: string; trim: string } {
  const tokens = (variant || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { engineCode: '', trim: '' };

  let end = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (isEngineToken(tokens[i])) end = i;
    else if (end >= 0) break;
    else if (i > 0) break;
  }

  if (end < 0) return { engineCode: '', trim: tokens.join(' ') };
  return {
    engineCode: tokens.slice(0, end + 1).join(' '),
    trim: tokens.slice(end + 1).join(' '),
  };
}

/* ------------------------------------------------------------------ */
/* Yakit / sanziman                                                    */
/* ------------------------------------------------------------------ */

const DIESEL_RE = /\b(tdi|tdci|hdi|bluehdi|ehdi|dci|crdi|cdti|multijet|jtdm|jtd|d4d|d-4d|cdi|bluetec|dtec|i-dtec|ddis|vgt|dizel|diesel)\b/;
const PETROL_RE = /\b(tsi|etsi|tfsi|fsi|ecoboost|ti-?vct|vti|thp|puretech|mpi|cvvt|d-?cvvt|gdi|t-?gdi|vvt|vvt-?i|vtec|i-?vtec|sidi|tce|sce|dig-?t|benzin|petrol)\b/;
const HYBRID_RE = /\b(hybrid|hibrit|hev|phev|mhev|e-?power)\b/;
const ELECTRIC_RE = /\b(elektrik|electric|kwh|e-tron|etron)\b/;
const LPG_RE = /\b(lpg|gpl|otogaz)\b/;

/** BMW/Mercedes tipi kodlarda son harf yakiti belirler: 320d -> dizel, 320i -> benzin */
function fuelFromPremiumCode(folded: string): FuelType {
  const m = folded.match(/\b\d{3}\s?([a-z]{1,3})\b/);
  if (!m) return '';
  const suffix = m[1];
  if (suffix === 'd' || suffix === 'cdi' || suffix === 'td' || suffix === 'dx') return 'Dizel';
  if (suffix === 'i' || suffix === 'ia' || suffix === 'is') return 'Benzin';
  if (suffix === 'e' || suffix === 'de') return 'Hibrit';
  return '';
}

/**
 * Serbest metinden yakit turetir. Premium motor kodu cikarimi UYGULANMAZ:
 * "Fiat 500e" gibi model adlari yanlis yakit etiketi uretmesin diye bu cikarim
 * yalnizca deriveFuelFromEngineCode icinde, motor kodu alanina uygulanir.
 */
export function deriveFuelType(...parts: Array<string | null | undefined>): FuelType {
  const folded = ' ' + parts.filter(Boolean).map((p) => foldTurkish(String(p))).join(' ') + ' ';
  if (ELECTRIC_RE.test(folded)) return 'Elektrik';
  if (HYBRID_RE.test(folded)) return 'Hibrit';
  if (LPG_RE.test(folded)) return 'LPG';
  if (DIESEL_RE.test(folded)) return 'Dizel';
  if (PETROL_RE.test(folded)) return 'Benzin';
  return '';
}

/** Motor kodu alanina ozel: kelime eslesmesi + 320i/320d/330e tipi kod cikarimi. */
export function deriveFuelFromEngineCode(engineCode: string): FuelType {
  const direct = deriveFuelType(engineCode);
  if (direct) return direct;
  return fuelFromPremiumCode(' ' + foldTurkish(engineCode || '') + ' ');
}

const AUTO_RE = /\b(otomatik|automatic|steptronic|tiptronic|dsg|dct|edc|eat\d?|s-?tronic|multitronic|cvt|powershift|amt|otm|9g|g-?tronic)\b/;
const MANUAL_RE = /\b(manuel|manual|duz\s*vites)\b/;

export function deriveTransmission(...parts: Array<string | null | undefined>): TransmissionType {
  const folded = ' ' + parts.filter(Boolean).map((p) => foldTurkish(String(p))).join(' ') + ' ';
  const auto = AUTO_RE.test(folded);
  const man = MANUAL_RE.test(folded);
  if (auto && !man) return 'Otomatik';
  if (man && !auto) return 'Manuel';
  return '';
}

/* ------------------------------------------------------------------ */
/* Motor uyumlulugu                                                    */
/* ------------------------------------------------------------------ */

/** Motor kodunu karsilastirilabilir anahtara indirger. */
export function engineKey(engineCode: string): string {
  const folded = foldTurkish(engineCode || '').trim();
  if (!folded) return '';
  const prem = folded.match(/\b(\d{3})\s?([a-z]{0,3})\b/);
  if (prem) return `${prem[1]}${(prem[2] || '').slice(0, 1)}`;
  const disp = engineDisplacement(engineCode);
  const fuel = foldTurkish(deriveFuelFromEngineCode(engineCode) || 'x');
  // "1.6 i-DTEC" ile "1.6i DTEC" ayni motoru tanimlar; anahtar hacim + yakittir.
  if (disp !== null) return `${disp.toFixed(1)}|${fuel}`;
  return `${folded.replace(/\s+/g, '')}|${fuel}`;
}

/** Hacim (litre) cikarir; premium kodlarda guvenilir olmadigi icin null doner. */
export function engineDisplacement(engineCode: string): number | null {
  // "1.6i DTEC" / "2.0d" gibi bitisik yazimlari da yakalar.
  const m = foldTurkish(engineCode || '').match(/(\d\.\d)/);
  return m ? parseFloat(m[1]) : null;
}

/**
 * Iki motorun ayni fiyat havuzunda toplanip toplanamayacagi.
 *  strict  : birebir ayni motor anahtari
 *  !strict : ayni yakit + hacim farki <= 0.3 L, premium kodda ayni seri ve
 *            ayni yakit harfi + guc basamagi farki <= 2
 */
export function isEngineCompatible(a: string, b: string, strict: boolean): boolean {
  const ka = engineKey(a);
  const kb = engineKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (strict) return false;

  const fa = deriveFuelFromEngineCode(a);
  const fb = deriveFuelFromEngineCode(b);
  if (fa && fb && fa !== fb) return false;

  const pa = foldTurkish(a).match(/\b(\d)(\d)(\d)\s?([a-z]{0,3})\b/);
  const pb = foldTurkish(b).match(/\b(\d)(\d)(\d)\s?([a-z]{0,3})\b/);
  if (pa && pb) {
    if (pa[1] !== pb[1]) return false;
    if ((pa[4] || '').slice(0, 1) !== (pb[4] || '').slice(0, 1)) return false;
    return Math.abs(Number(pa[2]) - Number(pb[2])) <= 2;
  }
  if (pa || pb) return false;

  const da = engineDisplacement(a);
  const db = engineDisplacement(b);
  if (da !== null && db !== null) return Math.abs(da - db) <= 0.3 + 1e-9;

  return false;
}

/* ------------------------------------------------------------------ */
/* Tarih / sehir                                                       */
/* ------------------------------------------------------------------ */

const MONTHS: Array<[RegExp, number]> = [
  [/^oca/, 0],
  [/^(sub|ubat)/, 1],
  [/^mar/, 2],
  [/^nis/, 3],
  [/^may/, 4],
  [/^haz/, 5],
  [/^tem/, 6],
  [/^(agu|austos|aust|ustos|au)/, 7],
  [/^eyl/, 8],
  [/^eki/, 9],
  [/^kas/, 10],
  [/^ara/, 11],
];

/**
 * "06 Agustos 2026" (bozuk encoding dahil) -> Date.
 * Sahibinden liste gorunumunde gun/ay ve yil ayri span'lardadir.
 */
export function parseTurkishListingDate(text: string): Date | null {
  if (!text) return null;
  const norm = text.replace(/[^0-9A-Za-zÀ-ɏ?]+/g, ' ').trim();
  const m = norm.match(/(\d{1,2})\s+([A-Za-zÀ-ɏ?]+)\s*(\d{4})?/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthToken = foldTurkish(m[2]).replace(/[^a-z]/g, '');
  let month = -1;
  for (const [re, idx] of MONTHS) {
    if (re.test(monthToken)) {
      month = idx;
      break;
    }
  }
  if (month < 0) return null;
  const year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
  if (day < 1 || day > 31 || year < 2015 || year > 2100) return null;
  return new Date(Date.UTC(year, month, day));
}

export function parseLocation(text: string): { city: string; district: string } {
  const parts = (text || '')
    .split(/\n|\r|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { city: parts[0] || '', district: parts[1] || '' };
}

/* ------------------------------------------------------------------ */
/* Ust seviye API                                                      */
/* ------------------------------------------------------------------ */

export function deriveFromSource(params: {
  folderMake: string;
  pageTitleOrFileName: string;
  listingTagTrim?: string | null;
  listingTitle?: string | null;
}): DerivedListingAttributes {
  const folderMake = normalizeMake(params.folderMake);
  const clean = cleanPageTitle(params.pageTitleOrFileName);

  // Sayfa basligindaki marka, klasor adindan onceliklidir: yanlis klasore
  // kaydedilmis sayfalar baska bir markanin fiyat havuzunu kirletemez.
  const titleMake = makeFromTitle(clean);
  const make = titleMake || folderMake;

  const { model, engineCode, trim: fileTrim } = splitModelEngineTrim(clean, make);

  const tagTrim = (params.listingTagTrim || '').trim();
  const trim = tagTrim || fileTrim || '';

  const fuelType = deriveFuelFromEngineCode(engineCode) || deriveFuelType(clean, params.listingTitle);
  const transmission = deriveTransmission(params.listingTitle, trim, clean);

  if (!make || !model) {
    return {
      make,
      model,
      engineCode,
      trim,
      fuelType,
      transmission,
      isValid: false,
      rejectReason: !make ? 'MARKA_TESPIT_EDILEMEDI' : 'MODEL_TESPIT_EDILEMEDI',
    };
  }

  return { make, model, engineCode, trim, fuelType, transmission, isValid: true };
}
