# Future modules (TODO, not implemented)

These are intentionally **not** implemented. Each will be its own Nest module under `src/modules/<name>` following the same pattern
(controller + service + DTOs, `@RequirePermission`, `TenantContext` scoping, audit events).

| Module | Planned tables | Notes |
|---|---|---|
| messaging channels | notification_channels | WhatsApp/SMS providers behind the existing notifications + BullMQ mail pipeline. |
| integrations | integration_accounts | Zoho, Yanolja, AI automation; credentials encrypted at rest. |
