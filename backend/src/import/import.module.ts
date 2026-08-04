import { Module } from '@nestjs/common';
import { ImportService } from './import.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [ImportService, PrismaService],
  exports: [ImportService],
})
export class ImportModule {}
