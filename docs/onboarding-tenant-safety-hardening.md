# Onboarding Tenant Safety Hardening

## Shared Boundary
- Added `getManagedWorkspaceRequestContext(req, res, options)` in [server.js](/Users/jannatuladny/cat-6.1/server.js).
- This helper now acts as the strict server-side workspace assertion for onboarding-adjacent management routes.
- Non-`super_admin` users must match the target workspace exactly.
- `school_admin` still keeps intended setup access under the onboarding guard allowlist, but only inside its own tenant.

## Hardened Routes
- `GET /api/workspaces/:workspaceId/profile`
- `POST /api/workspaces/:workspaceId/profile/registration`
- `PATCH /api/workspaces/:workspaceId/profile`
- `GET /api/workspaces/:workspaceId/email-settings`
- `POST /api/workspaces/:workspaceId/email-settings`
- `POST /api/workspaces/:workspaceId/email-settings/test`
- `GET /api/live-sessions`
- `POST /api/live-sessions`

## Preserved Behavior
- `super_admin` remains able to operate across tenants where intended.
- Onboarding guard behavior is unchanged.
- Canonical and legacy onboarding routes still use the explicit onboarding requester boundary.

## Notes
- Existing middleware-based workspace checks for `GET|POST /api/users`, `POST /api/channels`, `POST /api/workspaces/:workspaceId/students/import`, and membership routes remain in place and were not weakened.
