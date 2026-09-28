# API

Base: `/api/v1`. Live Swagger UI at `/api/docs` outside production (or with `ENABLE_DOCS=true`).

Conventions:
- Auth: `Authorization: Bearer <access>`; the refresh token lives in an httpOnly cookie. Tenant: `X-Company-Id`, optional `X-Service-Id`.
- IDs are positive integers assigned by the database, returned as JSON numbers (`"id": 42`). Path params, query filters, body fields and tenant headers accept only `1`–`9007199254740991` without leading zeros; anything else (`0`, negatives, decimals, UUIDs) is **400**. Clients never send an `id` on create. Invoice and receipt numbers (`LSP-INV-000001`) are separate business identifiers.
- Lists: `?page=1&limit=20&search=&sort=createdAt:desc` plus resource filters. Response `{ data, meta: { page, limit, total } }`.
- Errors: `{ statusCode, code, message, errors?, requestId }`. Another tenant's records return 404; missing permissions return 403.
- A lapsed trial or subscription makes writes return **402** `SUBSCRIPTION_REQUIRED` (reads keep working).
- Plan limits (brands, members, customers, invoices per month, feature flags) return **403** with an upgrade message.

| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/change-password`, `GET/PATCH /me`, `GET /me/context` |
| Signup | `POST /auth/signup` (creates the company on the chosen plan's trial), `POST /auth/signup/check-email` |
| Invitations | `GET/POST /invitations`, `POST /invitations/:id/resend`, `DELETE /invitations/:id` (revoke), `GET /invitations/lookup?token=`, `POST /invitations/accept` |
| Admin | `GET /admin/dashboard`; `GET/POST /admin/companies`, `GET/PATCH /admin/companies/:id`, `POST /admin/companies/:id/activate`, `/deactivate`, `PATCH /admin/companies/:id/subscription`; `POST /admin/onboarding`; `GET/POST /admin/plans`, `PUT /admin/plans/order`, `PATCH/DELETE /admin/plans/:id`, `POST /admin/plans/:id/activate`, `/deactivate`; `GET /admin/users`, `PATCH /admin/users/:id/status`; `GET /admin/audit-logs` |
| Company | `GET/PATCH /company` |
| Services (brands) | `GET/POST /services`, `GET/PATCH/DELETE /services/:id` (`code` locks once a document is issued), `POST /services/:id/numbering/preview`, `PUT /services/:id/default-template` |
| Files | `POST /documents/upload` (multipart; MIME sniffed, size capped), `GET /documents?serviceId=`, `GET /documents/:id/url`, `POST /documents/sign` |
| Access | `GET/POST /users`, `PATCH /users/:id`, `GET/POST /roles`, `PATCH/DELETE /roles/:id`, `GET /permissions` |
| Parties | CRUD `/departments`, `/employees`, `/customers`, `/vendors`, `/products` |
| Invoices | `GET/POST /invoices`, `GET/PATCH/DELETE /invoices/:id` (drafts only for edit/delete), `POST /invoices/:id/issue`, `/cancel`, `/void`, `/send` (email with PDF, 202), `GET/PUT /invoices/:id/payment-schedule`, `GET /invoices/:id/preview`, `GET /invoices/:id/pdf`, `POST /invoices/:id/regenerate-pdf` |
| Payments | `GET /payments` (filters `direction, method, status, serviceId, from, to, minAmount, maxAmount, search`; includes `summary`), `GET /payments/:id`, `GET /payments/:id/pdf` (receipt/voucher), `GET/POST /invoices/:id/payments`, `POST /payments/:id/refund`, `POST /payments/:id/reverse` |
| Templates | `GET/POST /invoice-templates`, `GET/DELETE /invoice-templates/:id`, `POST /invoice-templates/:id/versions`, `/publish`, `/duplicate`, `/preview`; CRUD `/custom-fields` |
| Notifications | `GET /notifications?unread=true`, `GET /notifications/unread-count`, `POST /notifications/read-all`, `POST /notifications/:id/read`, `POST /notifications/:id/unread` |
| Reports | `GET /reports/:type` where type = `sales, purchases, receivables, payables, outstanding, payments, tax, by-service`; filters `from, to, serviceId, customerId, vendorId, status` |
| Dashboard | `GET /dashboard` |
| Audit | `GET /audit-logs` (company scope) |
| Public | `GET /public/plans`, `GET /public/brands/:companySlug/:serviceSlug`, `GET /public/sitemap` |

## Numbering

Each brand has a short `code` (2–8 letters/digits) and a `numbering` config per series (`INVOICE, PROFORMA, CREDIT_NOTE, DEBIT_NOTE, PURCHASE, RECEIPT, VOUCHER`):

```json
{ "INVOICE": { "format": "{CODE}/INV/{FY}/{SEQ}", "padding": 6, "start": 1, "reset": "FY" } }
```

Tokens: `{CODE}`, `{YYYY}`, `{YY}`, `{MM}`, `{FY}` (e.g. `2026-27`), `{SEQ}`. A format must contain `{CODE}` and `{SEQ}`, and each series needs a distinct format. `reset` is `NEVER`, `YEARLY` or `FY`. Numbers are allocated inside the issuing transaction by an atomic upsert on `invoice_sequences (serviceId, series, period)`, so concurrent issues never duplicate, and a rolled-back issue never consumes a number.

## Realtime (Socket.IO)

Connect to `/socket.io` with `auth: { token: <access token> }`. The server emits `unauthorized` when the token is invalid or expired; refresh and reconnect.

| Event | Payload |
|---|---|
| `notification` | the notification row (includes `companyId`) |
| `invoice.updated` | `{ companyId, invoiceId, status, paidAmount, balanceAmount }` |
| `pdf.ready` | `{ companyId, invoiceId, documentId }` (sent to the user who requested the PDF) |
