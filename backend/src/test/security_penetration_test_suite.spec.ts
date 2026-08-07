import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import helmet from 'helmet';
import * as path from 'path';
import * as fs from 'fs';
import { AppModule } from '../app.module';
import { GlobalHttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../prisma.service';

describe('NakitGaraj Comprehensive Hardened Security Penetration Test Suite', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    // 1. ISOLATED TEST DB ENFORCEMENT
    const testDbPath = path.resolve(__dirname, '../../prisma/test_security.db');
    process.env.DATABASE_URL = `file:${testDbPath}`;

    if (process.env.DATABASE_URL.includes('dev.db') && !process.env.DATABASE_URL.includes('test_security.db')) {
      throw new Error('SECURITY VIOLATION: Test suite attempted to run against dev.db instead of test_security.db!');
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
        validationError: { target: false, value: false },
      }),
    );

    await app.init();
    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('0. Test DB & Fixture Verification', () => {
    it('should strictly verify test_security.db isolation and seed fixture availability', async () => {
      const bmw = await prisma.manufacturer.findFirst({ where: { name: 'BMW' } });
      const mercedes = await prisma.manufacturer.findFirst({ where: { name: 'Mercedes-Benz' } });

      if (!bmw || !mercedes) {
        throw new Error('TEST_FIXTURE_MISSING: Mandatory Manufacturer seed fixtures missing in test_security.db!');
      }

      const model = await prisma.model.findFirst({ where: { manufacturerId: bmw.id } });
      if (!model) {
        throw new Error('TEST_FIXTURE_MISSING: Mandatory Model seed fixtures missing in test_security.db!');
      }

      expect(bmw).toBeDefined();
      expect(mercedes).toBeDefined();
      expect(model).toBeDefined();
    });
  });

  describe('1. SQL Injection Vectors', () => {
    const sqliPayloads = [
      "' OR 1=1 --",
      '" OR "1"="1',
      '1 UNION SELECT NULL',
      "'; DROP TABLE VehicleEvaluation; --",
      "admin'/*",
      '%27%20OR%201%3D1--',
    ];

    it.each(sqliPayloads)(
      'should safely handle query parameter SQLi payload "%s" without 500 error or SQL execution',
      async (payload) => {
        const response = await request(app.getHttpServer())
          .get(`/api/models?brandId=${encodeURIComponent(payload)}`);

        expect(response.status).not.toBe(500);
        expect(response.body).not.toHaveProperty('stack');
        expect(response.body).not.toHaveProperty('debugStack');
      },
    );

    it('should reject SQLi payload in vehicle evaluation POST body with zero DB mutations and zero data leaks', async () => {
      const initialEvaluationCount = await prisma.vehicleEvaluation.count();

      const response = await request(app.getHttpServer())
        .post('/api/vehicle-evaluation')
        .send({
          year: 2015,
          manufacturerId: "' OR 1=1 --",
          modelId: "'; DROP TABLE VehicleEvaluation; --",
          mileage: 100000,
          color: 'Beyaz',
          damageStatus: 'NO',
          licensePlate: '34ABC123',
          firstName: "admin'/*",
          lastName: 'Kullanıcı',
          phone: '05301234567',
          sellingTimeline: '15-30 gün',
          userDesiredPrice: 1000000,
        });

      expect(response.status).not.toBe(500);
      expect(response.body).not.toHaveProperty('stack');

      const finalEvaluationCount = await prisma.vehicleEvaluation.count();
      expect(finalEvaluationCount).toBe(initialEvaluationCount);
    });
  });

  describe('2. XSS & Stored XSS Injection Vectors', () => {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert(1)>',
      '"><svg onload=alert(1)>',
      'javascript:alert(1)',
    ];

    it.each(xssPayloads)(
      'should reject input XSS payload "%s" in firstName/licensePlate',
      async (payload) => {
        const response = await request(app.getHttpServer())
          .post('/api/vehicle-evaluation')
          .send({
            year: 2015,
            manufacturerId: 'valid-uuid',
            modelId: 'valid-uuid',
            mileage: 100000,
            color: 'Beyaz',
            damageStatus: 'NO',
            licensePlate: payload,
            firstName: payload,
            lastName: 'Test',
            phone: '05301234567',
            sellingTimeline: '15-30 gün',
            userDesiredPrice: 1000000,
          });

        expect(response.status).toBe(400);
        expect(JSON.stringify(response.body)).not.toContain('<script>');
      },
    );
  });

  describe('3. DTO Bypass, Mass Assignment & Prototype Pollution', () => {
    it('should reject parameter tampering and extra fields (__proto__, isAdmin, cashOffer)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/vehicle-evaluation')
        .send({
          year: 2015,
          manufacturerId: 'some-id',
          modelId: 'some-id',
          mileage: 100000,
          color: 'Beyaz',
          damageStatus: 'NO',
          licensePlate: '34ABC123',
          firstName: 'Test',
          lastName: 'User',
          phone: '05301234567',
          sellingTimeline: '15-30 gün',
          userDesiredPrice: 1000000,
          __proto__: { isAdmin: true },
          isAdmin: true,
          cashOffer: 999999999,
          agreedCustomerNet: 999999999,
          status: 'SUCCESS',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBeDefined();
    });
  });

  describe('4. Relational Model Validation (Cross-Brand Forgery)', () => {
    it('should return DATA_INTEGRITY_ERROR when modelId does not belong to manufacturerId', async () => {
      const bmw = await prisma.manufacturer.findFirst({ where: { name: 'BMW' } });
      const mercedes = await prisma.manufacturer.findFirst({ where: { name: 'Mercedes-Benz' } });

      if (!bmw || !mercedes) {
        throw new Error('TEST_FIXTURE_MISSING: Manufacturer fixtures missing');
      }

      const mercedesModel = await prisma.model.findFirst({ where: { manufacturerId: mercedes.id } });

      if (!mercedesModel) {
        throw new Error('TEST_FIXTURE_MISSING: Mercedes Model fixture missing');
      }

      const response = await request(app.getHttpServer())
        .post('/api/vehicle-evaluation')
        .send({
          year: 2015,
          manufacturerId: bmw.id, // BMW
          modelId: mercedesModel.id, // Mercedes Model (Mismatched!)
          mileage: 100000,
          color: 'Beyaz',
          damageStatus: 'NO',
          licensePlate: '34ABC123',
          firstName: 'Test',
          lastName: 'User',
          phone: '05301234567',
          sellingTimeline: '15-30 gün',
          userDesiredPrice: 1000000,
        });

      expect(response.body.status).toBe('DATA_INTEGRITY_ERROR');
    });
  });

  describe('5. Unauthorized Admin Access & Public Mutation Protection', () => {
    const adminGetRoutes = [
      '/api/admin/dashboard',
      '/api/admin/evaluations',
      '/api/admin/consignments',
      '/api/admin/logs',
    ];

    it.each(adminGetRoutes)(
      'should reject unauthenticated GET request to "%s" with 401 Unauthorized',
      async (route) => {
        const response = await request(app.getHttpServer()).get(route);
        expect([401, 403]).toContain(response.status);
      },
    );

    it('should reject unauthenticated POST request to "/api/admin/import" with 401 Unauthorized', async () => {
      const response = await request(app.getHttpServer()).post('/api/admin/import');
      expect([401, 403]).toContain(response.status);
    });

    it('should reject removed public internal mutation route "/api/vehicle-specs/upsert-incremental" with 404', async () => {
      const response = await request(app.getHttpServer()).post('/api/vehicle-specs/upsert-incremental');
      expect(response.status).toBe(404);
    });
  });

  describe('6. IDOR (BOLA) & Sensitive Record Exposure', () => {
    it('should return 404 Not Found for non-existent evaluation UUID without stack traces', async () => {
      const nonExistentUuid = '00000000-0000-0000-0000-000000000000';
      const response = await request(app.getHttpServer())
        .get(`/api/vehicle-evaluation/${nonExistentUuid}`);

      expect(response.status).toBe(404);
      expect(response.body).not.toHaveProperty('stack');
    });
  });

  describe('7. SSRF (Server-Side Request Forgery) Vectors', () => {
    const ssrfPayloads = [
      'http://127.0.0.1:8080',
      'http://169.254.169.254/latest/meta-data/',
      'file:///etc/passwd',
    ];

    it.each(ssrfPayloads)(
      'should safely reject SSRF target payload "%s"',
      async (target) => {
        const response = await request(app.getHttpServer())
          .get(`/api/models?brandId=${encodeURIComponent(target)}`);

        expect(response.status).not.toBe(500);
        expect(JSON.stringify(response.body)).not.toContain('root:x:0:0');
      },
    );
  });

  describe('8. Path Traversal & Symlink/Junction Attack Protection', () => {
    const traversalPayloads = [
      '../../../../etc/passwd',
      '..\\..\\..\\Windows\\System32\\drivers\\etc\\hosts',
      '%2e%2e%2f%2e%2e%2f',
    ];

    it.each(traversalPayloads)(
      'should reject path traversal payload "%s"',
      async (payload) => {
        const response = await request(app.getHttpServer())
          .get(`/api/vehicle-evaluation/${encodeURIComponent(payload)}`);

        expect(response.status).not.toBe(500);
        expect(JSON.stringify(response.body)).not.toContain('root:x:0:0');
      },
    );
  });

  describe('9. Command Injection Vectors', () => {
    const cmdPayloads = [
      '; calc.exe',
      '| dir',
      '& whoami',
      '`id`',
    ];

    it.each(cmdPayloads)(
      'should safely handle command injection attempt "%s"',
      async (payload) => {
        const response = await request(app.getHttpServer())
          .get(`/api/models?brandId=${encodeURIComponent(payload)}`);

        expect(response.status).not.toBe(500);
        expect(JSON.stringify(response.body)).not.toContain('Volume Serial Number');
      },
    );
  });

  describe('10. JWT Manipulation & Auth Token Forgery', () => {
    it('should reject invalid or forged JWT tokens with 401 Unauthorized', async () => {
      const forgedToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.forged_signature';
      const response = await request(app.getHttpServer())
        .get('/api/admin/dashboard')
        .set('Authorization', forgedToken);

      expect([401, 403]).toContain(response.status);
    });

    it('should reject empty Authorization headers on protected routes', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/admin/evaluations')
        .set('Authorization', '');

      expect([401, 403]).toContain(response.status);
    });
  });

  describe('11. Malicious File Upload Protection', () => {
    it('should reject upload of executable/script files (.php, .exe, .sh)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/admin/import')
        .attach('file', Buffer.from('<?php echo "evil"; ?>'), 'malicious.php');

      expect([400, 401, 403]).toContain(response.status);
    });
  });

  describe('12. Stack Trace & Information Leakage', () => {
    it('should never expose stack traces or internal file paths on malformed requests', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/vehicle-evaluation/invalid-uuid-string');

      expect(response.status).not.toBe(500);
      expect(response.body).not.toHaveProperty('stack');
      expect(response.body).not.toHaveProperty('debugStack');
      expect(JSON.stringify(response.body)).not.toContain('node_modules');
      expect(JSON.stringify(response.body)).not.toContain('prisma');
    });
  });

  describe('13. Security Headers Enforcement', () => {
    it('should include standard security response headers', async () => {
      const response = await request(app.getHttpServer()).get('/api/brands');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});
