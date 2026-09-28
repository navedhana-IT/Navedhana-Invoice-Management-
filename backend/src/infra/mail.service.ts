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
    const url = env().SMTP_URL;
    if (url && !this.transport) this.transport = createTransport(url);
    return this.transport;
  }

  async deliver(job: MailJob) {
    const { subject, html, text } = renderMail(job);
    if (!this.transporter) {
      this.logger.log(`SMTP_URL not set; would send "${subject}" to ${job.to}`);
      return;
    }
    const attachments = await Promise.all((job.attachments ?? []).map(async (a) => ({ filename: a.filename, content: await this.storage.get(a.storageKey) })));
    await this.transporter.sendMail({ from: env().MAIL_FROM, to: job.to, cc: job.cc, replyTo: job.replyTo, subject, html, text, attachments });
  }
}

@Global()
@Module({ providers: [Mailer], exports: [Mailer] })
export class MailModule {}

export const webUrl = (path: string) => `${env().PUBLIC_WEB_URL.replace(/\/$/, '')}${path}`;
