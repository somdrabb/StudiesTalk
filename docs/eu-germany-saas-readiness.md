# EU / Germany SaaS Readiness

This implementation adds technical controls and evidence structures for EU/Germany SaaS readiness. It is not legal advice and does not replace review by a lawyer, tax advisor, or accountant.

## Implemented

- Configurable platform legal settings for company/operator identity, Impressum fields, provider disclosures, notices, and retention windows.
- Versioned legal documents for privacy, terms, Impressum, cookies, DPA/AVV, AI notice, recording notice, and subprocessor list.
- Subprocessor registry for vendor disclosures.
- Data retention configuration endpoint and coverage map.
- Data export/delete request evidence fields.
- VAT-ready workspace billing profile fields.
- Invoice legal fields and invoice number generation.

## Owner Must Configure

- Company/operator name and address.
- VAT ID and tax number, if applicable.
- Support and privacy contact emails.
- Hosting, AI, email, SMS, storage, analytics, video, and monitoring providers.
- Published legal documents per required locale.
- Subprocessor list and DPA availability status.
- Retention windows matching the real operational policy.

## Production Checklist

- Review all legal text with counsel.
- Review invoice/VAT setup with accountant or tax advisor.
- Configure Stripe tax/VAT behavior in Stripe if Stripe-hosted invoices are used.
- Confirm DPA/AVV availability with each provider.
- Keep subprocessors current when providers change.
- Test export/delete request handling and evidence generation.
- Keep audit evidence for legal publish, retention changes, and data requests.

## Stripe VAT Note

Stripe can collect tax-related customer details and generate hosted invoices, but this repository also stores VAT and invoice metadata for platform evidence. Make sure Stripe customer metadata, Stripe Tax settings, invoice template, and StudiesTalk billing records are aligned before selling.
