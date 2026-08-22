/**
 * product-contact-config.spec.ts
 *
 * URUN GENELI KORUMA — MUSTERIYE GIDEN KAYNAKTA SABIT ILETISIM VERISI OLMAZ.
 *
 * NakitGaraj tek bir isletmeye ait sabit urun degildir; baska isletmelere
 * satilir. Bu yuzden hicbir gercek telefon numarasi musteri arayuzu kaynagina
 * GOMULEMEZ. Gecmiste iki numara sabit yaziliydi: biri yalnizca Telegram/test
 * icin girilmis bir numara (site-config yedegi), digeri footer'da. Ikisi de
 * kanonik destek hatti DEGILDI.
 *
 * NOT: bu kontrol ON YUZ dosyalarini okur. Depoda calisan tek test kosucusu
 * backend jest oldugu icin buraya konuldu; ayrica bir test altyapisi kurmak
 * bu isin kapsamiyla orantisiz olurdu.
 */
import * as fs from 'fs';
import * as path from 'path';

const FRONTEND_SRC = path.resolve(__dirname, '../../frontend/src');

const read = (rel: string) => fs.readFileSync(path.join(FRONTEND_SRC, rel), 'utf-8');

/** Sabit yazilmis TR cep numarasi kalibi. */
const HARDCODED_TR_MOBILE = /(?:\+?90|0)\s?5\d{2}\s?\d{3}\s?\d{2}\s?\d{2}/;

/** Musteriye giden ekranlar (admin paneli haric). */
const CUSTOMER_FILES = [
  'config/site-config.ts',
  'components/Footer.tsx',
  'app/degerleme/page.tsx',
  'app/konsinye/page.tsx',
  'app/page.tsx',
];

describe('Beyaz etiket — musteri iletisim yapilandirmasi', () => {
  test.each(CUSTOMER_FILES)('%s icinde SABIT telefon numarasi yok', (rel) => {
    const offending = read(rel)
      .split('\n')
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(({ line }) => HARDCODED_TR_MOBILE.test(line));

    expect(offending).toEqual([]);
  });

  test('site-config iletisim alanlarinda TEST/GERCEK yedek deger yok', () => {
    const src = read('config/site-config.ts');

    // `supportPhone: env || '05...'` bicimi geri gelmemeli.
    expect(src).not.toMatch(/supportPhone:[^,]*\|\|\s*['"]\d/);
    expect(src).not.toMatch(/address:[^,]*\|\|\s*['"][^'"]*\d{2,}/);

    // Yapilandirilmamis alan null olmali; yer tutucu URETILMEMELI.
    expect(src).toContain('supportPhone: process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() || null');
    expect(src).toContain('supportPhone: string | null');
  });

  test('Footer numarayi ve adresi MERKEZI yapilandirmadan alir', () => {
    const src = read('components/Footer.tsx');

    expect(src).toContain("from '../config/site-config'");
    expect(src).toContain('telHref(siteConfig.supportPhone)');
    expect(src).toContain('{siteConfig.address}');

    // Sabit `tel:` baglantisi kalmamali.
    expect(src).not.toMatch(/href="tel:/);
  });

  test('Degerleme CTA lari merkezi yapilandirmadan turer', () => {
    const src = read('app/degerleme/page.tsx');

    expect(src).toContain('const supportTelHref = telHref(siteConfig.supportPhone);');
    // Ham sablon ile tel: uretimi kalmamali (null iken "tel:null" basardi).
    expect(src).not.toContain('tel:${siteConfig.supportPhone}');
  });

  test('Telefon yapilandirilmamissa CTA hic render EDILMEZ', () => {
    const src = read('app/degerleme/page.tsx');

    // Her uc CTA da supportTelHref korumasi altinda olmali.
    for (const testId of [
      'insufficient-contact-cta',
      'manual-contact-cta',
      'error-contact-cta',
    ]) {
      const idx = src.indexOf(testId);
      expect(idx).toBeGreaterThan(-1);
      // CTA'dan hemen once koruma bulunmali.
      const before = src.slice(Math.max(0, idx - 400), idx);
      expect(before).toContain('supportTelHref');
    }
  });

  test('Footer iletisim blogu bos yapilandirmada gizlenir', () => {
    const src = read('components/Footer.tsx');
    expect(src).toContain('const showContact = Boolean(siteConfig.address || phoneHref)');
    expect(src).toContain('{showContact && (');
  });
});

describe('Beyaz etiket — operasyonel bildirim ayri kalir', () => {
  test('On yuz musteri yapilandirmasi backend bildirim hedefini KULLANMAZ', () => {
    const src = read('config/site-config.ts');
    // Musteri destek telefonu ile galeri WhatsApp/bildirim hedefi AYRI kavramlar.
    expect(src).not.toContain('GALLERY_WHATSAPP_PHONE');
  });

  test('Admin ayar ekrani varsayilan olarak gercek numara TASIMAZ', () => {
    const src = read('app/admin_panel/dashboard/api-settings/page.tsx');
    const offending = src
      .split('\n')
      .filter((line) => HARDCODED_TR_MOBILE.test(line.trim()));

    expect(offending).toEqual([]);
  });
});
