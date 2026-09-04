/**
 * MENU KANITINI DUZ `categoryString` GOZLEMLERINE UYGULA — FAIL CLOSED.
 *
 * `categoryString` KIMLIK DEGILDIR. Gercek korpusta ayni duz dize iki farkli
 * exact yolu temsil edebiliyor:
 *
 *   dosya adi:  "Renault Symbol 1.0 TCe Joy"
 *   breadcrumb: Renault / Symbol / 1.0 TCe
 *
 * ve satir kesfi ayni duz dizeyle gercek cocugu bulabiliyor:
 *
 *   Renault / Symbol / 1.0 TCe / Joy
 *
 * Bu iki kaniti `categoryString` esit diye birlestirmek de, celiski saymak da
 * yanlistir. Kimlik exact `pathSegments`tir. Duz dize yalnizca exact yolu
 * olmayan eski/eksik gozlemi parent direct-nav kanitiyla PROMOTE etmek icin
 * kullanilir.
 *
 * Kaynak onceligi:
 *   exact breadcrumb / parent direct-nav path > flat categoryString
 *
 * Ayrica exact path kimligi BUYUK/kucuk harfe duyarsizdir. Gercek korpusta
 * listing discovery `Fiat / UNO`, kaydedilmis sayfa breadcrumb'i ise
 * `Fiat / Uno` uretebiliyor. Audit de ayni parent altindaki bu iki etiketi
 * zaten belirsiz kabul eder. Kaydedilmis breadcrumb casing'i kanonik kabul
 * edilir ve source'suz turetilmis yol onun altina birlestirilir.
 *
 * Fail-closed celiski ancak AYNI kaynak dosyasi iki farkli (case-only olmayan)
 * exact breadcrumb yolu iddia ederse veya AYNI exact yolun kaydedilmis
 * sayfalari farkli direct child setleri bildirirse uretilir.
 */
import { ObservedCategory } from './hierarchy-tree';

export class HierarchyEvidenceConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HierarchyEvidenceConflict';
  }
}

export function reconcileDirectNavPaths(observations: ObservedCategory[]): ObservedCategory[] {
  const reconciled: ObservedCategory[] = [];

  /**
   * Ayni DUZ dizeyi degil, ayni KANIT KIMLIGINI birlestir:
   *   - exact gozlem -> categoryString + exact path
   *   - flat gozlem  -> categoryString
   *
   * Boylece ayni categoryString'in iki farkli exact yolu sessizce ezilmez.
   */
  for (const raw of observations) {
    const current = cloneObservation(raw);
    assertNoSourcePathConflict(reconciled, current);

    const existing = reconciled.find((candidate) => sameIdentity(candidate, current));
    if (existing) mergeSameIdentity(existing, current);
    else reconciled.push(current);
  }

  /**
   * Yalnizca KESIN yolu bilinen ebeveynin KENDI direct-nav cocuklari yol
   * kaniti uretebilir. Flat metinden segment uydurulmaz.
   */
  const parents = [...reconciled];
  for (const parent of parents) {
    if (!parent.pathSegments || !Array.isArray(parent.navChildLabels)) continue;

    for (const rawLabel of parent.navChildLabels) {
      const label = String(rawLabel || '').trim();
      if (!label) continue;

      const categoryString = `${parent.categoryString} ${label}`.replace(/\s+/g, ' ').trim();
      const exactPath = [...parent.pathSegments, label];

      // Exact path zaten varsa kanit tamamdir. Ayni duz dizeyle baska exact
      // yollarin bulunmasi celiski degildir; categoryString lossy bir alias'tir.
      const exact = reconciled.find(
        (o) =>
          o.categoryString === categoryString &&
          o.pathSegments &&
          samePathFolded(o.pathSegments, exactPath),
      );
      if (exact) continue;

      // Yolu olmayan gozlemi, parent direct-nav kanitiyla exact yola tasiriz.
      const flat = reconciled.find(
        (o) => o.categoryString === categoryString && (!o.pathSegments || o.pathSegments.length === 0),
      );
      if (flat) {
        flat.pathSegments = exactPath;
        continue;
      }

      // Cocuk sayfasi hic yoksa bile parent menu onun varligini ve TAM yolunu
      // kanitlar. Secilebilir olur ama listingCount=0 oldugu icin fiyatlanmaz.
      reconciled.push({
        categoryString,
        listingCount: 0,
        sourceFiles: [],
        pathSegments: exactPath,
      });
    }
  }

  canonicalizeCaseOnlyPaths(reconciled);
  return reconciled;
}

/**
 * Kaydedilmis exact breadcrumb casing'ini kanoniklestirir.
 *
 * Source-backed derin bir breadcrumb tum prefix'lerinin casing'ini de kanitlar.
 * Ornegin `Fiat / Uno / 70 SX` varsa source'suz `Fiat / UNO / 45 S` yolu
 * `Fiat / Uno / 45 S` olarak normalize edilir. Segment SINIRI degismez;
 * yalnizca case-only alias tek kimlige indirilir.
 */
function canonicalizeCaseOnlyPaths(observations: ObservedCategory[]): void {
  const canonicalPrefixes = new Map<string, string[]>();

  for (const observation of observations) {
    if (!observation.pathSegments?.length || observation.sourceFiles.length === 0) continue;
    for (let length = 1; length <= observation.pathSegments.length; length += 1) {
      const prefix = observation.pathSegments.slice(0, length);
      const key = foldedPathKey(prefix);
      if (!canonicalPrefixes.has(key)) canonicalPrefixes.set(key, prefix);
    }
  }

  for (const observation of observations) {
    if (!observation.pathSegments?.length) continue;
    let normalized = [...observation.pathSegments];

    for (let length = 1; length <= normalized.length; length += 1) {
      const canonical = canonicalPrefixes.get(foldedPathKey(normalized.slice(0, length)));
      if (!canonical) continue;
      normalized = [...canonical, ...normalized.slice(length)];
    }

    observation.pathSegments = normalized;
  }
}

function cloneObservation(o: ObservedCategory): ObservedCategory {
  return {
    ...o,
    sourceFiles: [...(o.sourceFiles || [])],
    pathSegments: o.pathSegments ? [...o.pathSegments] : o.pathSegments,
    navChildLabels: Array.isArray(o.navChildLabels) ? [...o.navChildLabels] : o.navChildLabels,
  };
}

function sameIdentity(a: ObservedCategory, b: ObservedCategory): boolean {
  if (a.categoryString !== b.categoryString) return false;
  const aExact = Boolean(a.pathSegments && a.pathSegments.length > 0);
  const bExact = Boolean(b.pathSegments && b.pathSegments.length > 0);
  if (aExact !== bExact) return false;
  if (!aExact && !bExact) return true;
  return samePathFolded(a.pathSegments!, b.pathSegments!);
}

function mergeSameIdentity(target: ObservedCategory, incoming: ObservedCategory): void {
  const targetNav = target.navChildLabels;
  const incomingNav = incoming.navChildLabels;
  if (Array.isArray(targetNav) && Array.isArray(incomingNav) && !sameLabelSet(targetNav, incomingNav)) {
    throw new HierarchyEvidenceConflict(
      `NAV_CONFLICT for "${target.pathSegments?.join(' / ') || target.categoryString}": ` +
        'saved pages disagree on direct children',
    );
  }
  if (!Array.isArray(targetNav) && Array.isArray(incomingNav)) {
    target.navChildLabels = [...incomingNav];
  } else if (targetNav === undefined && incomingNav === null) {
    target.navChildLabels = null;
  }

  // Source-backed exact yolun casing'i source'suz alias'tan daha gucludur.
  if (
    incoming.sourceFiles.length > 0 &&
    incoming.pathSegments?.length &&
    target.pathSegments?.length &&
    samePathFolded(target.pathSegments, incoming.pathSegments)
  ) {
    target.pathSegments = [...incoming.pathSegments];
  }

  // Uretimde loadObservations zaten aggregate'dir; listing-discovery 0 sayimla
  // gelir. Max kullanmak ayni kaniti ikinci kez sayip havuzu sisirmeyi engeller.
  target.listingCount = Math.max(target.listingCount, incoming.listingCount);
  target.sourceFiles = [...new Set([...target.sourceFiles, ...incoming.sourceFiles])];
}

function assertNoSourcePathConflict(existing: ObservedCategory[], incoming: ObservedCategory): void {
  if (!incoming.pathSegments || incoming.pathSegments.length === 0 || incoming.sourceFiles.length === 0) return;
  const incomingFiles = new Set(incoming.sourceFiles);

  for (const candidate of existing) {
    if (!candidate.pathSegments || candidate.pathSegments.length === 0) continue;
    if (samePathFolded(candidate.pathSegments, incoming.pathSegments)) continue;
    const shared = candidate.sourceFiles.find((file) => incomingFiles.has(file));
    if (!shared) continue;

    throw new HierarchyEvidenceConflict(
      `PATH_CONFLICT for source "${shared}": ` +
        `"${candidate.pathSegments.join(' / ')}" vs "${incoming.pathSegments.join(' / ')}"`,
    );
  }
}

function foldedPathKey(segments: string[]): string {
  return segments.map((segment) => String(segment).trim().toLocaleLowerCase('tr')).join('\u0000');
}

function samePathFolded(a: string[], b: string[]): boolean {
  return a.length === b.length && foldedPathKey(a) === foldedPathKey(b);
}

function sameLabelSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((label, index) => label === right[index]);
}
