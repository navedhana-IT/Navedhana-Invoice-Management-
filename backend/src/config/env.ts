import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().default(7),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  PUBLIC_WEB_URL: z.string().default('http://localhost:3000'),
  S3_ENDPOINT: z.string().optional(),
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('navedhana'),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  S3_FORCE_PATH_STYLE: z.string().default('true').transform((v) => v === 'true'),
  CHROMIUM_PATH: z.string().optional(),
  UPLOAD_MAX_BYTES: z.coerce.number().default(5 * 1024 * 1024),
  /** Swagger UI is off in production unless explicitly enabled. */
  ENABLE_DOCS: z.string().optional().transform((v) => v === 'true'),
  /** e.g. smtp://user:pass@smtp.example.com:587 ; unset = emails are logged instead of sent. */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Navedhana Ledger <no-reply@navedhana.local>'),
  /** Shared with the web app's /api/revalidate route so plan edits refresh cached marketing pages. */
  REVALIDATE_SECRET: z.string().optional(),
  WEB_INTERNAL_URL: z.string().optional(),
  INVITE_TTL_HOURS: z.coerce.number().default(168),
  RESET_TTL_MINUTES: z.coerce.number().default(60),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
