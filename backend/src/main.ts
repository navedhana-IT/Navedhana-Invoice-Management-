import 'reflect-metadata';
import './common/ids';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { loadDotEnv } from './config/load-dotenv';
import { env } from './config/env';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { RedisIoAdapter } from './infra/redis-io.adapter';

async function bootstrap() {
  loadDotEnv();
  const e = env();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new ConsoleLogger({ json: e.NODE_ENV === 'production' }),
  });
  configureApp(app).enableShutdownHooks();
  const io = new RedisIoAdapter(app);
  io.connect();
  app.useWebSocketAdapter(io);
  await app.listen(e.PORT);
  new ConsoleLogger('Bootstrap').log(`API on :${e.PORT}/api/v1, docs at /api/docs`);
}

void bootstrap();
