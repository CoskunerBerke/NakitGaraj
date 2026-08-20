import { BadRequestException, Controller, Get, Post, Body, Query } from '@nestjs/common';
import { VehicleService } from './vehicle.service';
import { MarketSyncCronService, MarketSyncSettings } from './market-sync-cron.service';
import { CreateVehicleRequestDto } from './dto/create-vehicle-request.dto';

@Controller()
export class VehicleController {
  constructor(
    private vehicleService: VehicleService,
    private marketSyncCronService: MarketSyncCronService,
  ) {}

  @Get('brands')
  async getBrands() {
    return this.vehicleService.getBrands();
  }

  @Get('models')
  async getModels(@Query('brandId') brandId: string, @Query('year') year?: number) {
    return this.vehicleService.getModels(brandId, year);
  }

  @Get('variants')
  async getVariants(
    @Query('modelId') modelId: string,
    @Query('brandId') brandId?: string,
    @Query('year') year?: number,
  ) {
    return this.vehicleService.getVariants(modelId, brandId, year);
  }

  @Get('packages')
  async getPackages(
    @Query('variantId') variantId: string,
    @Query('modelId') modelId?: string,
    @Query('brandId') brandId?: string,
    @Query('year') year?: number,
  ) {
    return this.vehicleService.getPackages(variantId, modelId, brandId, year);
  }

  /**
   * SALT-OKUNUR musteri arac katalogu — GERCEK Sahibinden ilanlarindan.
   * Katalogda (VehicleSpecification) kayit olmamasi gercek bir araci
   * musteri formundan dusuremez; tek gercek kaynak RawVehicleListing'dir.
   *
   * level: makes | models | engines | trims | years | bodies
   * Girdi canonical AD (make/model/engine) ya da katalog ID'si olabilir.
   */
  @Get('observed-options')
  async getObservedOptions(
    @Query('level') level: string,
    @Query('make') make?: string,
    @Query('model') model?: string,
    @Query('engine') engine?: string,
    @Query('brandId') brandId?: string,
    @Query('modelId') modelId?: string,
    @Query('variantId') variantId?: string,
    @Query('year') year?: string,
  ) {
    const clean = (v?: string) => {
      const t = (v ?? '').toString().trim();
      // Serbest metin: uzunluk sinirli, kontrol karakteri yok. Sorgular Prisma
      // uzerinden parametrik calisir (ham SQL yok).
      if (!t || t.length > 120) return undefined;
      // Kontrol karakterlerini at (kod noktasi ile; kacis dizisi kullanmadan).
      return Array.from(t)
        .filter((ch) => {
          const code = ch.codePointAt(0) ?? 0;
          return code >= 32 && code !== 127;
        })
        .join('');
    };
    const numYear = Number(year);
    const y = Number.isFinite(numYear) && numYear >= 1980 && numYear <= 2100 ? numYear : undefined;
    const args = {
      make: clean(make), model: clean(model), engine: clean(engine),
      brandId: clean(brandId), modelId: clean(modelId), variantId: clean(variantId),
      year: y,
    };

    switch ((level || '').toLowerCase()) {
      case 'makes':
        return this.vehicleService.getObservedMakes();
      case 'models':
        return this.vehicleService.getObservedModels(args);
      case 'engines':
        return this.vehicleService.getObservedEngines(args);
      case 'trims':
        return this.vehicleService.getObservedTrims(args);
      case 'years':
        return this.vehicleService.getObservedYears(args);
      case 'bodies':
        return this.vehicleService.getObservedBodyTypes(args);
      default:
        throw new BadRequestException('Geçersiz seçenek düzeyi.');
    }
  }

  /** Geriye donuk uyumluluk: yalnizca kasa tipleri. */
  @Get('observed-body-types')
  async getObservedBodyTypes(
    @Query('modelId') modelId: string,
    @Query('brandId') brandId?: string,
    @Query('variantId') variantId?: string,
    @Query('year') year?: number,
  ) {
    return this.vehicleService.getObservedBodyTypes({ modelId, brandId, variantId, year });
  }

  @Get('years')
  async getYears() {
    return this.vehicleService.getYears();
  }

  @Get('vehicle-data')
  async getVehicleData(
    @Query('year') year: number,
    @Query('manufacturerId') manufacturerId: string,
    @Query('modelId') modelId: string,
    @Query('variantId') variantId?: string,
    @Query('packageId') packageId?: string,
    @Query('bodyTypeId') bodyTypeId?: string,
    @Query('fuelTypeId') fuelTypeId?: string,
    @Query('transmissionTypeId') transmissionTypeId?: string,
  ) {
    return this.vehicleService.getVehicleData({
      year,
      manufacturerId,
      modelId,
      variantId,
      packageId,
      bodyTypeId,
      fuelTypeId,
      transmissionTypeId,
    });
  }

  @Post('vehicle-requests')
  async createVehicleRequest(@Body() dto: CreateVehicleRequestDto) {
    return this.vehicleService.createVehicleRequest(dto);
  }

  @Post('admin/adjust-market-prices')
  async adjustMarketPrices(
    @Body('percentage') percentage: number,
    @Body('brandName') brandName?: string,
  ) {
    return this.vehicleService.adjustMarketPrices(percentage, brandName);
  }

  @Get('admin/market-sync-settings')
  async getMarketSyncSettings() {
    return this.marketSyncCronService.getSettings();
  }

  @Post('admin/market-sync-settings')
  async updateMarketSyncSettings(@Body() body: Partial<MarketSyncSettings>) {
    const current = this.marketSyncCronService.getSettings();
    const updated = { ...current, ...body };
    this.marketSyncCronService.saveSettings(updated);
    return updated;
  }

  @Post('admin/trigger-market-sync')
  async triggerMarketSync() {
    await this.marketSyncCronService.handleMonthlyAutoMarketSync();
    return { success: true, message: 'Automated market sync executed successfully.' };
  }
}
