/**
 * CIKARIM SOZLESMESI — HAM GOZLEM URETIR, YORUM URETMEZ.
 *
 * Ayristirici yalnizca kaynakta GORUNENI tasir. Marka/model metni
 * kanoniklestirilmez, yil/km normalize edilmez, eksik alan UYDURULMAZ:
 * cozulemeyen alan null kalir ve diff katmani onu INVALID sayar.
 */
import * as cheerio from 'cheerio';
import { AccessChallengeError, PageResult, RawObservedListing } from './contracts';

export interface ExtractionContext {
  source: string;
  runId: string;
  jobId: string;
  page: number;
  /** Goreli linkleri mutlaklastirmak icin. */
  baseUrl: string;
}

export interface ListingExtractor {
  extract(html: string, ctx: ExtractionContext): PageResult;
}

export interface ExtractionSelectors {
  card: string;
  listingId: string;
  url: string;
  title: string;
  make: string;
  model: string;
  year: string;
  mileage: string;
  price: string;
  location: string;
  nextPage: string;
}

export const DEFAULT_SELECTORS: ExtractionSelectors = {
  card: '[data-listing-id]',
  listingId: 'data-listing-id',
  url: 'a.listing-url',
  title: 'a.listing-url',
  make: '.make',
  model: '.model',
  year: '.year',
  mileage: '.km',
  price: '.price',
  location: '.location',
  nextPage: 'a.next-page',
};

/**
 * Turkce bicimli sayi cozumu: "1.850.000 TL" -> 1850000, "45.000 km" -> 45000.
 * Cozulemezse null (0 DEGIL) — sifir gercek bir fiyat olabilir, bilinmeyen degil.
 */
export function parseTurkishNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

export function parseYear(raw: string | null | undefined): number | null {
  const value = parseTurkishNumber(raw);
  if (value === null) return null;
  // Yil bir aralik kontrolu ister; disaridaki deger UYDURULMAZ, null birakilir.
  if (value < 1900 || value > 2100) return null;
  return value;
}

/** Sayfa govdesinde erisim engeli izleri. Bypass YOK — yalnizca tespit. */
const CHALLENGE_MARKERS: Array<{ pattern: RegExp; kind: 'CAPTCHA' | 'AUTH_REQUIRED' }> = [
  { pattern: /captcha|are you a human|robot olmad|guvenlik dogrulama/i, kind: 'CAPTCHA' },
  { pattern: /giris yapmal|please log in|oturum acmal/i, kind: 'AUTH_REQUIRED' },
];

export function detectChallengeInHtml(html: string): 'CAPTCHA' | 'AUTH_REQUIRED' | null {
  for (const marker of CHALLENGE_MARKERS) {
    if (marker.pattern.test(html)) return marker.kind;
  }
  return null;
}

export class HtmlListingExtractor implements ListingExtractor {
  constructor(private readonly selectors: ExtractionSelectors = DEFAULT_SELECTORS) {}

  extract(html: string, ctx: ExtractionContext): PageResult {
    const challenge = detectChallengeInHtml(html);
    if (challenge) {
      throw new AccessChallengeError(challenge, ctx.jobId, ctx.page);
    }

    const $ = cheerio.load(html);
    const s = this.selectors;
    const listings: RawObservedListing[] = [];
    let parseFailures = 0;
    const capturedAt = new Date().toISOString();

    $(s.card).each((_i, el) => {
      const node = $(el);
      const sourceListingId = (node.attr(s.listingId) || '').trim();
      const href = (node.find(s.url).attr('href') || '').trim();
      const title = node.find(s.title).text().trim();

      // Kimliksiz kart YORUMLANAMAZ — uydurulmaz, ayristirma hatasi sayilir.
      if (!sourceListingId) {
        parseFailures += 1;
        return;
      }

      listings.push({
        source: ctx.source,
        sourceListingId,
        sourceUrl: href ? new URL(href, ctx.baseUrl).toString() : '',
        title,
        sourceMake: node.find(s.make).text().trim(),
        sourceModel: node.find(s.model).text().trim(),
        year: parseYear(node.find(s.year).text()),
        mileage: parseTurkishNumber(node.find(s.mileage).text()),
        price: parseTurkishNumber(node.find(s.price).text()),
        currency: node.find(s.price).text().includes('TL') ? 'TRY' : null,
        location: node.find(s.location).text().trim() || null,
        capturedAt,
        runId: ctx.runId,
        jobId: ctx.jobId,
        page: ctx.page,
      });
    });

    return {
      listings,
      hasNextPage: $(s.nextPage).length > 0,
      pageOk: true,
      parseFailures,
    };
  }
}
