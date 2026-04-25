# Audit Log Retirement Plan

## Current Rule

- `audit_logs` is the canonical audit table.
- `audit_log` is legacy compatibility storage.
- New product work should write to `audit_logs`, not `audit_log`.

## Current Runtime Usage

### Canonical Writer

`audit_logs` is written by the centralized `audit()` helper in [server.js](/Users/jannatuladny/cat-6.1/server.js:1146).

That helper currently records the main modern audit events, including examples such as:

- `auth.login_success`
- `auth.login_failure`
- `registration.invite_created`
- `school_request.approve`
- `school_request.reject`
- `school_request.flag`
- `user.role_updated`
- `channel.delete`
- `channel.messages_cleared`
- `message.delete`
- `students.import`

### Legacy Writer

`audit_log` is written only through `legacyAuditLog()` in [server.js](/Users/jannatuladny/cat-6.1/server.js:3326).

Current runtime paths still calling `legacyAuditLog()`:

- school request bulk action helper
  - [server.js](/Users/jannatuladny/cat-6.1/server.js:9620)
  - action: `school_request.bulk`
- `POST /api/admin/school-requests/:id/approve`
  - [server.js](/Users/jannatuladny/cat-6.1/server.js:9784)
  - action: `school_request.approve`
- `POST /api/admin/school-requests/:id/create-workspace`
  - [server.js](/Users/jannatuladny/cat-6.1/server.js:9958)
  - action: `school_request.create_workspace`
- `POST /api/admin/school-requests/:id/reject`
  - [server.js](/Users/jannatuladny/cat-6.1/server.js:9988)
  - action: `school_request.reject`
- `POST /api/admin/school-requests/:id/flag`
  - [server.js](/Users/jannatuladny/cat-6.1/server.js:10005)
  - action: `school_request.flag`
- `POST /api/admin/workspaces/upsert`
  - [server.js](/Users/jannatuladny/cat-6.1/server.js:21216)
  - action: `workspace.update`
- `POST /api/admin/workspaces/upsert`
  - [server.js](/Users/jannatuladny/cat-6.1/server.js:21223)
  - action: `workspace.create`
- `DELETE /api/admin/workspaces/:workspaceId`
  - [server.js](/Users/jannatuladny/cat-6.1/server.js:21255)
  - action: `workspace.delete`
- `PATCH /api/admin/users/:id`
  - [server.js](/Users/jannatuladny/cat-6.1/server.js:21317)
  - action: `user.update`
- `DELETE /api/admin/users/:id`
  - [server.js](/Users/jannatuladny/cat-6.1/server.js:21344)
  - action: `user.delete`
- `POST /api/admin/invoices`
  - [server.js](/Users/jannatuladny/cat-6.1/server.js:21452)
  - action: `invoice.create`
- `POST /api/admin/invoices/:invoiceId/mark-paid`
  - [server.js](/Users/jannatuladny/cat-6.1/server.js:21485)
  - action: `invoice.mark_paid`
- `PUT /api/admin/workspace-settings/:workspaceId`
  - [server.js](/Users/jannatuladny/cat-6.1/server.js:21523)
  - action: `workspace.settings.update`

## Current Read Paths Still Using `audit_log`

These runtime reads still depend on the legacy table:

- `GET /api/admin/overview`
  - [server.js](/Users/jannatuladny/cat-6.1/server.js:21375)
  - reads `recentAudit` from `audit_log`
- `GET /api/admin/audit`
  - [server.js](/Users/jannatuladny/cat-6.1/server.js:21543)
  - reads the admin audit list from `audit_log`

## What This Means

`audit_log` is no longer the canonical audit model. It is now:

- a compatibility write target for a subset of legacy super-admin actions
- the data source for two admin read endpoints

That means the retirement problem is small and bounded.

## Minimum Retirement Plan

### Phase 1

Do not remove `audit_log`.

Do this first:

1. Stop adding any new `legacyAuditLog()` calls.
2. Treat `audit()` / `audit_logs` as the only canonical audit API.
3. Keep the current table only for compatibility while read paths are migrated.

### Phase 2

Move admin reads from `audit_log` to `audit_logs`.

Minimum code changes:

1. Replace the `recentAudit` query in `GET /api/admin/overview`
   - current source: `audit_log`
   - target source: `audit_logs`
   - map fields:
     - `workspace_id -> workspaceId`
     - `user_id -> actor`
     - `action -> action`
     - `target -> target`
     - `at -> createdAt`
2. Replace the query in `GET /api/admin/audit`
   - current source: `audit_log`
   - target source: `audit_logs`
   - map fields:
     - `id`
     - `workspace_id -> workspaceId`
     - `user_id -> actor`
     - `action`
     - `target`
     - `meta_json -> payloadJson`
     - `at -> createdAt`

This preserves current response shape while switching the storage source.

### Phase 3

After admin reads are fully moved:

1. Remove `legacyAuditLog()` call sites.
2. Keep `audit_log` read-only for one transition period if needed.
3. Optionally create a compatibility view if an old tool still expects the legacy shape.

Example compatibility strategy:

- keep `audit_logs` as the table
- expose a view shaped like `audit_log` only if an old panel still requires that shape

### Phase 4

When no runtime path reads or writes `audit_log`:

1. export/archive `audit_log`
2. remove it from bootstrap DDL
3. remove the compatibility helper

## Why `audit_log` Should Not Receive More Schema Work

- it is already legacy
- it has weaker structure than `audit_logs`
- it has known historical broken references
- `audit_logs` already has the better canonical shape:
  - `id`
  - `at`
  - `user_id`
  - `role`
  - `workspace_id`
  - `action`
  - `target`
  - `meta_json`
  - `ip`
  - `user_agent`

## Recommendation

Near-term recommendation:

- leave the table in place
- move admin read endpoints to `audit_logs`
- stop extending `legacyAuditLog()`

That is the minimum path to retirement without breaking current behavior.
