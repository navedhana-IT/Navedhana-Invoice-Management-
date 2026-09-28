import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { env } from './config/env';
import { Public } from './common/decorators';
import { PrismaModule, PrismaService } from './infra/prisma.service';
import { QueueModule } from './infra/queue.module';
import { MailModule } from './infra/mail.service';
import { RealtimeModule } from './infra/realtime';
import { StorageModule } from './infra/storage.service';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { NotificationsCoreModule } from './modules/notifications/notifications.service';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompanyModule } from './modules/company/company.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { InvoiceTemplatesModule } from './modules/invoice-templates/invoice-templates.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PartiesModule } from './modules/parties/parties.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PublicModule } from './modules/public/public.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ServicesModule } from './modules/services/services.module';
import { SignupModule } from './modules/signup/signup.module';
import { UsersModule } from './modules/users/users.module';
import { AccessGuard } from './tenancy/access.guard';

@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ ttl: 60_000, limit: 300 }],
        // Shared counters across API replicas; tests keep the in-memory default so runs stay isolated.
        storage: env().NODE_ENV === 'test' ? undefined : new ThrottlerStorageRedisService(new Redis(env().REDIS_URL, { maxRetriesPerRequest: 2 })),
      }),
    }),
    PrismaModule,
    StorageModule,
    QueueModule,
    MailModule,
    RealtimeModule,
    NotificationsCoreModule,
    AuditModule,
    AuthModule,
    AdminModule,
    CompanyModule,
    ServicesModule,
    UsersModule,
    PartiesModule,
    InvoiceTemplatesModule,
    InvoicesModule,
    PaymentsModule,
    DocumentsModule,
    ReportsModule,
    DashboardModule,
    PublicModule,
    SignupModule,
    InvitationsModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
})
export class AppModule {}
