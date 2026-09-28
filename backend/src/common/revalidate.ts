import { Logger } from '@nestjs/common';
import { env } from '../config/env';

const logger = new Logger('Revalidate');

/** Asks the web app to drop cached pages for these tags (e.g. pricing after a plan edit). Best effort. */
export function revalidateWeb(tags: string[]) {
  const { WEB_INTERNAL_URL, PUBLIC_WEB_URL, REVALIDATE_SECRET } = env();
  if (!REVALIDATE_SECRET) return;
  void fetch(`${WEB_INTERNAL_URL ?? PUBLIC_WEB_URL}/api/revalidate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-revalidate-secret': REVALIDATE_SECRET },
    body: JSON.stringify({ tags }),
    signal: AbortSignal.timeout(3000),
  }).then(
    (r) => { if (!r.ok) logger.warn(`Web revalidation returned ${r.status}`); },
    (e: Error) => logger.warn(`Web revalidation failed: ${e.message}`),
  );
}
