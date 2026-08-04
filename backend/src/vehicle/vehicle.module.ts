import { Module } from '@nestjs/common';
import { VehicleService } from './vehicle.service';
import { VehicleController } from './vehicle.controller';
import { PrismaService } from '../prisma.service';
import { CacheService } from '../cache.service';

@Module({
  providers: [VehicleService, PrismaService, CacheService],
  controllers: [VehicleController],
  exports: [VehicleService],
})
export class VehicleModule {}
