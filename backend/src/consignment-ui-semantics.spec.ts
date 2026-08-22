/**
 * consignment-ui-semantics.spec.ts
 *
 * URUN GENELI KORUMA — ILAN FIYATI, MUSTERI NETI GIBI GOSTERILEMEZ.
 *
 * `consignmentListingPrice` (= `maxExpectedValue`) galerinin ISTEME fiyatidir
 * ve tanim geregi beklenen satisin USTUNDEDIR. `customerConsignmentNet` ise
 * musterinin eline gececek tutardir. Olculen ornek: 1.499.900 TL ilan,
 * 1.406.580 TL net.
 *
 * Musteri ekraninda tehlikeli bir yedek vardi:
 *   customerConsignmentNet || consignmentPrice
 * Net gelmediginde musteriye ILAN FIYATI "size kalacak net" etiketiyle
 * gosteriliyordu; yani gercekte alacagindan fazlasi vaat ediliyordu.
 *
 * NOT: on yuz dosyalarini okur. Depoda calisan tek test kosucusu backend jest.
 */
import * as fs from 'fs';
import * as path from 'path';

const FRONTEND_SRC = path.resolve(__dirname, '../../frontend/src');
const read = (rel: string) => fs.readFileSync(path.join(FRONTEND_SRC, rel), 'utf-8');

describe('Musteri ekrani — net ile ilan fiyati ayrimi', () => {
  const src = read('app/degerleme/page.tsx');

  test('Tehlikeli yedek (net || ilanFiyati) KALDIRILDI', () => {
    expect(src).not.toContain('consignmentCustomerNet || consignmentPrice');
  });

  test('Net gecerli degilse null olur, ilan fiyatina DUSULMEZ', () => {
    expect(src).toContain('const consignmentCustomerNet =');
    expect(src).toContain('Number.isFinite(rawCustomerNet)');
    // Net turetimi ilan fiyatini kaynak olarak KULLANMAMALI.
    const start = src.indexOf('const rawCustomerNet');
    const end = src.indexOf('const estimatedDaysToSell');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(src.slice(start, end)).not.toContain('consignmentPrice');
  });

  test('Net alani yalnizca gercek net ya da acik bir bilinmiyor durumu basar', () => {
    const idx = src.indexOf('data-testid="result-consignment-net"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 320);
    expect(block).toContain('consignmentCustomerNet !== null');
    expect(block).not.toContain('consignmentPrice');
  });

  test('Ilan fiyati KENDI etiketiyle ayrica gosterilmeye devam eder', () => {
    expect(src).toContain('İlan fiyatımız');
    expect(src).toContain('data-testid="result-consignment-price"');
  });
});

describe('Galeri paneli — tutarli konsinye terminolojisi', () => {
  const src = read('app/admin_panel/dashboard/valuations/page.tsx');

  test('Belirsiz konsinye etiketleri KALDIRILDI', () => {
    expect(src).not.toContain('Dükkan Konsinye Fiyatı');
    expect(src).not.toContain('Konsinye: {formatTL');
  });

  test('Ilan fiyati ILAN olarak etiketlenir', () => {
    expect(src).toContain('Önerilen Konsinye İlan Fiyatı');
  });

  test('Musteri neti AYRI ve dogru etiketle gosterilir', () => {
    expect(src).toContain('Konsinyede Müşteriye Tahmini Net');
    expect(src).toContain('selectedEval.customerConsignmentNet');
  });

  test('Eski kayitta net YENIDEN URETILMEZ, acikca bilinmiyor gosterilir', () => {
    const idx = src.indexOf('data-testid="admin-consignment-net"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toContain('Saklanmamış');
    // Komisyon/ilan/nakit uzerinden hesaplama YOK.
    expect(block).not.toContain('maxExpectedValue');
    expect(block).not.toContain('estimatedValue');
  });

  test('Panelde net icin sentetik aritmetik yok', () => {
    expect(src).not.toMatch(/customerConsignmentNet\s*[-+*/]/);
    expect(src).not.toMatch(/maxExpectedValue\s*-\s*/);
  });
});
