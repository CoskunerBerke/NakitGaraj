/**
 * GERCEK KAYNAK CIKARIM SOZLESMESI — sabit kucuk fixture ile kilitlenir.
 *
 * Fixture, canli sayfa kopyasi DEGILDIR: gercek sinif iskeleti (kaydedilmis
 * kaynak sayfalardan dogrulanan yapi) uzerine UYDURMA veriyle kurulmus asgari
 * bir ornektir. Amac secici sozlesmesini kilitlemektir, icerik degil.
 */
import { AccessChallengeError } from './contracts';
import {
  SahibindenListingExtractor,
  detectSahibindenChallenge,
  sourceCategoryText,
  splitSourceCategory,
} from './sahibinden-extraction';

const CTX = { source: 'SAHIBINDEN_HTML', runId: 'r1', jobId: 'j1', page: 1, baseUrl: 'https://www.sahibinden.com' };

const row = (id: string, title: string, year: string, km: string, price: string) => `
  <tr data-id="${id}" class="searchResultsItem">
    <td class="searchResultsTitleValue"><a class="classifiedTitle" href="/ilan/${id}">${title}</a></td>
    <td class="searchResultsAttributeValue">${year}</td>
    <td class="searchResultsAttributeValue">${km}</td>
    <td class="searchResultsAttributeValue">Mavi</td>
    <td class="searchResultsPriceValue"><div>${price}</div></td>
    <td class="searchResultsLocationValue">İstanbul<br>Kadıköy</td>
  </tr>`;

const page = (rows: string, next = true) => `
  <html><body>
    <h1>Örnek Marka Örnek Aile Fiyatları &amp; Modelleri</h1>
    <table>${rows}</table>
    ${next ? '<a class="prevNextBut" title="Sonraki" href="/ornek?pagingOffset=50">Sonraki</a>' : ''}
  </body></html>`;

describe('SahibindenListingExtractor', () => {
  const x = new SahibindenListingExtractor();

  test('gercek iskeletten alanlar dogru cikarilir; kanoniklestirme yok', () => {
    const html = page(row('1000000001', 'ÖRNEK 1.0 X PAKET', '2021', '45.000', '1.234.567 TL'));
    const res = x.extract(html, CTX);
    expect(res.pageOk).toBe(true);
    expect(res.hasNextPage).toBe(true);
    expect(res.listings).toHaveLength(1);
    const l = res.listings[0];
    expect(l.sourceListingId).toBe('1000000001');
    expect(l.sourceUrl).toBe('https://www.sahibinden.com/ilan/1000000001');
    expect(l.title).toBe('ÖRNEK 1.0 X PAKET');
    expect(l.sourceMake).toBe('Örnek');
    expect(l.sourceModel).toBe('Marka Örnek Aile');
    expect(l.year).toBe(2021);
    expect(l.mileage).toBe(45000);
    expect(l.price).toBe(1234567);
    expect(l.currency).toBe('TRY');
    expect(l.location).toBe('İstanbulKadıköy');
  });

  test('kimliksiz kart (reklam satiri) gozlem uretmez; parseFailure sayilir', () => {
    const html = page(
      '<tr class="searchResultsItem nativeAd"><td>promo</td></tr>' +
        row('2000000002', 'GERCEK', '2020', '10.000', '900.000 TL'),
    );
    const res = x.extract(html, CTX);
    expect(res.listings).toHaveLength(1);
    expect(res.parseFailures).toBe(1);
  });

  test('cozulemeyen alan UYDURULMAZ: null kalir', () => {
    const html = page(row('3', 'EKSIK', '', '', ''));
    const res = x.extract(html, CTX);
    const l = res.listings[0];
    expect(l.year).toBeNull();
    expect(l.mileage).toBeNull();
    expect(l.price).toBeNull();
    expect(l.currency).toBeNull();
  });

  test('son sayfada hasNextPage=false (Sonraki linki yok)', () => {
    const res = x.extract(page(row('4', 'SON', '2019', '1.000', '500.000 TL'), false), CTX);
    expect(res.hasNextPage).toBe(false);
  });

  test('erisim engeli TESPIT edilir ve firlar; bypass yok', () => {
    expect(() => x.extract('<html><body>Press &amp; Hold to confirm</body></html>', CTX)).toThrow(AccessChallengeError);
    expect(detectSahibindenChallenge('px-captcha block')).toBe('CAPTCHA');
    // Cloudflare Turnstile ara sayfasi = erisim engeli (tespit, atlatma degil).
    expect(detectSahibindenChallenge('<script src="https://challenges.cloudflare.com/turnstile/v0/api.js">')).toBe('CAPTCHA');
    expect(detectSahibindenChallenge('Tarayıcınızı kontrol ediyoruz...')).toBe('CAPTCHA');
    expect(detectSahibindenChallenge('normal sayfa')).toBeNull();
  });

  test('kategori metni yardimcilari', () => {
    expect(sourceCategoryText('Audi A3 A3 Hatchback Fiyatları & Modelleri')).toBe('Audi A3 A3 Hatchback');
    expect(splitSourceCategory('Audi A3 A3 Hatchback')).toEqual({ make: 'Audi', model: 'A3 A3 Hatchback' });
  });
});
