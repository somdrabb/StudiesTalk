# Onboarding Billing Step

## Goal

Make the billing step useful without inventing unsupported billing behavior.

## Current Model

The billing step now uses lightweight, real server-backed data on `workspace_billing`.

Fields used:

- `billing_email`
- `invoice_contact_name`
- `readiness_acknowledged_at`
- `readiness_acknowledged_by_user_id`

Relevant files:

- [server/repositories/billingRepository.js](/Users/jannatuladny/cat-6.1/server/repositories/billingRepository.js)
- [server.js](/Users/jannatuladny/cat-6.1/server.js)
- [public/app.js](/Users/jannatuladny/cat-6.1/public/app.js)
- [db/schema/pg/007_billing.sql](/Users/jannatuladny/cat-6.1/db/schema/pg/007_billing.sql)

## What School Admins Can Do

During onboarding, school admins can:

- view billing readiness
- update billing contact email
- update invoice contact name
- acknowledge that billing readiness was reviewed for launch

They cannot:

- manage payment processing
- edit invoice/payment ledgers directly
- replace super-admin billing workflows

## Readiness Rule

`billing_setup` is complete when:

- `billing_email` exists
- `invoice_contact_name` exists
- billing is active or launch billing readiness has been acknowledged

This keeps the step honest:

- it improves launch readiness visibility
- it does not pretend a payment stack exists where one does not

## API Surface

- `GET /api/workspaces/:workspaceId/billing-profile`
- `PATCH /api/workspaces/:workspaceId/billing-profile`

The route is scoped with the same workspace checks as onboarding routes.

## Ownership Messaging

The UI explicitly states that billing remains a shared platform/school-admin concern.
That avoids implying that school admins now control invoice/payment administration end to end.
