import { ConflictException } from '@nestjs/common';
import { AdminService } from './admin.service';

describe('AdminService.createUser', () => {
  it('answers 409 (not a 500) when the e-mail is already registered', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }), create: jest.fn() },
      role: { findUnique: jest.fn(), create: jest.fn() },
    } as any;
    const service = new AdminService(prisma);

    await expect(
      service.createUser({
        email: 'personel@example.com',
        password: 'secret123',
        firstName: 'Ada',
        lastName: 'Örnek',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
