/**
 * KIMLIKSIZ SATIR TESHISI — GERCEK ICERIK BETIGI, GERCEK SECICI MOTORU.
 *
 * Canli haftalik duman kosusu 400 ile dustu:
 *   PARSE_ERROR page reported 1 row failure(s)
 *
 * Yani sayfada `tr.searchResultsItem` sinifini tasiyan ama `data-id`
 * TASIMAYAN bir satir vardi. Korpusu okuyan sertlestirilmis ayristirici
 * `[data-id]` olmayan satiri zaten gormedigi icin kimlik karsilastirmasi
 * degil YALNIZCA sayac dustu; satirin ne oldugu ise hicbir yerde
 * gorunmuyordu.
 *
 * Bu test, Chrome'un enjekte ettigi AYNI dosyayi (`content-script.js`) Node
 * `vm` ile calistirir. DOM, uretimdeki ayristiricinin da kullandigi cheerio
 * (css-select) uzerine kurulur: seciciler GERCEKTEN degerlendirilir, metin
 * eslesmesiyle taklit edilmez. (jsdom 29 yalnizca ESM tasiyan bir bagimlilik
 * getiriyor ve bu CJS jest kurulumunda yuklenemiyor; paylasilan jest
 * yapilandirmasini teshis icin degistirmek dogru takas degil.)
 *
 * SEMANTIK KILIDI: `parseFailures` sayaci ve `cards` ciktisi DEGISMEZ —
 * teshis yalnizca ek bir alan ekler, hicbir sey bastirmaz.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as cheerio from 'cheerio';

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
}

interface Observation {
  ok: boolean;
  cards: Array<{ sourceListingId: string; title: string }>;
  parseFailures: number;
  ignoredOrFailedRows: IgnoredRow[];
  hasNextPage: boolean;
}

/**
 * Icerik betiginin COLLECT_PAGE dalinda GERCEKTEN kullandigi DOM yuzeyi.
 * Secici cozumu cheerio'ya birakilir; burada yalnizca tarayici adlari
 * baglanir. Dugum -> sarmalayici onbellegi, testin belirli bir satira
 * `innerText` tanimlayabilmesi icin kimligi korur.
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
      querySelector: (selector: string) => wrap($(node as never).find(selector).get(0)),
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

  return { document, wrap };
}

/** Chrome'un enjekte ettigi dosyanin AYNISI, dokunulmadan. */
function observe(
  html: string,
  prepare?: (document: any) => void,
): Observation {
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

/** Gercek kaynak satirinin okunan kisimlari (kimlikli, saglam ilan). */
function listingRow(id: string, title: string): string {
  return `
    <tr class="searchResultsItem" data-id="${id}">
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

/** Kaynagin gercekten bastigi turden kimliksiz satir (vitrin/reklam). */
const PROMO_ROW = `
  <tr class="searchResultsItem searchResultsPromoBottom nativeAd">
    <td class="searchResultsTagAttributeValue">Reklam</td>
    <td><a class="classifiedTitle" href="/ilan/kampanya-audi/detay">Sıfır Audi kampanyası</a></td>
    <td class="searchResultsPriceValue">Kampanyalı</td>
    <td class="searchResultsDateValue">Vitrin</td>
  </tr>`;

describe('CONTENT SCRIPT REPORTS WHAT THE UNIDENTIFIED ROW WAS', () => {
  it('keeps cards and parseFailures identical while describing the ignored row', () => {
    const result = observe(
      page(
        `${listingRow('1300725330', 'Audi A3 Advanced')}${PROMO_ROW}${listingRow('1285845831', 'Audi A3 Advanced 2')}`,
      ),
    );

    // SEMANTIK DEGISMEDI: iki gecerli kart, tam olarak bir satir hatasi.
    expect(result.cards.map((card) => card.sourceListingId)).toEqual([
      '1300725330',
      '1285845831',
    ]);
    expect(result.parseFailures).toBe(1);
    expect(result.hasNextPage).toBe(true);

    // YENI: satirin ne oldugu artik gorunur.
    expect(result.ignoredOrFailedRows).toHaveLength(1);
    expect(result.ignoredOrFailedRows[0]).toEqual({
      index: 1,
      className: 'searchResultsItem searchResultsPromoBottom nativeAd',
      classifiedTitleText: 'Sıfır Audi kampanyası',
      classifiedTitleHref: '/ilan/kampanya-audi/detay',
      priceText: 'Kampanyalı',
      listingDateText: 'Vitrin',
      innerTextSample: 'Reklam Sıfır Audi kampanyası Kampanyalı Vitrin',
    });
  });

  /**
   * GERCEK OLCUM (2026-09-07): kaydedilmis 400 korpus sayfasinin 385'i tam
   * olarak BIR tane `searchResultsItem nativeAd classicNativeAd` satiri
   * tasiyor ve satir TAMAMEN BOS (kaynak reklami sonradan JS ile dolduruyor).
   * Duman kosusunun hedef sayfasi da ayni: 50 kart, 1 satir hatasi, index 3.
   * Butun metin alanlari bos olsa bile SINIF ADI kanit tasir; kayit bu yuzden
   * bos alanlarla da uretilmelidir.
   */
  it('still identifies the source native-ad slot when every text field is empty', () => {
    const nativeAd = '<tr class="searchResultsItem nativeAd classicNativeAd"><td></td></tr>';
    const result = observe(
      page(`${listingRow('1', 'a')}${listingRow('2', 'b')}${nativeAd}${listingRow('3', 'c')}`),
    );

    expect(result.cards).toHaveLength(3);
    expect(result.parseFailures).toBe(1);
    expect(result.ignoredOrFailedRows).toEqual([
      {
        index: 2,
        className: 'searchResultsItem nativeAd classicNativeAd',
        classifiedTitleText: '',
        classifiedTitleHref: '',
        priceText: '',
        listingDateText: '',
        innerTextSample: '',
      },
    ]);
  });

  it('treats a blank data-id like a missing one and records it too', () => {
    const blank = `
      <tr class="searchResultsItem" data-id="   ">
        <td><a class="classifiedTitle" href="/ilan/bos/detay">Boş kimlik</a></td>
      </tr>`;
    const result = observe(page(`${blank}${listingRow('99', 'Gerçek ilan')}`));

    expect(result.parseFailures).toBe(1);
    expect(result.cards).toHaveLength(1);
    expect(result.ignoredOrFailedRows).toHaveLength(1);
    expect(result.ignoredOrFailedRows[0]).toMatchObject({
      index: 0,
      className: 'searchResultsItem',
      classifiedTitleText: 'Boş kimlik',
      // Fiyat/tarih hucresi yoksa alan BOS gecer, kayit yine uretilir.
      priceText: '',
      listingDateText: '',
    });
  });

  it('records several ignored rows in page order and none on a clean page', () => {
    const many = observe(
      page(
        `${PROMO_ROW}${listingRow('1', 'a')}${PROMO_ROW}${listingRow('2', 'b')}${PROMO_ROW}`,
      ),
    );
    expect(many.parseFailures).toBe(3);
    expect(many.ignoredOrFailedRows.map((row) => row.index)).toEqual([0, 2, 4]);

    const clean = observe(page(`${listingRow('1', 'a')}${listingRow('2', 'b')}`));
    expect(clean.parseFailures).toBe(0);
    expect(clean.ignoredOrFailedRows).toEqual([]);
    expect(clean.cards).toHaveLength(2);
  });

  it('normalizes the row text and caps the sample at 500 characters', () => {
    const noisy = `
      <tr class="searchResultsItem">
        <td>${'çok uzun reklam metni '.repeat(80)}</td>
      </tr>`;
    const sample = observe(page(`${noisy}${listingRow('1', 'a')}`))
      .ignoredOrFailedRows[0].innerTextSample;

    expect(sample).toHaveLength(500);
    expect(sample).not.toMatch(/\s{2}|\n|\t/);
    expect(sample.startsWith('çok uzun reklam metni')).toBe(true);
  });

  it('prefers the visible innerText when the browser provides it', () => {
    const result = observe(
      page(`${PROMO_ROW}${listingRow('1', 'a')}`),
      (document) => {
        const row = document.querySelector('tr.searchResultsPromoBottom');
        Object.defineProperty(row, 'innerText', {
          value: '  GÖRÜNEN\n  reklam   metni  ',
          configurable: true,
        });
      },
    );
    expect(result.ignoredOrFailedRows[0].innerTextSample).toBe(
      'GÖRÜNEN reklam metni',
    );
  });
});

describe('THE DIAGNOSTIC IS LOGGED, NOT SWALLOWED AND NOT SENT TO THE BRIDGE', () => {
  const background = read('background.js');
  const content = read('content-script.js');

  it('still fails closed: the counter is untouched and the bridge error is rethrown', () => {
    expect(content).toMatch(/parseFailures \+= 1;/);
    // Teshis kaydi sayactan ONCE alinir; sayac atlanmaz, satir kart olmaz.
    const failureBranch = content.slice(
      content.indexOf('if (!sourceListingId)'),
      content.indexOf('const link = row.querySelector(\'a.classifiedTitle\');', content.indexOf('if (!sourceListingId)')),
    );
    expect(failureBranch).toMatch(
      /ignoredOrFailedRows\.push\(describeIgnoredRow\(row, index\)\);[\s\S]*parseFailures \+= 1;/,
    );
    expect(background).toMatch(
      /logIgnoredOrFailedRows\(directive, observation, err\);\s*throw err;/,
    );
  });

  it('prints every diagnostic field to the service worker log', () => {
    for (const field of [
      'className',
      'classifiedTitleText',
      'classifiedTitleHref',
      'priceText',
      'listingDateText',
      'innerTextSample',
    ]) {
      expect(background).toContain(`${field}: row.${field}`);
    }
    expect(background).toMatch(/console\.error\([\s\S]*parseFailures=/);
  });

  it('tells the user when the loaded content script is the old build', () => {
    expect(background).toMatch(/rows\.length === 0/);
    expect(background).toMatch(/reload the extension in chrome:\/\/extensions/);
  });

  it('does not widen the bridge payload with diagnostics', () => {
    const start = background.indexOf("'/autopilot/page-batch'");
    const batchBody = background.slice(
      start,
      background.indexOf('} catch (err) {', start),
    );
    expect(batchBody).toMatch(/parseFailures: observation\.parseFailures/);
    expect(batchBody).not.toMatch(/ignoredOrFailedRows/);
  });
});
