# Onboarding PostgreSQL Compatibility

## Runtime Policy

SQLite remains the default runtime.
No onboarding change in this pass forces PostgreSQL cutover.

## Repository Pattern

The onboarding hardening remains adapter-friendly:

- SQLite path in [server/repositories/onboardingRepository.js](/Users/jannatuladny/cat-6.1/server/repositories/onboardingRepository.js)
- PostgreSQL path in the same repository
- shared validation and state-machine helpers applied to both engines

## Schema Alignment

Onboarding tables remain in:

- [db/schema/pg/011_onboarding.sql](/Users/jannatuladny/cat-6.1/db/schema/pg/011_onboarding.sql)

Billing-related onboarding support now also depends on billing schema alignment:

- [db/schema/pg/007_billing.sql](/Users/jannatuladny/cat-6.1/db/schema/pg/007_billing.sql)

Added billing-profile fields:

- `invoice_contact_name`
- `readiness_acknowledged_at`
- `readiness_acknowledged_by_user_id`

SQLite bootstrap in [server.js](/Users/jannatuladny/cat-6.1/server.js) adds matching columns with `safeAlter(...)`.

## Compatibility Notes

- no `DB_ENGINE` runtime switch was introduced
- onboarding route response shapes remain backward-compatible, with additive fields only
- existing canonical and legacy onboarding routes still map to the same repository behavior
- smoke coverage still runs against SQLite and exercises server behavior through the existing app runtime

## Deferred Items

- there is not yet a standalone PostgreSQL-specific onboarding smoke path
- the onboarding guard cache remains in-memory and process-local for both engines
