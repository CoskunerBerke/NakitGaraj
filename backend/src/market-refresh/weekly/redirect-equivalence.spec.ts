/**
 * YONLENDIRME ESDEGERLIGI — kimlik kaniti, URL benzerligi DEGIL.
 *
 * Gercek gezinti kaniti (`structure-2026-09/captures.jsonl`, 6565 yakalama):
 * 635 GERCEK yonlendirme gozlendi, 25'i piyasa hedefi. Ornek:
 *   /alfa-romeo-156-2.5 -> /alfa-romeo-156-2.5-2.5   (kirinti degismedi)
 *
 * Guvenli kabul UC kanit ister: kategori sayfasi + kirinti hedefin TAM yoluna
 * esit + varis URL'sini BASKA dugum sahiplenmiyor. Ucuncusu sarttir: gercek
 * kanitta /abarth -> /abarth-500e kirintiyi korur ama varis URL'si cocuk
 * dugumun kendi adresidir.
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
  RedirectEquivalence,
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-redirect-'));
  snapshot = buildMarketTargetSnapshot(testTree());
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const target = (suffix = '/advanced'): MarketTarget =>
  snapshot.targets.find((item) => item.targetId.endsWith(suffix))!;

/** Dugum -> kaynak yolu. Varsayilan: her hedef kendi yolunu sahiplenir. */
function nodeUrls(extra: Record<string, string> = {}): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of snapshot.targets)
    map.set(item.targetId, item.categoryPath);
  for (const [id, url] of Object.entries(extra)) map.set(id, url);
  return map;
}

/**
 * @param finalUrl tarayicinin GERCEK varis adresi (yonlendirme benzetimi)
 * @param chainLabels varis sayfasinin kirintisi
 */
function batch(
  runId: string,
  page: number,
  rows: Array<[string, string]>,
  hasNextPage: boolean,
  finalUrl?: string,
  chainLabels?: string[],
): PageBatch {
  const exact = target();
  const labels = chainLabels ?? exact.pathSegments;
  const rawHtml = categoryPage({
    chain: labels.map((label, index) => ({
      label,
      slug: labels
        .slice(0, index + 1)
        .join('-')
        .toLocaleLowerCase('tr'),
    })),
    rows: rows.map(([id, date]) => ({ id, date, model: '' })),
    nextPage: hasNextPage,
  });
  return {
    runId,
    nodePath: exact.categoryPath,
    page,
    categoryText: exact.fullPath,
    pageUrl:
      finalUrl ?? buildIncrementalPageUrl(BASE, exact.categoryPath, page),
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
    sourcePathsByNode: nodeUrls(),
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

const ROWS: Array<[string, string]> = [
  ['9001', '5 Eylül 2026'],
  ['9002', '4 Eylül 2026'],
];

/** Alfa 156 / 2.5 ile ayni sekil: son parca TEKRARLANIR. */
const repeatedTailUrl = (): string => {
  const exact = target();
  const tail = exact.categoryPath.split('-').slice(-1)[0];
  return `${BASE.replace(/\/$/, '')}${exact.categoryPath}-${tail}?sorting=date_desc&pagingSize=50`;
};

describe('kanitlanmis esdeglik KABUL edilir', () => {
  // CASE A — Alfa 156 / 2.5 sekli.
  it('A: kirinti ayni + varis URL sahipsiz ise yonlendirme kabul edilir', () => {
    const session = run('case-a');
    const result = session.submitPageBatch(
      batch('case-a', 1, ROWS, false, repeatedTailUrl()),
    );
    expect(result).toMatchObject({
      targetComplete: true,
      boundaryReached: true,
    });
    expect(session.summary().targetsFailed).toBe(0);
  });

  // CASE E — sadece sayfalama/siralama farki zaten normalize edilir.
  it('E: pagingSize/sorting farki sahte uyumsuzluk yaratmaz', () => {
    const session = run('case-e');
    const exact = target();
    const url = `${BASE.replace(/\/$/, '')}${exact.categoryPath}?pagingSize=20&sorting=date_asc&pagingOffset=50`;
    const result = session.submitPageBatch(
      batch('case-e', 1, ROWS, false, url),
    );
    expect(result.targetComplete).toBe(true);
    expect(session.summary().targetsFailed).toBe(0);
  });

  // CASE F + G — kimlik ve filigran ANAHTARI istenen hedefte kalir.
  it('F/G: esdeglik kanitlansa da kimlik/filigran/yerlestirme ISTENEN hedefe yazilir', () => {
    const session = run('case-fg');
    const result = session.submitPageBatch(
      batch('case-fg', 1, ROWS, false, repeatedTailUrl()),
    );
    expect(result.watermarkCommitted).toBe(true);

    const wanted = target().targetId;
    const state = new TargetStateStore(path.join(dir, 'states.json')).get(
      wanted,
    )!;
    expect(state.targetId).toBe(wanted);
    expect(state.status).toBe('COMPLETE');
    expect(state.previousBoundaryDate).toBe('2026-09-05');

    // Kanit satirlari yalnizca ISTENEN hedefe baglanir.
    const raw = fs
      .readFileSync(path.join(dir, 'case-fg', 'raw.jsonl'), 'utf-8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { requestedTargetId: string });
    expect(raw.length).toBe(2);
    for (const record of raw) expect(record.requestedTargetId).toBe(wanted);

    // Diger hedeflerin filigrani ETKILENMEZ.
    const sibling = new TargetStateStore(path.join(dir, 'states.json')).get(
      target('/s-line').targetId,
    );
    expect(sibling?.status ?? 'FRESH').not.toBe('COMPLETE');
  });
});

describe('kanitlanmamis yonlendirme REDDEDILIR', () => {
  const rejects = (session: WeeklyMarketSession, needle: string) => {
    const summary = session.summary();
    expect(summary.targetsFailed).toBe(1);
    expect(summary.failures[0].code).toBe('REDIRECT_MISMATCH');
    expect(summary.failures[0].message).toContain(needle);
    const state = new TargetStateStore(path.join(dir, 'states.json')).get(
      target().targetId,
    )!;
    expect(state.status).not.toBe('COMPLETE');
    expect(state.previousBoundaryDate).toBeNull();
  };

  // CASE B — ebeveyn -> cocuk (gercek kanitta /abarth -> /abarth-500e sekli).
  it('B: varis URL BASKA (alt) dugumun adresi ise reddedilir', () => {
    const childUrl = `${target().categoryPath}-ambiente`;
    const session = run('case-b', {
      sourcePathsByNode: nodeUrls({
        'audi/a3/a3-sportback/35-tfsi/advanced/ambiente': childUrl,
      }),
    });
    const result = session.submitPageBatch(
      batch(
        'case-b',
        1,
        ROWS,
        false,
        `${BASE.replace(/\/$/, '')}${childUrl}?sorting=date_desc&pagingSize=50`,
      ),
    );
    expect(result).toMatchObject({
      targetFailed: true,
      failureCode: 'REDIRECT_MISMATCH',
      watermarkCommitted: false,
    });
    rejects(session, 'URL belongs to node');
  });

  // CASE C — kardes dugume yonlendirme.
  it('C: kardes dugumun adresine yonlendirme reddedilir', () => {
    const sibling = target('/s-line');
    const session = run('case-c');
    session.submitPageBatch(
      batch(
        'case-c',
        1,
        ROWS,
        false,
        `${BASE.replace(/\/$/, '')}${sibling.categoryPath}?sorting=date_desc&pagingSize=50`,
      ),
    );
    rejects(session, 'URL belongs to node');
  });

  // CASE D — alakasiz kategori: kirinti tutmaz.
  it('D: alakasiz kategoriye yonlendirme reddedilir', () => {
    const session = run('case-d');
    session.submitPageBatch(
      batch(
        'case-d',
        1,
        ROWS,
        false,
        `${BASE.replace(/\/$/, '')}/bmw-a3?sorting=date_desc&pagingSize=50`,
        ['BMW', 'A3'],
      ),
    );
    rejects(session, 'breadcrumb');
  });

  it('D2: ayni URL sekli ama kirinti COCUGU gosteriyorsa reddedilir', () => {
    // Gercek kanit: /dacia-jogger-1.6-hybrid -> /dacia-jogger-1.6-extreme
    // kirintiyi "1.6 Hybrid" -> "1.6" degistirmisti.
    const session = run('case-d2');
    session.submitPageBatch(
      batch('case-d2', 1, ROWS, false, repeatedTailUrl(), [
        ...target().pathSegments,
        'Ambiente',
      ]),
    );
    rejects(session, 'breadcrumb');
  });

  it('D3: kanit yoksa esdeglik kanitlanamaz ve muhafiz kati kalir', () => {
    const session = run('case-d3', { sourcePathsByNode: undefined });
    session.submitPageBatch(
      batch('case-d3', 1, ROWS, false, repeatedTailUrl()),
    );
    rejects(session, 'no source-path evidence');
  });
});

describe('esdeglik DENETIM IZI', () => {
  /** Kontrol noktasindan ilk hedefin KALICI kaydi. */
  const marker = (): RedirectEquivalence | null => {
    const payload = (
      JSON.parse(
        fs.readFileSync(path.join(dir, 'obs', 'checkpoint.json'), 'utf-8'),
      ) as { payload: WeeklyCheckpointPayload }
    ).payload;
    return payload.items[0].redirectEquivalence;
  };

  // CASE A — kanit yolu calisti: isaret kurulur ve iki adres de kaydedilir.
  it('A: kanitlanmis yonlendirme isaretlenir; istenen ve varis adresi kaydedilir', () => {
    const session = run('obs');
    const result = session.submitPageBatch(
      batch('obs', 1, ROWS, false, repeatedTailUrl()),
    );
    expect(result.targetComplete).toBe(true);

    const found = marker();
    expect(found).toMatchObject({
      accepted: true,
      requestedCategoryUrl: target().categoryPath,
      proof: 'BREADCRUMB_IDENTITY_AND_UNIQUE_URL',
    });
    // Varis adresi sorgu parametreleri OLMADAN saklanir.
    expect(found!.finalCategoryUrl).toBe(
      `${target().categoryPath}-${target().categoryPath.split('-').slice(-1)[0]}`,
    );
    expect(found!.finalCategoryUrl).not.toContain('?');
    expect(typeof found!.at).toBe('string');

    const summary = session.summary();
    expect(summary.redirectEquivalenceAccepted).toBe(1);
    expect(summary.redirectEquivalenceTargetIds).toEqual([target().targetId]);

    // Kimlik DEGISMEZ: durum anahtari hala istenen hedef.
    const state = new TargetStateStore(path.join(dir, 'states.json')).get(
      target().targetId,
    )!;
    expect(state.targetId).toBe(target().targetId);
    expect(state.status).toBe('COMPLETE');
  });

  // CASE B — ayni URL: isaret KURULMAZ.
  it('B: ayni adresli hedef isaretlenmez', () => {
    const session = run('obs');
    const result = session.submitPageBatch(batch('obs', 1, ROWS, false));
    expect(result.targetComplete).toBe(true);
    expect(marker()).toBeNull();
    expect(session.summary().redirectEquivalenceAccepted).toBe(0);
    expect(session.summary().redirectEquivalenceTargetIds).toEqual([]);
  });

  it('B2: yalnizca sayfalama/siralama farki da isaretlenmez', () => {
    const session = run('obs');
    const exact = target();
    const url = `${BASE.replace(/\/$/, '')}${exact.categoryPath}?pagingSize=20&sorting=date_asc`;
    session.submitPageBatch(batch('obs', 1, ROWS, false, url));
    expect(marker()).toBeNull();
    expect(session.summary().redirectEquivalenceAccepted).toBe(0);
  });

  // CASE C — reddedilen yonlendirme KABUL olarak isaretlenmez.
  it('C: kardes/cocuk dugume yonlendirme isaretlenmez', () => {
    const childUrl = `${target().categoryPath}-ambiente`;
    const session = run('obs', {
      sourcePathsByNode: nodeUrls({
        'audi/a3/a3-sportback/35-tfsi/advanced/ambiente': childUrl,
      }),
    });
    session.submitPageBatch(
      batch(
        'obs',
        1,
        ROWS,
        false,
        `${BASE.replace(/\/$/, '')}${childUrl}?sorting=date_desc`,
      ),
    );
    expect(marker()).toBeNull();
    expect(session.summary().redirectEquivalenceAccepted).toBe(0);
    expect(session.summary().targetsFailed).toBe(1);
  });

  // CASE D — kanit haritasi yoksa kati kalir ve isaretlenmez.
  it('D: kanit haritasi yokken reddedilir ve isaretlenmez', () => {
    const session = run('obs', { sourcePathsByNode: undefined });
    session.submitPageBatch(batch('obs', 1, ROWS, false, repeatedTailUrl()));
    expect(marker()).toBeNull();
    expect(session.summary().redirectEquivalenceAccepted).toBe(0);
    expect(session.summary().targetsFailed).toBe(1);
  });
});
