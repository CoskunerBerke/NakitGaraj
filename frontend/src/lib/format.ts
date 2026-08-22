/**
 * Ortak biçimlendirme yardımcıları.
 *
 * Para değerleri tek bir yerden biçimlenir; sayfalar kendi yerel
 * `toLocaleString` çağrılarını çoğaltmaz.
 */

/**
 * Türkçe para biçimi: binlik ayırıcı NOKTA, sembol SONDA → "1.250.000 ₺".
 *
 * Geçersiz/eksik değer için sessizce "0 ₺" ÜRETİLMEZ; "—" döner. Müşteriye
 * uydurma bir sayı göstermek, değerin bilinmediğini söylemekten kötüdür.
 */
export const formatTL = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('tr-TR')} ₺`;
};

/** Kilometre biçimi: "125.000 km". Geçersiz değer için "—". */
export const formatKm = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('tr-TR')} km`;
};
