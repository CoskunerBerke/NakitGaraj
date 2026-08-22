/**
 * notification-contact-config.spec.ts
 *
 * REGRESYON: bildirimlerdeki galeri/yetkili numarasi KAYNAK KODA GOMULMEZ.
 *
 * Bulunan hata: `adminPhone` iki bildirim metodunda da SABIT bir numaraya
 * esitlenmisti. O numara gecmiste yalnizca Telegram/test icin girilmisti.
 * Urun baska isletmelere satildiginda, satin alan isletmenin musterileri
 * yanlis kisiye yonlendirilirdi.
 *
 * Numara artik dagitima ozel ayardan (`galleryWhatsAppPhone`) gelir; ayar bos
 * ise buton HIC EKLENMEZ. Bu, musteri destek telefonundan AYRI bir kavramdir:
 * bu operasyonel bildirim hedefidir.
 */
import * as fs from 'fs';
import * as path from 'path';

const SERVICE_PATH = path.resolve(__dirname, 'telegram.service.ts');
const source = fs.readFileSync(SERVICE_PATH, 'utf-8');

/**
 * Sabit yazilmis TR cep numarasi kalibi (0 5XX XXX XX XX / +90...).
 * Kaynak kodda hicbir gercek numara bulunmamali.
 */
const HARDCODED_TR_MOBILE = /(?:\+?90|0)\s?5\d{2}\s?\d{3}\s?\d{2}\s?\d{2}/;

describe('Bildirim iletisim yapilandirmasi', () => {
  test('telegram.service.ts icinde SABIT telefon numarasi yok', () => {
    const offending = source
      .split('\n')
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(({ line }) => HARDCODED_TR_MOBILE.test(line));

    expect(offending).toEqual([]);
  });

  test('Yetkili numarasi ayardan okunur, sabit atanmaz', () => {
    expect(source).toContain('this.getSettings().galleryWhatsAppPhone');
    // "const adminPhone = '<duz metin numara>'" bicimi geri gelmemeli.
    expect(source).not.toMatch(/adminPhone\s*=\s*['"]\d/);
  });

  test('Buton etiketi numara SIZDIRMAZ', () => {
    expect(source).toContain("text: '📩 Yetkiliye İlet'");
    expect(source).not.toMatch(/Yetkiliye İlet \(\d/);
  });

  test('Ortam sablonunda gercek numara yok', () => {
    const envExample = fs.readFileSync(
      path.resolve(__dirname, '../../.env.example'),
      'utf-8',
    );
    const line = envExample
      .split('\n')
      .find((l) => l.startsWith('GALLERY_WHATSAPP_PHONE='));

    expect(line).toBe('GALLERY_WHATSAPP_PHONE=');
    expect(HARDCODED_TR_MOBILE.test(envExample)).toBe(false);
  });

  test('Ayar bos oldugunda WhatsApp baglantisi URETILMEZ', () => {
    // formatWhatsAppUrl bos girdide null doner; buton yalnizca url varsa eklenir.
    expect(source).toMatch(/if\s*\(!customerPhone\)\s*return null/);
    expect(source).toContain('if (adminWaUrl)');
  });
});
