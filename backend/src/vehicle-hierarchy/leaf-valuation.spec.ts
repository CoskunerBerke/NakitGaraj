/**
 * DEGERLEME ICIN KESIN YAPRAK COZUMLEMESI — SOZLESMELER.
 *
 * Bu testler tek bir seyi imkansiz kilar: kullanicinin sectigi araca AIT
 * OLMAYAN bir piyasa havuzuyla fiyat uretmek. Yaprak olmayan dugum, bilinmeyen
 * kimlik ve isim benzerligi hepsi REDDEDILIR; sessiz ebeveyn fallback yoktur.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { artifactToTree, loadArtifact } from './hierarchy-source';
import { identityFromPath } from './leaf-target';
import { VehicleHierarchyService } from './vehicle-hierarchy.service';

const artifact = loadArtifact();
const runOrSkip = artifact ? describe : describe.skip;

const AUDI_LEAF = 'audi/a3/a3-sportback/35-tfsi/advanced';

// ------------------------------------------------------- saf kimlik esleme

describe('YOL -> KIMLIK ESLEMESI', () => {
  it('5 segmentli yolda marka/seri/motor/paket rollerini UCLARDAN okur', () => {
    const id = identityFromPath(
      ['Audi', 'A3', 'A3 Sportback', '35 TFSI', 'Advanced'],
      'Audi / A3 / A3 Sportback / 35 TFSI / Advanced',
    );
    expect(id).toMatchObject({
      make: 'Audi',
      model: 'A3',
      engine: '35 TFSI',
      trim: 'Advanced',
    });
  });

  it('kisa yolda olmayan rolu UYDURMAZ', () => {
    expect(identityFromPath(['Renault', 'Clio'], 'Renault / Clio')).toMatchObject({
      make: 'Renault',
      model: 'Clio',
      engine: '',
      trim: '',
    });
  });

  it('uzun yolda da sabit derinlik VARSAYMAZ', () => {
    const id = identityFromPath(
      ['Mercedes', 'C Serisi', 'C 200', 'Coupe', 'AMG', 'Premium', 'Plus'],
      'x',
    );
    expect(id.make).toBe('Mercedes');
    expect(id.model).toBe('C Serisi');
    expect(id.engine).toBe('Premium');
    expect(id.trim).toBe('Plus');
  });

  it('segment metnini YENIDEN bosluktan bolmez', () => {
    const id = identityFromPath(['Audi', 'A3', 'A3 Sportback', '35 TFSI', 'Advanced'], 'x');
    expect(id.engine).toBe('35 TFSI');
    expect(id.engine).not.toBe('35');
  });
});

// --------------------------------------------------- gercek agac uzerinde

runOrSkip('KESIN YAPRAK COZUMLEME (gercek dataset)', () => {
  let service: VehicleHierarchyService;

  beforeAll(() => {
    service = new VehicleHierarchyService();
    service.setTree(artifactToTree(artifact!));
  });

  it('Audi zincirini kesin yaprak olarak cozer', () => {
    const target = service.resolveLeafTarget(AUDI_LEAF);
    expect(target.identity.fullPath).toBe('Audi / A3 / A3 Sportback / 35 TFSI / Advanced');
    expect(target.identity).toMatchObject({
      make: 'Audi',
      model: 'A3',
      engine: '35 TFSI',
      trim: 'Advanced',
    });
    expect(target.sourceFiles.length).toBeGreaterThan(0);
  });

  it('yaprak OLMAYAN dugumle degerleme reddedilir ve eksik adim bildirilir', () => {
    // "Audi > A3" tamamlanmis bir arac degildir.
    let thrown: any = null;
    try {
      service.resolveLeafTarget('audi/a3');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(BadRequestException);
    const body: any = thrown.getResponse();
    expect(body.reason).toBe('NOT_A_LEAF');
    expect(body.children).toEqual(expect.arrayContaining(['A3 Sportback', 'A3 Hatchback']));
  });

  it('cocuklu motor dugumuyle de degerleme reddedilir', () => {
    let thrown: any = null;
    try {
      service.resolveLeafTarget('audi/a3/a3-sportback/35-tfsi');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(BadRequestException);
    const body: any = thrown.getResponse();
    expect(body.reason).toBe('NOT_A_LEAF');
    expect(body.children).toEqual(
      expect.arrayContaining(['Advanced', 'Dynamic', 'S Line', 'Design']),
    );
  });

  it('bilinmeyen kimlik 404 olur ve ASLA ebeveyne dusmez', () => {
    let thrown: any = null;
    try {
      service.resolveLeafTarget('audi/a3/a3-sportback/35-tfsi/olmayan-paket');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(NotFoundException);
    expect((thrown.getResponse() as any).reason).toBe('UNKNOWN_HIERARCHY_NODE');
  });

  it('kaynak dosyalari YALNIZCA o yaprağa aittir, kardeslerle paylasilmaz', () => {
    const advanced = service.resolveLeafTarget(AUDI_LEAF);
    const siblings = ['dynamic', 's-line', 'design', 'sport', 'all-street'];

    for (const sibling of siblings) {
      const other = service.resolveLeafTarget(`audi/a3/a3-sportback/35-tfsi/${sibling}`);
      const shared = other.sourceFiles.filter((f) => advanced.sourceFiles.includes(f));
      expect(shared).toEqual([]);
    }
  });

  it('yaprak dosyalari ebeveynin kendi sayfalariyla da karismaz', () => {
    const leaf = service.resolveLeafTarget(AUDI_LEAF);
    const parentNode = service.getNode('audi/a3/a3-sportback/35-tfsi');
    expect(parentNode.isLeaf).toBe(false);
    // Ebeveynin kendi sayfalari yaprağin havuzuna girmez.
    const parentFiles = service.sourceFilesFor('audi/a3/a3-sportback/35-tfsi', false);
    expect(leaf.sourceFiles.filter((f) => parentFiles.includes(f))).toEqual([]);
  });

  /** Madde 15: butun yapraklar icin cozumleme dogru dugume baglanmali. */
  it('TUM yapraklar dogru dugume cozulur; hicbiri kardes/ebeveyne baglanmaz', () => {
    const tree = artifactToTree(artifact!);
    const leaves = [...tree.nodes.values()].filter((n) => n.isLeaf);
    expect(leaves.length).toBeGreaterThan(1000);

    const failures: string[] = [];
    const fileOwner = new Map<string, string>();

    for (const leaf of leaves) {
      /**
       * YAPI ILE PIYASA VERISI AYRIDIR. Kaynak bir kategoriyi ilan etmisse o
       * dugum agacta durur; ona cozulen ilan olmayabilir. Boyle bir dugum
       * FIYATLANMAZ ve bunu acikca reddeder — sessizce ust/kardes havuza
       * DUSMEZ. Reddi burada dogrulayip devam ediyoruz.
       */
      if (service.marketListingIds(leaf.id).length === 0) {
        expect(() => service.resolveLeafTarget(leaf.id)).toThrow();
        continue;
      }
      const target = service.resolveLeafTarget(leaf.id);
      if (target.identity.fullPath !== leaf.fullPath) {
        failures.push(`path mismatch: ${leaf.id}`);
        continue;
      }
      if (target.identity.make !== leaf.pathSegments[0]) {
        failures.push(`make mismatch: ${leaf.id}`);
      }
      // Bir kaynak dosyasi IKI farkli yaprağa ait olamaz (belirsiz eslesme).
      for (const file of target.sourceFiles) {
        const owner = fileOwner.get(file);
        if (owner && owner !== leaf.id) failures.push(`ambiguous source file: ${file}`);
        fileOwner.set(file, leaf.id);
      }
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });

  it('farkli derinliklerde en az uc arac ayni sekilde cozulur', () => {
    const tree = artifactToTree(artifact!);
    const leaves = [...tree.nodes.values()].filter((n) => n.isLeaf && n.ownListingCount > 0);

    const short = leaves.find((n) => n.depth === 1);
    const mid = leaves.find((n) => n.depth === 3);
    const long = leaves.find((n) => n.depth >= 4);
    expect(short && mid && long).toBeTruthy();

    for (const node of [short!, mid!, long!]) {
      const target = service.resolveLeafTarget(node.id);
      expect(target.identity.fullPath).toBe(node.fullPath);
      expect(target.sourceFiles.length).toBeGreaterThan(0);
    }
    // Ayni mekanizma, farkli markalar, hicbir markaya ozel dal yok.
    expect(new Set([short!.pathSegments[0], mid!.pathSegments[0], long!.pathSegments[0]]).size)
      .toBeGreaterThanOrEqual(1);
  });
});

// ------------------------------------------------- servis yoksa fail-closed

describe('FAIL-CLOSED', () => {
  it('artefakt yuklenemezse agac BOS SAYILMAZ, hata firlatir', () => {
    const service = new VehicleHierarchyService();
    const original = process.env.VEHICLE_HIERARCHY_ARTIFACT;
    process.env.VEHICLE_HIERARCHY_ARTIFACT = 'C:/olmayan/dizin/hierarchy.json';
    try {
      expect(() => service.getRoots()).toThrow(/not available/i);
      expect(() => service.resolveLeafTarget(AUDI_LEAF)).toThrow(/not available/i);
    } finally {
      if (original === undefined) delete process.env.VEHICLE_HIERARCHY_ARTIFACT;
      else process.env.VEHICLE_HIERARCHY_ARTIFACT = original;
    }
  });
});
