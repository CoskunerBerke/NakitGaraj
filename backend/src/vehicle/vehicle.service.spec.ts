import { BadRequestException } from '@nestjs/common';
import { VehicleService } from './vehicle.service';

describe('VehicleService', () => {
  function makeService() {
    const prisma = {
      vehicleSpecification: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
      },
      manufacturer: { findUnique: jest.fn() },
      model: { findUnique: jest.fn() },
    } as any;
    return { service: new VehicleService(prisma, {} as any), prisma };
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getYears', () => {
    it('starts at the current year instead of a hard-coded one', async () => {
      jest.useFakeTimers({ now: new Date('2028-03-15T10:00:00Z') });
      const { service } = makeService();

      const years = await service.getYears();

      expect(years[0]).toBe(2028);
      expect(years[years.length - 1]).toBe(2000);
    });
  });

  describe('getVehicleData (public, may generate catalogue rows)', () => {
    it.each([
      ['a missing year', { year: undefined }],
      ['a non-numeric year', { year: 'abc' }],
      ['a fractional year', { year: 2020.5 }],
      ['a year far in the past', { year: 1850 }],
      ['the year before the catalogue starts', { year: 1999 }],
      ['next year', { year: 2029 }],
      ['a year in the future', { year: 2033 }],
    ])('rejects %s without touching the database', async (_label, override) => {
      jest.useFakeTimers({ now: new Date('2028-03-15T10:00:00Z') });
      const { service, prisma } = makeService();

      await expect(
        service.getVehicleData({
          manufacturerId: 'm1',
          modelId: 'x1',
          ...(override as any),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.vehicleSpecification.count).not.toHaveBeenCalled();
    });

    it('accepts exactly the years that getYears offers', async () => {
      jest.useFakeTimers({ now: new Date('2028-03-15T10:00:00Z') });
      const { service, prisma } = makeService();
      const offered = await service.getYears();

      for (const year of [offered[offered.length - 1], offered[0]]) {
        await service.getVehicleData({
          year,
          manufacturerId: 'm1',
          modelId: 'x1',
        });
      }

      expect(offered[offered.length - 1]).toBe(2000);
      expect(offered[0]).toBe(2028);
      expect(prisma.vehicleSpecification.count).toHaveBeenCalledTimes(2);
    });

    it('rejects a request without manufacturer or model', async () => {
      const { service, prisma } = makeService();

      await expect(
        service.getVehicleData({ year: 2020, manufacturerId: '', modelId: 'x1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.vehicleSpecification.count).not.toHaveBeenCalled();
    });

    it('accepts a valid query (year as a query-string value)', async () => {
      const { service, prisma } = makeService();

      const result = await service.getVehicleData({
        year: '2020' as any,
        manufacturerId: 'm1',
        modelId: 'x1',
      });

      expect(result.variants).toEqual([]);
      expect(prisma.vehicleSpecification.count).toHaveBeenCalledWith({
        where: { year: 2020, manufacturerId: 'm1', modelId: 'x1' },
      });
    });
  });
});
