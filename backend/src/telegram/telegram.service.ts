import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { generateTelegramCardBuffer, TelegramCardData } from './telegram.card-generator';

export interface TelegramSettings {
  botToken: string;
  chatIds: string; // Comma separated IDs or group IDs (e.g. "123456789, 987654321")
  galleryWhatsAppPhone?: string; // Gallery phone number
  enabled: boolean;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private settingsFilePath = fs.existsSync(path.join(process.cwd(), 'backend/telegram-settings.json'))
    ? path.join(process.cwd(), 'backend/telegram-settings.json')
    : path.join(process.cwd(), 'telegram-settings.json');

  constructor() {
    this.ensureSettingsFile();
  }

  private ensureSettingsFile() {
    if (!fs.existsSync(this.settingsFilePath)) {
      const defaultSettings: TelegramSettings = {
        botToken: process.env.TELEGRAM_BOT_TOKEN || '8991553205:AAHbEJIsdi6IopkKoH4H1PpgghCoYg2P2Y8',
        chatIds: process.env.TELEGRAM_CHAT_IDS || '1835798213',
        galleryWhatsAppPhone: process.env.GALLERY_WHATSAPP_PHONE || '05350379074',
        enabled: true,
      };
      fs.writeFileSync(this.settingsFilePath, JSON.stringify(defaultSettings, null, 2), 'utf-8');
    }
  }

  getSettings(): TelegramSettings {
    try {
      this.ensureSettingsFile();
      const content = fs.readFileSync(this.settingsFilePath, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      return { botToken: '', chatIds: '', galleryWhatsAppPhone: '', enabled: true };
    }
  }

  saveSettings(settings: Partial<TelegramSettings>): TelegramSettings {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    fs.writeFileSync(this.settingsFilePath, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  }

  formatWhatsAppUrl(customerPhone?: string, messageText?: string): string | null {
    if (!customerPhone) return null;
    let clean = customerPhone.replace(/\D/g, '');
    if (!clean) return null;

    if (clean.startsWith('0')) {
      clean = '9' + clean;
    } else if (!clean.startsWith('90') && clean.length === 10) {
      clean = '90' + clean;
    }

    const encodedText = encodeURIComponent(messageText || 'Merhaba, NakitGaraj üzerinden başvurunuz ile ilgili yazıyorum.');
    return `https://wa.me/${clean}?text=${encodedText}`;
  }

  async sendTelegramMessage(
    text: string,
    customToken?: string,
    customChatIds?: string,
    replyMarkup?: any,
  ): Promise<{ success: boolean; message: string }> {
    const settings = this.getSettings();
    const token = (customToken !== undefined ? customToken : settings.botToken).trim();
    const rawChatIds = (customChatIds !== undefined ? customChatIds : settings.chatIds).trim();

    if (!token) {
      this.logger.warn('Telegram Bot Token is missing. Message not sent.');
      return { success: false, message: 'Telegram Bot Token tanımlanmamış.' };
    }

    if (!rawChatIds) {
      this.logger.warn('Telegram Chat IDs are missing. Message not sent.');
      return { success: false, message: 'Telegram Chat ID (Alıcılar) tanımlanmamış.' };
    }

    const chatIdList = rawChatIds
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (chatIdList.length === 0) {
      return { success: false, message: 'Geçerli alıcı Telegram Chat ID bulunamadı.' };
    }

    let successCount = 0;
    let lastError = '';

    for (const chatId of chatIdList) {
      try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const payload: any = {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        };

        if (replyMarkup) {
          payload.reply_markup = replyMarkup;
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const resData = await response.json();

        if (resData.ok) {
          successCount++;
        } else {
          lastError = resData.description || 'Bilinmeyen hata';
          this.logger.error(`Telegram send error to ${chatId}: ${lastError}`);
        }
      } catch (err: any) {
        lastError = err.message || 'Bağlantı hatası';
        this.logger.error(`Telegram fetch error for ${chatId}: ${lastError}`);
      }
    }

    if (successCount > 0) {
      return { success: true, message: `${successCount}/${chatIdList.length} alıcıya Telegram bildirimi başarıyla gönderildi.` };
    } else {
      return { success: false, message: `Telegram mesajı gönderilemedi: ${lastError}` };
    }
  }

  async sendTelegramPhoto(
    photoBuffer: Buffer,
    caption?: string,
    customToken?: string,
    customChatIds?: string,
    replyMarkup?: any,
  ): Promise<{ success: boolean; message: string }> {
    const settings = this.getSettings();
    const token = (customToken !== undefined ? customToken : settings.botToken).trim();
    const rawChatIds = (customChatIds !== undefined ? customChatIds : settings.chatIds).trim();

    if (!token || !rawChatIds) {
      return this.sendTelegramMessage(caption || 'Yeni Araç Değerlemesi!', customToken, customChatIds, replyMarkup);
    }

    const chatIdList = rawChatIds
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    let successCount = 0;
    let lastError = '';

    for (const chatId of chatIdList) {
      try {
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('photo', new Blob([new Uint8Array(photoBuffer)], { type: 'image/png' }), 'nakitgaraj_degerleme.png');
        if (caption) {
          formData.append('caption', caption);
          formData.append('parse_mode', 'HTML');
        }
        if (replyMarkup) {
          formData.append('reply_markup', JSON.stringify(replyMarkup));
        }

        const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          body: formData,
        });

        const resData = await response.json();
        if (resData.ok) {
          successCount++;
        } else {
          lastError = resData.description || 'Photo send error';
          this.logger.error(`Telegram sendPhoto error to ${chatId}: ${lastError}`);
        }
      } catch (err: any) {
        lastError = err.message || 'Connection error';
        this.logger.error(`Telegram sendPhoto fetch error for ${chatId}: ${lastError}`);
      }
    }

    if (successCount > 0) {
      return { success: true, message: `${successCount}/${chatIdList.length} alıcıya görsel Telegram bildirimi başarıyla gönderildi.` };
    } else {
      return this.sendTelegramMessage(caption || 'Yeni Araç Değerlemesi!', customToken, customChatIds, replyMarkup);
    }
  }

  async sendEvaluationNotification(evalData: {
    licensePlate: string;
    vehicleName: string;
    brandName?: string;
    modelName?: string;
    variantName?: string;
    bodyType?: string;
    year?: number;
    transmission?: string;
    fuel?: string;
    mileage: number;
    color: string;
    damageStatus: string;
    tramerAmount?: string | number;
    paintScheme?: any;
    chassisStatus?: any;
    firstName?: string;
    lastName?: string;
    phone?: string;
    userDesiredPrice?: number;
    fairMarketValue: number;
    finalOfferedPrice: number;
    finalConsignmentPrice: number;
    sellingTimeline?: string;
  }) {
    const desiredText = evalData.userDesiredPrice
      ? `<b>💰 Müşteri Beklentisi:</b> ${evalData.userDesiredPrice.toLocaleString('tr-TR')} ₺\n`
      : '<b>💰 Müşteri Beklentisi:</b> Belirtilmedi\n';

    const profit = Math.max(0, evalData.fairMarketValue - evalData.finalOfferedPrice);

    const caption = `
<b>🚗 YENİ NAKİTGARAJ ARAÇ DEĞERLEMESİ!</b>

<b>👤 Müşteri:</b> ${evalData.firstName || 'İsimsiz'} ${evalData.lastName || ''}
<b>📞 Telefon:</b> ${evalData.phone || 'Belirtilmedi'}
<b>🚘 Araç:</b> ${evalData.vehicleName}
<b>🛣️ Kilometre:</b> ${evalData.mileage.toLocaleString('tr-TR')} km
<b>📋 Plaka:</b> ${evalData.licensePlate || '34ABC123'} | <b>Renk:</b> ${evalData.color}

${desiredText}<b>📉 Piyasa Satış Değeri:</b> ${evalData.fairMarketValue.toLocaleString('tr-TR')} ₺
<b>💵 Anında Nakit Alım Teklifimiz:</b> ${evalData.finalOfferedPrice.toLocaleString('tr-TR')} ₺ <i>(Net Kâr: ${profit.toLocaleString('tr-TR')} ₺)</i>
<b>🏪 Dükkan Konsinye Fiyatımız:</b> ${evalData.finalConsignmentPrice.toLocaleString('tr-TR')} ₺

<b>⏱️ Satış Aciliyeti:</b> ${evalData.sellingTimeline || 'Hemen'}
<b>📅 Tarih:</b> ${new Date().toLocaleString('tr-TR')}
`.trim();

    const customerWaUrl = this.formatWhatsAppUrl(
      evalData.phone,
      `Merhabalar ${evalData.firstName || ''}, NakitGaraj üzerinden ${evalData.vehicleName} (${evalData.licensePlate || ''}) aracınız için yaptığınız değerleme ile ilgili yazıyorum.`,
    );

    const adminPhone = '05350379074';
    const adminText = `🚗 YENİ NAKİTGARAJ ARAÇ DEĞERLEMESİ!\n\n👤 Müşteri: ${evalData.firstName || 'İsimsiz'} ${evalData.lastName || ''}\n📞 Telefon: ${evalData.phone || 'Belirtilmedi'}\n🚘 Araç: ${evalData.vehicleName}\n🛣️ Kilometre: ${evalData.mileage ? evalData.mileage.toLocaleString('tr-TR') : 0} km\n📋 Plaka: ${evalData.licensePlate || ''} | Renk: ${evalData.color || ''}\n\n${evalData.userDesiredPrice ? '💰 Müşteri Beklentisi: ' + evalData.userDesiredPrice.toLocaleString('tr-TR') + ' ₺\n' : ''}📉 Piyasa Satış Değeri: ${evalData.fairMarketValue ? evalData.fairMarketValue.toLocaleString('tr-TR') : 0} ₺\n💵 Anında Nakit Alım Teklifimiz: ${evalData.finalOfferedPrice ? evalData.finalOfferedPrice.toLocaleString('tr-TR') : 0} ₺ (Net Kâr: ${profit.toLocaleString('tr-TR')} ₺)\n🏪 Dükkan Konsinye Fiyatımız: ${evalData.finalConsignmentPrice ? evalData.finalConsignmentPrice.toLocaleString('tr-TR') : 0} ₺\n\n⏱️ Satış Aciliyeti: ${evalData.sellingTimeline || 'Hemen'}\n📅 Tarih: ${new Date().toLocaleString('tr-TR')}`;

    const adminWaUrl = this.formatWhatsAppUrl(adminPhone, adminText);

    const inlineKeyboard: any[] = [];
    if (customerWaUrl) {
      inlineKeyboard.push([{ text: '📱 Müşteriye WhatsApp Mesajı At', url: customerWaUrl }]);
    }
    if (adminWaUrl) {
      inlineKeyboard.push([{ text: '📩 Yetkiliye İlet (05350379074)', url: adminWaUrl }]);
    }

    const replyMarkup = inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined;

    // Generate Card Buffer
    let paintSchemeObj: Record<string, string> = {};
    if (evalData.paintScheme) {
      try {
        paintSchemeObj = typeof evalData.paintScheme === 'string' ? JSON.parse(evalData.paintScheme) : evalData.paintScheme;
      } catch (e) {}
    }

    let chassisStatusObj: any = {};
    if (evalData.chassisStatus) {
      try {
        chassisStatusObj = typeof evalData.chassisStatus === 'string' ? JSON.parse(evalData.chassisStatus) : evalData.chassisStatus;
      } catch (e) {}
    }

    try {
      const cardBuffer = await generateTelegramCardBuffer({
        licensePlate: evalData.licensePlate,
        vehicleName: evalData.vehicleName,
        brandName: evalData.brandName,
        modelName: evalData.modelName,
        variantName: evalData.variantName,
        bodyType: evalData.bodyType,
        year: evalData.year,
        transmission: evalData.transmission,
        fuel: evalData.fuel,
        color: evalData.color,
        mileage: evalData.mileage,
        tramerAmount: evalData.tramerAmount,
        damageStatus: evalData.damageStatus,
        paintScheme: paintSchemeObj,
        chassisStatus: chassisStatusObj,
        firstName: evalData.firstName,
        lastName: evalData.lastName,
        phone: evalData.phone,
        finalOfferedPrice: evalData.finalOfferedPrice,
        fairMarketValue: evalData.fairMarketValue,
        finalConsignmentPrice: evalData.finalConsignmentPrice,
      });

      return this.sendTelegramPhoto(cardBuffer, caption, undefined, undefined, replyMarkup);
    } catch (err: any) {
      this.logger.error('Failed to generate Telegram photo card:', err.message);
      return this.sendTelegramMessage(caption, undefined, undefined, replyMarkup);
    }
  }

  private formatConsignmentNotes(rawNotes?: string): { paintText: string; equipText: string; userNoteText: string; paintSchemeObj?: any } {
    if (!rawNotes) {
      return { paintText: 'Belirtilmedi', equipText: 'Belirtilmedi', userNoteText: 'Yok' };
    }

    try {
      if (rawNotes.trim().startsWith('{')) {
        const parsed = JSON.parse(rawNotes);
        const paintScheme = parsed.paintScheme || {};
        const equipmentsObj = parsed.equipmentsObj || {};
        const vehicleStatusObj = parsed.vehicleStatusObj || {};
        const userNote = parsed.userNote || parsed.notes || '';

        // 1. Format Paint Scheme (Ekspertiz)
        const nonOriginal: string[] = [];
        let originalCount = 0;

        Object.entries(paintScheme).forEach(([part, status]) => {
          if (status !== 'ORIJINAL') {
            nonOriginal.push(` • ${part}: <b>${status}</b>`);
          } else {
            originalCount++;
          }
        });

        let paintText = ' • Hatasız / Tüm Parçalar Orijinal';
        if (nonOriginal.length > 0) {
          paintText = nonOriginal.join('\n') + (originalCount > 0 ? `\n • Diğer ${originalCount} Parça: Orijinal` : '');
        }

        // 2. Format Equipments & Vehicle Status
        const features: string[] = [];
        if (equipmentsObj.sunroof) features.push('Sunroof');
        if (equipmentsObj.panoramikTavan) features.push('Panoramik Tavan');
        if (equipmentsObj.camTavan) features.push('Cam Tavan');
        if (equipmentsObj.otherFeatures) features.push(equipmentsObj.otherFeatures);

        if (vehicleStatusObj.drivetrain) features.push(`Çeker: ${vehicleStatusObj.drivetrain}`);
        if (vehicleStatusObj.spareKey) features.push('Yedek Anahtar: Var');
        if (vehicleStatusObj.heavyDamage) features.push('⚠️ Ağır Hasarlı Kaydı Var');
        if (vehicleStatusObj.importExport) features.push(`Menşei: ${vehicleStatusObj.importExport}`);

        const equipText = features.length > 0 ? features.map((f) => ` • ${f}`).join('\n') : ' • Standart Donanım';

        return {
          paintText,
          equipText,
          userNoteText: userNote || 'Yok',
          paintSchemeObj: paintScheme,
        };
      }
    } catch (e) {}

    return { paintText: 'Belirtilmedi', equipText: 'Belirtilmedi', userNoteText: rawNotes };
  }

  async sendConsignmentNotification(consignmentData: {
    firstName: string;
    lastName: string;
    phone: string;
    province: string;
    district: string;
    vehicleName: string;
    mileage?: number;
    licensePlate?: string;
    desiredPrice?: number;
    notes?: string;
  }) {
    const priceText = consignmentData.desiredPrice
      ? `<b>🏷️ İstenen Konsinye Fiyatı:</b> ${consignmentData.desiredPrice.toLocaleString('tr-TR')} ₺\n`
      : '';

    const parsedNotes = this.formatConsignmentNotes(consignmentData.notes);

    const caption = `
<b>📢 YENİ KONSİNYE (DÜKKANA BIRAKMA) BAŞVURUSU!</b>

<b>👤 Müşteri:</b> ${consignmentData.firstName} ${consignmentData.lastName}
<b>📞 Telefon:</b> ${consignmentData.phone}
<b>📍 Konum:</b> ${consignmentData.province} / ${consignmentData.district}
<b>🚘 Araç:</b> ${consignmentData.vehicleName}
<b>Est. Kilometre:</b> ${consignmentData.mileage ? consignmentData.mileage.toLocaleString('tr-TR') + ' km' : 'Belirtilmedi'}
${priceText}
<b>🎨 Ekspertiz / Kaporta Durumu:</b>
${parsedNotes.paintText}

<b>⚡ Donanım & Araç Durumu:</b>
${parsedNotes.equipText}

<b>📝 Müşteri Notu:</b> ${parsedNotes.userNoteText}
<b>📅 Tarih:</b> ${new Date().toLocaleString('tr-TR')}
`.trim();

    const customerWaUrl = this.formatWhatsAppUrl(
      consignmentData.phone,
      `Merhabalar ${consignmentData.firstName || ''}, NakitGaraj üzerinden ${consignmentData.vehicleName} dükkana bırakma (konsinye) başvurunuz ile ilgili iletişime geçiyorum.`,
    );

    const adminPhone = '05350379074';
    const adminText = `🏪 YENİ DÜKKANA BIRAKMA (KONSİNYE) BAŞVURUSU!\n\n👤 Müşteri: ${consignmentData.firstName || ''} ${consignmentData.lastName || ''}\n📞 Telefon: ${consignmentData.phone || ''}\n🚘 Araç: ${consignmentData.vehicleName}\nKM: ${consignmentData.mileage ? consignmentData.mileage.toLocaleString('tr-TR') : 0} km\nPlaka: ${consignmentData.licensePlate || ''}\n\n💰 Müşteri Fiyatı: ${consignmentData.desiredPrice ? consignmentData.desiredPrice.toLocaleString('tr-TR') : 0} ₺\n📅 Tarih: ${new Date().toLocaleString('tr-TR')}`;

    const adminWaUrl = this.formatWhatsAppUrl(adminPhone, adminText);

    const inlineKeyboard: any[] = [];
    if (customerWaUrl) {
      inlineKeyboard.push([{ text: '📱 Müşteriye WhatsApp Mesajı At', url: customerWaUrl }]);
    }
    if (adminWaUrl) {
      inlineKeyboard.push([{ text: '📩 Yetkiliye İlet (05350379074)', url: adminWaUrl }]);
    }

    const replyMarkup = inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined;

    try {
      const cardBuffer = await generateTelegramCardBuffer({
        licensePlate: consignmentData.licensePlate,
        vehicleName: consignmentData.vehicleName,
        mileage: consignmentData.mileage || 0,
        paintScheme: parsedNotes.paintSchemeObj || {},
        firstName: consignmentData.firstName,
        lastName: consignmentData.lastName,
        phone: consignmentData.phone,
        finalOfferedPrice: consignmentData.desiredPrice || 0,
      });

      return this.sendTelegramPhoto(cardBuffer, caption, undefined, undefined, replyMarkup);
    } catch (err: any) {
      return this.sendTelegramMessage(caption, undefined, undefined, replyMarkup);
    }
  }
}
