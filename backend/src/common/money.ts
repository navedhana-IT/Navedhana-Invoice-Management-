import { Prisma } from '@prisma/client';

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

export const D = (v: Prisma.Decimal.Value | null | undefined) => new Decimal(v ?? 0);

/** Round half-up to 2 decimals (paise). */
export const round2 = (v: Prisma.Decimal.Value) => D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export const sum = (values: Prisma.Decimal.Value[]) => values.reduce<Decimal>((a, v) => a.plus(v), D(0));
