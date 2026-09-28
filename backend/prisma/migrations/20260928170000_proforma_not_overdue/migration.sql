-- Proformas can't receive payments, so they are never overdue.
UPDATE "payment_schedule_items" SET "status" = 'PENDING'
WHERE "status" = 'OVERDUE' AND "invoiceId" IN (SELECT "id" FROM "invoices" WHERE "invoiceType" = 'PROFORMA');

UPDATE "invoices" SET "status" = 'ISSUED' WHERE "invoiceType" = 'PROFORMA' AND "status" = 'OVERDUE';
