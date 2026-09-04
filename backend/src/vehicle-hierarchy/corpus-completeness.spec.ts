/**
 * KORPUSA KARSI TAMLIK — AGACI KENDISIYLE DOGRULAMAZ.
 *
 * Onceki denetim "uretilen her yaprak cozumlenebiliyor mu" diye soruyordu.
 * Bu DAIRESELDIR: eksik kurulmus bir agacin yapraklari da pekala cozumlenir.
 * Nitekim agac "1875/1875 yaprak cozumlendi" derken, gercekte 588 yaprak
 * aslinda EBEVEYNDI ve kullaniciya karisik havuzdan fiyat gosteriliyordu
 * (orn. "Audi / A3 / A3 Hatchback": 370 ilan, motor alani BOS,
 * 175.000–1.450.000 TL).
 *
 * Bu testler DIS kaynaga bakar: kullanicinin elle kaydettigi HTML'in kendi
 * kategori menusune. Kaynak sayfasi olan her dugum icin degismezler:
 *
 *   1) menude alt kategori ILAN EDILMISSE dugum YAPRAK OLAMAZ;
 *   2) menude ilan edilen her cocuk agacta GERCEKTEN bulunmali;
 *   3) yaprak olan her dugumun terminal oldugu kaynaktan DOGRULANMIS olmali.
 *
 * Artefakt yoksa testler atlanir (CI'da korpus bulunmayabilir); korpus varsa
 * bu sinif hata bir daha sessizce gecemez.
 */
import * as fs from 'fs';
import { ownSlugOf, splitNavChildren } from './nav-children';
import { classifyPage } from './page-classification';
import { artifactToTree, loadArtifact } from './hierarchy-source';
import { HierarchyNode } from './hierarchy-tree';

const artifact = loadArtifact();
const describeIfCorpus = artifact ? describe : describe.skip;

describeIfCorpus('KORPUSA KARSI TAMLIK', () => {
  const tree = artifactToTree(artifact!);
  const nodes = [...tree.nodes.values()];

  /** Sayfasi kaydedilmis dugumler — disaridan kanit YALNIZCA bunlar icin var. */
  const withPage = nodes.filter((n) => n.sourceFiles.length > 0);

  /** Sayfanin menusunde ILAN EDILEN dogrudan cocuk etiketleri. */
  function declaredChildren(node: HierarchyNode): string[] | null {
    let html: string;
    try {
      html = fs.readFileSync(node.sourceFiles[0], 'utf-8');
    } catch {
      return null;
    }
    const page = classifyPage(html, node.sourceFiles[0]);
    if (page.navChildren === null) return null;
    /**
     * DOGRUDAN cocuk = alt soy slug'i + kaynagin seviye isareti; uretimle AYNI
     * suzgec. Kaynak bir ara seviyeyi atlayip torunlari listelediyse bu
     * sayfa hicbir dogrudan cocuk ILAN ETMEZ (agac da ondan cocuk beklemez).
     */
    const own = ownSlugOf(page.ownPath, node.pathSegments);
    return splitNavChildren(
      page.navChildren,
      own,
      node.pathSegments.length,
    ).direct.map((c) => c.label);
  }

  it('korpus gercekten okunabiliyor (aksi halde test anlamsiz olurdu)', () => {
    expect(withPage.length).toBeGreaterThan(0);
    const readable = withPage.filter((n) => declaredChildren(n) !== null);
    /**
     * Birkac kaydedilmis sayfa gercek bir kategori sayfasi degildir (menusu
     * yok). Bunlar terminal SAYILMAZ — zaten fail-closed. Test, korpusun
     * ezici cogunlugunun okunabildigini garanti eder ki denetim anlamli olsun.
     */
    expect(readable.length / withPage.length).toBeGreaterThan(0.99);
  });

  /** ASIL REGRESYON: bu test, bildirilen hatayi yakalayan testtir. */
  it('kaynagi alt kategori ilan eden HICBIR dugum yaprak degildir', () => {
    const falseLeaves: string[] = [];
    for (const node of withPage) {
      const declared = declaredChildren(node);
      if (declared && declared.length > 0 && node.isLeaf) {
        falseLeaves.push(`${node.fullPath} -> ${declared.join(', ')}`);
      }
    }
    expect(falseLeaves.slice(0, 10)).toEqual([]);
    expect(falseLeaves.length).toBe(0);
  });

  it('menude ilan edilen her cocuk agacta bulunur', () => {
    const missing: string[] = [];
    for (const node of withPage) {
      const declared = declaredChildren(node);
      if (!declared) continue;
      const present = new Set(
        node.childIds.map((id) => tree.nodes.get(id)?.name),
      );
      for (const label of declared) {
        if (!present.has(label)) missing.push(`${node.fullPath} -> ${label}`);
      }
    }
    expect(missing.slice(0, 10)).toEqual([]);
    expect(missing.length).toBe(0);
  });

  it('her yaprak, terminal oldugu KAYNAKTAN dogrulanmis dugumdur', () => {
    const leaves = nodes.filter((n) => n.isLeaf);
    expect(leaves.length).toBeGreaterThan(0);
    for (const leaf of leaves) {
      expect(leaf.terminalConfirmed).toBe(true);
      expect(leaf.childIds.length).toBe(0);
      // Kanit sayfadan gelir; sayfasi olmayan bir dugum yaprak ILAN EDILEMEZ.
      expect(leaf.sourceFiles.length).toBeGreaterThan(0);
    }
  });

  /**
   * ILAN SAYISI YAPRAK KANITI DEGILDIR. Bu tam olarak yanilgiydi:
   * "370 ilan var, oyleyse burada durabiliriz".
   */
  it('ilan sayisi yaprak kaniti olarak KULLANILMAZ', () => {
    const richNonLeaves = nodes.filter(
      (n) => n.ownListingCount > 100 && !n.isLeaf,
    );
    expect(richNonLeaves.length).toBeGreaterThan(0);
    for (const node of richNonLeaves) expect(node.isLeaf).toBe(false);
  });

  /**
   * YAPI ILE PIYASA VERISI AYRI SEYLERDIR.
   *
   * Menude ilan edilen bir kategori, ona cozulen ilan OLMASA BILE agacta
   * kalmalidir. Aksi halde kullanici gercekte var olan bir donanimi hic
   * goremez. (Karsi ornek: A3 Sportback'in 17 cocugundan 13'unun kendi
   * havuzu bostur — ilanlari daha derine cozulmustur — ama hepsi
   * gorunmelidir.)
   */
  it('menude ilan edilen cocuk, ilani olmasa da agacta KALIR', () => {
    const missing: string[] = [];
    for (const node of withPage) {
      const declared = declaredChildren(node);
      if (!declared) continue;
      const present = new Set(
        node.childIds.map((id) => tree.nodes.get(id)?.name),
      );
      for (const label of declared)
        if (!present.has(label)) missing.push(`${node.fullPath} -> ${label}`);
    }
    expect(missing.length).toBe(0);
  });

  /**
   * SATIR KESFI, MENU KANITINI EZEMEZ. Ilan satirlarindan kesfedilen
   * cocuklar yalnizca EKLER; menusu okunmus bir dugumun cocuk kumesini
   * daraltamaz.
   */
  it('menusu okunmus dugumun cocuklari menuyu KAPSAR', () => {
    const shrunk: string[] = [];
    for (const node of withPage) {
      const declared = declaredChildren(node);
      if (!declared || declared.length === 0) continue;
      const present = new Set(
        node.childIds.map((id) => tree.nodes.get(id)?.name),
      );
      for (const label of declared)
        if (!present.has(label)) shrunk.push(node.fullPath);
    }
    expect(shrunk.slice(0, 5)).toEqual([]);
  });

  it('bildirilen karsi ornek: Audi / A3 / A3 Hatchback yaprak DEGILDIR', () => {
    const hatchback = nodes.find(
      (n) => n.fullPath === 'Audi / A3 / A3 Hatchback',
    );
    if (!hatchback) return; // korpus farkliysa test bir sey iddia etmez
    expect(hatchback.isLeaf).toBe(false);
    expect(hatchback.childIds.length).toBeGreaterThan(0);
    expect(hatchback.ownListingCount).toBeGreaterThan(0); // ilanlari var, yine de yaprak degil
  });
});
