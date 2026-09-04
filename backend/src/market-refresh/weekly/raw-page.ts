/** Save and parse raw weekly pages through the canonical corpus parser. */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import {
  classifyPage,
  PageClassification,
} from '../../vehicle-hierarchy/page-classification';

export interface ParsedWeeklyRow {
  sourceListingId: string;
  href: string;
  title: string;
  modelCells: string[];
  listingDateText: string;
  yearText: string | null;
  mileageText: string | null;
  priceText: string | null;
  locationText: string | null;
}

export interface ParsedWeeklyPage {
  classification: PageClassification;
  rows: ParsedWeeklyRow[];
  hasNextPage: boolean;
}

function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function saveRawWeeklyPage(
  dir: string,
  targetId: string,
  page: number,
  html: string,
): string {
  fs.mkdirSync(dir, { recursive: true });
  const key = crypto
    .createHash('sha256')
    .update(targetId)
    .digest('hex')
    .slice(0, 12);
  const contentHash = crypto
    .createHash('sha256')
    .update(html)
    .digest('hex')
    .slice(0, 12);
  const file = path.join(
    dir,
    `${key}.page-${String(page).padStart(3, '0')}.${contentHash}.html`,
  );
  if (fs.existsSync(file)) return file;
  const tmp = `${file}.tmp-${process.pid}`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, html, 'utf-8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
  return file;
}

export function parseRawWeeklyPage(
  html: string,
  filePath = '',
): ParsedWeeklyPage {
  const classification = classifyPage(html, filePath);
  const $ = cheerio.load(html);
  const byId = new Map<string, any>();
  $('tr.searchResultsItem[data-id], tr[data-id]').each((_index, element) => {
    const row = $(element);
    const id = clean(row.attr('data-id'));
    if (id && !byId.has(id)) byId.set(id, row);
  });

  const rows = classification.rows.map((canonical) => {
    const row = byId.get(canonical.listingId);
    if (!row)
      throw new Error(
        `Canonical row ${canonical.listingId} missing from DOM index`,
      );
    const attributes = row.find('td.searchResultsAttributeValue');
    return {
      sourceListingId: canonical.listingId,
      href: row.find('a.classifiedTitle').first().attr('href') || '',
      title: canonical.title,
      modelCells: [...canonical.cells],
      listingDateText: clean(
        row.find('td.searchResultsDateValue').first().text(),
      ),
      yearText: clean(attributes.eq(0).text()) || null,
      mileageText: clean(attributes.eq(1).text()) || null,
      priceText:
        clean(
          row
            .find('td.searchResultsPriceValue, .searchResultsPriceValue')
            .first()
            .text(),
        ) || null,
      locationText:
        clean(
          row
            .find('td.searchResultsLocationValue, .searchResultsLocationValue')
            .first()
            .text(),
        ) || null,
    };
  });
  const next = $('a.prevNextBut[title="Sonraki"]').first();
  const hasNextPage =
    next.length > 0 && !next.hasClass('disabled') && Boolean(next.attr('href'));
  return { classification, rows, hasNextPage };
}
