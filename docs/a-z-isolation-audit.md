# A-Z Isolation Audit

This document records the current multi-tenant isolation proof for StudiesTalk after the P0, P1, and P2 hardening passes.

## Current Status

The high-risk P0/P1 gaps are closed:

- Legacy trusted identity headers are no longer sent by the frontend.
- DM lists require authenticated participant access.
- Message edit authorization uses the stored message owner and same-workspace role checks.
- Translation checks access to the original channel or DM message.
- Live attendance writes validate session, workspace, class, and student membership.
- Calendar routes require authenticated context and no longer log full request bodies or headers.
- Knowledge search requires authentication.
- Culture preferences require channel membership.
- Admin access tokens are not stored in localStorage.
- Analytics cache keys include user, workspace, and role.

The P2 pass adds repeatable evidence:

- `scripts/p2-isolation-completion-smoke.js`
- `scripts/route-isolation-matrix.js`
- `scripts/db-isolation-integrity-check.js`

## P2 Fixes

DM, reply, and message reactions now use the authenticated actor id only. The API no longer accepts `req.body.userId` for reaction attribution and no longer falls back to anonymous reaction ownership.

Stripe webhook handling now blocks customer/workspace mapping mismatches. If Stripe metadata points at one workspace but the stored customer mapping points at another, the webhook records a blocked `webhook.mapping_mismatch` provider event and does not create payments or update the wrong workspace.

Invite-link lookup is now rate limited with the same strict limiter used for registration OTP flows.

## Route Matrix

Generate the route matrix with:

```bash
npm run isolation:route-matrix
```

The matrix classifies each route for:

- authentication
- CSRF or request limiting
- role validation
- workspace/entity ownership validation
- priority

Routes marked `public` are intended public routes, such as legal documents, health checks, registration, password reset, and explicit public settings.

## Database Integrity

Run the database isolation checker with:

```bash
npm run isolation:db-integrity
```

If `DB_PATH` points at a SQLite database, the checker validates common tenant-scoped orphan relationships. Without a DB path it performs a static schema coverage check.

## Remaining Risks

The route matrix is heuristic evidence, not a formal proof. Keep adding focused endpoint-level smoke tests when new routes are introduced.

Support mode has hooks for core customer-record reads: files, channel messages, DMs, billing, users, and AI conversations. New customer-data endpoints must call `logSupportAccessIfActive`.

Public registration and reset routes intentionally reveal valid invite data when a valid high-entropy token is supplied. Rate limits are in place, but production should keep monitoring token-probing attempts.

## Commands

```bash
nvm use 20
npm run preflight
npm run test:p0-isolation:smoke
npm run test:p1-isolation:smoke
npm run test:p2-isolation:smoke
npm run test:tenant-isolation:smoke
npm run test:security:smoke
```
