import { Module } from '@nestjs/common';
import { VehicleService } from './vehicle.service';
import { VehicleController } from './vehicle.controller';
import { MarketSyncCronService } from './market-sync-cron.service';
import { PrismaService } from '../prisma.service';
import { CacheService } from '../cache.service';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [TelegramModule],
  providers: [VehicleService, MarketSyncCronService, PrismaService, CacheService],
  controllers: [VehicleController],
  exports: [VehicleService, MarketSyncCronService],
})
export class VehicleModule {}
