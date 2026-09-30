import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConsignmentService } from './consignment.service';

describe('ConsignmentService.createConsignment', () => {
  const dto = {
    vehicleEvaluationId: 'eval-1',
    firstName: 'Deniz',
    lastName: 'Örnek',
    phone: '05550000000',
    email: 'deniz@example.com',
    province: 'Ankara',
    district: 'Çankaya',
    preferredContact: 'PHONE',
  };

  // What Prisma returns for an evaluation created by another customer.
  const storedConsignment = {
    id: 'cons-1',
    ...dto,
    status: 'PENDING',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    vehicleEvaluation: {
      id: 'eval-1',
      firstName: 'Başka',
      lastName: 'Müşteri',
      phone: '05551112233',
      userIp: '203.0.113.7',
      licensePlate: '06ABC123',
      mileage: 90000,
      userDesiredPrice: 1000000,
      vehicleSpecification: {
        year: 2020,
        manufacturer: { name: 'Fiat' },
        model: { name: 'Egea' },
      },
    },
  };

  function makeService(create: jest.Mock) {
    const prisma = { consignmentApplication: { create } } as any;
    const telegram = {
      sendConsignmentNotification: jest.fn().mockResolvedValue(undefined),
    } as any;
    return new ConsignmentService(prisma, {} as any, telegram);
  }

  it('does not return the linked evaluation (other customer data) to the public caller', async () => {
    const service = makeService(jest.fn().mockResolvedValue(storedConsignment));

    const result = await service.createConsignment(dto as any);

    expect(result.consignmentId).toBe('cons-1');
    expect(result.consignment.firstName).toBe('Deniz');
    expect(result.consignment).not.toHaveProperty('vehicleEvaluation');
    expect(JSON.stringify(result)).not.toContain('05551112233');
    expect(JSON.stringify(result)).not.toContain('203.0.113.7');
  });

  it('answers 409 when the evaluation already has a consignment application', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const service = makeService(jest.fn().mockRejectedValue(duplicate));

    await expect(service.createConsignment(dto as any)).rejects.toBeInstanceOf(ConflictException);
  });
});
