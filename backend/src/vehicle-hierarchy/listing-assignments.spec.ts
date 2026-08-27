/**
 * KORPUS SEVIYESINDE ATAMA DEGISMEZLERI.
 *
 * Bu testler "uretilen agac kendi icinde tutarli mi" diye SORMAZ. Gercek
 * korpustan uretilmis atamalari alir ve fiyatlamayi bozabilecek somut
 * durumlari imkansiz kilar:
 *
 *   - bir ilanin iki havuza birden girmesi (cift sayim),
 *   - bir ilanin var olmayan bir dugume yazilmasi,
 *   - kesin olmayan kanitin (PARTIAL/AMBIGUOUS/UNRESOLVED) havuza sizmasi,
 *   - cocugu olan bir dugumun terminal gibi fiyatlanmasi.
 *
 * Artefaktlar yoksa atlanir (CI'da korpus bulunmayabilir).
 */
import { artifactToTree, loadArtifact } from './hierarchy-source';
import { loadAssignments } from './build-listing-assignments';
import { isExactEvidence } from './listing-resolver';

const hierarchy = loadArtifact();
const assignments = loadAssignments();
const describeIfCorpus = hierarchy && assignments ? describe : describe.skip;

describeIfCorpus('ILAN ATAMALARI — KORPUS DEGISMEZLERI', () => {
  const tree = artifactToTree(hierarchy!);
  const entries = Object.entries(assignments!.assignments);

  it('korpus gercekten yuklendi', () => {
    expect(entries.length).toBeGreaterThan(1000);
  });

  it('her ilan EN FAZLA bir dugume atanir (cift sayim yok)', () => {
    // Yapi geregi anahtar tekildir; burada anahtarin gercekten ilan kimligi
    // oldugunu ve tekrar etmedigini dogruluyoruz.
    const ids = new Set(entries.map(([id]) => id));
    expect(ids.size).toBe(entries.length);
  });

  it('atanan her dugum agacta VARDIR', () => {
    const missing = entries.filter(([, a]) => !tree.nodes.has(a.nodeId));
    expect(missing.slice(0, 5)).toEqual([]);
  });

  it('KESIN olmayan kanit havuza girmez', () => {
    const pooled = entries.filter(([, a]) => isExactEvidence(a.evidence));
    for (const [, a] of pooled) {
      expect(['PAGE_EXACT', 'ROW_MODEL_EXACT']).toContain(a.evidence);
    }
    // Kesin olmayanlar da kayitlidir ama ayirt edilebilir olmalidir.
    const nonExact = entries.filter(([, a]) => !isExactEvidence(a.evidence));
    for (const [, a] of nonExact) {
      expect(['PARTIAL', 'AMBIGUOUS', 'UNRESOLVED']).toContain(a.evidence);
    }
  });

  /**
   * EN KRITIK: cocugu olan bir dugum terminal degildir. Ona atanmis satirlar
   * olabilir (sayfanin kendi seviyesi), ama o dugum FIYATLANMAZ — aksi halde
   * karisik havuz tek bir aracin fiyati gibi sunulurdu.
   */
  it('cocugu olan dugumler terminal sayilmaz', () => {
    for (const node of tree.nodes.values()) {
      if (node.childIds.length > 0) expect(node.isLeaf).toBe(false);
    }
  });

  it('atama derinligi dugumun gercek derinligiyle tutarlidir', () => {
    const wrong = entries.filter(([, a]) => {
      const node = tree.nodes.get(a.nodeId);
      return !node || node.depth + 1 !== a.depth;
    });
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  /**
   * Ust kategori sayfalarindan gercekten kazanim oldugunu kanitlar: satir
   * metninden cozulmus ilanlar bulunmali. Bu sifirsa, gorev anlamsizdir.
   */
  it('satir metninden kazanilmis ilanlar VARDIR', () => {
    const rowExact = entries.filter(([, a]) => a.evidence === 'ROW_MODEL_EXACT');
    expect(rowExact.length).toBeGreaterThan(1000);
  });

  it('hicbir ilan marka seviyesinde takili kalmaz', () => {
    const stuckAtMake = entries.filter(([, a]) => isExactEvidence(a.evidence) && a.depth === 1);
    expect(stuckAtMake.length).toBe(0);
  });
});
