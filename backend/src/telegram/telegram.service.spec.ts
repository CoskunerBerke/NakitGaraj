import { TelegramService } from './telegram.service';

jest.mock('./telegram.card-generator', () => ({
  generateTelegramCardBuffer: jest.fn().mockResolvedValue(Buffer.from('card')),
}));

describe('TelegramService notifications (HTML parse mode)', () => {
  let service: TelegramService;
  let sendPhoto: jest.SpyInstance;

  beforeEach(() => {
    service = new TelegramService();
    jest.spyOn(service, 'getSettings').mockReturnValue({
      botToken: 'test-token',
      chatIds: '1',
      galleryWhatsAppPhone: '05550000000',
      enabled: true,
    });
    sendPhoto = jest
      .spyOn(service, 'sendTelegramPhoto')
      .mockResolvedValue({ success: true, message: 'ok' });
  });

  it('escapes customer input in valuation notifications', async () => {
    await service.sendEvaluationNotification({
      licensePlate: '06ABC123',
      vehicleName: '2020 Fiat Egea (1.4 Fire)',
      mileage: 85000,
      color: 'Beyaz',
      damageStatus: 'NO',
      firstName: '<Ali & Veli>',
      lastName: 'Örnek',
      phone: '05550000000',
      fairMarketValue: 640000,
      finalOfferedPrice: 570000,
      finalConsignmentPrice: 654000,
    });

    const caption: string = sendPhoto.mock.calls[0][1];
    expect(caption).toContain('&lt;Ali &amp; Veli&gt;');
    expect(caption).not.toContain('<Ali');
    expect(caption).toContain('<b>'); // own formatting is kept
  });

  it('sends the "forward to manager" button to the configured gallery phone', async () => {
    await service.sendEvaluationNotification({
      licensePlate: '06ABC123',
      vehicleName: '2020 Fiat Egea (1.4 Fire)',
      mileage: 85000,
      color: 'Beyaz',
      damageStatus: 'NO',
      fairMarketValue: 640000,
      finalOfferedPrice: 570000,
      finalConsignmentPrice: 654000,
    });

    const replyMarkup = sendPhoto.mock.calls[0][4];
    const buttons = replyMarkup.inline_keyboard.flat();
    const forward = buttons.find((b: any) => b.text.startsWith('📩'));
    expect(forward.text).toContain('05550000000');
    expect(forward.url).toContain('wa.me/905550000000');
  });

  it('omits the "forward to manager" button when no gallery phone is configured', async () => {
    (service.getSettings as jest.Mock).mockReturnValue({
      botToken: 'test-token',
      chatIds: '1',
      galleryWhatsAppPhone: '',
      enabled: true,
    });
    const savedEnv = process.env.GALLERY_WHATSAPP_PHONE;
    delete process.env.GALLERY_WHATSAPP_PHONE;
    try {
      await service.sendEvaluationNotification({
        licensePlate: '06ABC123',
        vehicleName: '2020 Fiat Egea (1.4 Fire)',
        mileage: 85000,
        color: 'Beyaz',
        damageStatus: 'NO',
        phone: '05551112233',
        fairMarketValue: 640000,
        finalOfferedPrice: 570000,
        finalConsignmentPrice: 654000,
      });
    } finally {
      if (savedEnv !== undefined) process.env.GALLERY_WHATSAPP_PHONE = savedEnv;
    }

    const replyMarkup = sendPhoto.mock.calls[0][4];
    const buttons = replyMarkup.inline_keyboard.flat();
    expect(buttons.some((b: any) => b.text.startsWith('📩'))).toBe(false);
    // The customer's own WhatsApp button is still there.
    expect(buttons.some((b: any) => b.url.includes('wa.me/905551112233'))).toBe(true);
  });

  it('escapes free-text notes in consignment notifications', async () => {
    await service.sendConsignmentNotification({
      firstName: 'Ayşe',
      lastName: 'Örnek',
      phone: '05550000000',
      province: 'Ankara',
      district: 'Çankaya',
      vehicleName: 'Belirtilmedi',
      notes: 'Acil satılık <3 & pazarlık payı var',
    });

    const caption: string = sendPhoto.mock.calls[0][1];
    expect(caption).toContain('Acil satılık &lt;3 &amp; pazarlık payı var');
  });
});
