import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PrismaService } from '../prisma.service';
import { ConsignmentModule } from '../consignment/consignment.module';
import { AuditModule } from '../audit/audit.module';
import { ImportModule } from '../import/import.module';
import { EvaluationModule } from '../evaluation/evaluation.module';
import { ScraperCronService } from '../scraper/scraper-cron.service';

@Module({
  imports: [
    ConsignmentModule,
    AuditModule,
    ImportModule,
    EvaluationModule,
  ],
  providers: [
    AdminService,
    PrismaService,
    ScraperCronService,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
