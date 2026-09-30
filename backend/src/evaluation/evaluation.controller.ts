import { Controller, Post, Body, Req, Get, Param, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { EvaluationService } from './evaluation.service';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';

@Controller('vehicle-evaluation')
export class EvaluationController {
  constructor(private evaluationService: EvaluationService) {}

  // Public form: rate-limited per IP (ThrottlerModule default, 100/min).
  @UseGuards(ThrottlerGuard)
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
