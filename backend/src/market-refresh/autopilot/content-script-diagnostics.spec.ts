/**
 * KIMLIKSIZ SATIR SINIFLANDIRMASI — GERCEK ICERIK BETIGI, GERCEK SECICI MOTORU.
 *
 * Kaynak her sonuc sayfasina kendi reklam yuvasini koyuyor: `searchResultsItem`
 * sinifli ama `data-id` TASIMAYAN bir satir. Uzanti bunu ayristirma hatasi
 * sayiyor, kopru de sayfayi reddediyordu:
 *   PARSE_ERROR page reported 1 row failure(s)
 *
 * OLCUM (2026-09-07, korpusun TAMAMI): 13.654 dosya, sonuc satiri tasiyan
 * 13.411 sayfa, 13.411 kimliksiz satir (sayfa basina tam bir tane). Sinif
 * imzasi TEK: "searchResultsItem nativeAd classicNativeAd". Hicbirinde
 * baslik, /ilan/ baglantisi, rakamli fiyat, tarih, nitelik ya da metin YOK.
 *
 * Kural bu yuzden DAR: kanitli reklam imzasi VE ilan kaniti yoklugu birlikte
 * aranir. Ilan kaniti tasiyan ya da imzasiz kimliksiz satir FAIL CLOSED kalir.
 *
 * Test, Chrome'un enjekte ettigi AYNI dosyayi Node `vm` ile calistirir; DOM
 * uretimdeki ayristiricinin da kullandigi cheerio (css-select) uzerine
 * kurulur, yani seciciler GERCEKTEN degerlendirilir. (jsdom 29 yalnizca ESM
 * tasiyan bir bagimlilik getiriyor ve bu CJS jest kurulumunda yuklenemiyor.)
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as cheerio from 'cheerio';
import { categoryPage } from '../__fixtures__/structure-page';
import { parseRawWeeklyPage } from '../weekly/raw-page';

const EXTENSION_DIR = path.resolve(
  __dirname,
  '../../../../chrome-extension/market-refresh-autopilot',
);
const read = (file: string) =>
  fs.readFileSync(path.join(EXTENSION_DIR, file), 'utf-8');

const PAGE_URL =
  'https://www.sahibinden.com/audi-a3-a3-sportback-35-tfsi-advanced?pagingSize=50&sorting=date_desc';

interface IgnoredRow {
  index: number;
  className: string;
  classifiedTitleText: string;
  classifiedTitleHref: string;
  priceText: string;
  listingDateText: string;
  innerTextSample: string;
  nativeAdMarkers: string[];
  listingEvidence: string[];
}

interface Observation {
  ok: boolean;
  cards: Array<{ sourceListingId: string; title: string }>;
  parseFailures: number;
  ignoredOrFailedRows: IgnoredRow[];
  ignoredNonListingRows: IgnoredRow[];
  ignoredNativeAds: number;
  hasNextPage: boolean;
}

/**
 * Icerik betiginin COLLECT_PAGE dalinda GERCEKTEN kullandigi DOM yuzeyi.
 * Secici cozumu cheerio'ya birakilir; burada yalnizca tarayici adlari baglanir.
 */
function domFrom(html: string) {
  const $ = cheerio.load(html);
  const cache = new Map<unknown, any>();

  function element(node: unknown): any {
    if (cache.has(node)) return cache.get(node);
    const el = {
      get className(): string {
        return $(node as never).attr('class') || '';
      },
      get textContent(): string {
        return $(node as never).text();
      },
      get classList() {
        const classes = ($(node as never).attr('class') || '').split(/\s+/);
        return { contains: (name: string) => classes.includes(name) };
      },
      getAttribute(name: string): string | null {
        const value = $(node as never).attr(name);
        return value === undefined ? null : value;
      },
      querySelector: (selector: string) =>
        wrap($(node as never).find(selector).get(0)),
      querySelectorAll: (selector: string) =>
        $(node as never)
          .find(selector)
          .get()
          .map(element),
    };
    cache.set(node, el);
    return el;
  }
  const wrap = (node: unknown) => (node ? element(node) : null);

  const document = {
    get title(): string {
      return $('title').text();
    },
    get body() {
      return wrap($('body').get(0));
    },
    get doctype() {
      return { name: 'html' };
    },
    get documentElement() {
      return { outerHTML: $.html() };
    },
    querySelector: (selector: string) => wrap($(selector).get(0)),
    querySelectorAll: (selector: string) => $(selector).get().map(element),
  };

  return { document };
}

/** Chrome'un enjekte ettigi dosyanin AYNISI, dokunulmadan. */
function observe(html: string, prepare?: (document: any) => void): Observation {
  const { document } = domFrom(html);
  if (prepare) prepare(document);
  const sandbox: Record<string, unknown> = {
    document,
    location: { href: PAGE_URL, origin: 'https://www.sahibinden.com' },
    URL,
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('content-script.js'), sandbox, {
    filename: 'content-script.js',
  });
  const result = (sandbox as any).__ngAutopilotObserve({
    type: 'COLLECT_PAGE',
    captureRawHtml: false,
  });
  // Gozlem zaten `executeScript` sinirinda seri hale geliyor; ayni sekli al.
  return JSON.parse(JSON.stringify(result)) as Observation;
}

/** Gercek kaynak satiri: `data-id` ONCE (sertlestirilmis ayristiricinin bekledigi sekil). */
function listingRow(id: string, title = 'Audi A3 Advanced'): string {
  return `
    <tr data-id="${id}" class="searchResultsItem">
      <td class="searchResultsTagAttributeValue">Advanced</td>
      <td><a class="classifiedTitle" href="/ilan/${id}/detay">${title}</a></td>
      <td class="searchResultsAttributeValue">2022</td>
      <td class="searchResultsAttributeValue">10.000 km</td>
      <td class="searchResultsPriceValue">1.850.000 TL</td>
      <td class="searchResultsDateValue">5 Eylül 2026</td>
      <td class="searchResultsLocationValue">İstanbul</td>
    </tr>`;
}

function page(rows: string): string {
  return `<!DOCTYPE html><html lang="tr"><head><title>Audi A3</title></head><body>
    <h1>Audi A3 A3 Sportback 35 TFSI Advanced</h1>
    <table><tbody>${rows}</tbody></table>
    <a class="prevNextBut" title="Sonraki" href="?pagingOffset=50"></a>
  </body></html>`;
}

/** KANITLANMIS reklam yuvasi: korpustaki 13.411 satirin tamaminin sekli. */
const NATIVE_AD_SLOT =
  '<tr class="searchResultsItem nativeAd classicNativeAd"><td></td></tr>';

/** Ayni yuva, canlida doldurulmus: promosyon metni ilan KANITI degildir. */
const RENDERED_NATIVE_AD = `
  <tr class="searchResultsItem nativeAd classicNativeAd">
    <td class="searchResultsTagAttributeValue">Sponsorlu</td>
    <td><a class="nativeAdLink" href="https://reklam.example.com/kampanya">Sıfır Audi kampanyası</a></td>
    <td class="searchResultsPriceValue">Kampanyalı</td>
    <td class="searchResultsDateValue">Vitrin</td>
  </tr>`;

const AUDI_CHAIN = [
  { label: 'Audi', slug: 'audi' },
  { label: 'A3', slug: 'audi-a3' },
  { label: 'A3 Sportback', slug: 'audi-a3-a3-sportback' },
  { label: '35 TFSI', slug: 'audi-a3-a3-sportback-35-tfsi' },
  { label: 'Advanced', slug: 'audi-a3-a3-sportback-35-tfsi-advanced' },
];

/** Gercek duman hedefinin sekli: paylasilan fikstur + kaynagin reklam yuvasi. */
function audiPage(
  listings: number,
  ads: { first?: boolean; last?: boolean } = {},
): { html: string; ids: string[] } {
  const ids = Array.from({ length: listings }, (_, i) => String(1300000000 + i));
  let html = categoryPage({
    chain: AUDI_CHAIN,
    rows: ids.map((id) => ({ id, model: 'Advanced', date: '5 Eylül 2026' })),
    nextPage: true,
  });
  if (ads.first) html = html.replace('<tbody>', `<tbody>${NATIVE_AD_SLOT}`);
  if (ads.last) html = html.replace('</tbody>', `${NATIVE_AD_SLOT}</tbody>`);
  return { html, ids };
}

// --------------------------------------------------- A) KANITLI REKLAM YUVASI

describe('A) THE PROVEN NATIVE-AD SLOT IS NOT A PARSE FAILURE', () => {
  it('1) ignores the empty nativeAd classicNativeAd row without counting a failure', () => {
    const result = observe(page(`${listingRow('1')}${NATIVE_AD_SLOT}${listingRow('2')}`));

    expect(result.parseFailures).toBe(0);
    expect(result.ignoredOrFailedRows).toEqual([]);
    expect(result.ignoredNativeAds).toBe(1);
    expect(result.cards.map((card) => card.sourceListingId)).toEqual(['1', '2']);
    expect(result.ignoredNonListingRows).toHaveLength(1);
    expect(result.ignoredNonListingRows[0]).toMatchObject({
      index: 1,
      className: 'searchResultsItem nativeAd classicNativeAd',
      nativeAdMarkers: ['nativeAd', 'classicNativeAd'],
      listingEvidence: [],
    });
  });

  it('2) ignores a rendered ad with promotional text, but only on the proven signature', () => {
    const proven = observe(page(`${RENDERED_NATIVE_AD}${listingRow('1')}`));
    expect(proven.parseFailures).toBe(0);
    expect(proven.ignoredNativeAds).toBe(1);
    expect(proven.ignoredNonListingRows[0]).toMatchObject({
      classifiedTitleText: '',
      innerTextSample: 'Sponsorlu Sıfır Audi kampanyası Kampanyalı Vitrin',
      listingEvidence: [],
    });

    // Ayni promosyon metni, reklam IMZASI OLMADAN: kanit yok, imza yok -> fail closed.
    const unsigned = observe(
      page(`${RENDERED_NATIVE_AD.replace(' nativeAd classicNativeAd', '')}${listingRow('1')}`),
    );
    expect(unsigned.parseFailures).toBe(1);
    expect(unsigned.ignoredNativeAds).toBe(0);
    expect(unsigned.ignoredOrFailedRows[0]).toMatchObject({
      className: 'searchResultsItem',
      nativeAdMarkers: [],
      listingEvidence: [],
    });
  });

  it('7) counts several ad slots exactly once each and leaves the cards untouched', () => {
    const withAds = observe(
      page(
        `${NATIVE_AD_SLOT}${listingRow('1')}${RENDERED_NATIVE_AD}${listingRow('2')}${NATIVE_AD_SLOT}`,
      ),
    );
    const withoutAds = observe(page(`${listingRow('1')}${listingRow('2')}`));

    expect(withAds.ignoredNativeAds).toBe(3);
    expect(withAds.ignoredNonListingRows.map((row) => row.index)).toEqual([0, 2, 4]);
    expect(withAds.parseFailures).toBe(0);
    // Reklamlar kart listesini ETKILEMEZ: iki sayfa birebir ayni kartlari verir.
    expect(withAds.cards).toEqual(withoutAds.cards);
    expect(withoutAds.ignoredNativeAds).toBe(0);
    expect(withoutAds.ignoredNonListingRows).toEqual([]);
  });
});

// ------------------------------------------- B) ILAN KANITI VARSA FAIL CLOSED

describe('B) AN ID-LESS ROW THAT LOOKS LIKE A REAL LISTING STILL FAILS CLOSED', () => {
  it('3) fails closed on a classifiedTitle with a normal listing href, even under the ad signature', () => {
    const looksReal = `
      <tr class="searchResultsItem nativeAd classicNativeAd">
        <td><a class="classifiedTitle" href="/ilan/1320984119/detay">Audi A3 Advanced</a></td>
      </tr>`;
    const result = observe(page(`${looksReal}${listingRow('1')}`));

    expect(result.parseFailures).toBe(1);
    expect(result.ignoredNativeAds).toBe(0);
    expect(result.ignoredNonListingRows).toEqual([]);
    expect(result.ignoredOrFailedRows[0]).toMatchObject({
      classifiedTitleHref: '/ilan/1320984119/detay',
      nativeAdMarkers: ['nativeAd', 'classicNativeAd'],
      listingEvidence: ['CLASSIFIED_TITLE_HREF'],
    });
  });

  it('4) fails closed on a real price, a listing date or numeric attributes', () => {
    const cases: Array<[string, string, string]> = [
      ['price', '<td class="searchResultsPriceValue">1.850.000 TL</td>', 'PRICE_WITH_DIGITS'],
      ['date', '<td class="searchResultsDateValue">5 Eylül 2026</td>', 'LISTING_DATE'],
      ['relative date', '<td class="searchResultsDateValue">Bugün</td>', 'LISTING_DATE'],
      ['attributes', '<td class="searchResultsAttributeValue">2022</td>', 'ATTRIBUTE_WITH_DIGITS'],
    ];
    for (const [name, cell, reason] of cases) {
      const row = `<tr class="searchResultsItem nativeAd classicNativeAd">${cell}</tr>`;
      const result = observe(page(`${row}${listingRow('1')}`));
      expect([name, result.parseFailures]).toEqual([name, 1]);
      expect([name, result.ignoredNativeAds]).toEqual([name, 0]);
      expect(result.ignoredOrFailedRows[0].listingEvidence).toContain(reason);
    }
  });

  it('5) fails closed on a generic blank id-less row with no ad evidence at all', () => {
    const blank = '<tr class="searchResultsItem"><td></td></tr>';
    const whitespaceId =
      '<tr data-id="   " class="searchResultsItem"><td>boş kimlik</td></tr>';
    const result = observe(page(`${blank}${whitespaceId}${listingRow('1')}`));

    expect(result.parseFailures).toBe(2);
    expect(result.ignoredNativeAds).toBe(0);
    expect(result.cards).toHaveLength(1);
    expect(result.ignoredOrFailedRows.map((row) => row.index)).toEqual([0, 1]);
    for (const row of result.ignoredOrFailedRows) {
      expect(row.nativeAdMarkers).toEqual([]);
      expect(row.listingEvidence).toEqual([]);
    }
  });
});

// ------------------------------------ 6 + 8) GERCEK SAYFA VE AYRISTIRICI HIZASI

describe('THE REAL PAGE SHAPE: 50 LISTINGS PLUS THE SOURCE AD SLOT', () => {
  it('6) yields 50 cards and zero parse failures', () => {
    const { html, ids } = audiPage(50, { first: true });
    const result = observe(html);

    expect(result.cards).toHaveLength(50);
    expect(result.parseFailures).toBe(0);
    expect(result.ignoredNativeAds).toBe(1);
    expect(result.cards.map((card) => card.sourceListingId)).toEqual(ids);
    expect(result.hasNextPage).toBe(true);
  });

  it('8) extension IDs and hardened raw-parser IDs stay exactly equal, ad excluded by both', () => {
    for (const ads of [{}, { first: true }, { first: true, last: true }]) {
      const { html, ids } = audiPage(50, ads);
      const fromExtension = observe(html).cards.map((card) => card.sourceListingId);
      const fromRawParser = parseRawWeeklyPage(html).rows.map((row) => row.sourceListingId);

      // Koprunun kimlik karsilastirmasi bu iki kumeyi esitler; ikisi de reklami disarida birakir.
      expect([...fromExtension].sort()).toEqual([...fromRawParser].sort());
      expect(fromExtension).toEqual(ids);
      expect(fromExtension).not.toContain('');
      expect(fromRawParser).toHaveLength(50);
    }
  });

  it('an ad-only page reports no cards and no failure, so nothing is silently invented', () => {
    const result = observe(page(NATIVE_AD_SLOT));
    expect(result.cards).toEqual([]);
    expect(result.parseFailures).toBe(0);
    expect(result.ignoredNativeAds).toBe(1);
  });
});

// ----------------------------------------------------------- teshis yuzeyi

describe('DIAGNOSTICS STAY AUDITABLE, LOGGED AND OFF THE WIRE', () => {
  const background = read('background.js');
  const content = read('content-script.js');

  it('records the row text, normalized and capped at 500 characters', () => {
    const noisy = `<tr class="searchResultsItem"><td>${'çok uzun reklam metni '.repeat(80)}</td></tr>`;
    const sample = observe(page(`${noisy}${listingRow('1')}`))
      .ignoredOrFailedRows[0].innerTextSample;

    expect(sample).toHaveLength(500);
    expect(sample).not.toMatch(/\s{2}|\n|\t/);
    expect(sample.startsWith('çok uzun reklam metni')).toBe(true);
  });

  it('prefers the visible innerText when the browser provides it', () => {
    const result = observe(page(`${NATIVE_AD_SLOT}${listingRow('1')}`), (document) => {
      const row = document.querySelector('tr.classicNativeAd');
      Object.defineProperty(row, 'innerText', {
        value: '  GÖRÜNEN\n  reklam   metni  ',
        configurable: true,
      });
    });
    expect(result.ignoredNonListingRows[0].innerTextSample).toBe('GÖRÜNEN reklam metni');
  });

  it('keeps the ad rule narrow: the signature alone never overrides listing evidence', () => {
    expect(content).toMatch(/NATIVE_AD_CLASS_MARKERS = \['nativeAd', 'classicNativeAd'\]/);
    // Iki kosul BIRLIKTE aranir; imza tek basina yeterli DEGILDIR.
    expect(content).toMatch(
      /record\.nativeAdMarkers\.length > 0 && record\.listingEvidence\.length === 0/,
    );
    expect(content).toMatch(/parseFailures \+= 1;/);
  });

  it('still fails closed at the bridge: the error is rethrown, never swallowed', () => {
    expect(background).toMatch(
      /logIgnoredOrFailedRows\(directive, observation, err\);\s*throw err;/,
    );
    expect(background).toMatch(/rows\.length === 0/);
    expect(background).toMatch(/reload the extension in chrome:\/\/extensions/);
  });

  it('prints every diagnostic field, including why a row failed closed', () => {
    for (const field of [
      'className',
      'classifiedTitleText',
      'classifiedTitleHref',
      'priceText',
      'listingDateText',
      'innerTextSample',
      'nativeAdMarkers',
      'listingEvidence',
    ]) {
      expect(background).toContain(`${field}: row.${field}`);
    }
    expect(background).toMatch(/ignored \$\{ignoredAds\} non-listing native-ad row/);
  });

  it('does not widen the bridge payload with diagnostics or counters', () => {
    const start = background.indexOf("'/autopilot/page-batch'");
    const batchBody = background.slice(start, background.indexOf('} catch (err) {', start));
    expect(batchBody).toMatch(/parseFailures: observation\.parseFailures/);
    expect(batchBody).not.toMatch(/ignoredOrFailedRows|ignoredNonListingRows|ignoredNativeAds/);
  });
});
