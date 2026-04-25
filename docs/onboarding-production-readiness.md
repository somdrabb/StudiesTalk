# Onboarding Production Readiness

## Production-Ready In Scope
- tenant-safe onboarding access on allowlisted setup routes
- stronger server validation for profile, billing, email settings, and opening-hours data
- transactional profile writes
- replay-safe retry support for key onboarding creation routes
- evidence-based completion and activation trust
- blocked-activation audit trail
- cleaner guided-mode error recovery
- smoke coverage for the critical onboarding risk cases

## Runtime Compatibility
- SQLite remains the default runtime.
- PostgreSQL onboarding repository compatibility is preserved.
- Existing onboarding APIs and response shapes were kept stable except for stricter validation errors and additive audit events.

## Operational Confidence
- legacy schools are not forced through onboarding
- new school admins still get guided onboarding
- skipped onboarding remains resumable
- completed onboarding does not re-open
