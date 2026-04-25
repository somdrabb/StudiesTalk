# Policy Acceptance Data Model

## Reused Table

- Reused existing `policy_acceptances` table.
- No SQLite table rename was required.
- PostgreSQL parity schema was added in `db/schema/pg/012_policy_acceptance.sql`.

## Acceptance Record

- `id`
- `user_id`
- `workspace_id`
- `version`
- `accepted_at`

## Version Source

- Platform default:
  - `platform_settings.key = 'workspace_policy_version_default'`
- Current seeded default:
  - `2026-04-23`
- Optional workspace override:
  - `workspace_settings_admin.settings_json.policyAcceptance.version`

## Semantics

- Acceptance is versioned per:
  - user
  - workspace
  - policy version
- Idempotency is guaranteed by:
  - `UNIQUE (user_id, workspace_id, version)`
- Re-acceptance rule:
  - if the current workspace policy version changes, a new row/version match is required before entry
