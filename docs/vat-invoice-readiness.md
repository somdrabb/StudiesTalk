# VAT / Invoice Readiness

This document describes the technical invoice and VAT fields added for Germany/EU SaaS selling. It is implementation support only; tax handling must be reviewed by an accountant.

## Workspace Billing Fields

Each paying workspace can store:

- `legal_company_name`
- `billing_contact_name`
- `billing_email`
- `billing_address_line1`
- `billing_address_line2`
- `billing_city`
- `billing_postal_code`
- `billing_country`
- `vat_id`
- `tax_number`
- `invoice_language`
- `invoice_currency`
- `reverse_charge_applicable`
- Stripe/provider customer and subscription IDs

## Invoice Fields

Invoices now support:

- seller company, address, VAT ID, tax number
- buyer company, billing address, VAT ID
- `invoice_number` in `ST-YYYY-000001` style
- invoice date, due date, currency
- net amount, VAT rate, VAT amount, gross amount
- reverse charge note
- payment provider and provider invoice ID
- legal footer

## Invoice Numbering

`server/services/invoiceNumber.service.js` generates the next available number for local SQLite-backed invoice creation. Postgres implementations use the same visible format and should be upgraded to a database sequence before heavy production billing volume.

## Production Notes

- Confirm VAT rate logic before launch.
- Confirm reverse-charge eligibility before setting the flag.
- Align Stripe invoice settings with StudiesTalk invoice records.
- Keep invoice legal footer configurable and reviewed.
