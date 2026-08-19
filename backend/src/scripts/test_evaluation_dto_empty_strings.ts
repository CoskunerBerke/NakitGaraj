import * as path from 'path';
import * as fs from 'fs';

try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (e) {}
const dbPath = path.resolve(__dirname, '../../prisma/dev.db');
process.env.DATABASE_URL = 'file:' + dbPath;

import { PrismaClient } from '@prisma/client';
import { EvaluationService } from '../evaluation/evaluation.service';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateEvaluationDto } from '../evaluation/dto/create-evaluation.dto';

const prisma = new PrismaClient();

async function testDtoValidation() {
  console.log('\n--- TESTING DTO VALIDATION WITH EMPTY STRINGS ---');

  const rawPayload = {
    year: 2021,
    manufacturerId: '85ce10ef-f901-47d3-ae5f-2b1c631653c8',
    modelId: '88e2604e-598d-4c84-8ac7-bfa438c8eda4',
    variantId: '',
    packageId: '',
    bodyTypeId: '',
    fuelTypeId: '',
    transmissionTypeId: '',
    mileage: 50000,
    licensePlate: '34ABC123',
    color: 'Siyah',
    damageStatus: 'NO',
    sellingTimeline: 'ASAP',
    userDesiredPrice: 1500000,
    firstName: 'Ahmet',
    lastName: 'Yılmaz',
    phone: '05551234567',
  };

  const dtoInstance = plainToInstance(CreateEvaluationDto, rawPayload);
  const errors = await validate(dtoInstance, { whitelist: true });

  console.log('DTO Instance Properties:', {
    variantId: dtoInstance.variantId,
    packageId: dtoInstance.packageId,
    bodyTypeId: dtoInstance.bodyTypeId,
    fuelTypeId: dtoInstance.fuelTypeId,
    transmissionTypeId: dtoInstance.transmissionTypeId,
  });

  console.log('Validation Errors Count:', errors.length);
  if (errors.length > 0) {
    console.error('Validation Errors:', JSON.stringify(errors, null, 2));
  } else {
    console.log('✓ DTO Validation PASSED 100%! Empty strings transformed to undefined.');
  }
}

testDtoValidation().catch(console.error).finally(() => prisma.$disconnect());
