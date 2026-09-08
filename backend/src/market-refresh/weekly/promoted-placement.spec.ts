/**
 * VITRIN (promoted) SATIRLARI — kronoloji ve sinir guvenligi.
 *
 * Gercek 25 hedefli kanarya (`market-canary-25-2026-09-08`) 5 hedefi
 * `VALIDATION_FAIL page is not newest-first` ile dusurdu. Kaydedilmis HTML,
 * her ihlalin kaynagin `searchResultsPromoSuper` satiri oldugunu kanitladi:
 * satir tarih sirasindan BAGIMSIZ bir yuvaya sabitlenir. 24 sayfada 7 vitrin
 * satiri vardi; 2'si yalnizca komsu organik satirla AYNI tarihe denk geldigi
 * icin gecmisti — yani gecmeleri SANSTI.
 *
 * Kural: vitrin satiri GERCEK bir ilandir (ayristirilir, tekilestirilir,
 * dogrulamayi gecerse havuza girer) ama KONUMU zaman kaniti degildir.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PageBatch } from '../autopilot/autopilot-contracts';
import { buildIncrementalPageUrl } from '../autopilot/source-url';
import { AtomicChecksummedFile } from '../checkpoint-store';
import { categoryPage } from '../__fixtures__/structure-page';
import { AtomicWeeklyMarketPublisher } from './artifact-publisher';
import { WeeklyEvidenceStore } from './evidence-store';
import {
  buildMarketTargetSnapshot,
  MarketTarget,
  MarketTargetSnapshot,
} from './hierarchy-gate';
import { isPromotedPlacementClass, parseRawWeeklyPage } from './raw-page';
import { TargetStateStore } from './target-state-store';
import {
  WeeklyCheckpointPayload,
  WeeklyMarketSession,
  WeeklySessionOptions,
} from './weekly-session';
import { testTree } from './__fixtures__/tree';

const BASE = 'https://www.sahibinden.com/';
const NOW = new Date('2026-09-11T12:00:00Z');

let dir: string;
let snapshot: MarketTargetSnapshot;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-promo-'));
  snapshot = buildMarketTargetSnapshot(testTree());
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const target = (suffix = '/advanced'): MarketTarget =>
  snapshot.targets.find((item) => item.targetId.endsWith(suffix))!;

/** [ilan kimligi, tarih metni, vitrin mi] */
type Row = [string, string] | [string, string, boolean];

function batch(
  runId: string,
  page: number,
  rows: Row[],
  hasNextPage: boolean,
): PageBatch {
  const exact = target();
  const rawHtml = categoryPage({
    chain: exact.pathSegments.map((label, index) => ({
      label,
      slug: exact.pathSegments
        .slice(0, index + 1)
        .join('-')
        .toLocaleLowerCase('tr'),
    })),
    rows: rows.map(([id, date, promoted]) => ({
      id,
      date,
      model: '',
      promoted: Boolean(promoted),
    })),
    nextPage: hasNextPage,
  });
  return {
    runId,
    nodePath: exact.categoryPath,
    page,
    categoryText: exact.fullPath,
    pageUrl: buildIncrementalPageUrl(BASE, exact.categoryPath, page),
    hasNextPage,
    parseFailures: 0,
    rawHtml,
    cards: rows.map(([id, date]) => ({
      sourceListingId: id,
      href: `/ilan/${id}`,
      title: id,
      priceText: '1.000.000 TL',
      mileageText: '10.000 km',
      yearText: '2022',
      locationText: 'İstanbul',
      modelCells: [],
      listingDateText: date,
    })),
  };
}

function options(
  runId: string,
  over: Partial<WeeklySessionOptions> = {},
): WeeklySessionOptions {
  const runDir = path.join(dir, runId);
  return {
    runId,
    source: 'sahibinden',
    baseUrl: BASE,
    tree: testTree(),
    snapshot,
    selectedTargetIds: [target().targetId],
    checkpointFile: new AtomicChecksummedFile<WeeklyCheckpointPayload>(
      path.join(runDir, 'checkpoint.json'),
    ),
    evidence: new WeeklyEvidenceStore(path.join(runDir, 'raw.jsonl')),
    states: new TargetStateStore(path.join(dir, 'states.json')),
    publisher: new AtomicWeeklyMarketPublisher(path.join(dir, 'published')),
    rawPageDir: path.join(runDir, 'raw-pages'),
    boundaryPolicy: { minAnchorMatches: 3 },
    anchorSize: 5,
    random: () => 0.5,
    now: () => NOW,
    ...over,
  };
}

function run(
  runId: string,
  over: Partial<WeeklySessionOptions> = {},
): WeeklyMarketSession {
  const session = WeeklyMarketSession.start(options(runId, over));
  session.nextDirective();
  return session;
}

const stateOf = () =>
  new TargetStateStore(path.join(dir, 'states.json')).get(target().targetId)!;

describe('vitrin satiri siniflandirmasi', () => {
  it('yalnizca sabitlenmis vitrin yuvasini isaretler; gorsel vurgu organiktir', () => {
    expect(
      isPromotedPlacementClass('searchResultsItem searchResultsPromoSuper'),
    ).toBe(true);
    expect(
      isPromotedPlacementClass('searchResultsItem   searchResultsPromoSuper   '),
    ).toBe(true);
    /**
     * Bu iki bicim kaydedilmis kanitta KENDI tarih sirasindaydi (yalnizca
     * gorsel vurgu); organik saymak siralama denetimini guclu tutar.
     */
    expect(
      isPromotedPlacementClass(
        'searchResultsItem searchResultsPromoHighlight searchResultsPromoBold',
      ),
    ).toBe(false);
    expect(
      isPromotedPlacementClass(
        'searchResultsItem premium-plus-container-for-search',
      ),
    ).toBe(false);
    expect(isPromotedPlacementClass('searchResultsItem')).toBe(false);
    expect(isPromotedPlacementClass(null)).toBe(false);
  });

  it('ilan kimligi araligina gore DEGIL, DOM sinifina gore siniflandirir', () => {
    // 846xxxxxx bir KORELASYONDU; siniflandirici kaynak semantigidir.
    const html = categoryPage({
      chain: [{ label: 'Audi', slug: 'audi' }],
      rows: [
        { id: '846893027', model: '', date: '3 Eylül 2026' },
        { id: '1331025298', model: '', date: '2 Eylül 2026', promoted: true },
      ],
    });
    const rows = parseRawWeeklyPage(html).rows;
    expect(rows.find((r) => r.sourceListingId === '846893027')!.isPromoted).toBe(
      false,
    );
    expect(
      rows.find((r) => r.sourceListingId === '1331025298')!.isPromoted,
    ).toBe(true);
  });
});

describe('kronoloji dogrulamasi', () => {
  // CASE A — eski organik satirlar arasinda DAHA YENI tarihli vitrin satiri.
  it('A: organik satirlar arasina giren daha yeni vitrin satiri sayfayi dusurmez', () => {
    const session = run('case-a');
    const result = session.submitPageBatch(
      batch(
        'case-a',
        1,
        [
          ['201', '27 Ağustos 2026'],
          ['846893027', '3 Eylül 2026', true],
          ['202', '27 Ağustos 2026'],
        ],
        false,
      ),
    );
    expect(result).toMatchObject({
      targetComplete: true,
      boundaryReached: true,
    });
    expect(session.summary().targetsFailed).toBe(0);
    // Ilan ATILMAZ: uc satir da kanit olarak yazilir.
    expect(result.accepted).toBe(3);
  });

  // CASE B — tarihi komsusuyla AYNI olan vitrin satiri (kanaryada sansla gecen durum).
  it('B: ayni tarihli vitrin satiri da gecerlidir', () => {
    const session = run('case-b');
    const result = session.submitPageBatch(
      batch(
        'case-b',
        1,
        [
          ['301', '5 Eylül 2026'],
          ['846784510', '5 Eylül 2026', true],
          ['302', '4 Eylül 2026'],
        ],
        false,
      ),
    );
    expect(result).toMatchObject({ targetComplete: true });
    expect(session.summary().targetsFailed).toBe(0);
  });

  // CASE C — birden fazla vitrin satiri, rastgele konumlarda.
  it('C: birden fazla vitrin satiri organik akisi bozmaz', () => {
    const session = run('case-c');
    const result = session.submitPageBatch(
      batch(
        'case-c',
        1,
        [
          ['846000001', '9 Eylül 2026', true],
          ['401', '5 Eylül 2026'],
          ['846000002', '8 Eylül 2026', true],
          ['402', '4 Eylül 2026'],
          ['846000003', '7 Eylül 2026', true],
          ['403', '3 Eylül 2026'],
        ],
        false,
      ),
    );
    expect(result).toMatchObject({ targetComplete: true });
    expect(session.summary().targetsFailed).toBe(0);
    expect(result.accepted).toBe(6);
  });

  // CASE D — GERCEK organik ihlal: eskisi gibi KAPALI dusmeli.
  it('D: iki organik satir newest-first ihlal ederse hedef yine duser', () => {
    const session = run('case-d');
    const result = session.submitPageBatch(
      batch(
        'case-d',
        1,
        [
          ['501', '27 Ağustos 2026'],
          ['502', '3 Eylül 2026'],
        ],
        false,
      ),
    );
    expect(result).toMatchObject({
      targetFailed: true,
      failureCode: 'VALIDATION_FAIL',
      watermarkCommitted: false,
      targetComplete: false,
    });
    expect(session.summary().failures[0].message).toContain('not newest-first');
    expect(stateOf().previousBoundaryDate).toBeNull();
  });

  it('D2: ihlal mesaji SAYFADAKI gercek kart konumunu bildirir', () => {
    const session = run('case-d2');
    session.submitPageBatch(
      batch(
        'case-d2',
        1,
        [
          ['601', '5 Eylül 2026'],
          ['846000009', '9 Eylül 2026', true],
          ['602', '4 Eylül 2026'],
          ['603', '8 Eylül 2026'],
        ],
        false,
      ),
    );
    // Organik akisin 3. uyesi ama SAYFANIN 4. karti — kanit izlenebilir kalir.
    expect(session.summary().failures[0].message).toContain('at card 4');
  });
});

describe('sinir guvenligi', () => {
  // CASE E — vitrin satiri sinir/capa kararini SURUKLEYEMEZ.
  it('E: taahhut edilen sinir tarihi vitrin satirindan DEGIL organik akistan gelir', () => {
    const session = run('case-e');
    session.submitPageBatch(
      batch(
        'case-e',
        1,
        [
          ['701', '5 Eylül 2026'],
          ['846000010', '10 Eylül 2026', true],
          ['702', '4 Eylül 2026'],
        ],
        false,
      ),
    );
    const state = stateOf();
    expect(state.status).toBe('COMPLETE');
    // Vitrin 10 Eylul olsa da sinir en yeni ORGANIK gun olan 5 Eylul'dur.
    expect(state.previousBoundaryDate).toBe('2026-09-05');
    expect(state.seenListingIdsAtBoundary).not.toContain('846000010');
    expect(state.overlapAnchorIds).not.toContain('846000010');
  });

  it('E2: sabitlenmis vitrin satiri "onceki sinira ulasildi" kaniti uretemez', () => {
    // Ilk kosu: sinir 5 Eylul, capalar organik.
    const first = run('case-e2');
    first.submitPageBatch(
      batch(
        'case-e2',
        1,
        [
          ['801', '5 Eylül 2026'],
          ['802', '4 Eylül 2026'],
          ['803', '3 Eylül 2026'],
          ['804', '2 Eylül 2026'],
        ],
        false,
      ),
    );
    const anchors = [...stateOf().overlapAnchorIds];
    expect(anchors.length).toBeGreaterThan(0);

    // Ikinci kosu: ayni capa kimlikleri YALNIZCA vitrin yuvasinda geri gelir.
    const second = run('case-e2b');
    const rows: Row[] = [['901', '9 Eylül 2026']];
    for (const anchor of anchors) rows.push([anchor, '4 Eylül 2026', true]);
    const result = second.submitPageBatch(batch('case-e2b', 1, rows, true));
    // Sinir KANITLANMADI: vitrin kimlikleri capa sayilmaz.
    expect(result.boundaryReached).toBe(false);
  });

  // CASE F — tekilestirme vitrin satirlarina da esit uygulanir.
  it('F: vitrin ilani da kararli kimlikle tekilestirilir', () => {
    const session = run('case-f');
    session.submitPageBatch(
      batch(
        'case-f',
        1,
        [
          ['1001', '9 Eylül 2026'],
          ['846000011', '9 Eylül 2026', true],
        ],
        true,
      ),
    );
    const second = session.submitPageBatch(
      batch(
        'case-f',
        2,
        [
          ['846000011', '9 Eylül 2026', true],
          ['1002', '8 Eylül 2026'],
        ],
        false,
      ),
    );
    expect(second.duplicates).toBe(1);
    expect(second.newCount).toBe(1);
  });
});
