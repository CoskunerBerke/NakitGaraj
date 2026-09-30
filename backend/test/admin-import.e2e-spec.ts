import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';

// Needs a migrated database. Imports an empty list, so no catalogue rows
// are written; the test role, user and their audit log entries are removed.
describe('Admin JSON import (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;

  const ROLE = 'E2E_IMPORTER';
  const EMAIL = 'e2e-importer@example.test';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    const permission = await prisma.permission.upsert({
      where: { name: 'manage_vehicles' },
      update: {},
      create: { name: 'manage_vehicles' },
    });
    const role = await prisma.role.upsert({
      where: { name: ROLE },
      update: {},
      create: { name: ROLE, permissions: { connect: [{ id: permission.id }] } },
    });
    // The import writes an audit log entry, which references a real user.
    const user = await prisma.user.upsert({
      where: { email: EMAIL },
      update: { roleId: role.id },
      create: {
        email: EMAIL,
        passwordHash: 'not-a-real-hash',
        firstName: 'E2E',
        lastName: 'Importer',
        roleId: role.id,
      },
    });
    token = await app.get(JwtService).signAsync({ sub: user.id, roleId: role.id });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { user: { email: EMAIL } } });
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.role.deleteMany({ where: { name: ROLE } });
    await app.close();
  });

  it('accepts a .json file upload (format=json)', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/import')
      .set('Authorization', `Bearer ${token}`)
      .field('format', 'json')
      .attach('file', Buffer.from('[]'), 'vehicles.json')
      .expect(201);
    expect(res.body).toMatchObject({ inserted: 0, updated: 0 });
  });

  it('answers 400 for malformed JSON text', async () => {
    await request(app.getHttpServer())
      .post('/admin/import')
      .set('Authorization', `Bearer ${token}`)
      .field('format', 'json')
      .field('data', '{not json')
      .expect(400);
  });
});
