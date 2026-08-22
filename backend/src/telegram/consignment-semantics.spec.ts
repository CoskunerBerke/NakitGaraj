/**
 * consignment-semantics.spec.ts
 *
 * REGRESYON: bildirimde KONSINYE ILAN FIYATI ile MUSTERI NETI karistirilmamali.
 *
 * Bulunan sorun (gercek ciktidan olculdu):
 *   beklenen satis  1.450.082 TL
 *   nakit teklif    1.350.000 TL
 *   ilan fiyati     1.499.900 TL   <- bildirimde "Dükkan Konsinye Fiyatımız"
 *   musteri neti    1.406.580 TL   <- bildirimde HIC GORUNMUYORDU
 *
 * "Dükkan Konsinye Fiyatımız" ifadesi "konsinyede sana odeyecegimiz" gibi
 * okunuyordu; oysa deger galerinin ISTEME fiyatiydi. Bayi musterinin gercekte
 * ne alacagini goremiyordu.
 *
 * Ayrica `fairMarketValue - cashOffer` farki "Net Kâr" olarak etiketlenmisti.
 * Bu BRUT marjdir; isletme ve risk maliyeti dusulmemistir.
 *
 * Fiyat formulleri DEGISMEDI — bu tamamen anlam/etiket duzeltmesidir.
 */
import { TelegramService } from './telegram.service';

const KNOWN = {
  market: 1_450_082,
  cash: 1_350_000,
  listing: 1_499_900,
  net: 1_406_580,
  grossMargin: 100_082, // 1.450.082 - 1.350.000
};

const tr = (n: number) => n.toLocaleString('tr-TR');

/** Bildirimi gondermeden, olusan metni yakalar. */
async function captureCaption(overrides: Record<string, any> = {}): Promise<string> {
  const svc: any = new TelegramService();
  svc.getSettings = () => ({
    botToken: 'test-token',
    chatIds: '123',
    galleryWhatsAppPhone: '',
    enabled: true,
  });

  let captured = '';
  svc.sendTelegramPhoto = async (_buf: any, caption: string) => { captured = caption; return true; };
  svc.sendTelegramMessage = async (caption: string) => { captured = caption; return true; };

  await svc.sendEvaluationNotification({
    licensePlate: '34QA1234',
    vehicleName: '2022 Peugeot 308 (1.2 PureTech)',
    mileage: 55_000,
    color: 'Beyaz',
    damageStatus: 'NO',
    fairMarketValue: KNOWN.market,
    finalOfferedPrice: KNOWN.cash,
    finalConsignmentPrice: KNOWN.listing,
    customerConsignmentNet: KNOWN.net,
    userDesiredPrice: 0,
    sellingTimeline: 'hemen',
    firstName: 'Test',
    lastName: 'Musteri',
    phone: '05550000000',
    ...overrides,
  });

  return captured;
}

describe('Bildirim — konsinye anlam ayrimi', () => {
  test('Ilan fiyati ILAN olarak etiketlenir', async () => {
    const caption = await captureCaption();
    expect(caption).toContain('Önerilen Konsinye İlan Fiyatı');
    expect(caption).toContain(tr(KNOWN.listing));
    // Eski, belirsiz etiket geri gelmemeli.
    expect(caption).not.toContain('Dükkan Konsinye Fiyatımız');
  });

  test('Musteri neti AYRI satirda ve dogru etiketle gosterilir', async () => {
    const caption = await captureCaption();
    expect(caption).toContain('Konsinyede Müşteriye Tahmini Net');
    expect(caption).toContain(tr(KNOWN.net));
  });

  test('Ilan fiyati MUSTERI NETI gibi sunulmaz', async () => {
    const caption = await captureCaption();
    const netIdx = caption.indexOf('Konsinyede Müşteriye Tahmini Net');
    const listingIdx = caption.indexOf('Önerilen Konsinye İlan Fiyatı');
    expect(netIdx).toBeGreaterThan(-1);
    expect(listingIdx).toBeGreaterThan(-1);

    // Net etiketinden sonraki satirda ILAN degeri degil NET degeri olmali.
    const netLine = caption.slice(netIdx, netIdx + 120);
    expect(netLine).toContain(tr(KNOWN.net));
    expect(netLine).not.toContain(tr(KNOWN.listing));
  });

  test('Brut marj "Net Kâr" olarak adlandirilmaz', async () => {
    const caption = await captureCaption();
    expect(caption).toContain('Brüt Marj');
    expect(caption).toContain(tr(KNOWN.grossMargin));
    expect(caption).not.toContain('Net Kâr');
  });

  test('Piyasa ve nakit degerleri korunur', async () => {
    const caption = await captureCaption();
    expect(caption).toContain(tr(KNOWN.market));
    expect(caption).toContain(tr(KNOWN.cash));
  });

  /**
   * Net cekirdekten gelmiyorsa UYDURULMAZ: satir hic basilmaz.
   * Ozellikle ilan fiyati net yerine GECMEZ.
   */
  test('Net yoksa net satiri hic gosterilmez, ilan fiyati yerine gecmez', async () => {
    const caption = await captureCaption({ customerConsignmentNet: null });
    expect(caption).not.toContain('Konsinyede Müşteriye Tahmini Net');
    expect(caption).toContain('Önerilen Konsinye İlan Fiyatı');
  });

  test('Ekonomik siralama bildirimde tutarli: nakit < net < ilan', () => {
    expect(KNOWN.cash).toBeLessThan(KNOWN.net);
    expect(KNOWN.net).toBeLessThan(KNOWN.market);
    expect(KNOWN.market).toBeLessThanOrEqual(KNOWN.listing);
  });
});
