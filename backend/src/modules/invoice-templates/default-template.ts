import type { Prisma } from '@prisma/client';
import { asJson, defaultTemplateConfig } from './template-config.schema';
import type { Id } from '../../common/ids';

export type ThemeColors = { primaryColor?: string; accentColor?: string };

/** Creates a published "Standard" template v1 and makes it the service default. */
export async function createDefaultTemplate(tx: Prisma.TransactionClient, companyId: Id, serviceId: Id, userId?: Id, colors?: ThemeColors) {
  const config = defaultTemplateConfig();
  Object.assign(config.theme, colors);
  const template = await tx.invoiceTemplate.create({
    data: {
      companyId,
      serviceId,
      name: 'Standard',
      versions: {
        create: { companyId, version: 1, config: asJson(config), status: 'PUBLISHED', publishedAt: new Date(), createdById: userId },
      },
    },
  });
  await tx.service.update({ where: { id: serviceId }, data: { defaultTemplateId: template.id } });
  return template;
}
