import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import * as fs from 'fs';
import * as path from 'path';

export interface MarketSyncSettings {
  enabled: boolean;
  monthlyInflationPercentage: number;
  consignmentProfitPercentage: number;
  cashOfferProfitPercentage: number;
  luxuryMinProfitFixed: number;
  luxuryMaxProfitFixed: number;
  lastSyncDate: string | null;
  totalSpecsUpdated: number;
}

@Injectable()
export class MarketSyncCronService {
  private readonly logger = new Logger(MarketSyncCronService.name);
  private readonly settingsFilePath = path.join(process.cwd(), 'market-sync-settings.json');

  constructor(
    private prisma: PrismaService,
    private telegramService: TelegramService,
  ) {}

  getSettings(): MarketSyncSettings {
    try {
      if (fs.existsSync(this.settingsFilePath)) {
        const raw = fs.readFileSync(this.settingsFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        return {
          enabled: parsed.enabled ?? true,
          monthlyInflationPercentage: parsed.monthlyInflationPercentage ?? 2.5,
          consignmentProfitPercentage: parsed.consignmentProfitPercentage ?? 6.0,
          cashOfferProfitPercentage: parsed.cashOfferProfitPercentage ?? 12.0,
          luxuryMinProfitFixed: parsed.luxuryMinProfitFixed ?? 200000,
          luxuryMaxProfitFixed: parsed.luxuryMaxProfitFixed ?? 300000,
          lastSyncDate: parsed.lastSyncDate ?? null,
          totalSpecsUpdated: parsed.totalSpecsUpdated ?? 0,
        };
      }
    } catch (err) {
      this.logger.error('Failed to read market-sync-settings.json', err);
    }
    const defaultSettings: MarketSyncSettings = {
      enabled: true,
      monthlyInflationPercentage: 2.5,
      consignmentProfitPercentage: 6.0,
      cashOfferProfitPercentage: 12.0,
      luxuryMinProfitFixed: 200000,
      luxuryMaxProfitFixed: 300000,
      lastSyncDate: null,
      totalSpecsUpdated: 0,
    };
    this.saveSettings(defaultSettings);
    return defaultSettings;
  }

  saveSettings(settings: MarketSyncSettings) {
    try {
      fs.writeFileSync(this.settingsFilePath, JSON.stringify(settings, null, 2), 'utf8');
    } catch (err) {
      this.logger.error('Failed to write market-sync-settings.json', err);
    }
  }

  // AUTOMATED CRON JOB: Fires automatically on the 1st day of every month at midnight!
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async handleMonthlyAutoMarketSync() {
    this.logger.log('--- TRIGGERING AUTOMATED MONTHLY MARKET PRICE SYNC ---');
    const settings = this.getSettings();

    if (!settings.enabled) {
      this.logger.log('Automated monthly market price sync is disabled in settings.');
      return;
    }

    const percentage = settings.monthlyInflationPercentage || 2.5;
    const result = await this.performSync(percentage);

    settings.lastSyncDate = new Date().toISOString();
    settings.totalSpecsUpdated = result.updatedCount;
    this.saveSettings(settings);

    // Notify Gallery Admin via Telegram
    const formattedDate = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
    const message = `📢 <b>[NAKİTGARAJ OTOMATİK SİSTEM GÜNCELLEMESİ]</b>\n\n` +
      `🗓️ <b>Tarih:</b> ${formattedDate}\n` +
      `✅ <b>Durum:</b> Veritabanındaki ${result.updatedCount.toLocaleString('tr-TR')} araç için <b>%${percentage}</b> aylık piyasa güncellemesi otomatik uygulandı!\n\n` +
      `🚗 Müşterilerinize sunulan tüm nakit ve konsinye teklifleri güncel Türkiye ikinci el piyasasına 100% kalibre edilmiştir.`;

    await this.telegramService.sendTelegramMessage(message);
  }

  async performSync(percentage: number) {
    const multiplier = 1 + (percentage / 100);
    const specs = await this.prisma.vehicleSpecification.findMany();

    const updates: any[] = [];
    for (const spec of specs) {
      if (spec.originalMSRP && spec.originalMSRP > 0) {
        updates.push(
          this.prisma.vehicleSpecification.update({
            where: { id: spec.id },
            data: { originalMSRP: Math.round(spec.originalMSRP * multiplier) },
          })
        );
      }
    }

    const CHUNK_SIZE = 500;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      await this.prisma.$transaction(chunk);
    }

    return { updatedCount: updates.length, percentage };
  }
}
