import { EmsalMatcherService } from './emsal-matcher.service';

describe('validated weekly exact rows in pricing', () => {
  test('uses a published exact row not yet present in Prisma without broad fallback', async () => {
    const prisma = {
      rawVehicleListing: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const matcher = new EmsalMatcherService(prisma as any);
    const result = await matcher.matchComparableListings({
      make: 'Audi',
      model: 'A3',
      variant: '35 TFSI',
      trim: 'Advanced',
      year: 2024,
      mileageKm: 20_000,
      listingIds: ['9001'],
      externalExactListings: [
        {
          sourceListingId: '9001',
          make: 'Audi',
          model: 'A3',
          variant: '35 TFSI',
          trim: 'Advanced',
          title: 'Temiz araç',
          year: 2024,
          mileageKm: 18_000,
          price: 2_000_000,
          city: 'İstanbul',
          listingDate: '2026-09-04',
        },
      ],
    });
    expect(result.matchedCount).toBe(1);
    expect(result.uniqueListingIds).toEqual(['9001']);
    expect(result.cleanListings[0]).toMatchObject({
      id: '9001',
      price: 2_000_000,
    });
    expect(prisma.rawVehicleListing.findMany).toHaveBeenCalled();
  });

  test('rejects an external row whose ID is not in the exact target pool', async () => {
    const prisma = {
      rawVehicleListing: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const matcher = new EmsalMatcherService(prisma as any);
    const result = await matcher.matchComparableListings({
      make: 'Audi',
      model: 'A3',
      variant: '35 TFSI',
      trim: 'Advanced',
      year: 2024,
      mileageKm: 20_000,
      listingIds: ['allowed'],
      externalExactListings: [
        {
          sourceListingId: 'sibling',
          make: 'Audi',
          model: 'A3',
          variant: '35 TFSI',
          trim: 'S Line',
          title: 'Başka paket',
          year: 2024,
          mileageKm: 18_000,
          price: 2_000_000,
          city: 'İstanbul',
          listingDate: '2026-09-04',
        },
      ],
    });
    expect(result.matchedCount).toBe(0);
    expect(result.uniqueListingIds).toEqual([]);
  });
});
