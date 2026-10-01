import { InjectQueue } from '@nestjs/bullmq';
import { Global, Injectable, Logger, Module } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { createTransport, type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { renderMail, type MailTemplate } from './mail-templates';
import { MAIL_QUEUE } from './queue.module';
import { StorageService } from './storage.service';

/** Attachments are referenced by storage key and loaded by the worker, keeping queue payloads small. */
export type MailJob = MailTemplate & { to: string; cc?: string; replyTo?: string; attachments?: { storageKey: string; filename: string }[] };

/** API side: queue the email so requests never wait on SMTP. */
@Injectable()
export class Mailer {
  constructor(@InjectQueue(MAIL_QUEUE) private readonly queue: Queue<MailJob>) {}

  send(job: MailJob) {
    return this.queue.add(job.template, job, { attempts: 5, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: 500, removeOnFail: 1000 });
  }
}

/** Worker side: renders and delivers. Without SMTP_URL, emails are logged (development). */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private transport?: Transporter;

  constructor(private readonly storage: StorageService) {}

  private get transporter() {
    if (!this.transport) {
      const e = env();
      if (e.SMTP_HOST) {
        const port = e.SMTP_PORT ?? (e.SMTP_SECURE ? 465 : 587);
        const secure = e.SMTP_SECURE !== undefined ? e.SMTP_SECURE : port === 465;
        this.transport = createTransport({
          host: e.SMTP_HOST,
          port,
          secure,
          auth: e.SMTP_USER
            ? {
                user: e.SMTP_USER,
                pass: e.SMTP_PASS,
              }
            : undefined,
        });
      } else if (e.SMTP_URL) {
        this.transport = createTransport(e.SMTP_URL);
      }
    }
    return this.transport;
  }

  get fromAddress(): string {
    const e = env();
    if (e.SMTP_FROM) {
      return e.SMTP_FROM.includes('<') ? e.SMTP_FROM : `nbills <${e.SMTP_FROM}>`;
    }
    return e.MAIL_FROM;
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('SMTP is not configured (neither SMTP_HOST nor SMTP_URL set)');
      return false;
    }
    await this.transporter.verify();
    this.logger.log('SMTP connection verified successfully');
    return true;
  }

  async deliver(job: MailJob) {
    const { subject, html, text } = renderMail(job);
    if (!this.transporter) {
      this.logger.log(`SMTP not configured; would send "${subject}" to ${job.to}`);
      return;
    }
    const attachments = await Promise.all((job.attachments ?? []).map(async (a) => ({ filename: a.filename, content: await this.storage.get(a.storageKey) })));
    const from = this.fromAddress;
    await this.transporter.sendMail({ from, to: job.to, cc: job.cc, replyTo: job.replyTo ?? from, subject, html, text, attachments });
    this.logger.log(`Sent email "${subject}" to ${job.to}`);
  }
}

@Global()
@Module({ providers: [Mailer, MailService], exports: [Mailer, MailService] })
export class MailModule {}

export const webUrl = (path: string) => `${env().PUBLIC_WEB_URL.replace(/\/$/, '')}${path}`;
