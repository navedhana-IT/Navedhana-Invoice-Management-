/** Database ids are positive integers assigned by PostgreSQL sequences; the client never creates them. */
export type Id = number;

/** Parses a route param, query string, select value or stored value into an id; anything else is undefined. */
export function toId(value: unknown): Id | undefined {
  const s = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^[1-9]\d{0,15}$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : undefined;
}
