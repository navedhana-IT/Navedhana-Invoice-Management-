// Read-only check: renders an existing invoice to PDF with local Chromium. Usage: ts-node scripts/render-pdf.ts <invoiceNumber> <out.pdf>
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { loadDotEnv } from '../src/config/load-dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PdfService } from '../src/modules/pdf/pdf.service';
import { PrismaService } from '../src/infra/prisma.service';

async function main() {
  loadDotEnv();
  const [number, out = 'invoice.pdf'] = process.argv.slice(2);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const inv = await app.get(PrismaService).invoice.findFirstOrThrow({ where: { invoiceNumber: number } });
  const pdf = app.get(PdfService);
  const buf = await pdf.toPdf(await pdf.html(inv.id, inv.companyId));
  writeFileSync(out, buf);
  console.log(`${out}: ${buf.length} bytes`);
  await app.close();
}
main();
