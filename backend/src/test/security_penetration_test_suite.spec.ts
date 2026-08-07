import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import helmet from 'helmet';
import { AppModule } from '../app.module';
import { GlobalHttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../prisma.service';

describe('NakitGaraj Comprehensive Security Penetration Test Suite', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
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
      'should handle SQLi payload "%s" safely without 500 error or SQL execution',
      async (payload) => {
        const response = await request(app.getHttpServer())
          .get(`/api/models?brandId=${encodeURIComponent(payload)}`);

        expect(response.status).not.toBe(500);
        expect(response.body).not.toHaveProperty('debugStack');
      },
    );

    it('should reject SQLi payload in vehicle evaluation POST body', async () => {
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

      const finalEvaluationCount = await prisma.vehicleEvaluation.count();
      expect(finalEvaluationCount).toBeDefined();
      expect(finalEvaluationCount).toBe(initialEvaluationCount);
    });
  });

  describe('2. XSS & DOM Injection Vectors', () => {
    const xssPayloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '"><svg onload=alert(1)>',
      'javascript:alert(1)',
    ];

    it.each(xssPayloads)(
      'should safely reject XSS payload "%s" in firstName/licensePlate',
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

      if (bmw && mercedes) {
        const mercedesModel = await prisma.model.findFirst({ where: { manufacturerId: mercedes.id } });

        if (mercedesModel) {
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
        }
      }
    });
  });

  describe('5. Unauthorized Admin Access & Public Route Protection', () => {
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
  });

  describe('6. Stack Trace & Information Leakage', () => {
    it('should never expose stack traces or internal file paths on malformed requests', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/vehicle-evaluation/non-existent-uuid-12345');

      expect(response.status).not.toBe(500);
      expect(response.body).not.toHaveProperty('stack');
      expect(response.body).not.toHaveProperty('debugStack');
      expect(JSON.stringify(response.body)).not.toContain('node_modules');
      expect(JSON.stringify(response.body)).not.toContain('prisma');
    });
  });

  describe('7. Security Headers Enforcement', () => {
    it('should include standard security response headers', async () => {
      const response = await request(app.getHttpServer()).get('/api/brands');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});
