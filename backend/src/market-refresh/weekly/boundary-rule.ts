/**
 * GUVENLI SINIR KURALI — TARIH + ILAN KIMLIGI + SINIRLI ORTUSME.
 *
 * Haftalik tazeleme her KESIN hedefi en yeniden en eskiye okur ve ancak
 * onceki basarili sinirin GUVENLE gecildigi kanitlaninca durur. Tarih tek
 * basina guvenli DEGILDIR: ayni gune sonradan eklenen ilanlar olabilir ve
 * kaynak siralamasi bir gun icinde kararsizdir. Bu yuzden uc kanit birlikte
 * kullanilir:
 *
 *   1) TARIHE YENIDEN GIRIS   onceki sinir gununden KESIN OLARAK ESKI en az bir
 *                              ilan goruldu -> sinir gununun tamami okundu
 *                              (ayni gun gec eklenenler dahil).
 *   2) KIMLIK ORTUSMESI        onceki kosunun sinir altindaki BASI (capa
 *                              kimlikleri) yeniden goruldu -> iki kosunun
 *                              gozlem dizileri ortusuyor; arada eklenen hicbir
 *                              ilan atlanmadi.
 *   3) TARIH PENCERESI         capalar silinmis olabilir (satildi/kaldirildi):
 *                              o zaman onceki sinirden `overlapDays` gun daha
 *                              eskiye kadar okumak yedek kanittir.
 *
 * Durma = liste sonu  YA DA  (1 VE (2 YA DA 3)).
 *
 * ILK KOSU (onceki durum yok) icin sinir yoktur; ACIK bir baslangic
 * politikasi uygulanir: `initialBaselinePages` (varsayilan: kaynagin
 * gosterebildigi azami sayfa = 20 x 50) ve/veya `initialBaselineDays`.
 * 90 gun gibi gizli bir varsayim YOKTUR; politika CLI'dan verilir ve durumda
 * kaydedilir.
 *
 * Kural SAFTIR: G/C yok, oturum durumu yok; ayni girdi ayni karari verir.
 */
import { MAX_PAGES_PER_LEAF } from '../autopilot/source-url';
import { addDays } from './listing-date';

export type BoundaryProof =
  /** Kaynak daha fazla sayfa sunmadi. */
  | 'END_OF_LISTING'
  /** Sinir gunu gecildi VE capa kimlikleri yeniden goruldu. */
  | 'ANCHOR_IDS'
  /** Sinir gunu gecildi VE tarih penceresi (overlapDays) tamamlandi. */
  | 'DATE_WINDOW'
  /** Ilk kosu: baslangic politikasinin derinligine ulasildi. */
  | 'BASELINE_POLICY';

export interface BoundaryPolicy {
  /** Sinir gununden kac gun daha eskiye kadar okumak yedek kanit sayilir (>= 1). */
  overlapDays: number;
  /** Capa kumesinden en az kac kimlik yeniden gorulmeli (kume kucukse tamami). */
  minAnchorMatches: number;
  /** Ilk kosu: en fazla kac sayfa (kaynak tavani ile sinirli). */
  initialBaselinePages: number;
  /** Ilk kosu: bu kadar gunden eski ilana ulasinca dur (null = yalnizca sayfa). */
  initialBaselineDays: number | null;
  /** Mevcut hedef icin sert sayfa tavani; asilirsa sinir KANITLANMAMIS sayilir. */
  maxPagesPerTarget: number;
}

export interface PriorBoundary {
  /** Onceki basarili kosunun en yeni ilan gunu (YYYY-MM-DD). */
  boundaryDate: string;
  /** O gun gorulen tum kimlikler. */
  boundaryIds: ReadonlySet<string>;
  /** Sinir gununden eski ilk N kimlik (kaynak sirasiyla). */
  anchorIds: ReadonlySet<string>;
}

export interface BoundaryInput {
  hasNextPage: boolean;
  pagesVisited: number;
  /** Bu kosuda gorulen en eski ilan gunu (null = henuz satir yok). */
  oldestDateSeen: string | null;
  seenIds: ReadonlySet<string>;
  /** null = ilk kosu (taze hedef). */
  prior: PriorBoundary | null;
  /** Kaynak takvimine gore bugun (YYYY-MM-DD); baslangic gun politikasi icin. */
  today: string;
  policy: BoundaryPolicy;
}

export interface BoundaryDecision {
  reached: boolean;
  proof: BoundaryProof | null;
  /** Kanit ayrintisi (durum/gunluk icin). */
  reason: string;
  /** Tavan asildi ve sinir kanitlanmadi: hedef BASARISIZ, filigran ilerlemez. */
  exhausted: boolean;
  dateReentered: boolean;
  anchorMatches: number;
  boundaryMatches: number;
}

export const DEFAULT_BOUNDARY_POLICY: BoundaryPolicy = {
  overlapDays: 1,
  minAnchorMatches: 5,
  initialBaselinePages: MAX_PAGES_PER_LEAF,
  initialBaselineDays: null,
  maxPagesPerTarget: MAX_PAGES_PER_LEAF,
};

export function validateBoundaryPolicy(policy: BoundaryPolicy): void {
  const positiveInt = (name: keyof BoundaryPolicy, min: number) => {
    const value = policy[name];
    if (!Number.isInteger(value) || (value as number) < min) {
      throw new Error(`Boundary policy ${name} must be an integer >= ${min}, got ${String(value)}`);
    }
  };
  positiveInt('overlapDays', 1);
  positiveInt('minAnchorMatches', 1);
  positiveInt('initialBaselinePages', 1);
  positiveInt('maxPagesPerTarget', 1);
  if (policy.initialBaselineDays !== null) {
    if (!Number.isInteger(policy.initialBaselineDays) || policy.initialBaselineDays < 1) {
      throw new Error('Boundary policy initialBaselineDays must be null or an integer >= 1');
    }
  }
  if (policy.initialBaselinePages > MAX_PAGES_PER_LEAF) {
    throw new Error(
      `Boundary policy initialBaselinePages ${policy.initialBaselinePages} exceeds the source maximum ${MAX_PAGES_PER_LEAF}`,
    );
  }
  if (policy.maxPagesPerTarget > MAX_PAGES_PER_LEAF) {
    throw new Error(
      `Boundary policy maxPagesPerTarget ${policy.maxPagesPerTarget} exceeds the source maximum ${MAX_PAGES_PER_LEAF}`,
    );
  }
}

function countMatches(seen: ReadonlySet<string>, wanted: ReadonlySet<string>): number {
  let matches = 0;
  for (const id of wanted) if (seen.has(id)) matches += 1;
  return matches;
}

export function evaluateBoundary(input: BoundaryInput): BoundaryDecision {
  const { policy, prior } = input;
  const boundaryMatches = prior ? countMatches(input.seenIds, prior.boundaryIds) : 0;
  const anchorMatches = prior ? countMatches(input.seenIds, prior.anchorIds) : 0;
  const dateReentered = Boolean(
    prior && input.oldestDateSeen !== null && input.oldestDateSeen < prior.boundaryDate,
  );
  const base = { exhausted: false, dateReentered, anchorMatches, boundaryMatches };

  if (!input.hasNextPage) {
    return {
      ...base,
      reached: true,
      proof: 'END_OF_LISTING',
      reason: `source offers no further page after page ${input.pagesVisited}`,
    };
  }

  if (!prior) {
    if (input.pagesVisited >= policy.initialBaselinePages) {
      return {
        ...base,
        reached: true,
        proof: 'BASELINE_POLICY',
        reason: `initial baseline depth of ${policy.initialBaselinePages} page(s) reached`,
      };
    }
    if (
      policy.initialBaselineDays !== null &&
      input.oldestDateSeen !== null &&
      input.oldestDateSeen < addDays(input.today, -policy.initialBaselineDays)
    ) {
      return {
        ...base,
        reached: true,
        proof: 'BASELINE_POLICY',
        reason: `initial baseline depth of ${policy.initialBaselineDays} day(s) reached at ${input.oldestDateSeen}`,
      };
    }
    return {
      ...base,
      reached: false,
      proof: null,
      exhausted: input.pagesVisited >= policy.maxPagesPerTarget,
      reason: `fresh target: ${input.pagesVisited}/${policy.initialBaselinePages} baseline page(s) read`,
    };
  }

  if (!dateReentered) {
    return {
      ...base,
      reached: false,
      proof: null,
      exhausted: input.pagesVisited >= policy.maxPagesPerTarget,
      reason:
        `boundary day ${prior.boundaryDate} not yet passed (oldest seen ${input.oldestDateSeen ?? 'none'}); ` +
        `${boundaryMatches}/${prior.boundaryIds.size} boundary-day id(s) re-observed`,
    };
  }

  const anchorsRequired = Math.min(policy.minAnchorMatches, prior.anchorIds.size);
  if (prior.anchorIds.size > 0 && anchorMatches >= anchorsRequired) {
    return {
      ...base,
      reached: true,
      proof: 'ANCHOR_IDS',
      reason:
        `boundary day ${prior.boundaryDate} passed and ${anchorMatches}/${prior.anchorIds.size} anchor id(s) ` +
        `re-observed (required ${anchorsRequired})`,
    };
  }

  const windowStart = addDays(prior.boundaryDate, -policy.overlapDays);
  if (input.oldestDateSeen !== null && input.oldestDateSeen < windowStart) {
    return {
      ...base,
      reached: true,
      proof: 'DATE_WINDOW',
      reason:
        `boundary day ${prior.boundaryDate} passed; anchors ${anchorMatches}/${prior.anchorIds.size} ` +
        `(required ${anchorsRequired}) but the ${policy.overlapDays}-day overlap window ended at ${input.oldestDateSeen}`,
    };
  }

  return {
    ...base,
    reached: false,
    proof: null,
    exhausted: input.pagesVisited >= policy.maxPagesPerTarget,
    reason:
      `boundary day ${prior.boundaryDate} passed but overlap not proven: anchors ${anchorMatches}/${prior.anchorIds.size} ` +
      `(required ${anchorsRequired}), oldest seen ${input.oldestDateSeen} >= window start ${windowStart}`,
  };
}

/**
 * Bir kosunun basarili bitisinde SONRAKI kosu icin sinir kaydi: en yeni gun,
 * o gunun tum kimlikleri ve sinir altindaki ilk `anchorSize` kimlik
 * (kaynak sirasiyla). Gozlemler en yeniden en eskiye VERILMELIDIR.
 */
export function deriveNextBoundary(
  observations: ReadonlyArray<{ sourceListingId: string; listingDate: string }>,
  anchorSize: number,
): { boundaryDate: string | null; boundaryIds: string[]; anchorIds: string[] } {
  if (observations.length === 0) return { boundaryDate: null, boundaryIds: [], anchorIds: [] };
  let boundaryDate = observations[0].listingDate;
  for (const observation of observations) {
    if (observation.listingDate > boundaryDate) boundaryDate = observation.listingDate;
  }
  const boundaryIds = new Set<string>();
  const anchorIds: string[] = [];
  const anchorSeen = new Set<string>();
  for (const observation of observations) {
    if (observation.listingDate === boundaryDate) boundaryIds.add(observation.sourceListingId);
    else if (
      observation.listingDate < boundaryDate &&
      anchorIds.length < anchorSize &&
      !anchorSeen.has(observation.sourceListingId)
    ) {
      anchorSeen.add(observation.sourceListingId);
      anchorIds.push(observation.sourceListingId);
    }
  }
  return { boundaryDate, boundaryIds: [...boundaryIds].sort(), anchorIds };
}
