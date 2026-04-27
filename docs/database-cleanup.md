# Database Cleanup

This tool removes known demo, sample, smoke-test, and default workspace data from the SQLite database without dropping tables or resetting schema.

Files:

- `scripts/cleanup-demo-data.js`
- `package.json` scripts:
  - `npm run cleanup:demo:dry`
  - `npm run cleanup:demo`

## Safety model

The cleanup tool is intentionally conservative.

- Real deletion is refused unless `--confirm-cleanup` is passed.
- A SQLite backup is always created before a real cleanup run.
- The script prints the candidate workspaces and row delete plan before deleting.
- Platform tables and schema are preserved.
- `security_events`, `audit_log`, and `audit_logs` are preserved by default.
- `platform_settings` and global config rows are preserved.
- No production users are deleted unless they belong to a targeted demo workspace.
- No tables are dropped.
- No migrations are modified.
- Managed files are deleted only when their `files_registry` row belongs to a deleted workspace.
- Orphan files are reported only. They are deleted only when `--delete-orphans` is passed during a real run.

## Cleanup rules

The tool targets workspaces only when they match known demo or smoke-test rules, including:

- workspace id exactly `default`
- workspace id prefixes:
  - `legacy`
  - `demo`
  - `test`
  - `muster`
- smoke-style workspace ids:
  - `ws_onboarding_*`
  - `ws_policy_*`
  - `ws_security_*`
  - `ws_new_admin_policy_*`
  - `ws_live_*`
  - `ws_attendance_*`
  - `ws_runtime_*`
  - `ws_smoke_*`
  - `ws_tenant_iso_*`
  - `ws_auth_*`
  - `ws_auth_reset_*`
  - `ws_account_security_*`
  - `ws_file_storage_*`
  - `ws_pg_full_*`
  - `ws_other_*`
  - `http_ws_*`
  - `legacy_ws_*`
- known smoke/demo names:
  - `WorkNest demo`
  - `StudiesTalk Smoke School`
  - `New Admin Smoke School`
  - `Attendance Rehearsal Workspace`
  - `Attendance Workspace`
  - `Attendance Workspace B`
- names marked as demo/sample/test, including:
  - `legacy*`
  - `demo*`
  - `test*`
  - `muster*`
  - `Sprachschule Duisburg` only when also marked `demo`, `test`, or `sample`

## Preserved data

By default the tool preserves:

- `platform_settings`
- global configuration rows
- `security_events`
- `audit_log`
- `audit_logs`
- schema and migration history
- any workspace not matched by the cleanup rules
- any real school workspace unless passed explicitly by `--workspace-id`
- admin and super-admin users outside targeted demo workspaces

## Usage

Dry run:

```bash
npm run cleanup:demo:dry
```

Real cleanup:

```bash
npm run cleanup:demo
```

Explicit workspace selection:

```bash
node scripts/cleanup-demo-data.js --confirm-cleanup --workspace-id ws_onboarding_example
```

Delete reported orphans during a real cleanup:

```bash
node scripts/cleanup-demo-data.js --confirm-cleanup --delete-orphans
```

## Backup location

Backups are written under the app backup directory using this pattern:

```text
backup/studiestalk-sqlite-backup-cleanup-demo-data-YYYYMMDD-HHMMSS.db
```

Each backup also writes a JSON manifest next to the backup file.

## Verification

After a real cleanup run, the script verifies:

- `PRAGMA integrity_check`
- required tables still exist
- at least one `admin`, `school_admin`, or `super_admin` user remains
- targeted workspaces are gone

Recommended follow-up:

```bash
node --check scripts/cleanup-demo-data.js
npm run preflight
npm run test:security:smoke
npm run test:onboarding:smoke
npm run test:policy:smoke
```
