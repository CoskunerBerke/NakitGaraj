import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ConsignmentService } from './consignment.service';
import { CreateConsignmentDto } from './dto/create-consignment.dto';

@Controller('consignment')
export class ConsignmentController {
  constructor(private consignmentService: ConsignmentService) {}

  // Public form: rate-limited per IP (ThrottlerModule default, 100/min).
  @UseGuards(ThrottlerGuard)
  @Post()
  async createConsignment(@Body() dto: CreateConsignmentDto) {
    return this.consignmentService.createConsignment(dto);
  }
}
