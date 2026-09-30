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
