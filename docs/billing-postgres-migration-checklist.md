# Billing PostgreSQL Migration Checklist

This checklist covers the Billing-only adapter migration. It does not cover
auth/session/runtime cutover.

## Current Boundary

- SQLite remains the default active runtime.
- `server.js` still owns auth/session and most non-billing domains through SQLite.
- Billing SQL is behind `server/repositories/billingRepository.js`.
- Billing can be rehearsed separately by setting `BILLING_DB_ENGINE=postgres`.
- Full `DB_ENGINE=postgres` cutover is intentionally not part of this step.

## Converted Billing Routes

- `GET /api/admin/billing/:workspaceId`
  - Uses `listInvoices(workspaceId)`.
  - Uses `listPayments(workspaceId)`.
  - Response shape remains `{ invoices, payments }`.

- `POST /api/admin/invoices`
  - Uses `createInvoice(input)`.
  - Response shape remains `{ ok: true, id }`.

- `POST /api/admin/invoices/:id/mark-paid`
  - Uses `markInvoicePaid(input)`.
  - Response shape remains `{ ok: true, paymentId }`.

## PostgreSQL-Compatible SQL Rules

The PostgreSQL billing path avoids:

- `INSERT OR IGNORE`
- `INSERT OR REPLACE`
- `datetime('now')`
- `strftime(...)`
- `rowid`

PostgreSQL-compatible replacements:

- `INSERT ... ON CONFLICT (...) DO NOTHING`
- app-generated ISO timestamps for billing writes
- explicit `ORDER BY created_at DESC, id DESC`

## Verification

- [ ] Create invoice
  - Open Admin Billing.
  - Select a concrete workspace.
  - Create an invoice with amount, description, and due date.
  - Confirm the request returns `{ ok: true, id }`.

- [ ] List invoices
  - Reload Admin Billing.
  - Confirm the invoice appears in the invoices table.
  - Confirm workspace filtering still works.
  - Confirm status filtering still works.

- [ ] Mark invoice paid
  - Click `Mark paid` on the created invoice.
  - Confirm the request returns `{ ok: true, paymentId }`.
  - Confirm the invoice status becomes `paid`.

- [ ] List payments
  - Reload Admin Billing.
  - Confirm one manual payment appears for the paid invoice.
  - Confirm payment amount, invoice id, workspace id, provider, and paid timestamp are present.

- [ ] Admin billing page still works
  - Confirm summary cards load.
  - Confirm attention box renders.
  - Confirm invoice and payment tables render without console errors.

## Remaining Blockers

- Auth/session runtime is still SQLite.
- Admin authorization still reads SQLite users.
- Audit logging still writes SQLite.
- PostgreSQL billing rehearsal requires copied workspace/user rows first because invoice foreign keys reference them.
- Non-admin payment summaries and AI context helpers still read invoice/payment data from SQLite in `server.js`; convert those after the Admin Billing route rehearsal passes.
- Non-billing SQL in `server.js` still contains SQLite-only syntax and must be migrated domain by domain.

## Rehearsal Result - 2026-04-22

Environment:

- App started with `BILLING_DB_ENGINE=postgres`.
- Full `DB_ENGINE` was not switched.
- Auth/session runtime stayed on SQLite with `DB_PATH=storage/worknest.db`.
- PostgreSQL rehearsal database: local `studiestalk`.

What worked:

- PostgreSQL schema applied successfully with `npm run db:pg:schema`.
- Core `workspaces` and `users` rows were copied into PostgreSQL for billing foreign keys.
- `GET /api/admin/billing/lens` returned `{ invoices, payments }`.
- `POST /api/admin/invoices` returned `{ ok: true, id }`.
- `POST /api/admin/invoices/:id/mark-paid` returned `{ ok: true, paymentId }`.
- `GET /api/admin/overview` billing counters reflected PostgreSQL billing state:
  - `openInvoices` became `1` after invoice creation.
  - `openInvoices` returned to `0` after marking the invoice paid.

What failed:

- The configured `studiestalk_user` PostgreSQL role did not exist locally.
- The active Node runtime was Node 18, while `better-sqlite3@12.6.2` required Node 20+ and failed to load.
- First invoice POST was blocked by CSRF until `/api/auth/csrf` was called and `x-csrf-token` was supplied.
- PostgreSQL initially returned date/timestamp values as ISO strings, unlike SQLite responses.

Fixes made:

- Used the local PostgreSQL user/database for rehearsal instead of missing `studiestalk_user`.
- Pinned `better-sqlite3` to `^11.10.0` so the unchanged SQLite runtime works on Node 18.
- Normalized PostgreSQL Billing list responses:
  - `dueDate` returns `YYYY-MM-DD`.
  - `createdAt` and `paidAt` return epoch milliseconds.
  - Payment `createdAt` returns epoch milliseconds.

Shape comparison:

- SQLite and PostgreSQL Billing list responses both return:
  - invoice keys: `id`, `workspaceId`, `studentUserId`, `amountCents`, `currency`, `description`, `status`, `dueDate`, `createdAt`, `paidAt`
  - payment keys: `id`, `invoiceId`, `workspaceId`, `studentUserId`, `amountCents`, `currency`, `provider`, `providerRef`, `createdAt`
- Admin Billing page compatibility is preserved at the API shape/type level.
