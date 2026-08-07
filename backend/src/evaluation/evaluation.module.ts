import { Module } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { EvaluationController } from './evaluation.controller';
import { PrismaService } from '../prisma.service';
import { EmsalMatcherService } from './emsal-matcher.service';

@Module({
  providers: [EvaluationService, EmsalMatcherService, PrismaService],
  controllers: [EvaluationController],
  exports: [EvaluationService, EmsalMatcherService],
})
export class EvaluationModule {}

