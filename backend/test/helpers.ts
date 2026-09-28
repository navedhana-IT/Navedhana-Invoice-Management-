import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { existsSync } from 'fs';
import request from 'supertest';

/** `realtime`: attach the Redis Socket.IO adapter (as main.ts does) and listen on a random port. */
export async function bootApp({ realtime = false } = {}) {
  if (existsSync('.env')) process.loadEnvFile('.env');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  // loadEnvFile overrides Jest's NODE_ENV; 'test' keeps throttling in memory so runs don't share counters.
  process.env.NODE_ENV = 'test';
  // Imported after env is set so env() reads the test database.
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/configure-app');
  const { SYSTEM_ROLES } = await import('../src/common/permissions');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  if (realtime) {
    const { RedisIoAdapter } = await import('../src/infra/redis-io.adapter');
    const io = new RedisIoAdapter(app);
    io.connect();
    app.useWebSocketAdapter(io);
    await app.listen(0);
  } else {
    await app.init();
  }

  const prisma = new PrismaClient();
  for (const r of SYSTEM_ROLES) {
    if (!(await prisma.role.findFirst({ where: { companyId: null, key: r.key } }))) {
      await prisma.role.create({ data: { key: r.key, name: r.name, permissions: r.permissions, allServices: r.allServices, isSystem: true } });
    }
  }
  return { app, prisma };
}

export async function createMasterAdmin(prisma: PrismaClient, email: string, password: string) {
  await prisma.user.upsert({
    where: { email },
    create: { email, fullName: 'Master', isMasterAdmin: true, passwordHash: await argon2.hash(password) },
    update: {},
  });
}

export async function login(app: INestApplication, email: string, password: string) {
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return { token: res.body.accessToken as string, cookie: res.headers['set-cookie'] as unknown as string[] };
}

/** Authenticated request builder with optional tenant headers. */
export const api = (app: INestApplication, token: string, companyId?: number, serviceId?: number) => {
  const h = (r: request.Test) => {
    r.set('Authorization', `Bearer ${token}`);
    if (companyId) r.set('X-Company-Id', String(companyId));
    if (serviceId) r.set('X-Service-Id', String(serviceId));
    return r;
  };
  const s = request(app.getHttpServer());
  return {
    get: (u: string) => h(s.get(`/api/v1${u}`)),
    post: (u: string, body?: object) => h(s.post(`/api/v1${u}`)).send(body ?? {}),
    patch: (u: string, body?: object) => h(s.patch(`/api/v1${u}`)).send(body ?? {}),
    put: (u: string, body?: object) => h(s.put(`/api/v1${u}`)).send(body ?? {}),
    delete: (u: string) => h(s.delete(`/api/v1${u}`)),
  };
};
