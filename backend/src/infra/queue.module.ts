import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { env } from '../config/env';
import type { Id } from '../common/ids';

export const PDF_QUEUE = 'pdf';
export const MAINTENANCE_QUEUE = 'maintenance';
export const MAIL_QUEUE = 'mail';

export interface PdfJob {
  invoiceId: Id;
  companyId: Id;
  actorUserId?: Id;
  /** Set for receipt/voucher PDFs. */
  paymentId?: Id;
}

/** Job data is JSON in Redis, so bigint ids arrive in the worker as numbers. */
export type Queued<T> = { [K in keyof T]: T[K] extends Id ? number : T[K] extends Id | undefined ? number | undefined : T[K] };

export function redisConnection() {
  const u = new URL(env().REDIS_URL);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: Number(u.pathname.slice(1) || 0),
    tls: u.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: redisConnection(),
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000 },
      }),
    }),
    BullModule.registerQueue({ name: PDF_QUEUE }, { name: MAINTENANCE_QUEUE }, { name: MAIL_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
