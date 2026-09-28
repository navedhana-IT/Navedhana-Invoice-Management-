/**
 * Today's calendar date in `timeZone`, as UTC midnight. @db.Date columns (due dates) are stored as UTC
 * midnight, so this is the value to compare them against.
 */
export function todayIn(timeZone: string, now = new Date()): Date {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
}
