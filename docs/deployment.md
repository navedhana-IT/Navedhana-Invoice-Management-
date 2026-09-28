# Deployment

Three processes, two images:

| Process | Image | Command | Needs |
|---|---|---|---|
| `api` | `backend/Dockerfile` | `node dist/main.js` (port 4000, REST + Socket.IO) | Postgres, Redis, S3 |
| `worker` | `backend/Dockerfile` | `node dist/worker.js` | Postgres, Redis, S3, SMTP, Chromium (in image) |
| `web` | `frontend/Dockerfile` | `node server.js` (port 3000, Next standalone) | `api` reachable at `API_URL` |

Only `web` has to be public. Browsers call `/api/*` and `/socket.io/*` on the web origin and Next rewrites them to the API, so the refresh cookie stays first-party. S3 must be reachable by browsers for signed URLs (set `S3_PUBLIC_ENDPOINT` if the internal and public hosts differ).

## Local development

```bash
npm run install:all                       # backend + frontend dependencies
cp backend/.env.example backend/.env      # fill in DATABASE_URL, JWT_ACCESS_SECRET, S3_*
cp frontend/.env.example frontend/.env
cd backend && npx prisma migrate dev && npm run db:seed && cd ..
npm run dev:api      # http://localhost:4000 (Swagger at /api/docs)
npm run dev:worker   # PDFs, email, overdue sweep
npm run dev:web      # http://localhost:3000
```

Supporting services (any S3-compatible store works; the bucket is created on boot):

```bash
docker run -d --name nv-redis -p 6379:6379 redis:7-alpine
docker run -d --name nv-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit   # SMTP_URL=smtp://localhost:1025
docker run -d --name nv-s3 -p 9000:9000 -e RUSTFS_ACCESS_KEY=... -e RUSTFS_SECRET_KEY=... rustfs/rustfs:1.0.0
```

## Full stack with Docker Compose

```bash
cp compose.env.example compose.env   # fill in secrets
docker compose --env-file compose.env up -d --build
docker compose --env-file compose.env run --rm api npx prisma db seed   # first run: creates the master admin
```

Open http://localhost:3000 and sign in with `NV_MASTER_ADMIN_EMAIL`. Every email the stack sends lands in Mailpit at http://localhost:8025 unless `NV_SMTP_URL` points at a real server.

Compose only interpolates `NV_*` variables, so an unrelated root `.env` can't leak into the stack.

## Migrations

Schema changes are made in development with `npm run db:migrate` (creates a file in `backend/prisma/migrations/`, committed with the code).

On every deploy, run migrations **once, before** the new `api`/`worker` start:

```bash
npx prisma migrate deploy   # inside the backend image
```

Compose does this with the one-shot `migrate` service that `api` and `worker` wait for. On other platforms, run the same command as a release/pre-deploy job. Never run `prisma migrate dev` or `db push` against production.

Migrations must be backward compatible with the previous release (add columns as nullable first, backfill, then tighten in a later release), because old API pods keep serving until the rollout finishes.

## Environment

Backend variables are documented in `backend/.env.example` and validated at startup (`backend/src/config/env.ts`). The process exits on invalid config. Production essentials:

- `NODE_ENV=production`: marks cookies `Secure`, switches to JSON logs and hides Swagger (unless `ENABLE_DOCS=true`). The site must be served over HTTPS.
- `JWT_ACCESS_SECRET`: at least 32 random characters. Rotating it signs everyone out of their access tokens (refresh still works).
- `CORS_ORIGINS` / `PUBLIC_WEB_URL`: the public web origin. `PUBLIC_WEB_URL` is also used for links in emails (invitations, password resets).
- `DATABASE_URL`, `REDIS_URL`, `S3_*`: managed services recommended (RDS/Cloud SQL, ElastiCache/Upstash, S3/R2).
- `SMTP_URL` (e.g. `smtps://user:pass@smtp.example.com:465`) and `MAIL_FROM`. Without `SMTP_URL`, emails are only logged, which is fine for development but means invitations and resets never arrive.
- `REVALIDATE_SECRET` + `WEB_INTERNAL_URL`: when a master admin edits plans, the API calls `POST {WEB_INTERNAL_URL}/api/revalidate` so the cached pricing page refreshes. Set the same secret on `web`.

Frontend (`frontend/.env.example`):

- `API_URL` is baked in at **build** time for the `/api` and `/socket.io` rewrites and is also read at runtime by server components.
- `NEXT_PUBLIC_SITE_URL` drives canonical URLs, the sitemap and OG tags.
- `NEXT_PUBLIC_WS_URL` (optional, build time): the API's public origin. When set, realtime upgrades to WebSockets directly against the API (add the web origin to `CORS_ORIGINS`). When empty, Socket.IO uses long-polling through the web origin, which needs no extra ingress.

## Realtime

The API hosts a Socket.IO gateway. Clients authenticate with their access token in the handshake and join a private `user:<id>` room; events are `notification`, `invoice.updated` and `pdf.ready`. The gateway uses the Redis adapter, so events emitted by the worker or by any API replica reach every connected client. Behind a load balancer with WebSocket transport, no sticky sessions are needed; with long-polling, enable sticky sessions if you run more than one API replica.

## Scaling notes

- `api` is stateless apart from Socket.IO connections (see above). Scale horizontally behind the web tier.
- `worker` can run multiple replicas. BullMQ distributes jobs and the hourly overdue sweep is a single Redis job scheduler, so it runs once regardless of replica count.
- PDF rendering keeps one Chromium per worker. Increase replicas rather than concurrency if PDFs back up.

## Checks after deploy

- `GET /api/v1/health` returns 200 through the web origin.
- Sign in, open an invoice, download its PDF, email it and confirm it arrives.
- `docker compose logs worker` shows `Worker started`.

## CI

```bash
npm run install:all
npm run typecheck && npm run lint && npm test
npm run build
# Backend e2e needs TEST_DATABASE_URL and Redis:
npm --prefix backend run test:e2e
# Optional: EXPLAIN ANALYZE of the list queries against ~10k seeded invoices (test database only):
(cd backend && PERF=1 npx jest --config test/jest-e2e.config.js test/perf.e2e-spec.ts)
# Browser e2e against a running stack (see frontend/playwright.config.ts):
cd frontend && npx playwright install chromium webkit firefox && npm run test:e2e
```

Playwright runs every flow (signup, company admin invoicing and payments, employee invite through Mailpit, master admin onboarding) on Chromium, Firefox and WebKit, plus an iPhone 13 emulation smoke run. `--project=responsive` sweeps each main route from 320px to 2560px, fails on horizontal overflow and saves screenshots to `test-results/responsive/`. It needs the API, worker, Mailpit (`E2E_MAILPIT_URL`, default `http://localhost:8025`) and master admin credentials (`E2E_MASTER_EMAIL` / `E2E_MASTER_PASSWORD`, or `backend/.env` locally). WebKit and device emulation approximate Safari and phones; they are not a substitute for testing on real devices.

Not set up yet: a CI pipeline definition (GitHub Actions or similar), Postgres backups/PITR and uptime monitoring.
