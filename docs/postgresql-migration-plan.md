# PostgreSQL Migration Plan

This document prepares StudiesTalk for a future PostgreSQL migration without changing the current SQLite runtime.

## Current Position

The active SQLite database at `storage/studiestalk.db` has already been cleaned and hardened across the main active domains:

- `tasks` / `task_comments`
- homework domain
- `attendance_sessions` / `attendance_records` / `attendance_notifications`
- billing domain
- `files_registry` / `file_events`
- AI domain

The next step is not a runtime cutover. The next step is to remove SQLite assumptions from schema design and SQL usage so a future PostgreSQL rollout is low-risk.

## Migration Phases

### Phase 0: Freeze Scope

- Keep SQLite as the only runtime engine.
- Do not add new SQLite-only schema patterns.
- Treat this document as the source plan for PostgreSQL readiness work.

### Phase 1: SQL Audit Cleanup

Replace SQLite-specific write patterns in application code:

- `INSERT OR IGNORE`
- `INSERT OR REPLACE`
- `datetime('now')`
- `strftime(...)`
- `rowid`-based ordering where semantic ordering should exist

Also isolate schema-inspection and migration code that depends on:

- `PRAGMA table_info(...)`
- `PRAGMA foreign_key_list(...)`
- `PRAGMA foreign_key_check`
- `PRAGMA journal_mode`
- `PRAGMA busy_timeout`

### Phase 2: Type Normalization

Standardize data types before cutover:

- boolean-like `INTEGER` flags -> PostgreSQL `boolean`
- mixed timestamp storage -> consistent PostgreSQL timestamp strategy
- JSON-in-`TEXT` columns -> `jsonb` where the data is structured and queried as JSON
- case-insensitive email handling -> `citext` or unique indexes on `lower(email)`

### Phase 3: Schema Translation

Create a PostgreSQL DDL target for active domains first, in this order:

1. workspaces / users / channels / memberships
2. tasks
3. homework
4. attendance
5. billing
6. files
7. AI
8. auth/security/supporting tables

### Phase 4: Data Migration Rehearsal

- Export SQLite data into a staging PostgreSQL database.
- Validate constraints, nullability, and enum/check behavior.
- Reconcile any remaining weak-typing data issues.

### Phase 5: Dual-Cutover Preparation

- Add a database abstraction or adapter boundary for engine-specific SQL.
- Keep one logical query contract while supporting SQLite and PostgreSQL separately during rehearsal.

### Phase 6: Production Cutover

- Run final export/import.
- Validate counts, constraints, and key business flows.
- Switch runtime only after staging verification passes.

## Domain Order

Recommended migration order inside PostgreSQL:

1. Core identity and workspace ownership
   - `workspaces`
   - `users`
   - `workspace_members`
   - `channels`
   - `channel_members`
2. Tasks
3. Homework
4. Active attendance
5. Billing
6. Files
7. AI
8. Messaging and communication
9. Email/inbound-email domain
10. Remaining admin/security tables

This order follows FK dependencies and active product importance.

## Legacy / Excluded Domains

Do not expand these during PostgreSQL preparation. Archive or treat as compatibility-only unless the product explicitly reactivates them.

- `class_attendance`
- `class_attendance_records`
- `audit_log`
- detached test/exam tables:
  - `test_channels`
  - `test_sections`
  - `test_tasks`
  - `test_options`
  - `test_attempts`
  - `test_answers`
  - `writing_reviews`
  - `speaking_reviews`
  - `transcript_items`

## Risky Tables / Relationships

These need explicit policy decisions before cutover:

- `ai_usage_ledger.user_id`
  - Keep soft for now.
  - Historical ledger rows should probably survive user deletion.
  - Candidate PostgreSQL design: nullable FK with `ON DELETE SET NULL`.
- `files_registry.message_id`
  - Keep soft for now.
  - This behaves like historical linkage, not strict lifecycle ownership.
  - Do not add a hard FK until message/file retention policy is explicit.
- email and inbound-email JSON-like payload fields
  - Several columns currently store structured content as text.
  - Decide whether they stay text blobs or become `jsonb`.
- timestamp columns
  - The codebase currently mixes ISO text timestamps, Unix-second integers, and app-generated millisecond numbers.

## Type Mapping Guidance

### Booleans

Convert SQLite integer flags like `0/1` to PostgreSQL `boolean`.

Examples:

- `users.phone_verified`
- `users.must_change_password`
- `homework_items.is_locked`
- `homework_items.is_archived`
- `homework_submissions.is_late`
- `files_registry.deleted`
- `files_registry.pinned`

### Timestamps

Recommended PostgreSQL policy:

- event timestamps: `timestamptz`
- pure dates: `date`
- time-only fields: `time` only when genuinely separate from a date

Current SQLite timestamp patterns that should be normalized:

- `TEXT DEFAULT (datetime('now'))`
- `TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
- `INTEGER DEFAULT (strftime('%s','now'))`
- application-managed millisecond integers

Target rule:

- Use `timestamptz` for created/updated/reviewed/sent/ended timestamps.
- Keep `date` for fields like course dates or attendance session dates when they are true calendar dates.

### JSON Text -> jsonb

Strong candidates for `jsonb`:

- `inbound_emails.attachments_json`
- similar structured settings or payload columns where the app stores arrays/objects as text

Keep as `TEXT` unless the column stores structured JSON with stable shape and query value.

### Case-Insensitive Email

Current SQLite logic relies on `lower(email)` patterns and weak text handling.

Target PostgreSQL options:

- preferred: `citext`
- fallback: normal `text` plus unique indexes on `lower(email)`

Likely places:

- `users.email`
- any workspace or mailbox email identity column that needs uniqueness or stable lookup behavior

## Columns That Should Remain Nullable or Soft

Keep these soft in the first PostgreSQL target:

- `ai_usage_ledger.user_id`
- `files_registry.message_id`

Potential nullable-FK cases:

- `files_registry.channel_id`
- `files_registry.uploader_id`
- `homework_submissions.reviewed_by`
- `payments.student_user_id`
- `invoices.student_user_id`
- `ai_runtime_sessions.conversation_id`

## SQLite-Specific Hotspots In Code

The main SQLite engine coupling is in `server.js`.

### Engine / Connection Assumptions

- `better-sqlite3` usage at the top-level connection setup
- `db.pragma('journal_mode = WAL')`
- `db.pragma('busy_timeout = 5000')`

These are SQLite-only and need an adapter or branch for PostgreSQL.

### PRAGMA-Based Schema Inspection / Migration

Examples in `server.js`:

- `PRAGMA table_info(...)`
- `PRAGMA foreign_key_list(...)`
- `PRAGMA foreign_key_check`
- explicit `PRAGMA foreign_keys = OFF/ON`

These are used throughout bootstrap and rebuild migrations. PostgreSQL will need:

- `information_schema`
- `pg_catalog`
- transactional `ALTER TABLE`
- direct constraint introspection instead of PRAGMAs

### SQLite Rebuild Migration Pattern

Current code uses SQLite-style rebuilds:

1. `ALTER TABLE ... RENAME TO ..._old`
2. create new table
3. copy rows
4. drop old table

Examples already exist for:

- `message_translations`
- `live_attendance`
- `live_sessions`

PostgreSQL does not need most of these rebuild patterns. Many changes can be done with direct `ALTER TABLE`.

### Upsert / Ignore Patterns That Need ON CONFLICT Conversion

Common SQLite-only patterns in `server.js`:

- `INSERT OR IGNORE`
- `INSERT OR REPLACE`

High-visibility hotspots include:

- channel membership writes
- workspace membership writes
- file registration writes
- billing bootstrap writes
- refresh token writes
- reaction tables
- DM membership writes
- inbound email writes
- homework completion writes
- IP blocklist writes

Examples:

- `INSERT OR IGNORE INTO workspace_members`
- `INSERT OR IGNORE INTO channel_members`
- `INSERT OR IGNORE INTO files_registry`
- `INSERT OR REPLACE INTO homework_completions`
- `INSERT OR REPLACE INTO ip_blocklist`
- `INSERT OR IGNORE INTO refresh_tokens`
- `INSERT OR IGNORE INTO dm_members`
- `INSERT OR IGNORE INTO message_reaction_users`

Target PostgreSQL equivalents:

- `INSERT ... ON CONFLICT DO NOTHING`
- `INSERT ... ON CONFLICT (...) DO UPDATE SET ...`

Important note:

- `INSERT OR REPLACE` is not just an upsert translation problem. In SQLite it can behave like delete+insert. Each occurrence should be reviewed for whether PostgreSQL should do an update, not a replacement.

### Date / Time Function Usage

Current SQLite-specific time expressions include:

- `datetime('now')`
- `strftime('%s','now')`
- `strftime('%Y-%m-%dT%H:%M:%fZ','now')`

These appear heavily in bootstrap DDL and write queries.

Target PostgreSQL replacements:

- `CURRENT_TIMESTAMP`
- `now()`
- explicit casts where needed

### rowid Ordering

The code still uses `rowid` in places such as:

- message selection
- duplicate channel resolution
- channel/message listing fallbacks
- reply ordering
- DM ordering

This is a PostgreSQL blocker because `rowid` is SQLite-specific and not a stable semantic ordering key.

Replace with explicit ordering columns:

- `created_at`
- primary key
- domain-specific rank/order column when needed

### Weak Typing Assumptions

SQLite currently tolerates:

- storing booleans as integers
- timestamps as mixed text/integer values
- empty-string defaults where `NULL` might be semantically correct
- permissive comparisons across text/integer boundaries

PostgreSQL will be stricter. This is especially relevant in:

- auth/session timestamps
- AI timestamps
- attendance dates/times
- email/log tables
- optional foreign keys stored as empty strings

## Active Domain PostgreSQL Notes

### Tasks

- FK-backed in SQLite already.
- Good early PostgreSQL target.
- Convert `created_at`, `updated_at`, `due_at`, `completed_at` into consistent timestamp types.

### Homework

- FK-backed in SQLite already.
- Review `status` columns for future enum/check formalization.
- Keep `reviewed_by` nullable.

### Attendance

- Migrate only:
  - `attendance_sessions`
  - `attendance_records`
  - `attendance_notifications`
- Exclude `class_attendance*`.
- Channel lifecycle integrity has already been fixed in application code and must remain preserved after cutover.

### Billing

- Already has repaired FK/check coverage in SQLite.
- Good PostgreSQL candidate.
- `student_user_id` should remain nullable.

### Files

- Keep `message_id` soft for the first PostgreSQL target.
- Keep nullable behavior on `channel_id` and `uploader_id`.

### AI

- Already mostly clean.
- `ai_usage_ledger.user_id` remains soft by design.
- Good candidate for early PostgreSQL constraint parity once timestamp policy is decided.

## Top Blockers Before Cutover

1. The app is still directly bound to `better-sqlite3`.
2. SQLite-specific SQL is spread through runtime writes, not just bootstrap.
3. `rowid` ordering must be removed or replaced.
4. Timestamp storage is inconsistent across domains.
5. Some data that should become `boolean`, `date`, or `timestamptz` is still represented as `INTEGER` or `TEXT`.
6. Rebuild migration logic is SQLite-specific and should not be carried forward as the main PostgreSQL migration strategy.
7. A few important soft-reference policy decisions are still intentionally unresolved:
   - `ai_usage_ledger.user_id`
   - `files_registry.message_id`

## Recommended Next Assets

After this plan, the safest next preparation steps are:

1. create a PostgreSQL DDL draft for the active domains only
2. create a SQL hotspot checklist mapping each `INSERT OR IGNORE` / `REPLACE` site to its intended `ON CONFLICT` behavior
3. remove `rowid` ordering from runtime queries
4. standardize timestamp strategy in code before any engine switch

## Summary

StudiesTalk is ready for PostgreSQL planning, but not yet for PostgreSQL runtime.

The main blockers are not foreign keys anymore. The main blockers are:

- engine-specific SQL
- mixed timestamp/type conventions
- `rowid` assumptions
- a few deliberate soft-reference policies that still need product decisions

That is the right place to focus before any actual DB engine switch.
