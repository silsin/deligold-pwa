import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
