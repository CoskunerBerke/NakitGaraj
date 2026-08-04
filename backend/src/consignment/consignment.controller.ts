import { Controller, Post, Body } from '@nestjs/common';
import { ConsignmentService } from './consignment.service';
import { CreateConsignmentDto } from './dto/create-consignment.dto';

@Controller('consignment')
export class ConsignmentController {
  constructor(private consignmentService: ConsignmentService) {}

  @Post()
  async createConsignment(@Body() dto: CreateConsignmentDto) {
    return this.consignmentService.createConsignment(dto);
  }
}
