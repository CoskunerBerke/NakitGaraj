import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';

type Method = 'get' | 'post' | 'patch' | 'delete';

// Every route under /admin: AdminController plus the admin/* routes of
// VehicleController. A test below fails when a new admin route is added
// without being listed here.
const ADMIN_ROUTES: ReadonlyArray<readonly [Method, string]> = [
  ['get', '/admin/dashboard'],
  ['get', '/admin/evaluations'],
  ['get', '/admin/consignments'],
  ['post', '/admin/consignments/e2e-missing-id/status'],
  ['get', '/admin/logs'],
  ['post', '/admin/import'],
  ['post', '/admin/scraper/trigger'],
  ['get', '/admin/scraper/status'],
  ['get', '/admin/vehicle-requests'],
  ['post', '/admin/vehicle-requests/e2e-missing-id/status'],
  ['get', '/admin/users'],
  ['post', '/admin/users'],
  ['delete', '/admin/users/e2e-missing-id'],
  ['patch', '/admin/users/e2e-missing-id/password'],
  ['get', '/admin/telegram/settings'],
  ['post', '/admin/telegram/settings'],
  ['post', '/admin/telegram/test'],
  ['get', '/admin/market-sync/settings'],
  ['post', '/admin/market-sync/settings'],
  ['post', '/admin/adjust-market-prices'],
  ['get', '/admin/market-sync-settings'],
  ['post', '/admin/market-sync-settings'],
  ['post', '/admin/trigger-market-sync'],
];

// Routes that need the ADMIN role, not just a permission.
const ADMIN_ROLE_ROUTES: ReadonlyArray<readonly [Method, string]> = [
  ['get', '/admin/users'],
  ['post', '/admin/users'],
  ['delete', '/admin/users/e2e-missing-id'],
  ['patch', '/admin/users/e2e-missing-id/password'],
  ['get', '/admin/telegram/settings'],
  ['post', '/admin/telegram/settings'],
  ['post', '/admin/telegram/test'],
];

// The same permission names the seed creates.
const ALL_PERMISSIONS = [
  'manage_vehicles',
  'view_valuations',
  'manage_consignments',
  'view_audit_logs',
];

// Needs a migrated database (npx prisma migrate deploy). Upserts the four
// permission names and creates two test roles, which are removed afterwards;
// no vehicle, customer or user data is touched.
describe('Admin route authorization (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let staffToken: string;
  let managerToken: string;
  let forgedToken: string;
  let adminToken: string;

  const STAFF_ROLE = 'E2E_NO_PERMISSIONS';
  const MANAGER_ROLE = 'E2E_ALL_PERMISSIONS_NOT_ADMIN';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);

    const permissions = await Promise.all(
      ALL_PERMISSIONS.map((name) =>
        prisma.permission.upsert({
          where: { name },
          update: {},
          create: { name },
        }),
      ),
    );

    const staffRole = await prisma.role.upsert({
      where: { name: STAFF_ROLE },
      update: {},
      create: { name: STAFF_ROLE },
    });
    const managerRole = await prisma.role.upsert({
      where: { name: MANAGER_ROLE },
      update: { permissions: { set: permissions.map((p) => ({ id: p.id })) } },
      create: {
        name: MANAGER_ROLE,
        permissions: { connect: permissions.map((p) => ({ id: p.id })) },
      },
    });
    const adminRole = await prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN' },
    });

    staffToken = await jwt.signAsync({
      sub: 'e2e-staff',
      roleId: staffRole.id,
    });
    managerToken = await jwt.signAsync({
      sub: 'e2e-manager',
      roleId: managerRole.id,
    });
    adminToken = await jwt.signAsync({
      sub: 'e2e-admin',
      roleId: adminRole.id,
    });
    // ADMIN claims, but signed with a secret the server does not know.
    forgedToken = await new JwtService({
      secret: 'not-the-server-secret',
    }).signAsync({
      sub: 'e2e-forged',
      roleId: adminRole.id,
    });
  });

  afterAll(async () => {
    await prisma.role.deleteMany({
      where: { name: { in: [STAFF_ROLE, MANAGER_ROLE] } },
    });
    await app.close();
  });

  it('lists every registered admin route', () => {
    const stack: any[] = (app.getHttpAdapter().getInstance() as any).router
      .stack;
    const registered = stack
      .filter(
        (layer) =>
          typeof layer.route?.path === 'string' &&
          layer.route.path.startsWith('/admin'),
      )
      .flatMap((layer) =>
        Object.keys(layer.route.methods).map((m) => `${m} ${layer.route.path}`),
      )
      .sort();
    const listed = ADMIN_ROUTES.map(
      ([m, p]) => `${m} ${p.replace('e2e-missing-id', ':id')}`,
    ).sort();
    expect(registered).toEqual(listed);
  });

  it.each(ADMIN_ROUTES)(
    '%s %s rejects requests without a token (401)',
    async (method, path) => {
      await request(app.getHttpServer())[method](path).send({}).expect(401);
    },
  );

  it.each(ADMIN_ROUTES)(
    '%s %s rejects a token signed with another secret (401)',
    async (method, path) => {
      await request(app.getHttpServer())
        [method](path)
        .set('Authorization', `Bearer ${forgedToken}`)
        .send({})
        .expect(401);
    },
  );

  it.each(ADMIN_ROUTES)(
    '%s %s rejects a logged-in user without permissions (403)',
    async (method, path) => {
      await request(app.getHttpServer())
        [method](path)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({})
        .expect(403);
    },
  );

  it.each(ADMIN_ROLE_ROUTES)(
    '%s %s rejects a user with every permission but not the ADMIN role (403)',
    async (method, path) => {
      await request(app.getHttpServer())
        [method](path)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({})
        .expect(403);
    },
  );

  it('lets an ADMIN list users', async () => {
    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('lets a non-ADMIN user with view_valuations open the dashboard', async () => {
    await request(app.getHttpServer())
      .get('/admin/dashboard')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
  });
});
