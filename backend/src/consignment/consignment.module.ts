import { Module } from '@nestjs/common';
import { ConsignmentService } from './consignment.service';
import { ConsignmentController } from './consignment.controller';
import { PrismaService } from '../prisma.service';
import { EvaluationModule } from '../evaluation/evaluation.module';

@Module({
  imports: [EvaluationModule],
  providers: [ConsignmentService, PrismaService],
  controllers: [ConsignmentController],
  exports: [ConsignmentService],
})
export class ConsignmentModule {}
