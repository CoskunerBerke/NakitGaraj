import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { ConsignmentService } from '../consignment/consignment.service';
import { AuditService } from '../audit/audit.service';
import { ImportService } from '../import/import.service';
import { ScraperCronService } from '../scraper/scraper-cron.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { TelegramService } from '../telegram/telegram.service';

import { MarketSyncCronService } from '../vehicle/market-sync-cron.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private adminService: AdminService,
    private consignmentService: ConsignmentService,
    private auditService: AuditService,
    private importService: ImportService,
    private scraperCronService: ScraperCronService,
    private telegramService: TelegramService,
    private marketSyncCronService: MarketSyncCronService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('view_valuations')
  async getDashboard() {
    return this.adminService.getDashboardStats();
  }

  @Get('evaluations')
  @RequirePermissions('view_valuations')
  async getEvaluations() {
    return this.adminService.getEvaluations();
  }

  @Get('consignments')
  @RequirePermissions('manage_consignments')
  async getConsignments() {
    return this.consignmentService.getConsignments();
  }

  @Post('consignments/:id/status')
  @RequirePermissions('manage_consignments')
  async updateConsignmentStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('notes') notes: string,
    @Request() req: any,
  ) {
    const updated = await this.consignmentService.updateStatus(
      id,
      status,
      notes,
    );
    await this.auditService.log(
      'UPDATE_CONSIGNMENT_STATUS',
      'ConsignmentApplication',
      id,
      req.user.sub,
      req.ip,
      { status, notes },
    );
    return { success: true, updated };
  }

  @Get('logs')
  @RequirePermissions('view_audit_logs')
  async getLogs() {
    return this.auditService.getLogs();
  }

  @Post('import')
  @RequirePermissions('manage_vehicles')
  @UseInterceptors(FileInterceptor('file'))
  async importFile(
    @UploadedFile() file: any,
    @Body('format') format: string,
    @Request() req: any,
  ) {
    if (!file && format !== 'json') {
      throw new BadRequestException('Lütfen yüklenecek bir dosya seçiniz.');
    }

    let result: any;
    if (format === 'json') {
      const data =
        typeof req.body.data === 'string'
          ? JSON.parse(req.body.data)
          : req.body.data;
      result = await this.importService.importJson(data);
    } else if (file.originalname.endsWith('.csv')) {
      result = await this.importService.importCsv(file.buffer);
    } else if (
      file.originalname.endsWith('.xlsx') ||
      file.originalname.endsWith('.xls')
    ) {
      result = await this.importService.importExcel(file.buffer);
    } else {
      throw new BadRequestException(
        'Desteklenmeyen dosya formatı. Lütfen CSV, Excel veya JSON kullanın.',
      );
    }

    await this.auditService.log(
      'IMPORT_VEHICLE_DATA',
      'VehicleSpecification',
      undefined,
      req.user.sub,
      req.ip,
      { format, count: result.inserted + result.updated },
    );

    return result;
  }

  @Post('scraper/trigger')
  @RequirePermissions('manage_vehicles')
  async triggerScrape(@Request() req: any) {
    const msg = await this.scraperCronService.triggerManualScrape();
    await this.auditService.log(
      'TRIGGER_SCRAPER_MANUAL',
      'VehicleSpecification',
      undefined,
      req.user.sub,
      req.ip,
      {}
    );
    return { success: true, message: msg };
  }

  @Get('scraper/status')
  @RequirePermissions('manage_vehicles')
  async getScraperStatus() {
    return this.scraperCronService.getScraperStatus();
  }

  @Get('vehicle-requests')
  @RequirePermissions('view_valuations')
  async getVehicleRequests() {
    return this.adminService.getVehicleRequests();
  }

  @Post('vehicle-requests/:id/status')
  @RequirePermissions('manage_vehicles')
  async updateVehicleRequestStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.adminService.updateVehicleRequestStatus(id, status);
  }

  @Get('users')
  async getUsers() {
    return this.adminService.getUsers();
  }

  @Post('users')
  async createUser(
    @Body('email') email: string,
    @Body('password') password: string,
    @Body('firstName') firstName: string,
    @Body('lastName') lastName: string,
    @Body('roleName') roleName: string,
  ) {
    if (!email || !password || !firstName || !lastName) {
      throw new BadRequestException('Lütfen tüm zorunlu alanları doldurunuz.');
    }
    return this.adminService.createUser({
      email,
      password,
      firstName,
      lastName,
      roleName: roleName || 'STAFF',
    });
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  @Patch('users/:id/password')
  async updateUserPassword(
    @Param('id') id: string,
    @Body('password') newPassword: string,
  ) {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('Şifre en az 6 karakter olmalıdır.');
    }
    return this.adminService.updateUserPassword(id, newPassword);
  }

  @Get('telegram/settings')
  async getTelegramSettings() {
    return this.telegramService.getSettings();
  }

  @Post('telegram/settings')
  async saveTelegramSettings(
    @Body('botToken') botToken: string,
    @Body('chatIds') chatIds: string,
    @Body('galleryWhatsAppPhone') galleryWhatsAppPhone: string,
    @Body('enabled') enabled: boolean,
  ) {
    return this.telegramService.saveSettings({ botToken, chatIds, galleryWhatsAppPhone, enabled });
  }

  @Post('telegram/test')
  async testTelegram(
    @Body('botToken') botToken?: string,
    @Body('chatIds') chatIds?: string,
  ) {
    const text = `
<b>🚀 NAKİTGARAJ TELEGRAM BİLDİRİM TESTİ</b>

Tebrikler! Telegram bot entegrasyonunuz başarıyla çalışıyor.
Artık gelen tüm yeni <b>Araç Değerlemeleri</b> ve <b>Konsinye Başvuruları</b> bu kanala anında iletilecektir.

<b>📅 Tarih:</b> ${new Date().toLocaleString('tr-TR')}
`.trim();

    return this.telegramService.sendTelegramMessage(text, botToken, chatIds);
  }

  @Get('market-sync/settings')
  async getMarketSyncSettings() {
    return this.marketSyncCronService.getSettings();
  }

  @Post('market-sync/settings')
  async saveMarketSyncSettings(@Body() body: any) {
    const current = this.marketSyncCronService.getSettings();
    const updated = {
      ...current,
      ...body,
    };
    this.marketSyncCronService.saveSettings(updated);
    return { success: true, settings: updated };
  }
}
