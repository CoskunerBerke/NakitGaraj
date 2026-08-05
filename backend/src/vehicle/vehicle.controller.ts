import { Controller, Get, Post, Body, Query } from '@nestjs/common';
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
  async getModels(@Query('brandId') brandId: string) {
    return this.vehicleService.getModels(brandId);
  }

  @Get('variants')
  async getVariants(@Query('modelId') modelId: string) {
    return this.vehicleService.getVariants(modelId);
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
