/**
 * condition-assessment.ts
 *
 * Sahibinden HTML'inden ALINAMAYAN, musteriden ayrica sorulan fiziksel
 * kondisyon bilgilerini normalize eder ve TEK bir kondisyon duzeltmesine cevirir.
 *
 * TASARIM KURALLARI
 *  1) Bu katman fiyat motorundan AYRIDIR. Emsallerden gelen "temiz esdeger"
 *     piyasa degeri once hesaplanir; kondisyon duzeltmesi sonra uygulanir.
 *  2) Kondisyon cezasi ile GALERI KARI ayri kavramlardir; birbirinin yerine
 *     gecmez.
 *  3) Kor toplama YOKTUR. Ayni fiziksel kusura iki kez ceza verilmez ve
 *     kusurlar azalan getiri (diminishing) ile birikir.
 *  4) Yapisal/agir hasarda otomatik fiyat uretilmez; manuel degerlendirme
 *     istenir. Gercek saha kalibrasyonu olmadan agresif yuzdeler uydurulmaz.
 *  5) Butun katsayilar burada MERKEZI ve configurable'dir.
 */

/** Parca agirlik sinifi — piyasa etkisi buyukten kucuge */
export type PartClass = 'COSMETIC' | 'MINOR' | 'MEDIUM' | 'MAJOR';

/** Musterinin bir parca icin bildirdigi durum */
export type PartStatus = 'ORIJINAL' | 'LOKAL' | 'BOYALI' | 'DEGISEN';

/**
 * Parca -> sinif haritasi. Yapisal ve gorunur panellerin piyasa etkisi
 * farklidir: tavan/direk/sasi yapisal, kapi/kaput/bagaj orta, camurluk hafif.
 */
export const PART_CLASS: Record<string, PartClass> = {
  'Tavan': 'MAJOR',
  'Şasi': 'MAJOR',
  'Podye': 'MAJOR',
  'Direk': 'MAJOR',
  'Motor Kaputu': 'MEDIUM',
  'Bagaj Kapağı': 'MEDIUM',
  // Arayuzdeki kaporta semasi bagaj kapagini 'Bagaj' adiyla gonderir; iki ad
  // da AYNI parcadir. Eslesmezse parca sessizce MINOR'a duser (yanlis sinif).
  'Bagaj': 'MEDIUM',
  // Tamponlar arayuzden gonderilir ve kaporta parcasi degildir: degisimi/boyasi
  // piyasa degerini en az etkileyen kalemdir (COSMETIC sinifi bunun icindir).
  'Ön Tampon': 'COSMETIC',
  'Arka Tampon': 'COSMETIC',
  'Sol Ön Kapı': 'MEDIUM',
  'Sağ Ön Kapı': 'MEDIUM',
  'Sol Arka Kapı': 'MEDIUM',
  'Sağ Arka Kapı': 'MEDIUM',
  'Sol Ön Çamurluk': 'MINOR',
  'Sağ Ön Çamurluk': 'MINOR',
  'Sol Arka Çamurluk': 'MINOR',
  'Sağ Arka Çamurluk': 'MINOR',
};

/**
 * Arayuzun (degerleme/konsinye formlari + kaporta semasi) gonderebildigi
 * parca adlari. Backend yorumu ile birebir ayni olmak zorundadir; buradaki
 * her ad PART_CLASS icinde ACIKCA siniflandirilmis olmali, aksi halde parca
 * varsayilan sinifa duser ve yanlis fiyatlanir.
 */
export const UI_PART_NAMES: string[] = [
  'Motor Kaputu', 'Tavan', 'Bagaj', 'Bagaj Kapağı', 'Ön Tampon', 'Arka Tampon',
  'Sol Ön Çamurluk', 'Sağ Ön Çamurluk', 'Sol Ön Kapı', 'Sağ Ön Kapı',
  'Sol Arka Kapı', 'Sağ Arka Kapı', 'Sol Arka Çamurluk', 'Sağ Arka Çamurluk',
];

export const CONDITION_CONFIG = {
  /**
   * Tek bir parca icin taban etki orani: [sinif][durum].
   * Bunlar TABAN degerlerdir; asagidaki azalan-getiri ve segment
   * duyarliligi ile olceklenir. Gercek saha verisi geldikce buradan ayarlanir.
   */
  partImpact: {
    COSMETIC: { LOKAL: 0.002, BOYALI: 0.004, DEGISEN: 0.008 },
    MINOR: { LOKAL: 0.004, BOYALI: 0.010, DEGISEN: 0.022 },
    MEDIUM: { LOKAL: 0.006, BOYALI: 0.016, DEGISEN: 0.034 },
    MAJOR: { LOKAL: 0.010, BOYALI: 0.030, DEGISEN: 0.060 },
  } as Record<PartClass, Record<Exclude<PartStatus, 'ORIJINAL'>, number>>,

  /**
   * Azalan getiri: n'inci kusurun katkisi decay^(n-1) ile carpilir.
   * Boylece 6 boyali parca, 6 x tek-parca cezasi kadar olmaz.
   */
  diminishingDecay: 0.75,

  /** Kaporta kaynakli toplam kesintinin ust siniri */
  maxCosmeticPenalty: 0.18,

  /** Tum kondisyon kaynakli kesintinin mutlak ust siniri */
  maxTotalPenalty: 0.28,

  /**
   * Yas/km duyarliligi: ayni kusur yeni ve dusuk km araclarda daha cok,
   * eski ve yuksek km araclarda daha az konusur.
   */
  ageSensitivity: { newVehicleYears: 3, newMultiplier: 1.25, oldVehicleYears: 12, oldMultiplier: 0.7 },

  /** Mekanik ariza taban etkileri */
  mechanical: { engineProblem: 0.06, transmissionProblem: 0.05, otherMechanical: 0.02 },

  /**
   * Tramer tutari: dogrusal TL kirimi YAPILMAZ. Arac degerine oranlanir ve
   * yumusatilir; ayrica ust sinirlanir.
   */
  tramer: { ratioWeight: 0.35, maxPenalty: 0.10 },

  /**
   * Hasar BEYAN EDILDI ama detay verilmedi: kusurun buyuklugu bilinmiyor.
   * Bu iki deger sistemde daha once de yururlukteydi; saha kalibrasyonu
   * olmadan degistirilmez.
   */
  declaredNoDetailPenalty: 0.08,
  unknownDamagePenalty: 0.04,

  /** Bu esigin ustundeki toplam kesinti otomatik fiyat yerine manuel gerektirir */
  manualReviewThreshold: 0.15,

  /**
   * OTOMASYON GUVENLIK KAPISI (fiyat orani DEGILDIR).
   *
   * Arayuzun sordugu yapisal-olmayan kaporta paneli sayisi 10'dur:
   *   MEDIUM (6): Motor Kaputu, Bagaj(=Bagaj Kapagi), Sol/Sag On Kapi, Sol/Sag Arka Kapi
   *   MINOR  (4): Sol/Sag On Camurluk, Sol/Sag Arka Camurluk
   * (Tavan MAJOR'dur ve zaten manuel kapisini acar; tamponlar COSMETIC'tir ve
   *  rutin olarak degistigi icin sayilmaz.)
   *
   * Bu panellerden ucu veya daha fazlasi DEGISEN ise hasar tek bir carpma
   * bolgesini asmis demektir. Boyle bir arac, matematiksel kondisyon kesintisi
   * manualReviewThreshold'un ALTINDA kalsa bile otomatik fiyatlandirilmaz.
   * (Kanitlanmis vaka: 10 panel DEGISEN -> kesinti %12,25 < %15 -> 1.000.000 TL
   *  temiz degerli araca AUTO 750.000 TL teklif ediliyordu.)
   *
   * Esik, matrisin AUTO kalmasini sart kostugu en yuksek vakanin (2 DEGISEN
   * panel) hemen ustune konmustur: gerekli AUTO davranislarini bozmayan EN
   * MUHAFAZAKAR degerdir. Hicbir fiyat yuzdesi degistirilmemistir.
   */
  maxAutoChangedPanels: 2,
};

export interface ConditionInput {
  damageStatus?: string;                       // YES | NO | UNKNOWN
  paintScheme?: string | null;                 // JSON: { "Sol Ön Kapı": "BOYALI", ... }
  chassisState?: string | null;                // JSON: { "Şasi": "..." }
  vehicleStatus?: string | null;               // JSON: { heavyDamage, scratchOrDent, crackedGlass }
  tramerAmount?: string | null;                // "45.000 TL" | "Var" | "0 TL" | "Bilinmiyor"
  vehicleYear: number;
  currentYear?: number;
  /** Temiz esdeger piyasa degeri (kondisyon oncesi) */
  cleanMarketValue: number;
}

export interface ConditionResult {
  /** 0..1 arasi toplam kondisyon kesinti orani */
  penalty: number;
  /** Yapisal/agir durum veya yuksek belirsizlik -> otomatik fiyat verilmez */
  requiresManualReview: boolean;
  manualReason?: string;
  /** Audit dokumu (musteriye gosterilmez) */
  breakdown: {
    cosmeticPenalty: number;
    structuralPenalty: number;
    mechanicalPenalty: number;
    tramerPenalty: number;
    ageMultiplier: number;
    changedPanelCount: number;
    paintedPanelCount: number;
    localPanelCount: number;
    countedParts: Array<{ part: string; status: PartStatus; cls: PartClass; impact: number }>;
    ignoredDuplicates: string[];
    flags: string[];
  };
}

function safeJson(raw: string | null | undefined): Record<string, any> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** "45.000 TL" -> 45000 ; "Var" -> null (bilinmiyor) ; "0 TL" -> 0 */
export function parseTramer(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const t = String(raw).trim();
  if (/bilinmiyor/i.test(t)) return null;
  const digits = t.replace(/[^\d]/g, '');
  if (!digits) return /var/i.test(t) ? null : null;
  return parseInt(digits, 10);
}

function normalizeStatus(v: any): PartStatus | null {
  const s = String(v || '').trim().toUpperCase();
  if (s === 'ORIJINAL' || s === 'ORJINAL' || s === '') return null;
  if (s === 'LOKAL') return 'LOKAL';
  if (s === 'BOYALI') return 'BOYALI';
  if (s === 'DEGISEN' || s === 'DEĞIŞEN' || s === 'DEĞİŞEN') return 'DEGISEN';
  return null;
}

const SEVERITY: Record<PartStatus, number> = { ORIJINAL: 0, LOKAL: 1, BOYALI: 2, DEGISEN: 3 };

/**
 * Kondisyon degerlendirmesi.
 * Not: Yuzdeler gercek saha kalibrasyonu ile ayarlanmak uzere muhafazakar
 * secilmistir; agir durumlarda otomatik fiyat yerine manuel kapisi kullanilir.
 */
export function assessCondition(input: ConditionInput): ConditionResult {
  const C = CONDITION_CONFIG;
  const flags: string[] = [];
  const ignoredDuplicates: string[] = [];
  const countedParts: ConditionResult['breakdown']['countedParts'] = [];

  const paint = safeJson(input.paintScheme);
  const chassis = safeJson(input.chassisState);
  const status = safeJson(input.vehicleStatus);

  // --- 1) Parca bazli kaporta: ayni parcaya TEK ceza (en agir durum baskin) ---
  const perPart = new Map<string, PartStatus>();
  for (const [part, raw] of Object.entries(paint)) {
    const st = normalizeStatus(raw);
    if (!st) continue;
    const prev = perPart.get(part);
    if (prev) {
      ignoredDuplicates.push(`${part}: ${prev}+${st} -> ${SEVERITY[st] > SEVERITY[prev] ? st : prev}`);
      if (SEVERITY[st] <= SEVERITY[prev]) continue;
    }
    perPart.set(part, st);
  }

  // --- 2) Yas duyarliligi ---
  const year = input.currentYear ?? new Date().getFullYear();
  const age = Math.max(0, year - input.vehicleYear);
  let ageMultiplier = 1;
  if (age <= C.ageSensitivity.newVehicleYears) ageMultiplier = C.ageSensitivity.newMultiplier;
  else if (age >= C.ageSensitivity.oldVehicleYears) ageMultiplier = C.ageSensitivity.oldMultiplier;

  // --- 3) Kaporta cezasi: azalan getiri ile birikir (kor toplama yok) ---
  const impacts: Array<{ part: string; status: PartStatus; cls: PartClass; impact: number }> = [];
  for (const [part, st] of perPart) {
    const cls = PART_CLASS[part] || 'MINOR';
    const base = C.partImpact[cls][st as Exclude<PartStatus, 'ORIJINAL'>] ?? 0;
    impacts.push({ part, status: st, cls, impact: base });
  }
  impacts.sort((a, b) => b.impact - a.impact); // en agir once, decay sonrakilere

  let cosmeticPenalty = 0;
  let structuralPenalty = 0;
  impacts.forEach((it, i) => {
    const scaled = it.impact * Math.pow(C.diminishingDecay, i) * ageMultiplier;
    if (it.cls === 'MAJOR') structuralPenalty += scaled;
    else cosmeticPenalty += scaled;
    countedParts.push({ ...it, impact: scaled });
  });
  // Tavan / sasi / podye / direk BOYALI ya da DEGISEN ise bu bir YAPISAL
  // beyandir: fiyat kirmakla gecistirilmez, fiziksel ekspertiz gerekir.
  // (LOKAL rotus yapisal sayilmaz.)
  const structuralPartDeclared = impacts.some(
    (it) => it.cls === 'MAJOR' && (it.status === 'BOYALI' || it.status === 'DEGISEN'),
  );
  // Yapisal olmayan kaporta panellerinde DEGISEN sayisi (tampon sayilmaz)
  const changedPanelCount = impacts.filter(
    (it) => (it.cls === 'MINOR' || it.cls === 'MEDIUM') && it.status === 'DEGISEN',
  ).length;
  const paintedPanelCount = impacts.filter(
    (it) => (it.cls === 'MINOR' || it.cls === 'MEDIUM') && it.status === 'BOYALI',
  ).length;
  const localPanelCount = impacts.filter(
    (it) => (it.cls === 'MINOR' || it.cls === 'MEDIUM') && it.status === 'LOKAL',
  ).length;
  const extremeMultiPanel = changedPanelCount > C.maxAutoChangedPanels;
  cosmeticPenalty = Math.min(cosmeticPenalty, C.maxCosmeticPenalty);

  // --- 4) Yapisal beyanlar ---
  const chassisAction = String(Object.values(chassis)[0] || '').trim();
  const heavyDamage = status.heavyDamage === true || /agir|ağır|pert/i.test(String(status.heavyDamage || ''));
  const chassisIssue = chassisAction && !/yok|orijinal|orjinal|sorunsuz/i.test(chassisAction);

  if (structuralPartDeclared) { flags.push('STRUCTURAL_PART'); }
  if (extremeMultiPanel) { flags.push('EXTREME_MULTI_PANEL'); }
  if (chassisIssue) { flags.push('CHASSIS_OR_STRUCTURAL'); }
  if (heavyDamage) { flags.push('HEAVY_DAMAGE'); }
  const airbagDeployed = status.airbagDeployed === true;
  if (airbagDeployed) flags.push('AIRBAG');

  // --- 5) Mekanik ---
  let mechanicalPenalty = 0;
  if (status.engineProblem === true) { mechanicalPenalty += C.mechanical.engineProblem; flags.push('ENGINE_FAULT'); }
  if (status.transmissionProblem === true) { mechanicalPenalty += C.mechanical.transmissionProblem; flags.push('TRANSMISSION_FAULT'); }
  if (status.mechanicalProblem === true) mechanicalPenalty += C.mechanical.otherMechanical;

  // --- 6) Tramer: dogrusal TL kirimi YOK, orana cevrilip yumusatilir ---
  const tramer = parseTramer(input.tramerAmount);
  let tramerPenalty = 0;
  if (tramer !== null && tramer > 0 && input.cleanMarketValue > 0) {
    const ratio = tramer / input.cleanMarketValue;
    const rawTramerPenalty = ratio * C.tramer.ratioWeight;
    tramerPenalty = Math.min(rawTramerPenalty, C.tramer.maxPenalty);
    flags.push(`TRAMER_${Math.round(ratio * 100)}PCT`);
    // Model KENDI tavanina dayandiysa beyan edilen hasar kaydi, bu katmanin
    // dogrulanmis araliginin disindadir. Tavanla kirpip otomatik fiyat vermek
    // gercek etkiyi oldugundan kucuk gosterir -> manuel degerlendirme.
    // (Yeni bir yuzde uydurulmaz; esik, mevcut tavanin kendisidir.)
    if (rawTramerPenalty > C.tramer.maxPenalty) flags.push('TRAMER_ABOVE_MODEL_RANGE');
  } else if (input.tramerAmount && /var/i.test(String(input.tramerAmount)) && tramer === null) {
    flags.push('TRAMER_UNKNOWN_AMOUNT');
  }

  // damageStatus YES ama detay yoksa muhafazakar taban
  // Detay verilmediginde HANGI kusurun oldugu bilinmez. Bu durumda saha
  // kalibrasyonu olmadan yeni bir oran UYDURULMAZ; sistemde halihazirda
  // yururlukte olan taban degerler (YES %8 / UNKNOWN %4) korunur.
  const hasDetail =
    perPart.size > 0 || chassisIssue || heavyDamage || airbagDeployed ||
    mechanicalPenalty > 0 || tramerPenalty > 0;
  if (input.damageStatus === 'YES' && !hasDetail) {
    cosmeticPenalty = Math.max(cosmeticPenalty, C.declaredNoDetailPenalty);
    flags.push('DAMAGE_DECLARED_NO_DETAIL');
  }
  if (input.damageStatus === 'UNKNOWN' && !hasDetail) {
    cosmeticPenalty = Math.max(cosmeticPenalty, C.unknownDamagePenalty);
    flags.push('DAMAGE_UNKNOWN');
  }

  const raw = cosmeticPenalty + structuralPenalty + mechanicalPenalty + tramerPenalty;
  const penalty = Math.min(raw, C.maxTotalPenalty);

  // --- 7) Manuel kapisi ---
  const structuralFlag = flags.some((f) =>
    ['STRUCTURAL_PART', 'CHASSIS_OR_STRUCTURAL', 'HEAVY_DAMAGE', 'AIRBAG',
      'ENGINE_FAULT', 'TRANSMISSION_FAULT', 'TRAMER_ABOVE_MODEL_RANGE'].includes(f),
  );
  const requiresManualReview =
    structuralFlag || extremeMultiPanel || penalty >= C.manualReviewThreshold;
  let manualReason: string | undefined;
  if (structuralFlag) {
    manualReason =
      'Aracınızda yapısal/ağır hasar, ağır hasar kaydı ya da mekanik arıza beyanı bulunduğu için fiyat uzmanımızca yerinde değerlendirilecektir.';
  } else if (extremeMultiPanel) {
    manualReason =
      'Aracınızda çok sayıda değişen panel bildirildiği için fiyat, otomatik değerlendirme yerine uzmanımızca yerinde belirlenecektir.';
  } else if (requiresManualReview) {
    manualReason =
      'Bildirilen hasar seviyesi otomatik fiyatlandırma için yüksek olduğundan aracınız uzmanımızca değerlendirilecektir.';
  }

  return {
    penalty,
    requiresManualReview,
    manualReason,
    breakdown: {
      cosmeticPenalty,
      structuralPenalty,
      mechanicalPenalty,
      tramerPenalty,
      ageMultiplier,
      changedPanelCount,
      paintedPanelCount,
      localPanelCount,
      countedParts,
      ignoredDuplicates,
      flags,
    },
  };
}
