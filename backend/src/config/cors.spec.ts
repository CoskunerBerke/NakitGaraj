import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { buildCorsOptions } from './cors';

@Controller()
class PingController {
  @Get('ping')
  ping() {
    return 'pong';
  }
}

describe('buildCorsOptions', () => {
  it('allows only the configured origins when CORS_ORIGIN is set', () => {
    expect(
      buildCorsOptions({
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://a.example, https://b.example ,',
      }),
    ).toEqual({
      origin: ['https://a.example', 'https://b.example'],
      credentials: true,
    });
  });

  it('allows no cross-origin requests in production without CORS_ORIGIN', () => {
    expect(buildCorsOptions({ NODE_ENV: 'production' })).toEqual({
      origin: false,
    });
    expect(
      buildCorsOptions({ NODE_ENV: 'production', CORS_ORIGIN: ' , ' }),
    ).toEqual({ origin: false });
  });

  it('stays permissive outside production', () => {
    for (const NODE_ENV of ['development', 'test', undefined]) {
      expect(buildCorsOptions({ NODE_ENV })).toEqual({
        origin: true,
        credentials: true,
      });
    }
  });

  describe('in a Nest app', () => {
    let app: INestApplication<App>;

    async function createApp(env: NodeJS.ProcessEnv) {
      const moduleRef = await Test.createTestingModule({
        controllers: [PingController],
      }).compile();
      app = moduleRef.createNestApplication();
      app.enableCors(buildCorsOptions(env));
      await app.init();
    }

    afterEach(async () => {
      await app.close();
    });

    it('sends no CORS headers to another site in production without CORS_ORIGIN', async () => {
      await createApp({ NODE_ENV: 'production' });
      const res = await request(app.getHttpServer())
        .get('/ping')
        .set('Origin', 'https://evil.example')
        .expect(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();

      const preflight = await request(app.getHttpServer())
        .options('/ping')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('answers a configured origin and ignores others', async () => {
      await createApp({
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://site.example',
      });
      const allowed = await request(app.getHttpServer())
        .get('/ping')
        .set('Origin', 'https://site.example')
        .expect(200);
      expect(allowed.headers['access-control-allow-origin']).toBe(
        'https://site.example',
      );
      const other = await request(app.getHttpServer())
        .get('/ping')
        .set('Origin', 'https://evil.example')
        .expect(200);
      expect(other.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('reflects any origin in development', async () => {
      await createApp({ NODE_ENV: 'development' });
      const res = await request(app.getHttpServer())
        .get('/ping')
        .set('Origin', 'http://localhost:3000')
        .expect(200);
      expect(res.headers['access-control-allow-origin']).toBe(
        'http://localhost:3000',
      );
    });
  });
});
