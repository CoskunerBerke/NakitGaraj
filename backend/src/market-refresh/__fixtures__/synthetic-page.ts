/**
 * SENTETIK FIXTURE — gercek sayfa KOPYALANMAZ.
 * Depoya buyuk/gercek HTML alinmaz; testler minimal sentetik yapiyla kosar.
 */

export interface SyntheticListing {
  id: string;
  title?: string;
  make?: string;
  model?: string;
  year?: string;
  km?: string;
  price?: string;
  location?: string;
}

export function syntheticCard(listing: SyntheticListing): string {
  const {
    id,
    title = `Ilan ${id}`,
    make = 'Audi',
    model = 'A3',
    year = '2021',
    km = '45.000 km',
    price = '1.850.000 TL',
    location = 'Istanbul',
  } = listing;
  return `
    <div class="listing" data-listing-id="${id}">
      <a class="listing-url" href="/ilan/${id}">${title}</a>
      <span class="make">${make}</span>
      <span class="model">${model}</span>
      <span class="year">${year}</span>
      <span class="km">${km}</span>
      <span class="price">${price}</span>
      <span class="location">${location}</span>
    </div>`;
}

export function syntheticListingPage(
  listings: SyntheticListing[],
  opts: { hasNextPage?: boolean; extraHtml?: string } = {},
): string {
  const cards = listings.map(syntheticCard).join('\n');
  const next = opts.hasNextPage ? '<a class="next-page" href="?page=next">Sonraki</a>' : '';
  return `<html><body>${cards}\n${next}\n${opts.extraHtml || ''}</body></html>`;
}

/** Kimliksiz kart: ayristirma hatasi uretmeli, UYDURULMAMALI. */
export function malformedCard(): string {
  return `<div class="listing"><a class="listing-url" href="/ilan/x">Kimliksiz</a></div>`;
}

export function captchaPage(): string {
  return `<html><body><h1>Guvenlik Dogrulama</h1><div id="captcha">captcha</div></body></html>`;
}

export function loginWallPage(): string {
  return `<html><body><p>Devam etmek icin giris yapmalisiniz.</p></body></html>`;
}
