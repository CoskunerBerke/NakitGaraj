/**
 * TAKSONOMI FILTRESI — COCUK YALNIZCA GERCEK ALT KATEGORIDIR.
 *
 * Uzanti sayfadan aday baglantilar toplar; NEYIN cocuk sayilacagina BURASI
 * karar verir. Boylece kural test edilebilir tek yerde durur ve tarayici
 * tarafinda ayrisan ikinci bir kopyasi olmaz.
 *
 * TEK VE GENEL KURAL: cocuk, mevcut dugumun KESIN ALT SOYUDUR.
 * Bu tek kural kaynak-agnostiktir ve istenmeyen her sinifi ayni anda eler:
 *   - sayfalama  (/audi-a3?pagingOffset=50 -> normalize edilince dugumun KENDISI)
 *   - kirilim yolu / breadcrumb (/audi -> ATA)
 *   - kardes kategori (/audi-a4 -> alt soy DEGIL)
 *   - ust menu, oneri, reklam, satici baglantilari (yol disinda)
 *
 * Sayimsiz aday cocuk sayilmaz: sayimsiz bir dal bolumleme kararini
 * veremez ve "bilinmeyen sayim" olarak zaten durdurulurdu.
 */
import { extractChildCount, stripTrailingCount } from './count-text';
import { isUnderRoot } from './scope-guard';

/** Uzantinin sayfadan topladigi ham aday baglanti. */
export interface ChildCandidate {
  path: string;
  /** Gorunen etiket; sayim etiketin icinde olabilir. */
  label?: string;
  /** Sayimi tasiyan ham metin (etiketten ayri bir elemandaysa). */
  countText?: string | null;
  /** Uzanti sayiyi zaten cozduyse (geriye donuk uyumluluk). */
  count?: number | null;
}

export interface TaxonomyChild {
  path: string;
  label: string;
  count: number | null;
  parentPath: string;
  depth: number;
}

/** Kesin alt soy: altinda VE kendisi degil. */
export function isStrictDescendant(candidatePath: string, nodePath: string): boolean {
  return candidatePath !== nodePath && isUnderRoot(candidatePath, nodePath);
}

/**
 * Aday baglantilardan gercek alt kategorileri suzer.
 *
 * @param normalize  aday yolunu kanonik dugum yoluna cevirir (sayfalama
 *                   parametreleri atilir) — session'in normalizeNodePath'i.
 */
export function filterImmediateChildren(
  nodePath: string,
  candidates: ChildCandidate[] | undefined,
  depth: number,
  normalize: (path: string) => string,
): TaxonomyChild[] {
  if (!Array.isArray(candidates)) return [];

  const seen = new Set<string>();
  const children: TaxonomyChild[] = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate.path !== 'string' || !candidate.path.trim()) continue;

    let path: string;
    try {
      path = normalize(candidate.path);
    } catch {
      // Kaynak kokeni disinda ya da cozulemeyen yol: cocuk degildir.
      continue;
    }

    if (!isStrictDescendant(path, nodePath)) continue;
    if (seen.has(path)) continue;

    const rawLabel = String(candidate.label ?? '');
    const count =
      extractChildCount(candidate.countText) ??
      extractChildCount(rawLabel) ??
      (typeof candidate.count === 'number' && Number.isFinite(candidate.count)
        ? Math.floor(candidate.count)
        : null);

    // Sayimsiz dal bolumleme icin kullanilamaz.
    if (count === null) continue;

    seen.add(path);
    children.push({
      path,
      label: stripTrailingCount(rawLabel) || path,
      count,
      parentPath: nodePath,
      depth,
    });
  }

  return children;
}
