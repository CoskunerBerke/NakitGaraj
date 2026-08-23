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

/**
 * YALNIZCA sayfa basligi / dosya adi artigi: "... - 10" seklindeki sayfalama eki.
 * Bu desen ILAN SATIRININ model hucresine UYGULANMAZ: gercek model adlari
 * "-<rakam>" tasiyabilir (Saab 9-3, Saab 9-5, Proton Gen-2) ve satir hucresinde
 * bu ek silinirse iki farkli model tek bir "9" altinda birlesir.
 */
const PAGE_NUMBER_JUNK: RegExp[] = [/\s*-\s*\d+\s*$/g];

/** Sahibinden sayfa basligi / dosya adi artiklari (fold edilmis metne uygulanir) */
const TITLE_JUNK: RegExp[] = [
  /2\s*\.?\s*el\s+arabalar\s+ve\s+satilik\s+sifir\s+km\s+otomobil/g,
  // Bazi dosya adlari bozuk kodlanmis karakter tasir ("Fiyatlar─▒").
  // Bu yuzden "fiyatlar" kokunden sonraki bosluksuz artiklar da atilir;
  // gercek model/motor tokenlari ("A 200", "C 200 d") ETKILENMEZ.
  /fiyatlar\S*\s*&?\s*modell?eri/g,
  /fiyatlari\s*&?\s*modelleri/g,
  /fiyatlari\s*&?\s*modleri/g,
  /(^|\s)fiyatlar\S*/g,
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
  return stripJunk(raw, [...PAGE_NUMBER_JUNK, ...TITLE_JUNK]);
}

/**
 * ILAN SATIRININ kendi model hucresini temizler.
 * cleanPageTitle ile ayni artik sozlugunu kullanir, ANCAK sayfalama eki
 * ("- 10") desenini UYGULAMAZ. Aksi halde satirdaki gercek model adi kirpilir:
 *   "9-3" -> "9", "9-5" -> "9", "Gen-2" -> "Gen"
 * ve farkli modeller tek bir emsal havuzunda birlesir.
 */
export function cleanRowModel(raw: string): string {
  return stripJunk(raw, TITLE_JUNK);
}

function stripJunk(raw: string, patterns: RegExp[]): string {
  if (!raw) return '';
  let workOrig = ' ' + raw + ' ';
  let workFolded = foldTurkish(workOrig);

  for (const pat of patterns) {
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

  // Metin olmayan artik karakterler (kod cozme bozulmasi) atilir.
  const cleaned = Array.from(workOrig)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      const isArtifact = (code >= 0x2500 && code <= 0x259f) || code === 0xfffd;
      return isArtifact ? ' ' : ch;
    })
    .join('');
  return cleaned.replace(/&/g, ' ').replace(/\s+/g, ' ').trim();
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
 *
 * KNOWN_MAKES statik bir liste DEGILDIR: cagiran taraf (importer) kaynak
 * dizinde KESFEDILEN klasor adlarini `extraMakes` ile gecer. Boylece kullanici
 * yarin yeni bir marka klasoru ekledigininde, o marka icin de yanlis-klasor
 * duzeltmesi KOD DEGISIKLIGI OLMADAN calisir. Listede olmayan bir marka
 * icin davranis zaten guvenlidir: klasor adina geri dusulur.
 */
export function makeFromTitle(cleanTitle: string, extraMakes: string[] = []): string {
  const folded = foldTurkish(cleanTitle || '').trim();
  if (!folded) return '';
  let best = '';
  const candidates = extraMakes.length ? [...KNOWN_MAKES, ...extraMakes] : KNOWN_MAKES;
  for (const m of candidates) {
    const name = String(m || '').trim();
    if (!name) continue;
    const fm = foldTurkish(name);
    if (folded === fm || folded.startsWith(fm + ' ')) {
      if (fm.length > foldTurkish(best).length) best = name;
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
  // "1.6 i-DTEC" ile "1.6i DTEC" ayni motoru tanimlar: aile tokeni normalize
  // edilir ("i-" oneki dusurulur), bu yuzden ikisi ayni anahtari uretir.
  //
  // Aile tokeni anahtarin PARCASIDIR: yalniz hacim+yakit kullanilirsa
  // "1.0 TCe" (turbo) ile "1.0 SCe" (atmosferik) ayni motor sayilir ve
  // birebir (strict) eslesmede tek havuzda birlesir -> yanlis L1.
  const family = engineFamilyToken(folded);
  if (disp !== null) return `${disp.toFixed(1)}|${fuel}|${family}`;
  return `${folded.replace(/\s+/g, '')}|${fuel}`;
}

/**
 * Ayni motor ailesinin farkli yazimlari tek forma indirgenir.
 * DIKKAT: yalniz YAZIM farklari birlestirilir; teknik olarak farkli aileler
 * (TCe/SCe, TDI/TSI, GDI/TGDI) ASLA ayni forma indirgenmez.
 */
const ENGINE_FAMILY_ALIASES: Record<string, string> = {
  idtec: 'dtec',
  ivtec: 'vtec',
  vvti: 'vvt',
  dcvvt: 'cvvt',
};

/** Motor kodundaki acik aile tokeni ("1.6 i-DTEC" / "1.6i DTEC" -> "dtec"); yoksa ''. */
function engineFamilyToken(foldedEngineCode: string): string {
  const tokens = foldedEngineCode.replace(/[-_]+/g, ' ').split(/\s+/);
  for (const raw of tokens) {
    const t = raw.replace(/[^a-z0-9]/g, '');
    if (!t) continue;
    const alias = ENGINE_FAMILY_ALIASES[t];
    if (alias) return alias;
    if (ENGINE_WORDS.has(t)) return ENGINE_FAMILY_ALIASES[t] || t;
  }
  return '';
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
/* Tam model (FULL MODEL) kimligi                                      */
/* ------------------------------------------------------------------ */

/**
 * Model adi eslesmesi: birebir ya da TOKEN SINIRLI icerme.
 *   "A3"  ~ "A3 A3 Sportback"   (onek)     "316" ~ "3 Serisi 316"      (sonek)
 *   "Egea" ~ "Egea Cross"        (onek)     "3 Serisi" ~ "3 Serisi 320 d"
 * Ham alt dizgi KULLANILMAZ ("3" != "320"). Sihirbaz (katalog) ve degerleme
 * (emsal havuzu) AYNI kurali kullanir; olculen: kisa adlarda (A3/A4/A5/A6)
 * degerleme yalniz birebir eslerken katalog onekle esliyordu ve 270+ yaprak
 * sihirbazda gorunup fiyatlanamiyordu.
 */
export function modelNameMatches(candidate: string | null | undefined, target: string | null | undefined): boolean {
  const c = foldTurkish(candidate || '').trim();
  const t = foldTurkish(target || '').trim();
  if (!c || !t) return false;
  if (c === t) return true;
  if (c.startsWith(t + ' ')) return true;
  if (c.endsWith(' ' + t)) return true;
  return c.includes(' ' + t + ' ');
}

/**
 * Sahibinden satirindaki TAM MODEL hucresini karsilastirilabilir forma getirir.
 *
 * Normalize edilen: unicode formu, Turkce buyuk/kucuk harf, fazla bosluk,
 * noktalama cevresindeki anlamsiz bosluk, kod cozme artiklari.
 * KORUNAN: gercek teknik/paket tokenlari (1.6, TDI, TCe, SCe, BlueMotion,
 * Trend, Trend X, Emotion Plus...). Hicbir token SILINMEZ.
 */
export function normalizeFullModel(raw: string | null | undefined): string {
  if (!raw) return '';
  const src = String(raw).normalize('NFKC');
  return foldTurkish(src)
    .replace(/[─-▟�]/g, ' ')
    .replace(/[^a-z0-9.+-]+/g, ' ')
    .replace(/\s*\.\s*/g, '.')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Birebir (L1) kimlik karsilastirmasi: NORMALIZE EDILMIS ESITLIK.
 * Substring (A.includes(B) / B.includes(A)) KULLANILMAZ:
 *   "Trend" != "Trend X",  "Emotion" != "Emotion Plus"
 * Iki taraftan biri bossa birebir kimlik URETILMEZ (sahte exact yok).
 */
export function fullModelExact(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeFullModel(a);
  const nb = normalizeFullModel(b);
  if (!na || !nb) return false;
  return na === nb;
}

/**
 * Motor kodu ile paket adini tek bir TAM MODEL string'inde birlestirir.
 * Paket alani motor bilgisini zaten tasiyorsa tekrar eklenmez.
 *   ("1.6 TDCi", "Trend")                 -> "1.6 TDCi Trend"
 *   ("", "1.6 TDI BlueMotion Comfortline") -> "1.6 TDI BlueMotion Comfortline"
 */
export function composeFullModel(
  variant: string | null | undefined,
  trim: string | null | undefined,
): string {
  const v = (variant || '').trim();
  const t = (trim || '').trim();
  if (!t) return v;
  if (!v) return t;
  const nv = normalizeFullModel(v);
  const nt = normalizeFullModel(t);
  if (!nv || nt === nv || nt.startsWith(`${nv} `)) return t;
  return `${v} ${t}`;
}

/**
 * TAM MODEL string'inin BASINDAKI acik motor imzasi.
 *   "1.6 TDI BlueMotion Highline" -> "1.6 TDI"
 *   "1.0 TCe Joy"                 -> "1.0 TCe"
 *   "Joy" / "Active Plus"         -> ''   (paket adi motor DEGILDIR)
 *
 * Yalniz ANCHORED (bastaki) motor tokenlari kullanilir ve sonucun hacim ya da
 * premium motor kodu icermesi zorunludur; aksi halde '' doner. Bu bir TAHMIN
 * degildir: bilgi zaten ilanin kendi model hucresinde ACIKCA yazilidir.
 */
export function explicitEngineSignature(fullModel: string | null | undefined): string {
  const tokens = String(fullModel || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';

  // Motor kosusu dizgenin BASINDA olmak zorunda DEGILDIR. Ilan/katalog tam-model
  // etiketleri model ve kasa onekiyle gelir: "A3 Sedan 35 TFSI",
  // "A3 Hatchback 1.6 TDI", "3 Serisi 320d". Olculen (Audi A3 Sedan 35 TFSI,
  // 578 gercek ilan): motor imzasi hep ortada/sondaydi ve capali arama "" donup
  // 464 gecerli adayin TAMAMINI dusuruyordu -> musteri "yeterli veri yok" aldi.
  // Kosu, ek tokeniyle ("i", "d", "T") BASLAYAMAZ; bu tokenlar yalniz bir
  // hacmin hemen ardindan motor sayilir.
  const isEng = (i: number) =>
    isEngineToken(tokens[i]) || isPowerIndexEngineStart(tokens, i) || isPremiumCodeStart(tokens, i);
  let start = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (isEng(i) && !SUFFIX_ENGINE_TOKENS.has(normToken(tokens[i]))) { start = i; break; }
  }
  if (start < 0) return '';
  let end = start;
  for (let i = start + 1; i < tokens.length; i++) {
    if (isEng(i)) end = i;
    else break;
  }
  const code = tokens.slice(start, end + 1).join(' ');
  const folded = foldTurkish(code);
  const hasDisplacement = /\d\.\d/.test(folded);
  const hasPremiumCode = /\b\d{3}\s?[a-z]{0,3}\b/.test(folded);
  const hasPowerIndex = isPowerIndexEngineStart(tokens, start);
  return hasDisplacement || hasPremiumCode || hasPowerIndex ? code : '';
}

/**
 * Ayri yazilmis PREMIUM motor kodu: "180 d", "350 CDI", "250 D", "740 d".
 *
 * Uc basamakli sayi tek basina motor tokeni DEGILDIR ve "d"/"i" gibi ekler
 * koşu BASLATAMAZ; bu yuzden "CLA 180 d AMG" icindeki kod, sayi ile eki ayri
 * tokenler halinde geldiginde kacirilirdi (olculen: 9 Mercedes/BMW hedefi
 * birebir L1 kimligini kaybedip L2'ye dusuyordu). Sayi, hemen ardindan bir ek
 * tokeni (<=3 harf) ya da motor ailesi sozcugu geldiginde kodun basidir.
 * Bitisik yazim ("320d") zaten isEngineToken ile tanimlidir.
 */
function isPremiumCodeStart(tokens: string[], i: number): boolean {
  const t = normToken(tokens[i] || '');
  if (!/^\d{3}$/.test(t)) return false;
  const next = i + 1 < tokens.length ? normToken(tokens[i + 1]) : '';
  if (!next) return false;
  return SUFFIX_ENGINE_TOKENS.has(next) || /^[a-z]{1,3}$/.test(next) || ENGINE_WORDS.has(next);
}

/**
 * VW grubu GUC ENDEKSI motor kodu: "35 TFSI", "30 TDI", "40 TFSI", "45 TFSI e".
 *
 * Bu yazimda hacim YOKTUR; iki basamakli endeks tek basina motor sayilMAZ
 * ("35" herhangi bir sey olabilir). Yalnizca HEMEN ARDINDAN bilinen bir motor
 * ailesi tokeni (TFSI/TDI/TSI/...) geldiginde cift, motor kodudur. Endeks
 * araligi gercek kullanimi kapsar (25-70); sayfa/yil/km gibi sayilar dislanir.
 * Marka sabiti YOKTUR: yazim sinifi tanimlanir, marka degil.
 */
const RE_POWER_INDEX = /^\d{2}$/;
function isPowerIndexEngineStart(tokens: string[], i: number): boolean {
  const t = normToken(tokens[i] || '');
  if (!RE_POWER_INDEX.test(t)) return false;
  const n = Number(t);
  if (n < 20 || n > 80) return false;
  const next = i + 1 < tokens.length ? normToken(tokens[i + 1]) : '';
  return Boolean(next) && ENGINE_WORDS.has(next);
}

/* ------------------------------------------------------------------ */
/* Ilan basligindaki ACIK agir hasar beyani                            */
/* ------------------------------------------------------------------ */

/**
 * YALNIZ acik (explicit) ve guclu hasar ifadeleri. Kelime siniri ile eslesir:
 * "EKSPERTIZ" icindeki "pert" ESLESMEZ (olculen: 343 temiz ilan yanlislikla
 * eleniyordu).
 *
 * KAPSAM DISI (bilerek):
 *  - "hasar kayitli" / "hasarli" tek basina: agir hasar ile ayni siddet DEGILDIR.
 *  - "boya" / "lokal" / "degisen": normal ikinci el ifadeleridir.
 *  - Fiyatin dusuk ya da yuksek olmasi: satici motivasyonu bilinemez, fiyattan
 *    hasar cikarimi YAPILMAZ.
 *
 * Sinyal yoksa sonuc "temiz" DEGIL, "bilinmiyor"dur.
 */
const STRONG_DAMAGE_PATTERNS: RegExp[] = [
  // Turkce ekler bitisik gelir: "agir hasarli", "agir hasarlidir", "agir hasari",
  // "agir hasar kayitli". "agir hasarSIZ" ise HASARSIZ demektir -> haric.
  /\bagir\s+hasar(?!siz)/,
  /\bagir\s+kaza(?!siz)/,
  // "ekspertiz"/"expertiz" ESLESMEZ: kelime basi siniri "pert"ten once gelmez.
  /\bpert(li|ini|inde|den)?\b/,
  /\bhurda(ya|dan|lik)?\b/,
  /\bhurda\d/,
  /\bcekme\s+belge/,
];

/** Ilan basliginda ACIK agir hasar beyani var mi? */
export function hasStrongDamageSignal(text: string | null | undefined): boolean {
  const t = foldTurkish(String(text || ''));
  if (!t) return false;
  return STRONG_DAMAGE_PATTERNS.some((re) => re.test(t));
}

/* ------------------------------------------------------------------ */
/* Kilometre hucresi                                                   */
/* ------------------------------------------------------------------ */

/**
 * Ilan satirinin KM hucresini sayiya cevirir.
 *
 * Fiyat ve kilometre AYRI DOM hucrelerinden okunur; bu yuzden sayisal degerin
 * fiyata esit olmasi bir karisma belirtisi DEGILDIR (olculen: 488 gercek ilan
 * yalnizca km == fiyat oldugu icin kilometresini kaybediyordu).
 * Yil ile karisma korumasi ve ust sinir korunur.
 */
export function parseMileageCell(
  raw: string | null | undefined,
  year: number,
  maxKm = 2_000_000,
): number | null {
  const d = String(raw || '').replace(/[^\d]/g, '');
  if (!d) return null;
  const km = parseInt(d, 10);
  if (!Number.isFinite(km) || km < 0 || km > maxKm) return null;
  if (km === year) return null;
  return km;
}

/* ------------------------------------------------------------------ */
/* Kasa tipi (body type)                                               */
/* ------------------------------------------------------------------ */

export type BodyType =
  | 'SEDAN'
  | 'HATCHBACK'
  | 'SPORTBACK'
  | 'COUPE'
  | 'GRAN_COUPE'
  | 'CABRIO'
  | 'STATION_WAGON'
  | 'SUV'
  | '';

/**
 * Kasa tipi YALNIZCA acik (explicit) metin sinyalinden turetilir.
 * Model adina gore tahmin YAPILMAZ ("3 Serisi -> Sedan" gibi cikarim yok).
 * Sinyal yoksa '' (UNKNOWN) doner; celisen iki sinyal varsa da '' doner.
 *
 * Siralama onemli: "gran coupe" -> GRAN_COUPE, "coupe"den once denenir;
 * "sportback" HATCHBACK'e birlestirilmez (fiyat davranisi farkli olabilir).
 * Tum desenler fold edilmis metinde word-boundary ile calisir; "sw", "hb"
 * gibi kisa tokenlar yalniz bagimsiz kelime olarak kabul edilir.
 */
const BODY_PATTERNS: Array<[BodyType, RegExp]> = [
  ['GRAN_COUPE', /\bgran\s*coupe\b/],
  ['SPORTBACK', /\bsportback\b/],
  ['STATION_WAGON', /\b(station\s*wagon|stationwagon|touring|avant|variant|kombi|sw)\b/],
  ['CABRIO', /\b(cabrio|cabriolet|convertible|roadster)\b/],
  ['COUPE', /\bcoupe\b/],
  ['HATCHBACK', /\b(hatchback|hb)\b/],
  ['SEDAN', /\bsedan\b/],
  // NOT: "Cross" bir KASA adi degil, cogu zaman donanim/paket adidir
  // (Fiat 500L Cross Plus, Egea Cross, Polo Cross...). Kasa olarak
  // yorumlanirsa hatchback araclar SUV etiketi alir -> yanlis eleme.
  ['SUV', /\bsuv\b/],
];

/** Katalog/musteri girdisindeki Turkce kasa adlarini ayni siniflara indirger. */
const BODY_ALIASES: Array<[BodyType, RegExp]> = [
  ['STATION_WAGON', /^station\s*wagon$/],
  ['GRAN_COUPE', /^gran\s*coupe$/],
  ['CABRIO', /^(cabrio|cabriolet)$/],
  ['SEDAN', /^sedan$/],
  ['HATCHBACK', /^(hatchback|hb)$/],
  ['SPORTBACK', /^sportback$/],
  ['COUPE', /^coupe$/],
  ['SUV', /^(suv|crossover|arazi.*)$/],
];

/** Serbest metinden kasa tipi. Celiskide ve sinyalsizlikte '' doner. */
export function deriveBodyType(...parts: Array<string | null | undefined>): BodyType {
  const folded = ' ' + parts.filter(Boolean).map((p) => foldTurkish(String(p))).join(' ') + ' ';
  const hits: BodyType[] = [];
  for (const [name, re] of BODY_PATTERNS) {
    if (re.test(folded) && !hits.includes(name)) hits.push(name);
  }
  if (hits.length === 1) return hits[0];
  // GRAN_COUPE metni "coupe"yi de eslestirir; bu celiski degildir.
  if (hits.length === 2 && hits.includes('GRAN_COUPE') && hits.includes('COUPE')) return 'GRAN_COUPE';
  return ''; // sinyal yok veya celisen sinyaller -> UNKNOWN
}

/**
 * Kaynak onceligi ile kasa tipi:
 *   1) model/kategori metni (sayfa basligi — Sahibinden kategorisinden gelir,
 *      "A3 Hatchback" gibi; en guvenilir sinyal)
 *   2) ilan basligi (satici metni — "coupe tasarim" gibi pazarlama dili
 *      icerebilir, yalniz model sinyalsizse kullanilir)
 * Iki kaynak celisirse model kazanir; boylece "A3 Hatchback" modelindeki bir
 * ilan, basliginda "coupe" yazdigi icin COUPE olamaz.
 */
export function deriveBodyTypeFromSources(
  modelText: string | null | undefined,
  titleText: string | null | undefined,
): BodyType {
  const fromModel = deriveBodyType(modelText);
  if (fromModel) return fromModel;
  return deriveBodyType(titleText);
}

/** Katalog/musteri kasa adini normalize eder ("Station Wagon" -> STATION_WAGON). */
export function normalizeBodyType(raw: string | null | undefined): BodyType {
  const t = foldTurkish((raw || '').trim());
  if (!t) return '';
  for (const [name, re] of BODY_ALIASES) if (re.test(t)) return name;
  // Zaten canonical bir deger geldiyse kabul et
  const up = (raw || '').trim().toUpperCase().replace(/\s+/g, '_');
  const known: BodyType[] = ['SEDAN','HATCHBACK','SPORTBACK','COUPE','GRAN_COUPE','CABRIO','STATION_WAGON','SUV'];
  return (known as string[]).includes(up) ? (up as BodyType) : '';
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
  /**
   * Ilan satirinin KENDI model hucresi.
   * Sahibinden'in MARKA duzeyindeki arama sayfalarinda satir iki adet
   * td.searchResultsTagAttributeValue tasir: [model, motor+paket]
   * (orn. ["Giulietta", "1.4 TB MultiAir Distinctive"]).
   * Model duzeyindeki sayfalarda ise tek hucre vardir ve model sayfa
   * basligindan gelir. Marka duzeyindeki sayfalarda baslik model icermedigi
   * icin bu hucre olmadan tum sayfa karantinaya dusuyordu.
   */
  listingRowModel?: string | null;
  /**
   * Kaynak dizinde KESFEDILEN marka klasor adlari. Statik listede olmayan
   * yeni markalarda da "yanlis klasore kaydedilmis sayfa" duzeltmesini
   * calistirir; verilmezse davranis degismez.
   */
  knownMakes?: string[];
}): DerivedListingAttributes {
  const folderMake = normalizeMake(params.folderMake);
  const clean = cleanPageTitle(params.pageTitleOrFileName);

  // Sayfa basligindaki marka, klasor adindan onceliklidir: yanlis klasore
  // kaydedilmis sayfalar baska bir markanin fiyat havuzunu kirletemez.
  const titleMake = makeFromTitle(clean, params.knownMakes || []);
  const make = titleMake || folderMake;

  let { model, engineCode, trim: fileTrim } = splitModelEngineTrim(clean, make);

  // Sayfa basligi model vermiyorsa (marka duzeyi sayfa), satirin kendi model
  // hucresi kullanilir. Bu bir TAHMIN degil, sayfanin yapisal alanidir:
  // marka duzeyi sayfalarda satirin ILK td.searchResultsTagAttributeValue
  // hucresi modeldir (varsa ikincisi motor+paket).
  let modelFromRow = '';
  if (!model) {
    // Satir hucresi SAYFA BASLIGI DEGILDIR: sayfalama eki temizligi burada
    // uygulanmaz, aksi halde "9-3"/"Gen-2" gibi gercek model adlari kirpilir.
    const rowModel = cleanRowModel(String(params.listingRowModel || ''));
    if (rowModel) {
      const fromRow = splitModelEngineTrim(`${make} ${rowModel}`, make);
      if (fromRow.model) {
        model = fromRow.model;
        modelFromRow = rowModel;
        engineCode = engineCode || fromRow.engineCode;
        fileTrim = fileTrim || fromRow.trim;
      }
    }
  }

  let tagTrim = (params.listingTagTrim || '').trim();
  // Baslik model vermedigi icin model satirdan alindiysa, ayni hucre paket
  // olarak TEKRAR kullanilmaz (tek tag hucreli marka duzeyi sayfalar).
  if (modelFromRow && tagTrim && foldTurkish(tagTrim) === foldTurkish(modelFromRow)) tagTrim = '';
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

/** Musteriye gosterilebilecek kasa siniflari (canonical -> Turkce etiket). */
export const BODY_TYPE_LABELS: Record<Exclude<BodyType, ''>, string> = {
  SEDAN: 'Sedan',
  HATCHBACK: 'Hatchback',
  SPORTBACK: 'Sportback',
  COUPE: 'Coupe',
  GRAN_COUPE: 'Gran Coupe',
  CABRIO: 'Cabrio',
  STATION_WAGON: 'Station Wagon',
  SUV: 'SUV',
};

/** Izin verilen canonical kasa degerleri (API sozlesmesi icin tek kaynak). */
export const CANONICAL_BODY_TYPES = Object.keys(BODY_TYPE_LABELS) as Array<Exclude<BodyType, ''>>;
