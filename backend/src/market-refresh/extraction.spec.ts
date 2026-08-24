import { AccessChallengeError } from './contracts';
import {
  ExtractionContext,
  HtmlListingExtractor,
  parseTurkishNumber,
  parseYear,
} from './extraction';
import {
  captchaPage,
  loginWallPage,
  malformedCard,
  syntheticListingPage,
} from './__fixtures__/synthetic-page';

const ctx: ExtractionContext = {
  source: 'SAHIBINDEN_HTML',
  runId: 'run-1',
  jobId: 'sahibinden:audi:a3',
  page: 1,
  baseUrl: 'https://fixture.invalid/',
};

describe('market-refresh extraction contract', () => {
  const extractor = new HtmlListingExtractor();

  it('parses Turkish formatted numbers and refuses to invent unknowns', () => {
    expect(parseTurkishNumber('1.850.000 TL')).toBe(1850000);
    expect(parseTurkishNumber('45.000 km')).toBe(45000);
    expect(parseTurkishNumber('')).toBeNull();
    expect(parseTurkishNumber(null)).toBeNull();
    expect(parseTurkishNumber('Belirtilmemis')).toBeNull();
    expect(parseYear('2021')).toBe(2021);
    expect(parseYear('19')).toBeNull();
  });

  it('extracts raw observations without canonicalizing vehicle identity', () => {
    const html = syntheticListingPage([
      { id: '111', make: 'audi ', model: ' a3 sportback', price: '1.850.000 TL' },
    ]);
    const result = extractor.extract(html, ctx);

    expect(result.listings).toHaveLength(1);
    const listing = result.listings[0];
    // Kaynakta gorunen metin korunur; kanoniklestirme YAPILMAZ.
    expect(listing.sourceMake).toBe('audi');
    expect(listing.sourceModel).toBe('a3 sportback');
    expect(listing).not.toHaveProperty('canonicalMake');
    expect(listing).not.toHaveProperty('canonicalModel');
    expect(listing.price).toBe(1850000);
    expect(listing.currency).toBe('TRY');
    expect(listing.sourceUrl).toBe('https://fixture.invalid/ilan/111');
    expect(listing.runId).toBe('run-1');
    expect(listing.page).toBe(1);
  });

  it('reports pagination presence from the page itself', () => {
    const withNext = extractor.extract(
      syntheticListingPage([{ id: '1' }], { hasNextPage: true }),
      ctx,
    );
    const withoutNext = extractor.extract(
      syntheticListingPage([{ id: '2' }], { hasNextPage: false }),
      ctx,
    );
    expect(withNext.hasNextPage).toBe(true);
    expect(withoutNext.hasNextPage).toBe(false);
  });

  it('counts identity-less cards as parse failures instead of fabricating ids', () => {
    const html = syntheticListingPage([{ id: '1' }], { extraHtml: malformedCard() });
    const result = extractor.extract(html, ctx);
    expect(result.listings).toHaveLength(1);
    // Kimliksiz kart icin sahte id URETILMEZ.
    expect(result.listings.every((l) => l.sourceListingId !== '')).toBe(true);
  });

  it('leaves unreadable numeric fields null rather than defaulting to zero', () => {
    const html = syntheticListingPage([
      { id: '9', price: 'Fiyat belirtilmemis', km: 'Belirtilmemis', year: 'Bilinmiyor' },
    ]);
    const listing = extractor.extract(html, ctx).listings[0];
    expect(listing.price).toBeNull();
    expect(listing.mileage).toBeNull();
    expect(listing.year).toBeNull();
  });

  it('raises a typed access challenge for captcha and login walls', () => {
    expect(() => extractor.extract(captchaPage(), ctx)).toThrow(AccessChallengeError);
    expect(() => extractor.extract(loginWallPage(), ctx)).toThrow(AccessChallengeError);
    try {
      extractor.extract(captchaPage(), ctx);
    } catch (err) {
      expect((err as AccessChallengeError).kind).toBe('CAPTCHA');
    }
    try {
      extractor.extract(loginWallPage(), ctx);
    } catch (err) {
      expect((err as AccessChallengeError).kind).toBe('AUTH_REQUIRED');
    }
  });
});
