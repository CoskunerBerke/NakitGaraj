import { Module } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { EvaluationController } from './evaluation.controller';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [EvaluationService, PrismaService],
  controllers: [EvaluationController],
  exports: [EvaluationService],
})
export class EvaluationModule {}
