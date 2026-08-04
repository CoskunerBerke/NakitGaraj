import { Controller, Post, Body, Req, Get, Param } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';

@Controller('vehicle-evaluation')
export class EvaluationController {
  constructor(private evaluationService: EvaluationService) {}

  @Post()
  async evaluateVehicle(@Body() dto: CreateEvaluationDto, @Req() req: any) {
    const ip = req.ip || req.socket.remoteAddress;
    return this.evaluationService.evaluateVehicle(dto, ip);
  }

  @Get(':id')
  async getEvaluationById(@Param('id') id: string) {
    return this.evaluationService.getEvaluationById(id);
  }
}
