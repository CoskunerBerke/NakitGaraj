/**
 * MENU KANITINI DUZ `categoryString` GOZLEMLERINE UYGULA — FAIL CLOSED.
 *
 * KOK NEDEN (gercek korpusta olculdu): bir ebeveyn sayfasi kendi menusunde
 * kesin olarak
 *
 *   Seat / Ibiza -> 1.6 TDI
 *
 * diyebiliyor; ayni cocugun kaydedilmis dosyasi ise giris/engel/eksik DOM
 * nedeniyle breadcrumb vermeyip yalnizca duz kategori dizesi tasiyabiliyor:
 *
 *   "Seat Ibiza 1.6 TDI"
 *
 * `hierarchy-tree` daha once "bu categoryString zaten var" deyip menu tarafindan
 * kanitlanan TAM yolu eklemiyordu. Sonra breadcrumb'siz gozlem marka + geri kalan
 * olarak kurtariliyor ve `Seat / Ibiza 1.6 TDI` diye kisayol dugumu doguyordu.
 * Bu, kullanicinin en kritik degismezini ihlal eder: ARA SEVIYE ATLANAMAZ.
 *
 * Bu katman kaynak onceligini acik hale getirir:
 *
 *   exact breadcrumb / parent direct-nav path > flat categoryString
 *
 * Duz gozlemde yol yoksa menu yolu ona PROMOTE edilir; mevcut kesin yol menu
 * yoluyla celisiyorsa tahmin/overwrite YOKTUR — build durur.
 */
import { ObservedCategory } from './hierarchy-tree';

export class HierarchyEvidenceConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HierarchyEvidenceConflict';
  }
}

export function reconcileDirectNavPaths(observations: ObservedCategory[]): ObservedCategory[] {
  const byString = new Map<string, ObservedCategory>();

  // Once ayni categoryString'i tek kayitta birlestir. Uretimde loadObservations
  // zaten bunu yapar; ikinci hierarchy build'inde listing-discovery gozlemleri
  // eklendigi icin burada tekrar savunma yapilir.
  for (const raw of observations) {
    const current = cloneObservation(raw);
    const existing = byString.get(current.categoryString);
    if (!existing) {
      byString.set(current.categoryString, current);
      continue;
    }
    mergeSameCategory(existing, current);
  }

  // Yalnizca KESIN yolu bilinen ebeveynin KENDI direct-nav cocuklari yol
  // kaniti uretebilir. Flat metinden segment uydurulmaz.
  const parents = [...byString.values()];
  for (const parent of parents) {
    if (!parent.pathSegments || !Array.isArray(parent.navChildLabels)) continue;

    for (const rawLabel of parent.navChildLabels) {
      const label = String(rawLabel || '').trim();
      if (!label) continue;

      const categoryString = `${parent.categoryString} ${label}`.replace(/\s+/g, ' ').trim();
      const exactPath = [...parent.pathSegments, label];
      const existing = byString.get(categoryString);

      if (!existing) {
        byString.set(categoryString, {
          categoryString,
          listingCount: 0,
          sourceFiles: [],
          pathSegments: exactPath,
        });
        continue;
      }

      if (!existing.pathSegments || existing.pathSegments.length === 0) {
        existing.pathSegments = exactPath;
        continue;
      }

      if (!samePath(existing.pathSegments, exactPath)) {
        throw new HierarchyEvidenceConflict(
          `PATH_CONFLICT for "${categoryString}": existing ` +
            `"${existing.pathSegments.join(' / ')}" vs direct-nav ` +
            `"${exactPath.join(' / ')}"`,
        );
      }
    }
  }

  return [...byString.values()];
}

function cloneObservation(o: ObservedCategory): ObservedCategory {
  return {
    ...o,
    sourceFiles: [...(o.sourceFiles || [])],
    pathSegments: o.pathSegments ? [...o.pathSegments] : o.pathSegments,
    navChildLabels: Array.isArray(o.navChildLabels)
      ? [...o.navChildLabels]
      : o.navChildLabels,
  };
}

function mergeSameCategory(target: ObservedCategory, incoming: ObservedCategory): void {
  if (target.pathSegments && incoming.pathSegments && !samePath(target.pathSegments, incoming.pathSegments)) {
    throw new HierarchyEvidenceConflict(
      `PATH_CONFLICT for "${target.categoryString}": ` +
        `"${target.pathSegments.join(' / ')}" vs "${incoming.pathSegments.join(' / ')}"`,
    );
  }
  if (!target.pathSegments && incoming.pathSegments) target.pathSegments = [...incoming.pathSegments];

  const targetNav = target.navChildLabels;
  const incomingNav = incoming.navChildLabels;
  if (Array.isArray(targetNav) && Array.isArray(incomingNav) && !sameLabelSet(targetNav, incomingNav)) {
    throw new HierarchyEvidenceConflict(
      `NAV_CONFLICT for "${target.categoryString}": saved pages disagree on direct children`,
    );
  }
  if (!Array.isArray(targetNav) && Array.isArray(incomingNav)) {
    target.navChildLabels = [...incomingNav];
  } else if (targetNav === undefined && incomingNav === null) {
    target.navChildLabels = null;
  }

  // Ayni kategori iki kez geldiyse sayimi sisirmeyiz. Uretimde esas DB gozlemi
  // zaten aggregate'dir; listing-discovery gozlemleri 0 sayimla gelir.
  target.listingCount = Math.max(target.listingCount, incoming.listingCount);
  target.sourceFiles = [...new Set([...target.sourceFiles, ...incoming.sourceFiles])];
}

function samePath(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
}

function sameLabelSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((label, index) => label === right[index]);
}
