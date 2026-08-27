/**
 * HEDEFLI KAPSAMA KUYRUGU SOZLESMELERI.
 *
 * Burada imkansiz kilinan seyler: zaten elimizde olan bir sayfayi tekrar
 * istemek, tahmin edilmis bir URL'e kor istek gondermek, ve yanlis sayfayi
 * "toplandi" diye isaretlemek.
 */
import {
  breadcrumbMatchesTarget,
  buildCoverageQueue,
  CoverageTarget,
  isSuccessful,
  pathKey,
} from './coverage-queue';

function target(over: Partial<CoverageTarget> = {}): CoverageTarget {
  return {
    make: 'Audi',
    fullPath: ['Audi', 'A3', 'A3 Sedan'],
    categoryUrl: '/audi-a3-a3-sedan',
    urlSource: 'NAV_HREF',
    priority: 'A',
    recoveredMarketRows: 0,
    subtreeMarketRows: 593,
    navResultCount: 3125,
    knownChildren: 3,
    ...over,
  };
}

describe('KUYRUK YALNIZCA GERCEKTEN EKSIK SAYFALARI ICERIR', () => {
  it('yalnizca istenen oncelikleri alir', () => {
    const q = buildCoverageQueue([
      target(),
      target({ priority: 'B', categoryUrl: '/b', fullPath: ['B'] }),
      target({ priority: 'D', categoryUrl: '/d', fullPath: ['D'] }),
    ]);
    expect(q.targets.map((t) => t.categoryUrl)).toEqual(['/audi-a3-a3-sedan']);
    expect(q.skippedOtherPriority).toBe(2);
  });

  /** Bir ust sayfa toplandiginda hedef kendiliginden dusmeli. */
  it('diskte zaten olan kategoriyi TEKRAR istemez', () => {
    const q = buildCoverageQueue([target()], {
      alreadyPresent: new Set([pathKey(['Audi', 'A3', 'A3 Sedan'])]),
    });
    expect(q.targets).toEqual([]);
    expect(q.skippedAlreadyPresent).toBe(1);
  });

  it('checkpoint\'te tamamlanmis hedefi TEKRAR istemez', () => {
    const q = buildCoverageQueue([target()], { completed: new Set(['/audi-a3-a3-sedan']) });
    expect(q.targets).toEqual([]);
    expect(q.skippedCompleted).toBe(1);
  });

  /**
   * Tahmin edilmis URL'e kor istek GONDERILMEZ; ayri inceleme kuyruguna alinir.
   */
  it('kaynak href\'i olmayan hedefi kuyruga ALMAZ, incelemeye ayirir', () => {
    const q = buildCoverageQueue([target({ urlSource: 'DERIVED_FROM_PATH' })]);
    expect(q.targets).toEqual([]);
    expect(q.needsReview).toHaveLength(1);
  });

  it('duman kosusu icin ilk N hedefi DETERMINISTIK verir', () => {
    const many = [1, 2, 3, 4, 5].map((i) =>
      target({ categoryUrl: `/x-${i}`, fullPath: ['X', String(i)] }),
    );
    const a = buildCoverageQueue(many, { limit: 3 });
    const b = buildCoverageQueue(many, { limit: 3 });
    expect(a.targets.map((t) => t.categoryUrl)).toEqual(['/x-1', '/x-2', '/x-3']);
    expect(b.targets.map((t) => t.categoryUrl)).toEqual(a.targets.map((t) => t.categoryUrl));
  });

  it('kok listesi kopruye uygun bicimdedir', () => {
    const q = buildCoverageQueue([target()]);
    expect(q.roots).toEqual([{ path: '/audi-a3-a3-sedan', label: 'A3 Sedan' }]);
  });
});

describe('YANLIS SAYFA TAMAMLANDI SAYILMAZ', () => {
  it('breadcrumb hedefle birebir esitse kabul', () => {
    const r = breadcrumbMatchesTarget(['Audi', 'A3', 'A3 Sedan'], target());
    expect(r).toEqual({ ok: true, reason: 'OK' });
  });

  /** Kaynak ust kategoriye yonlendirirse bu BASARI DEGILDIR. */
  it('ust kategoriye yonlendirme REDDEDILIR', () => {
    const r = breadcrumbMatchesTarget(['Audi', 'A3'], target());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('REDIRECT_MISMATCH');
  });

  it('breadcrumb yoksa kabul edilmez', () => {
    expect(breadcrumbMatchesTarget(null, target()).reason).toBe('NO_BREADCRUMB');
    expect(breadcrumbMatchesTarget([], target()).reason).toBe('NO_BREADCRUMB');
  });

  it('yalnizca SUCCESS ve ALREADY_PRESENT tamamlanmis sayilir', () => {
    expect(isSuccessful('SUCCESS')).toBe(true);
    expect(isSuccessful('ALREADY_PRESENT')).toBe(true);
    for (const bad of [
      'REDIRECT_MISMATCH',
      'CAPTCHA',
      'LOGIN_REQUIRED',
      'ACCESS_RESTRICTED',
      'NETWORK_ERROR',
      'PARSE_ERROR',
      'UNKNOWN_PAGE',
    ] as const) {
      expect(isSuccessful(bad)).toBe(false);
    }
  });
});
