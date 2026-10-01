import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { buildCorsOptions } from './config/cors';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind a reverse proxy on the same host (Nginx, see DEPLOYMENT.md) use
  // X-Forwarded-For for the client IP, so rate limits and audit logs see the
  // real client instead of 127.0.0.1. Remote clients cannot spoof it.
  app.set('trust proxy', 'loopback');
  
  // Set global API prefix
  app.setGlobalPrefix('api');
  
  // CORS: CORS_ORIGIN (comma-separated list, e.g. https://example.com) limits
  // which sites may call the API. Without it, production allows no
  // cross-origin requests (same origin through Nginx only) and development
  // allows every origin. See config/cors.ts.
  const corsOptions = buildCorsOptions(process.env);
  if (corsOptions.origin === false) {
    console.log(
      'CORS_ORIGIN is not set: cross-origin requests are refused ' +
        '(same-origin only). Set CORS_ORIGIN to allow other sites.',
    );
  }
  app.enableCors(corsOptions);

  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}/api`);
}
bootstrap();
