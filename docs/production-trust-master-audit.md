# Production Trust Master Audit

Date: 2026-04-24

Scope reviewed:

- `server.js`
- `server/env.js`
- `db/`
- `server/repositories/`
- `scripts/`
- `docs/`
- `public/app.js`
- `package.json`
- `.env.example`

This is a read-only audit. No application code changes were made as part of this pass.

## Executive Summary

StudiesTalk is materially stronger than an early-stage single-file app:

- password writes now prefer `argon2id`
- legacy `bcrypt` and PBKDF2 verification remain compatible
- registration duplicate checks exist for workspace email, phone, and DOB
- CSRF, onboarding, policy, upload hardening, request IDs, health endpoints, backup scripts, and tenant isolation helpers are in place
- super-admin private-content access is blocked on the main hardened content routes

The main remaining trust risks are not the already-hardened primary chat flows. They are the older legacy endpoints and operational edges that still bypass the newer guard model:

1. legacy search can still broaden beyond the requested workspace
2. legacy file analytics/stat endpoints still trust client-selected workspace context
3. password reset tokens are stored in plaintext in the database
4. SQLite uniqueness protection is conditional and can silently remain incomplete if legacy duplicates already exist
5. the main runtime is still SQLite-first even when `DB_ENGINE=postgres` is configured

## Already In Good Shape

### Account Identity / Password

- Registration duplicate detection exists before user creation in the same workspace by normalized email, normalized phone, and normalized DOB.
- Duplicate registration returns a clean fixed payload and does not reveal which field matched.
- New password hashing uses `argon2id` when the package is available.
- Verification supports `argon2`, `bcrypt`, and legacy PBKDF2 hashes.
- Forgot-password requests return a generic success response for unknown accounts.
- Weak password rejection and reset completion are security-logged without logging the submitted password.

### Tenant Isolation / Privacy

- Shared helpers exist for workspace, channel, message, file, homework, and DM access decisions.
- Hardened routes resolve resource ownership from the database instead of trusting client `workspaceId` alone.
- `super_admin` is denied private-content access on hardened content routes by default.
- Managed upload reads and writes now use guarded access checks rather than open static serving for registry-backed files.
- Tenant isolation smoke coverage exists and passes locally.

### Production Readiness

- `server/env.js` validates production-sensitive env values and avoids printing secret values.
- request IDs are attached to requests and responses
- `/health` and `/health/deep` exist
- SQLite backup, restore, and verification scripts exist
- deployment, rollback, and PostgreSQL staging rehearsal docs exist
- core smoke coverage exists for security, onboarding, policy, account security, and tenant isolation

## Findings

### A. Account Identity / Password

| Finding | File / location | Risk | Current behavior | Recommended fix | Priority | SQLite / PostgreSQL compatibility |
| --- | --- | --- | --- | --- | --- | --- |
| Password reset tokens are stored in plaintext | `server/repositories/authRepository.js:135-154`, `server.js:14646-14708` | High | Reset tokens are generated as raw random strings, stored directly in `password_resets.token`, then looked up by raw token. A database read exposes usable reset links until expiry. | Store only a SHA-256 token hash, email the raw token once, and compare by hash on completion. Keep expiry and one-time-use behavior unchanged. | P1 | Compatible with both. Requires matching schema/repository update in SQLite and PostgreSQL. |
| SQLite uniqueness protection is conditional, not guaranteed | `server.js:3396-3428` | High | Unique indexes for workspace email and phone are only created if duplicate rows do not already exist. If legacy duplicates exist, startup logs a warning and proceeds without true uniqueness enforcement. | Add an explicit duplicate-cleanup migration/reporting step and fail production preflight when duplicates remain unresolved. | P1 | Compatible with both. PostgreSQL already enforces workspace email uniqueness but not workspace phone uniqueness. |
| Password history exists but reuse is not blocked | `server/repositories/userRepository.js:263-273`, `639-649`; `server.js:14728-14735` | Medium | New hashes are written into `password_history`, but reset/registration flows do not check the new password against prior hashes. | Enforce a recent-password reuse check on password reset and admin-set-password flows. | P3 | Compatible with both. |
| Duplicate matching includes DOB-only collisions | `server.js:2431-2461` | Medium | Same-workspace DOB alone can trigger an `account_already_exists` response. That is privacy-safe but may create false positives in schools with incomplete identity data. | Prefer ranking: email > normalized phone > DOB plus name corroboration, or keep current behavior but document manual recovery/support path. | P3 | Compatible with both. |
| Forgot-password security event logs normalized email | `server.js:14665-14673` | Low | Reset requests log the email in the security-event payload. This is not a secret, but it is still PII. | Reduce payload to domain-only or account-id-only when available. | P4 | Compatible with both. |

### B. Tenant Isolation / School Privacy Boundary

| Finding | File / location | Risk | Current behavior | Recommended fix | Priority | SQLite / PostgreSQL compatibility |
| --- | --- | --- | --- | --- | --- | --- |
| Search route can broaden beyond the requested workspace | `server.js:16708-16754` | Critical | `GET /api/search` filters by `workspaceId` only if supplied, and if no rows are found it retries with `workspaceId = null`, effectively broadening to all workspaces. It also does not run through the newer shared channel/message access helpers. | Remove fallback broadening entirely. Resolve requester workspace server-side, scope channel search to that workspace, and apply membership-aware filtering before returning message hits. | P0 | Compatible with both, but should move behind repository/service boundary eventually. |
| Legacy file analytics routes trust client-selected tenant context | `server.js:10197-10260`, `10142-10195`, `10086-10140` | Critical | `/api/file-stats`, `/api/file-stats/increment`, `/api/file-events`, and `/api/analytics/files` use `workspaceIdFromRequest`, body-provided `workspaceId`, or legacy `x-admin` / `x-super-admin` headers. They do not use the hardened tenant assertions. This allows cross-tenant metadata reads/tampering or unauthenticated metric writes. | Require authenticated user context, resolve workspace from token/server-side state, and restrict events/stats to files the user can actually access. Replace legacy admin headers with token-derived authorization. | P0 | Compatible with both. Good candidate for a dedicated repository/service hardening pass. |
| DM tenancy is inferred, not modeled | `server.js:2108-2127`, `2280-2330`; `docs/tenant-isolation-inventory.md` | High | DM workspace is inferred from creator/member users because `dms.workspace_id` does not exist. The runtime now blocks mixed-workspace or missing-workspace DMs, but the protection is inferential rather than schema-backed. | Add explicit `workspace_id` to `dms` and DM-related tables, backfill existing rows, and migrate access checks to the stored field. | P1 | Requires dual-schema migration work in SQLite and PostgreSQL. |
| Some legacy mailbox/admin paths still return generic permission responses rather than the hardened tenant event model | `server.js:11951-12416` | Medium | Mailbox scoping is much better and super-admin mailbox browsing is blocked by role model, but some mailbox/admin denial paths still use older generic `Forbidden` handling rather than the same explicit tenant-denial/audit pattern used on core content routes. | Normalize mailbox/inbox attachment denials to shared tenant/security logging and explicit forbidden-file/content events. | P3 | Compatible with both. |
| `assertAdminForWorkspace` still has optional super-admin bypass for workspace admin operations | `server.js:2178-2191` | Medium | This is appropriate for platform management routes, but it is a sharp edge if reused on school-private operational routes in the future. | Keep it for platform admin routes only, and document that private content routes must never use `allowSuperAdmin=true`. | P3 | Compatible with both. |

### C. Production Deployment Readiness

| Finding | File / location | Risk | Current behavior | Recommended fix | Priority | SQLite / PostgreSQL compatibility |
| --- | --- | --- | --- | --- | --- | --- |
| Main runtime still boots SQLite even when `DB_ENGINE=postgres` is configured | `server.js:157-174` | High | The app warns that `DB_ENGINE != sqlite`, but `server.js` still opens SQLite directly as the primary runtime. PostgreSQL rehearsal exists, but full production cutover is not actually ready. | Treat PostgreSQL as staging-only until the runtime ownership is fully moved behind repositories. Keep SQLite as the documented default for production unless and until a full cutover pass is completed. | P1 | This is the core SQLite/PostgreSQL compatibility blocker. |
| `/health/deep` exposes filesystem paths and config shape unauthenticated | `server.js:23114-23167` | Medium | Deep health includes absolute DB path and writable directory paths. Useful operationally, but too verbose for an internet-exposed unauthenticated endpoint. | Keep `/health` public, restrict `/health/deep` by network/auth or redact internal paths in production. | P2 | Compatible with both. |
| Backup verification checks readability, not restore correctness under app load | `scripts/backup-sqlite.js`, `scripts/restore-sqlite-backup.js`, `scripts/verify-backup.js`, `scripts/sqlite-backup-utils.js` | Medium | Backup script checkpoints WAL and writes a manifest. Restore requires `--confirm-restore`. Verification opens the backup and checks key tables, but there is no automated restore drill or end-to-end smoke against a restored DB. | Add a restore smoke that restores into a temp path and boots the app against it. | P2 | SQLite-only operational gap. |
| `test:all:smoke` does not include account-security or tenant-isolation smoke suites | `package.json` | Medium | The aggregated smoke script runs security, onboarding, and policy only. Account identity and tenant isolation require separate manual commands. | Expand `test:all:smoke` or add a `test:all:trust:smoke` script that includes account and tenant suites. | P2 | Compatible with both. |
| README production messaging is ahead of runtime reality | `README.md`, `server.js:170-173`, `docs/postgres-staging-rehearsal.md` | Low | README says PostgreSQL is recommended for production, while the code still warns that the main runtime remains SQLite during staged migration. | Align README wording with actual runtime status: PostgreSQL is rehearsal-ready, not default-ready. | P4 | Documentation-only. |

## Critical Blockers

1. `GET /api/search` can widen search scope beyond the selected workspace and bypass the newer tenant-access model.
2. Legacy file analytics/stat/event routes still trust client-selected tenant context and legacy admin headers.

## High-Priority Fixes

1. Hash password reset tokens at rest and verify by hash.
2. Resolve and enforce duplicate-user cleanup so SQLite uniqueness is not silently skipped in production.
3. Add explicit `workspace_id` to DM data instead of inferring workspace from participants.
4. Keep PostgreSQL documented as rehearsal-only until the main runtime no longer opens SQLite directly.

## Quick Wins

1. Restrict or redact `/health/deep` in production.
2. Expand the aggregate smoke command to include tenant and account-security suites.
3. Reduce PII in forgot-password security event payloads.
4. Align README production wording with the actual runtime state.

## Recommended Implementation Order

1. Fix legacy tenant leaks first:
   - `search`
   - `file-stats`
   - `file-events`
   - `analytics/files`
2. Hash password reset tokens at rest.
3. Add production duplicate-cleanup reporting/preflight failure for workspace email/phone duplicates.
4. Add DM `workspace_id` schema support and remove inferred-workspace logic.
5. Tighten operational trust:
   - `/health/deep`
   - restore smoke
   - aggregate smoke script
   - README/docs alignment
6. Only after the above, do a dedicated PostgreSQL runtime-ownership pass.

## Files Likely Needing Edits Next

- `server.js`
- `server/repositories/authRepository.js`
- `server/repositories/userRepository.js`
- `server/repositories/messageRepository.js`
- `server/repositories/channelRepository.js`
- `db/schema/pg/003_users_auth.sql`
- `db/schema/pg/004_channels_messages.sql`
- `scripts/security-smoke.js`
- `scripts/account-security-smoke.js`
- `scripts/tenant-isolation-smoke.js`
- `package.json`
- `README.md`
- `docs/tenant-isolation-inventory.md`
- `docs/postgres-staging-rehearsal.md`

## Notes On Client Trust

`public/app.js` still sends `workspaceId` in many requests for UI state and admin navigation. That is acceptable only because the server is supposed to treat client workspace context as advisory. The remaining trust work is therefore almost entirely server-side: remove or harden the legacy endpoints that still rely on client-supplied workspace selectors.
