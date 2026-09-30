import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';

// Needs a migrated database (npx prisma migrate deploy). Only roles are
// upserted; no vehicle, customer or user data is touched.
describe('Admin route authorization (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let staffToken: string;
  let adminToken: string;

  const STAFF_ROLE = 'E2E_NO_PERMISSIONS';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);

    const staffRole = await prisma.role.upsert({
      where: { name: STAFF_ROLE },
      update: {},
      create: { name: STAFF_ROLE },
    });
    const adminRole = await prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN' },
    });

    staffToken = await jwt.signAsync({ sub: 'e2e-staff', roleId: staffRole.id });
    adminToken = await jwt.signAsync({ sub: 'e2e-admin', roleId: adminRole.id });
  });

  afterAll(async () => {
    await prisma.role.deleteMany({ where: { name: STAFF_ROLE } });
    await app.close();
  });

  it.each([
    ['post', '/admin/adjust-market-prices'],
    ['get', '/admin/market-sync-settings'],
    ['post', '/admin/market-sync-settings'],
    ['post', '/admin/trigger-market-sync'],
    ['get', '/admin/users'],
    ['get', '/admin/telegram/settings'],
  ] as const)('%s %s rejects requests without a token', async (method, path) => {
    await request(app.getHttpServer())[method](path).send({ percentage: 50 }).expect(401);
  });

  it.each([
    ['get', '/admin/users'],
    ['post', '/admin/users'],
    ['get', '/admin/telegram/settings'],
    ['post', '/admin/telegram/test'],
    ['get', '/admin/market-sync/settings'],
    ['post', '/admin/adjust-market-prices'],
  ] as const)('%s %s rejects a logged-in user without the required role', async (method, path) => {
    await request(app.getHttpServer())
      [method](path)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({})
      .expect(403);
  });

  it('lets an ADMIN list users', async () => {
    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });
});
