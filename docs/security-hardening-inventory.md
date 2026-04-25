# StudiesTalk Security Hardening Inventory

## Scope

This inventory documents the production-facing security posture in the current Node/Express app after the safe hardening pass in `server.js`. The intent is to improve trust and operational safety without changing onboarding logic, policy acceptance behavior, database engine defaults, or public API response shapes.

## Current Auth And Session Model

- Access model: JWT access tokens are signed in `server.js` with `JWT_ACCESS_SECRET` and returned both as JSON (`accessToken`) and as an `httpOnly` cookie named `access_token`.
- Refresh model: JWT refresh tokens are signed with `JWT_REFRESH_SECRET`, stored as `httpOnly` `refresh_token` cookies, hashed before persistence, and rotated on `/api/auth/refresh`.
- Revocation model: access token `jti` values are checked against the auth repository; refresh tokens are persisted, revocable, and rotated or revoked on password reset and logout.
- Login model: `/api/login` and `/api/auth/login` share the same handler. Login attempts and security events are recorded through the auth repository.
- Password reset model: reset tokens are stored in `password_resets`, invalidated on use, and all refresh tokens for the user are revoked when a reset completes.

## CSRF Model

- CSRF token cookie: `csrf_token`, readable by JavaScript, `sameSite=lax`, `secure` follows `COOKIE_SECURE`.
- Validation rule: all `POST`, `PUT`, `PATCH`, and `DELETE` requests must send `x-csrf-token` matching the `csrf_token` cookie.
- Auth exception: routes under `/api/auth/` are excluded from CSRF enforcement to preserve login, refresh, logout, and reset behavior.
- Bootstrap: the server ensures a CSRF cookie is present on normal app requests and exposes `/api/auth/csrf` for explicit retrieval.

## Cookie Settings

- `access_token`
  - `httpOnly: true`
  - `sameSite: lax`
  - `secure: ENV.COOKIE_SECURE`
  - `path: /`
  - `maxAge: 15 minutes`
- `refresh_token`
  - `httpOnly: true`
  - `sameSite: lax`
  - `secure: ENV.COOKIE_SECURE`
  - `path: /`
  - `maxAge: 30 days`
- `csrf_token`
  - `httpOnly: false`
  - `sameSite: lax`
  - `secure: ENV.COOKIE_SECURE`
  - `path: /`

## Security Headers

Helmet is enabled with a conservative profile intended not to break the current frontend:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Cross-Origin-Resource-Policy: same-site`
- `Cross-Origin-Opener-Policy: same-origin-allow-popups`
- `Content-Security-Policy`: intentionally disabled for now because the app still relies on inline script/style patterns and a strict CSP would be a breaking change.
- `Cross-Origin-Embedder-Policy`: intentionally disabled to avoid breaking existing media/embed flows.
- `X-Powered-By`: disabled at the Express layer.

## Rate Limits

### Previously Present

- `/api/login` and `/api/auth/login`
- Registration OTP send and verify routes
- Registration mobile OTP send and verify routes
- AI runtime limiter

### Added In This Pass

- Login: in-memory limiter, 10 attempts per 15 minutes.
- Registration OTP send/verify: existing strict limiter retained via in-memory limiter, 5 attempts per 15 minutes.
- Password reset request: 5 attempts per hour.
- Password reset completion: 8 attempts per hour.
- Registration mutation routes:
  - `/api/register/session`
  - `/api/register/request-review`
  - `/api/register/send-link`
  - `/api/register/complete`
- Policy acceptance routes:
  - `/api/workspaces/:workspaceId/policy/accept`
  - `/api/policy/accept`
- Onboarding mutation routes:
  - canonical workspace onboarding `PATCH` and activation routes
  - legacy onboarding `POST` lifecycle and step routes
- Admin-sensitive mutation routes:
  - school request review actions
  - admin security revoke/block actions
  - owner/workspace email setting mutations
  - workspace upsert/delete
  - admin user update/delete
  - invoice mutations
  - workspace settings updates

### Rate-Limit Response Shape

All new hardening limiters return:

```json
{ "error": "Too many requests. Please try again later.", "code": "rate_limited" }
```

and set `Retry-After`.

### Current Limiter Storage Model

- Storage: `rate-limiter-flexible` `RateLimiterMemory`
- Deployment note: safe for a single-process deployment and local/dev fallback.
- Remaining risk: limits are process-local. For horizontally scaled production, move these limiters to Redis or another shared backend.

## Upload And File Handling

- Public uploads:
  - `POST /api/uploads` writes to disk with randomized filenames.
  - Current gap: no MIME allowlist and no size limit on the generic `upload` middleware.
  - Static serving is available under `/uploads`.
- Logo and CSV admin uploads:
  - in-memory multer with `2 MB` file size limit.
- File registry:
  - file metadata is recorded in `files_registry`, `file_events`, and `file_stats`.
- Inbox attachments:
  - admin inbox attachments are served from `storage/email_attachments` with attachment metadata lookup and path validation before streaming.

## Tenant And Role Guard Patterns

- `requireAccessToken` / `authRequired` enforce authenticated API access.
- `requireSuperAdmin`, `requireAdmin`, teacher/admin helper checks, and workspace-scoped request context helpers are used across admin and school-management routes.
- `onboardingGuard.middleware` enforces required school-admin onboarding before broader workspace access.
- `policyGuard.middleware` enforces workspace policy acceptance before guarded API access.
- Workspace isolation is commonly enforced by comparing route workspace IDs against `req.auth.workspaceId`.

## Sensitive Routes

### Authentication And Password

- `/api/login`
- `/api/auth/login`
- `/api/auth/forgot-password`
- `/api/auth/reset-password/complete`
- `/api/auth/refresh`
- `/api/auth/logout`

### Registration And OTP

- `/api/register/otp/send`
- `/api/register/otp/verify`
- `/api/register/mobile-otp/send`
- `/api/register/mobile-otp/verify`
- `/api/register/request-review`
- `/api/register/send-link`
- `/api/register/complete`

### Policy And Onboarding

- `/api/workspaces/:workspaceId/policy/accept`
- `/api/policy/accept`
- `/api/workspaces/:workspaceId/onboarding`
- `/api/workspaces/:workspaceId/onboarding/steps/:stepId`
- `/api/workspaces/:workspaceId/onboarding/activate`
- `/api/onboarding/:workspaceId/*`

### Admin-Sensitive

- school request approval/rejection/flagging/workspace creation
- session revoke and IP block/unblock endpoints
- admin user mutation endpoints
- admin workspace mutation endpoints
- admin workspace email settings and owner email settings
- admin invoice and workspace settings mutations

## Existing Security Event And Audit Logging

- `login_attempts`
  - records login identifier, success/failure, user ID, workspace ID, IP, and user agent
- `security_events`
  - records auth and security events including login success/failure, password reset request, password change, IP block actions, and session revocations
- `audit_logs` / legacy `audit_log`
  - records broader application audit actions including school request review, registration invites, onboarding mutations, and admin actions

## Remaining Risk Areas Not Changed In This Pass

- No strict CSP yet; inline scripts/styles still need a phased cleanup before CSP enforcement.
- Generic `/api/uploads` still accepts unrestricted MIME types and does not enforce a global file size limit.
- Rate limiting is in-memory and not shared across multiple app instances.
- CORS allowed origins are still hardcoded in `server.js`; production deployment should align them with the real frontend domains.
- `/uploads` remains directly statically served; if private uploads are introduced later, this should move behind signed URLs or authenticated download routes.
