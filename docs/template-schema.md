# Invoice Template JSON Schema

Implemented as Zod in `backend/src/modules/invoice-templates/template-config.schema.ts` (mirrored in `frontend/src/features/templates/types.ts`).

```ts
TemplateConfig = {
  version: 1,
  page:   { size: "A4" | "LETTER", orientation: "portrait" | "landscape" },
  theme:  { fontFamily: string, baseFontSize: number, primaryColor: string, accentColor: string },
  header: { logo: "service_logo" | "header_logo" | "none", showCompanyName: boolean, showContact: boolean,
            logoPosition: Align = "left", logoSize: 24-160 = 60, nameAlign: Align = "left", nameSize: 12-40 = 20,
            contactAlign: Align = "right", contactSize: 7-16 = 9, divider: boolean = true },
  sections: Array<{
    id: string,
    type: "company_header" | "customer_details" | "invoice_details" | "items_table" | "tax_table"
        | "totals" | "payment_schedule" | "bank_details" | "terms" | "signature"
        | "custom_text" | "custom_image" | "custom_field" | "qr_code" | "logo" | "footer",
    width: "full" | "half",
    props: Record<string, unknown>   // e.g. { text } for custom_text, { fieldKey } for custom_field
  }>,
  footer: { showTerms: boolean, logo: "footer_logo" | "none", text?: string,
            logoPosition: Align = "right", logoSize: 16-120 = 40, textAlign: Align = "left", textSize: 7-14 = 9,
            showContact: boolean = false, contactAlign: Align = "center", contactSize: 7-14 = 8,
            pinToBottom: boolean = true }   // Align = "left" | "center" | "right"; sizes in px; defaults apply to older versions
}
```

## Versioning

- `invoice_templates` (per service) -> `invoice_template_versions` (`version`, `config`, `status DRAFT | PUBLISHED`).
- Editing always writes a new DRAFT version; `POST /invoice-templates/:id/publish` publishes the latest draft.
- Only published versions render invoices. On issue the invoice stores `templateVersionId`; PDFs re-render with that exact version.

## Custom fields

`custom_field_definitions` per service: `key, label, type (TEXT | NUMBER | DATE | DROPDOWN | BOOLEAN | CURRENCY), options[]`. Values live in `invoice.customFieldValues` (JSON) and are placed in a template with a `custom_field` section.
