import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AppLogger } from './common/logger/app-logger.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = await app.resolve(AppLogger);
  const configService = app.get(ConfigService);

  app.useLogger(logger);
  app.setGlobalPrefix(configService.get<string>('app.apiPrefix'));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter(logger));
  app.useGlobalInterceptors(new LoggingInterceptor(logger));
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('API Facturador Electronico DIAN - Morchis')
    .setDescription(
      'API NestJS para facturacion electronica DIAN integrada con flujo ERP.',
    )
    .setVersion('1.0.0')
    .addTag('invoices', 'Operaciones de facturacion DIAN')
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument, {
    useGlobalPrefix: true,
    swaggerOptions: {
      persistAuthorization: true,
      displayOperationId: true,
      operationsSorter: 'alpha',
      tagsSorter: 'alpha',
    },
  });

  const port = configService.get<number>('app.port');
  const apiPrefix = configService.get<string>('app.apiPrefix');
  await app.listen(port);
  logger.log(`API listening on port ${port}`, 'Bootstrap');
  logger.log(`Swagger available at /${apiPrefix}/docs`, 'Bootstrap');
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', error);
  process.exit(1);
});