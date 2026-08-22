/**
 * İşletme iletişim bilgisi yardımcıları.
 *
 * Bu ürün başka işletmelere satılır: hiçbir gerçek numara kaynak koda gömülmez
 * ve YER TUTUCU NUMARA ÜRETİLMEZ. Numara yapılandırılmamışsa bu yardımcılar
 * `null` döner; çağıran arayüz ilgili ögeyi GİZLER. Bozuk `tel:` / `wa.me`
 * bağlantısı ya da "undefined" basmak yerine hiç bağlantı göstermemek doğrudur.
 *
 * Bilinçli olarak sade tutuldu: tam uluslararası numara ayrıştırma bugünkü
 * ürün için gereksiz karmaşıklık olurdu. Türkiye biçimi tanınır, tanınmayan
 * biçimler ise BOZULMADAN olduğu gibi gösterilir.
 */

/** Yalnızca rakamları bırakır. Boş/geçersizse null. */
export const normalizePhone = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
};

/**
 * Ekranda gösterilecek biçim.
 * 11 haneli TR numarası (0XXX XXX XX XX) gruplanır; diğerleri olduğu gibi.
 */
export const formatPhoneDisplay = (raw: string | null | undefined): string | null => {
  const digits = normalizePhone(raw);
  if (!digits) return null;

  if (digits.length === 11 && digits.startsWith('0')) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`;
  }
  if (digits.length === 10) {
    return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`;
  }
  return String(raw).trim();
};

/** `tel:` bağlantısı. Numara yoksa null — bağlantı hiç render edilmemeli. */
export const telHref = (raw: string | null | undefined): string | null => {
  const digits = normalizePhone(raw);
  return digits ? `tel:${digits}` : null;
};

/**
 * WhatsApp bağlantısı. TR numarası 90 ülke koduna çevrilir.
 * Numara yoksa null.
 */
export const whatsappHref = (
  raw: string | null | undefined,
  messageText?: string,
): string | null => {
  const digits = normalizePhone(raw);
  if (!digits) return null;

  let intl = digits;
  if (intl.startsWith('0')) intl = `9${intl}`;
  else if (!intl.startsWith('90') && intl.length === 10) intl = `90${intl}`;

  const suffix = messageText ? `?text=${encodeURIComponent(messageText)}` : '';
  return `https://wa.me/${intl}${suffix}`;
};

/** İletişim ögesi gösterilmeli mi. */
export const hasPhone = (raw: string | null | undefined): boolean => normalizePhone(raw) !== null;
