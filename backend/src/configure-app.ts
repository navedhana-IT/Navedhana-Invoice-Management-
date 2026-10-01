import './common/ids';
import { ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './config/env';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { requestContext } from './common/request-context';

/** bigint params are already parsed by ParseIdPipe; the stock pipe would try `new BigInt()` on absent ones. */
class AppValidationPipe extends ValidationPipe {
  protected toValidate(metadata: ArgumentMetadata) {
    return metadata.metatype !== (BigInt as unknown) && super.toValidate(metadata);
  }
}

/** Shared by main.ts and e2e tests so both run the same security pipeline. */
export function configureApp(app: NestExpressApplication) {
  const e = env();
  app.setGlobalPrefix('api/v1');
  app.set('trust proxy', 1);
  app.use(requestContext);
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({ origin: e.CORS_ORIGINS.split(',').map((o) => o.trim()), credentials: true, exposedHeaders: ['X-Request-Id'] });
  app.useGlobalPipes(new AppValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  if (e.NODE_ENV !== 'production' || e.ENABLE_DOCS) {
    const config = new DocumentBuilder()
      .setTitle('nbills API')
      .setDescription('A Navedhana Product')
      .setVersion('1.0')
      .addBearerAuth()
      .addGlobalParameters(
        { name: 'X-Company-Id', in: 'header', required: false, description: 'Tenant (company) id for tenant routes' },
        { name: 'X-Service-Id', in: 'header', required: false, description: 'Optional service/brand scope' },
      )
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, config));
  }
  return app;
}
