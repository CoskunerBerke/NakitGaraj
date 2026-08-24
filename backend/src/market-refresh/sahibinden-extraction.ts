/**
 * SAHIBINDEN LISTE CIKARIMI — GERCEK KAYNAK YAPISI.
 *
 * Secici gercekleri, kullanicinin KENDI kaydettigi kaynak sayfalarindan
 * dogrulanmistir (korpusun geldigi ayni yapi):
 *   kart        tr.searchResultsItem[data-id]   (data-id = platformun kalici
 *               ilan kimligi; korpustaki sourceListingId ile ayni bicim)
 *   baslik/url  a.classifiedTitle
 *   nitelikler  td.searchResultsAttributeValue  sirasi: [yil, km, renk]
 *   fiyat       .searchResultsPriceValue        ("1.450.000 TL")
 *   konum       .searchResultsLocationValue
 *   sonraki     a.prevNextBut[title="Sonraki"]
 *   kategori    h1                              ("Audi A3 ... Fiyatları & Modelleri")
 *
 * KURALLAR (contracts ile ayni):
 *   - kimliksiz kart (reklam/promosyon satiri) YORUMLANMAZ -> parseFailure
 *   - cozulemeyen alan null kalir; UYDURMA yok
 *   - kanoniklestirme YOK: sourceMake/sourceModel kategori metninden AYNEN
 *   - erisim engeli TESPIT edilir ve firlatilir; bypass YOK
 *
 * Seciciler kaynak-duzeyindedir; marka/model'e ozel hicbir dal yoktur.
 */
import * as cheerio from 'cheerio';
import { AccessChallengeError, PageResult, RawObservedListing } from './contracts';
import { detectChallengeInHtml, ExtractionContext, ListingExtractor, parseTurkishNumber, parseYear } from './extraction';

/** Sahibinden'e ozgu erisim-engeli izleri (yalnizca TESPIT; atlatma yok). */
const SOURCE_CHALLENGE_MARKERS: Array<{ pattern: RegExp; kind: 'CAPTCHA' | 'AUTH_REQUIRED' }> = [
  { pattern: /press\s*&(?:amp;)?\s*hold|px-captcha|perimeterx|olağan dışı bir erişim|erişim engellendi/i, kind: 'CAPTCHA' },
  // Cloudflare Turnstile ara sayfasi ("Tarayıcınızı kontrol ediyoruz" +
  // challenges.cloudflare.com/turnstile + /cs/tloading yonlendirmesi). Bu bir
  // erisim engelidir; TESPIT edilir ve guvenle durulur. Atlatma YOK: Turnstile
  // token uretimi, otomasyon gizleme ya da "Devam Et" tiklamasi DENENMEZ.
  { pattern: /challenges\.cloudflare\.com\/turnstile|tarayıcınızı kontrol ediyoruz|\/cs\/tloading/i, kind: 'CAPTCHA' },
];

export function detectSahibindenChallenge(html: string): 'CAPTCHA' | 'AUTH_REQUIRED' | null {
  for (const marker of SOURCE_CHALLENGE_MARKERS) {
    if (marker.pattern.test(html)) return marker.kind;
  }
  return detectChallengeInHtml(html);
}

/** "Audi A3 A3 Hatchback Fiyatları & Modelleri" -> "Audi A3 A3 Hatchback" */
export function sourceCategoryText(h1Text: string): string {
  return h1Text
    .replace(/\s+/g, ' ')
    .replace(/Fiyatları.*$/i, '')
    .trim();
}

/**
 * Kategori metninden kaynak marka/model AYRIMI: ilk sozcuk marka, kalani
 * model ailesidir ("Audi A3 A3 Hatchback" -> make "Audi", model "A3 A3
 * Hatchback"). Bu bir KANONIKLESTIRME degildir; kaynagin kendi kategori
 * adlandirmasinin oldugu gibi ikiye bolunmesidir.
 */
export function splitSourceCategory(category: string): { make: string; model: string } {
  const parts = category.split(' ').filter(Boolean);
  if (parts.length <= 1) return { make: category, model: '' };
  return { make: parts[0], model: parts.slice(1).join(' ') };
}

export class SahibindenListingExtractor implements ListingExtractor {
  extract(html: string, ctx: ExtractionContext): PageResult {
    const $ = cheerio.load(html);

    /**
     * ENGEL SINIFLAMASI YALNIZCA ILAN YAPISI YOKKEN YAPILIR.
     *
     * Olculen: normal liste sayfalari da uyuyan (dorman) bir
     * `<div id='recaptcha'>` login-popup iskeleti ve PerimeterX SDK script'i
     * tasiyor; ham HTML'de kaba marker taramasi MESRU sayfayi engel sanip
     * kosuyu durduruyordu. Gercek engel sayfasinda ise hic
     * `tr.searchResultsItem` yoktur. Kural: kart varsa sayfa mesrudur;
     * kart yoksa markerlara bakilir. Bu bir atlatma degildir — yalnizca
     * dogru TESPIT sirasidir.
     */
    const cards = $('tr.searchResultsItem');
    if (cards.length === 0) {
      const challenge = detectSahibindenChallenge(html);
      if (challenge) {
        throw new AccessChallengeError(challenge, ctx.jobId, ctx.page);
      }
    }
    const category = sourceCategoryText($('h1').first().text());
    const { make, model } = splitSourceCategory(category);

    const listings: RawObservedListing[] = [];
    let parseFailures = 0;
    const capturedAt = new Date().toISOString();

    cards.each((_i, el) => {
      const node = $(el);
      const sourceListingId = (node.attr('data-id') || '').trim();
      if (!sourceListingId) {
        // Reklam/promosyon satiri: kimliksiz kart gozlem sayilmaz.
        parseFailures += 1;
        return;
      }

      const link = node.find('a.classifiedTitle').first();
      const href = (link.attr('href') || '').trim();
      const attrs = node.find('td.searchResultsAttributeValue');
      const priceText = node.find('.searchResultsPriceValue').text();

      listings.push({
        source: ctx.source,
        sourceListingId,
        sourceUrl: href ? new URL(href, ctx.baseUrl).toString() : '',
        title: link.text().trim().replace(/\s+/g, ' '),
        sourceMake: make,
        sourceModel: model,
        year: parseYear($(attrs.get(0)).text()),
        mileage: parseTurkishNumber($(attrs.get(1)).text()),
        price: parseTurkishNumber(priceText),
        currency: /TL/i.test(priceText) ? 'TRY' : null,
        location: node.find('.searchResultsLocationValue').text().trim().replace(/\s+/g, ' ') || null,
        capturedAt,
        runId: ctx.runId,
        jobId: ctx.jobId,
        page: ctx.page,
      });
    });

    return {
      listings,
      hasNextPage: $('a.prevNextBut[title="Sonraki"]').length > 0,
      pageOk: true,
      parseFailures,
    };
  }
}
