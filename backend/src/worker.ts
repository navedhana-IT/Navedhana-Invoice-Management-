import 'reflect-metadata';
import './common/ids';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadDotEnv } from './config/load-dotenv';
import { env } from './config/env';
import { WorkerModule } from './worker.module';

/** Background worker: PDF rendering + scheduled maintenance. Same codebase, separate process/container. */
async function bootstrap() {
  loadDotEnv();
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: new ConsoleLogger({ json: env().NODE_ENV === 'production' }),
  });
  app.enableShutdownHooks();
  new ConsoleLogger('Worker').log('Worker started');
}

void bootstrap();
