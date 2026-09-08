/**
 * SAYFALAR ARASI ORTUSME — ZARARSIZ KAYMA ile GERCEK IHLAL AYRIMI.
 *
 * OLCULEN OLAY (`audi/a3/a3-sedan/1-6-tdi/attraction`, 2026-09-08 21:32):
 * sayfa 4 ile sayfa 5 arasinda pencerenin USTUNDEKI 7 ilan yayindan kalkti,
 * ofset kisalmis kumede 7 sira geriye dustu ve sayfa 5, sayfa 4'un kuyrugunu
 * (kart 45-51) yeniden servis etti. Sayfa 5'in en yenisi 08-28, sayfa 4'un
 * en eskisi 08-27 oldugu icin `pagination is not newest-first across pages`
 * patladi ve 4 sayfalik saglam kanit cope gitti.
 *
 * Kanit (kaydedilmis HTML): tekrar eden 7 satir PROMOSYON DEGIL, kimlikleri
 * KARARLI ve zaten gorulmus; her sayfa KENDI icinde dogru siralı; tarih
 * ayristirmasi dogru. Yani ihlal degil, ORTUSME.
 *
 * Kural: capraz sayfa denetimi yalnizca GORULMEMIS satira bakar.
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-overlap-'));
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
  return {
    runId,
    nodePath: exact.categoryPath,
    page,
    categoryText: exact.fullPath,
    pageUrl: buildIncrementalPageUrl(BASE, exact.categoryPath, page),
    hasNextPage,
    parseFailures: 0,
    rawHtml: categoryPage({
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
    }),
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
    boundaryPolicy: { initialBaselinePages: 2, maxPagesPerTarget: 4 },
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

/** Gercek olayin sekli: sayfa 1 en eskisi 08-27 ile biter. */
const PAGE_ONE: Row[] = [
  ['100', '31 Ağustos 2026'],
  ['101', '30 Ağustos 2026'],
  ['102', '28 Ağustos 2026'],
  ['103', '28 Ağustos 2026'],
  ['104', '27 Ağustos 2026'],
];

const evidenceIds = (runId: string): string[] =>
  fs
    .readFileSync(path.join(dir, runId, 'raw.jsonl'), 'utf-8')
    .trim()
    .split('\n')
    .map(
      (line) =>
        (JSON.parse(line) as { sourceListingId: string }).sourceListingId,
    );

describe('A: gorulmus satirlarin ortusmesi ZARARSIZ', () => {
  it('sayfa 2, sayfa 1 kuyrugunu tekrar servis etse de hedef ILERLER', () => {
    const runId = 'overlap-benign';
    const session = run(runId);
    session.submitPageBatch(batch(runId, 1, PAGE_ONE, true));

    /**
     * Pencere geriye kaydi: 102/103 (08-28) ve 104 (08-27) TEKRAR geldi,
     * ardindan gorulmemis ve DAHA ESKI satirlar geliyor.
     */
    const result = session.submitPageBatch(
      batch(
        runId,
        2,
        [
          ['102', '28 Ağustos 2026'],
          ['103', '28 Ağustos 2026'],
          ['104', '27 Ağustos 2026'],
          ['200', '26 Ağustos 2026'],
          ['201', '25 Ağustos 2026'],
        ],
        false,
      ),
    );
    expect(result.targetFailed ?? false).toBe(false);
    expect(result).toMatchObject({
      targetComplete: true,
      boundaryReached: true,
    });
    expect(session.summary().targetsFailed).toBe(0);
  });
});

describe('B: GORULMEMIS yeni satir hala GERCEK ihlaldir', () => {
  it('daha once gorulmemis 08-28 satiri VALIDATION_FAIL uretir', () => {
    const runId = 'overlap-real';
    const session = run(runId);
    session.submitPageBatch(batch(runId, 1, PAGE_ONE, true));

    const result = session.submitPageBatch(
      batch(
        runId,
        2,
        [
          ['102', '28 Ağustos 2026'], // gorulmus — bakilmaz
          ['999', '28 Ağustos 2026'], // GORULMEMIS ve onceki en eskiden yeni
          ['200', '26 Ağustos 2026'],
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
    const message = session.summary().failures[0].message;
    expect(message).toContain('not newest-first across pages');
    // Kanit izlenebilir: hangi kart, hangi tarih karsilastirmasi.
    expect(message).toContain('at card 2');
    expect(message).toContain('2026-08-28 > 2026-08-27');
    // Filigran ILERLEMEZ.
    const state = new TargetStateStore(path.join(dir, 'states.json')).get(
      target().targetId,
    )!;
    expect(state.previousBoundaryDate).toBeNull();
  });
});

describe('C: ortusen satirlar TEKILESTIRILIR', () => {
  it('tekrar eden kimlikler iki kez yazilmaz ve iki kez atanmaz', () => {
    const runId = 'overlap-dedup';
    const session = run(runId);
    session.submitPageBatch(batch(runId, 1, PAGE_ONE, true));
    const second = session.submitPageBatch(
      batch(
        runId,
        2,
        [
          ['102', '28 Ağustos 2026'],
          ['103', '28 Ağustos 2026'],
          ['104', '27 Ağustos 2026'],
          ['200', '26 Ağustos 2026'],
        ],
        false,
      ),
    );
    expect(second.duplicates).toBe(3);
    expect(second.newCount).toBe(1);

    const ids = evidenceIds(runId);
    expect(ids.length).toBe(new Set(ids).size); // hic kopya yazim yok
    expect(ids.filter((id) => id === '102')).toHaveLength(1);

    // Tekil ilan sayisi: 5 + 1 yeni.
    expect(session.summary().newListings).toBe(6);
    expect(session.summary().exact).toBe(6);

    // Sinir capalari da tekrar eden kimligi iki kez tasimaz.
    const state = new TargetStateStore(path.join(dir, 'states.json')).get(
      target().targetId,
    )!;
    const anchors = [
      ...state.seenListingIdsAtBoundary,
      ...state.overlapAnchorIds,
    ];
    expect(anchors.length).toBe(new Set(anchors).size);
  });
});

describe('D/E/F: mevcut denetimler DEGISMEDI', () => {
  it('D: TEK sayfa icinde gercek organik siralama ihlali hala duser', () => {
    const runId = 'single-page';
    const session = run(runId);
    const result = session.submitPageBatch(
      batch(
        runId,
        1,
        [
          ['300', '27 Ağustos 2026'],
          ['301', '3 Eylül 2026'],
        ],
        false,
      ),
    );
    expect(result).toMatchObject({
      targetFailed: true,
      failureCode: 'VALIDATION_FAIL',
      watermarkCommitted: false,
    });
    expect(session.summary().failures[0].message).toContain(
      'page is not newest-first at card 2',
    );
  });

  it('E: vitrin satiri davranisi degismedi (kronolojiden HARIC, yutulmaz)', () => {
    const runId = 'promo';
    const session = run(runId);
    const result = session.submitPageBatch(
      batch(
        runId,
        1,
        [
          ['400', '27 Ağustos 2026'],
          ['846000001', '3 Eylül 2026', true], // vitrin: sirayi bozamaz
          ['401', '26 Ağustos 2026'],
        ],
        false,
      ),
    );
    expect(result.targetFailed ?? false).toBe(false);
    expect(result.accepted).toBe(3); // ilan ATILMAZ
    expect(session.summary().targetsFailed).toBe(0);
  });

  it('F: sayfalar arasi TARIH ESITLIGI ihlal degildir', () => {
    const runId = 'tie';
    const session = run(runId);
    session.submitPageBatch(batch(runId, 1, PAGE_ONE, true));
    // Gorulmemis satir, onceki sayfanin en eskisiyle AYNI gun: > degil.
    const result = session.submitPageBatch(
      batch(
        runId,
        2,
        [
          ['500', '27 Ağustos 2026'],
          ['501', '26 Ağustos 2026'],
        ],
        false,
      ),
    );
    expect(result.targetFailed ?? false).toBe(false);
    expect(result).toMatchObject({ targetComplete: true });
  });
});

describe('G: sonsuz sayfalama YOK', () => {
  it('yalnizca gorulmus kimlik iceren sayfalar sayfa tavaninda GUVENLE duser', () => {
    const runId = 'anti-loop';
    const session = run(runId, {
      // Sinir kaniti asla olusmasin: her sayfa ayni gorulmus satirlari versin.
      boundaryPolicy: { initialBaselinePages: 20, maxPagesPerTarget: 3 },
    });
    session.submitPageBatch(batch(runId, 1, PAGE_ONE, true));

    const repeat: Row[] = [
      ['102', '28 Ağustos 2026'],
      ['103', '28 Ağustos 2026'],
    ];
    // Sayfa 2: ilerleme yok ama patlamaz.
    const second = session.submitPageBatch(batch(runId, 2, repeat, true));
    expect(second.targetFailed ?? false).toBe(false);
    expect(second.newCount).toBe(0);

    // Sayfa 3: tavan doldu -> KAPALI duser, sonsuza kadar sayfalamaz.
    const third = session.submitPageBatch(batch(runId, 3, repeat, true));
    expect(third).toMatchObject({
      targetFailed: true,
      failureCode: 'VALIDATION_FAIL',
      watermarkCommitted: false,
    });
    expect(session.summary().failures[0].message).toContain(
      'safe boundary not proven',
    );
    // Filigran ILERLEMEZ.
    expect(
      new TargetStateStore(path.join(dir, 'states.json')).get(target().targetId)
        ?.previousBoundaryDate,
    ).toBeNull();
  });
});
