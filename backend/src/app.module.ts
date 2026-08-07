import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { VehicleModule } from './vehicle/vehicle.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { ConsignmentModule } from './consignment/consignment.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { ImportModule } from './import/import.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{
      ttl: Number(process.env.THROTTLE_TTL) || 60000,
      limit: Number(process.env.THROTTLE_LIMIT) || 120,
    }]),
    ScheduleModule.forRoot(),
    AuthModule,
    VehicleModule,
    EvaluationModule,
    ConsignmentModule,
    AdminModule,
    AuditModule,
    ImportModule,
    TelegramModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
