import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Reject unknown properties and coerce types from the payload.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // The AllExceptionsFilter turns domain errors (insufficient funds, unknown
  // symbol) into `{ success, error }`, which is the exact envelope our axios
  // interceptor unwraps in the PWA. Without it a thrown TradeError would come
  // back as a bare 500 and the app would show a generic error instead of the
  // user-facing message.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Serve uploaded store logos statically at /store-logos/ so the PWA can
  // render them as <img src="apiBase/store-logos/<file>">. Other uploads
  // (e.g. id-cards) are deliberately NOT served — they stay private.
  app.useStaticAssets(join(process.env.UPLOAD_DIR || './uploads', 'store-logos'), {
    prefix: '/store-logos/',
  });

  // The PWA is a separate origin; allow-list comes from config rather than '*'.
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map(s => s.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 7456);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
