import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaModule, PrismaService } from './infra/prisma.service';
import { MailModule, MailService, type MailJob } from './infra/mail.service';
import { Realtime, RealtimeModule } from './infra/realtime';
import { NotificationsCoreModule, NotificationsService } from './modules/notifications/notifications.service';
import { MAIL_QUEUE, MAINTENANCE_QUEUE, PDF_QUEUE, QueueModule, type PdfJob, type Queued } from './infra/queue.module';
import { StorageModule } from './infra/storage.service';
import { InvoiceLedger } from './modules/invoices/invoice-ledger';
import { PdfModule } from './modules/pdf/pdf.module';
import { PdfService } from './modules/pdf/pdf.service';

@Processor(PDF_QUEUE, { concurrency: 2 })
class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(private readonly pdf: PdfService, private readonly realtime: Realtime) {
    super();
  }

  async process(job: Job<Queued<PdfJob>>) {
    const invoiceId = BigInt(job.data.invoiceId);
    const companyId = BigInt(job.data.companyId);
    const actorUserId = job.data.actorUserId === undefined ? undefined : BigInt(job.data.actorUserId);
    const doc = await this.pdf.generate(invoiceId, companyId, actorUserId);
    this.logger.log(`Invoice ${invoiceId} -> ${doc.storageKey}`);
    if (actorUserId) this.realtime.toUsers([actorUserId], 'pdf.ready', { companyId, invoiceId, documentId: doc.id });
    return { documentId: doc.id };
  }
}

/**
 * Hourly: re-derives status for open invoices with past-due FIXED stages (-> OVERDUE) and notifies
 * the people who track payments. Also sends a one-time "trial ending" reminder 3 days before expiry.
 */
@Processor(MAINTENANCE_QUEUE)
class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InvoiceLedger,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process() {
    const overdue = await this.overdueSweep();
    const trials = await this.trialReminders();
    return { overdue, trials };
  }

  /** Candidates are due before the latest "today" anywhere (UTC+14); recompute applies each company's own timezone. */
  private async overdueSweep() {
    const horizon = new Date(Date.now() + 14 * 3600_000);
    const due = await this.prisma.invoice.findMany({
      where: { status: { in: ['ISSUED', 'RECEIVED', 'PARTIALLY_PAID'] }, invoiceType: { not: 'PROFORMA' }, schedule: { some: { dueType: 'FIXED', dueDate: { lt: horizon }, status: { not: 'PAID' } } } },
      select: { id: true, status: true },
    });
    let changed = 0;
    for (const { id, status } of due) {
      const inv = await this.prisma.$transaction(async (tx) => { await this.ledger.lock(tx, id); return this.ledger.recompute(tx, id); });
      if (inv.status === status) continue;
      changed++;
      if (inv.status === 'OVERDUE') {
        await this.notifications.notifyPermission('payment.view', {
          companyId: inv.companyId, serviceId: inv.serviceId, type: 'INVOICE_OVERDUE',
          title: `Overdue · ${inv.invoiceNumber}`, body: `${inv.balanceAmount.toFixed(2)} ${inv.currency} is past due`, link: `/app/invoices/${id}`,
        });
      }
    }
    this.logger.log(`Overdue sweep checked ${due.length}, updated ${changed} invoices`);
    return { checked: due.length, updated: changed };
  }

  private async trialReminders() {
    const soon = new Date(Date.now() + 3 * 86_400_000);
    const companies = await this.prisma.company.findMany({
      where: { subscriptionStatus: 'TRIALING', trialEndsAt: { gt: new Date(), lte: soon }, status: 'ACTIVE' },
      select: { id: true, displayName: true, trialEndsAt: true, timezone: true },
    });
    let sent = 0;
    for (const c of companies) {
      const already = await this.prisma.notification.findFirst({ where: { companyId: c.id, type: 'TRIAL_ENDING' } });
      if (already) continue;
      const when = c.trialEndsAt!.toLocaleDateString('en-IN', { timeZone: c.timezone, dateStyle: 'medium' });
      await this.notifications.notifyPermission('company.update', {
        companyId: c.id, type: 'TRIAL_ENDING', title: 'Your trial ends soon', body: `The ${c.displayName} trial ends on ${when}. Contact us to activate your plan.`, link: '/app/settings',
      });
      sent++;
    }
    return sent;
  }
}

@Processor(MAIL_QUEUE, { concurrency: 5 })
class MailProcessor extends WorkerHost {
  constructor(private readonly mail: MailService) {
    super();
  }

  process(job: Job<MailJob>) {
    return this.mail.deliver(job.data);
  }
}

@Injectable()
class Scheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler('overdue-sweep', { pattern: '0 5 * * * *' }, { name: 'overdue-sweep' });
  }
}

@Module({
  imports: [PrismaModule, StorageModule, QueueModule, MailModule, RealtimeModule, NotificationsCoreModule, PdfModule],
  providers: [PdfProcessor, MaintenanceProcessor, MailProcessor, MailService, InvoiceLedger, Scheduler],
})
export class WorkerModule {}
