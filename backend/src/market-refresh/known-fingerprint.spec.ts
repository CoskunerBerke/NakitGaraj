/** BILINEN ILAN HIZLI YOLU + KURESEL TEKILLESTIRME SOZLESMELERI. */
import {
  classifyCard,
  normalizeTitle,
  GlobalListingDeduper,
} from './known-fingerprint';
import { classifySession } from './persistent-profile';

const ref = { price: 1_450_000, mileage: 191_500, title: 'AUDI A3 1.4 TFSI S LINE' };

describe('classifyCard', () => {
  test('referans yok -> NEW (detay acilir)', () => {
    const r = classifyCard({ sourceListingId: '1', price: 100, mileage: 200, title: 'X' }, null);
    expect(r.decision).toBe('NEW');
    expect(r.shouldOpenDetail).toBe(true);
  });

  test('ayni parmak izi -> KNOWN_UNCHANGED, DETAY ACILMAZ', () => {
    const r = classifyCard({ sourceListingId: '1', ...ref }, ref);
    expect(r.decision).toBe('KNOWN_UNCHANGED');
    expect(r.change).toBeNull();
    expect(r.shouldOpenDetail).toBe(false);
  });

  test('fiyat degisti -> CHANGED / PRICE_CHANGED', () => {
    const r = classifyCard({ sourceListingId: '1', ...ref, price: 1_500_000 }, ref);
    expect(r.decision).toBe('CHANGED');
    expect(r.change).toBe('PRICE_CHANGED');
    expect(r.shouldOpenDetail).toBe(true);
  });

  test('km degisti -> CHANGED / MILEAGE_CHANGED', () => {
    const r = classifyCard({ sourceListingId: '1', ...ref, mileage: 195_000 }, ref);
    expect(r.change).toBe('MILEAGE_CHANGED');
  });

  test('baslik degisti -> CHANGED / TITLE_CHANGED (bosluk/harf normalize)', () => {
    const same = classifyCard({ sourceListingId: '1', ...ref, title: '  audi a3   1.4 TFSI s line ' }, ref);
    expect(same.decision).toBe('KNOWN_UNCHANGED'); // yalniz bosluk/harf farki = ayni
    const diff = classifyCard({ sourceListingId: '1', ...ref, title: 'AUDI A3 1.4 TFSI S LINE HATASIZ' }, ref);
    expect(diff.change).toBe('TITLE_CHANGED');
  });

  test('birden fazla alan degisti -> MULTIPLE_CHANGED (fiyat tek basina degil)', () => {
    const r = classifyCard({ sourceListingId: '1', ...ref, price: 1_500_000, mileage: 195_000 }, ref);
    expect(r.change).toBe('MULTIPLE_CHANGED');
  });

  test('null alan degisim SAYILMAZ (bilinmeyen != degisti)', () => {
    const r = classifyCard({ sourceListingId: '1', price: null, mileage: null, title: ref.title }, ref);
    expect(r.decision).toBe('KNOWN_UNCHANGED');
  });
});

describe('GlobalListingDeduper', () => {
  test('ayni ID iki farkli yapraktan gelirse TEK kayit', () => {
    const d = new GlobalListingDeduper();
    expect(d.observe('1331833768')).toBe(true); // A3 yapragindan
    expect(d.observe('1331833768')).toBe(false); // A3 Sportback yapragindan (ayni ilan)
    expect(d.observe('9999')).toBe(true);
    expect(d.size).toBe(2);
  });

  test('bos ID islenmez', () => {
    const d = new GlobalListingDeduper();
    expect(d.observe('')).toBe(false);
    expect(d.observe('  ')).toBe(false);
    expect(d.size).toBe(0);
  });
});

describe('normalizeTitle', () => {
  test('yerelden bagimsiz kucuk harf + tekil bosluk (AUDI==audi)', () => {
    expect(normalizeTitle('  AUDI   A3  ')).toBe('audi a3');
    expect(normalizeTitle('audi a3')).toBe('audi a3');
    // Yerelden bagimsiz: ASCII I -> i (noktasiz ı DEGIL), boylece marka
    // metni kararli karsilastirilir.
    expect(normalizeTitle('BMW 320I')).toBe('bmw 320i');
  });
});

describe('classifySession (saf siniflandirma)', () => {
  test('oturum izi -> SESSION_USABLE', () => {
    expect(classifySession('<a>Çıkış Yap</a><span>Hesabım</span>')).toBe('SESSION_USABLE');
  });
  test('giris cagrisi -> LOGIN_REQUIRED', () => {
    expect(classifySession('<button>Giriş Yap</button>')).toBe('LOGIN_REQUIRED');
  });
  test('Cloudflare Turnstile -> ACCESS_CHALLENGE (bypass yok)', () => {
    expect(classifySession('<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>')).toBe('ACCESS_CHALLENGE');
    expect(classifySession('Tarayıcınızı kontrol ediyoruz...')).toBe('ACCESS_CHALLENGE');
  });
});
