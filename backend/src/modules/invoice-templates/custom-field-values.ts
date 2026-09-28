import { BadRequestException } from '@nestjs/common';
import type { CustomFieldDefinition } from '@prisma/client';

/** Validates invoice.customFieldValues against the service's field definitions. */
export function validateCustomFieldValues(defs: CustomFieldDefinition[], values: Record<string, unknown> = {}) {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  for (const key of Object.keys(values)) {
    if (!byKey.has(key)) throw new BadRequestException(`Unknown custom field "${key}"`);
  }
  for (const d of defs) {
    const v = values[d.key];
    if (v === undefined || v === null || v === '') {
      if (d.required) throw new BadRequestException(`Custom field "${d.label}" is required`);
      continue;
    }
    const ok =
      d.type === 'TEXT' ? typeof v === 'string' && v.length <= 500
      : d.type === 'NUMBER' || d.type === 'CURRENCY' ? !Number.isNaN(Number(v))
      : d.type === 'DATE' ? typeof v === 'string' && !Number.isNaN(Date.parse(v))
      : d.type === 'BOOLEAN' ? typeof v === 'boolean'
      : d.type === 'DROPDOWN' ? typeof v === 'string' && d.options.includes(v)
      : false;
    if (!ok) throw new BadRequestException(`Custom field "${d.label}" has an invalid ${d.type.toLowerCase()} value`);
  }
  return values;
}
