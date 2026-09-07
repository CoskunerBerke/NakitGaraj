/**
 * SOURCE LISTING DATE — fail-closed calendar-day parser.
 *
 * Weekly boundaries are calendar days, not capture timestamps. The source may
 * render Turkish month names, numeric dates, "Bugün" or "Dün". Unknown text is
 * never replaced with capturedAt: doing so could advance a watermark past an
 * unparsed listing and lose it forever.
 */

const MONTHS: Record<string, number> = {
  ocak: 1,
  oca: 1,
  şubat: 2,
  subat: 2,
  şub: 2,
  sub: 2,
  mart: 3,
  mar: 3,
  nisan: 4,
  nis: 4,
  mayıs: 5,
  mayis: 5,
  may: 5,
  haziran: 6,
  haz: 6,
  temmuz: 7,
  tem: 7,
  ağustos: 8,
  agustos: 8,
  ağu: 8,
  agu: 8,
  eylül: 9,
  eylul: 9,
  eyl: 9,
  ekim: 10,
  eki: 10,
  kasım: 11,
  kasim: 11,
  kas: 11,
  aralık: 12,
  aralik: 12,
  ara: 12,
};

function sourceDay(date: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day)));
}

function isoDay(year: number, month: number, day: number): string | null {
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    return null;
  }
  return value.toISOString().slice(0, 10);
}

/** Today's calendar day in the source's own time zone (YYYY-MM-DD). */
export function sourceToday(now = new Date()): string {
  return sourceDay(now).toISOString().slice(0, 10);
}

/** Parse a source listing date into YYYY-MM-DD, or return null without guessing. */
export function parseListingDate(
  raw: string | null | undefined,
  now = new Date(),
): string | null {
  const value = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return null;

  // Sahibinden's relative labels are Turkish source-calendar days. Using UTC
  // here would mis-date listings between 00:00 and 03:00 in Turkey.
  const today = sourceDay(now);
  if (/^bugün\b/i.test(value)) return today.toISOString().slice(0, 10);
  if (/^dün\b/i.test(value)) {
    today.setUTCDate(today.getUTCDate() - 1);
    return today.toISOString().slice(0, 10);
  }

  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\b|\s)/.exec(value);
  if (match)
    return isoDay(Number(match[1]), Number(match[2]), Number(match[3]));

  match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\b|\s)/.exec(value);
  if (match)
    return isoDay(Number(match[3]), Number(match[2]), Number(match[1]));

  match = /^(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)(?:\s+(\d{4}))?(?:\b|\s)/.exec(
    value,
  );
  if (!match) return null;
  const month = MONTHS[match[2].toLocaleLowerCase('tr')];
  if (!month) return null;

  const day = Number(match[1]);
  let year = match[3] ? Number(match[3]) : today.getUTCFullYear();
  let parsed = isoDay(year, month, day);
  if (!parsed) return null;

  // A year-less December observed in early January belongs to the prior year.
  if (!match[3] && parsed > today.toISOString().slice(0, 10)) {
    year -= 1;
    parsed = isoDay(year, month, day);
  }
  return parsed;
}

export function addDays(day: string, amount: number): string {
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ISO day "${day}"`);
  }
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}
