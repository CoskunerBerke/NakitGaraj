import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind a reverse proxy on the same host (Nginx, see DEPLOYMENT.md) use
  // X-Forwarded-For for the client IP, so rate limits and audit logs see the
  // real client instead of 127.0.0.1. Remote clients cannot spoof it.
  app.set('trust proxy', 'loopback');
  
  // Set global API prefix
  app.setGlobalPrefix('api');
  
  // CORS: CORS_ORIGIN (comma-separated list, e.g. https://example.com) limits
  // which sites may call the API. Without it every origin is allowed, which
  // is fine for local development; set it in production.
  const corsOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });

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
