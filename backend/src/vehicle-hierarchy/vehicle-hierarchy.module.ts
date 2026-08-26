import { Module } from '@nestjs/common';
import { VehicleHierarchyController } from './vehicle-hierarchy.controller';
import { VehicleHierarchyService } from './vehicle-hierarchy.service';

@Module({
  controllers: [VehicleHierarchyController],
  providers: [VehicleHierarchyService],
  exports: [VehicleHierarchyService],
})
export class VehicleHierarchyModule {}
