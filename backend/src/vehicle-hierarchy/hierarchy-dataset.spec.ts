/**
 * TUM DATASET UZERINDE AGAC TESTI (gercek artefakt).
 *
 * Audi A3'un gecmesi YETMEZ. Bu testler, toplanmis verinin TAMAMINDA hicbir
 * ara seviyenin UI gezinmesinden dusmedigini dogrular.
 *
 * Artefakt uretilen veridir ve gitignore'ludur; yoksa testler atlanir ve
 * sebebi acikca yazilir (sessizce "gecti" demez).
 */
import { auditHierarchy } from './hierarchy-audit';
import { artifactToTree, loadArtifact } from './hierarchy-source';
import { enumerateLeafPaths, findByPath, HierarchyNode, HierarchyTree } from './hierarchy-tree';

const artifact = loadArtifact();
const runOrSkip = artifact ? describe : describe.skip;

if (!artifact) {
  // eslint-disable-next-line no-console
  console.warn(
    '[hierarchy-dataset] artifact not found; run "npm run hierarchy:build" to enable these tests.',
  );
}

runOrSkip('GERCEK DATASET AGACI', () => {
  let tree: HierarchyTree;

  beforeAll(() => {
    tree = artifactToTree(artifact!);
  });

  it('denetimden SERT kusursuz gecer', () => {
    const report = auditHierarchy(tree);
    const hard = report.findings.filter((f) => f.kind !== 'UNRESOLVED_CATEGORY');
    expect(hard).toEqual([]);
    expect(report.totalNodes).toBeGreaterThan(1000);
    expect(report.rootCount).toBeGreaterThan(20);
  });

  it('derinlik SABIT DEGILDIR — dataset birden fazla derinlik icerir', () => {
    const depths = new Set([...tree.nodes.values()].map((n) => n.depth));
    expect(depths.size).toBeGreaterThanOrEqual(5);
    expect(Math.max(...depths)).toBeGreaterThanOrEqual(4);
  });

  it('her yaprak kokten ADIM ADIM yurunerek bulunabilir', () => {
    const paths = enumerateLeafPaths(tree);
    expect(paths.length).toBeGreaterThan(500);

    const failures: string[] = [];
    for (const segments of paths) {
      let cursor: HierarchyNode | undefined = tree.nodes.get(
        tree.rootIds.find((id) => tree.nodes.get(id)!.name === segments[0])!,
      );
      if (!cursor) {
        failures.push(`root missing: ${segments.join(' / ')}`);
        continue;
      }
      for (let i = 1; i < segments.length; i += 1) {
        const childId: string | undefined = cursor.childIds.find(
          (id) => tree.nodes.get(id)!.name === segments[i],
        );
        if (!childId) {
          failures.push(`step missing: ${segments.slice(0, i + 1).join(' / ')}`);
          break;
        }
        cursor = tree.nodes.get(childId)!;
      }
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });

  /**
   * ESKI VARSAYIM BILEREK KALDIRILDI: "cocugu yoksa yapraktir".
   *
   * Gercek korpusta bu 588 ebeveyni yaprak gosteriyordu (71 markada, 43'u
   * dogrudan marka koku). Ornek: "Audi / A3 / A3 Hatchback" yaprak sanilip
   * 370 ilanla fiyatlaniyordu; oysa o 370 satir tum motorlarin karisimi ve
   * sayfanin kendi menusu 9 alt kategori ilan ediyor.
   *
   * DOGRU degismez: cocugu olmayan bir dugum ancak terminal oldugu KAYNAKTAN
   * dogrulandiysa yapraktir. Dogrulanmadiysa BILINMEYENDIR.
   */
  it('yaprak yalnizca kaynaktan dogrulanmis terminal dugumdur', () => {
    for (const node of tree.nodes.values()) {
      expect(node.hasChildren).toBe(node.childIds.length > 0);
      if (node.isLeaf) {
        expect(node.childIds.length).toBe(0);
        expect(node.terminalConfirmed).toBe(true);
      }
      if (node.childIds.length > 0) expect(node.isLeaf).toBe(false);
    }
  });

  /**
   * BILINMEYEN != YAPRAK. Kaynagin ilan ettigi ama sayfasini toplamadigimiz
   * dugumler secilebilir olmali, FIYATLANABILIR olmamalidir.
   */
  it('cocuksuz ve dogrulanmamis dugumler yaprak SAYILMAZ', () => {
    const unknown = [...tree.nodes.values()].filter(
      (n) => n.childIds.length === 0 && !n.terminalConfirmed,
    );
    for (const node of unknown) expect(node.isLeaf).toBe(false);
  });

  it('her dugum kokune kadar kesintisiz zincirle baglidir', () => {
    for (const node of tree.nodes.values()) {
      let cursor = node;
      let steps = 0;
      while (cursor.parentId) {
        const parent = tree.nodes.get(cursor.parentId);
        expect(parent).toBeDefined();
        expect(parent!.childIds).toContain(cursor.id);
        cursor = parent!;
        steps += 1;
        expect(steps).toBeLessThan(20); // dongu koruma
      }
      expect(cursor.parentId).toBeNull();
      expect(cursor.depth).toBe(0);
    }
  });

  it('ZORUNLU: Audi / A3 / A3 Sportback / 35 TFSI / Advanced tam zinciriyle vardir', () => {
    const chain = ['Audi', 'A3', 'A3 Sportback', '35 TFSI', 'Advanced'];
    for (let i = 1; i <= chain.length; i += 1) {
      const node = findByPath(tree, chain.slice(0, i));
      expect(node).not.toBeNull();
      if (i < chain.length) expect(node!.isLeaf).toBe(false);
    }
    const leaf = findByPath(tree, chain)!;
    expect(leaf.isLeaf).toBe(true);
    expect(leaf.id).toBe('audi/a3/a3-sportback/35-tfsi/advanced');
    expect(leaf.ownListingCount).toBeGreaterThan(0);
    expect(leaf.sourceFiles.length).toBeGreaterThan(0);
  });

  it('kisayol zincirleri dataset genelinde de YOKTUR', () => {
    expect(findByPath(tree, ['Audi', 'A3', '35 TFSI'])).toBeNull();
    expect(findByPath(tree, ['Audi', 'A3', 'Advanced'])).toBeNull();
    expect(findByPath(tree, ['Audi', 'A3 Sportback'])).toBeNull();
  });

  it('ayni paket adi farkli araclarda AYRI kimliktir', () => {
    const byName = new Map<string, string[]>();
    for (const node of tree.nodes.values()) {
      if (!node.isLeaf) continue;
      byName.set(node.name, [...(byName.get(node.name) || []), node.id]);
    }
    const repeated = [...byName.entries()].filter(([, ids]) => ids.length > 1);
    expect(repeated.length).toBeGreaterThan(0); // tekrar eden isimler gercekten var
    for (const [, ids] of repeated) {
      expect(new Set(ids).size).toBe(ids.length); // ama kimlikler ayri
    }
  });

  it('birden fazla markada cok seviyeli zincir vardir (Audi ozel degil)', () => {
    const deepRoots = new Set<string>();
    for (const node of tree.nodes.values()) {
      if (node.depth >= 3) deepRoots.add(node.pathSegments[0]);
    }
    expect(deepRoots.size).toBeGreaterThanOrEqual(5);
  });
});
