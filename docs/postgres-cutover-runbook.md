# PostgreSQL Final Cutover Runbook

This runbook defines the final `DB_ENGINE=postgres` switch plan. Do not switch
the default runtime until staging validation and repeated full smoke runs pass.

## Current Decision

- Production-critical cutover blockers: none identified.
- SQLite remains the default runtime until the final deployment step.
- Remaining SQLite-only domains are non-critical and are classified in
  `docs/final-postgres-gap-report.md`.
- Non-critical active domains must either be disabled during staging cutover or
  explicitly accepted as SQLite-backed until their post-cutover migrations land.

## Exact Env Changes

Set these for the PostgreSQL-default staging or production process:

```bash
export DB_ENGINE=postgres
export BILLING_DB_ENGINE=postgres
export TASKS_DB_ENGINE=postgres
export ATTENDANCE_DB_ENGINE=postgres
export CHANNELS_DB_ENGINE=postgres
export MESSAGES_DB_ENGINE=postgres
```

Keep the existing PostgreSQL connection variables from `.env`:

```bash
export DATABASE_URL="$DATABASE_URL"
export PGHOST="$PGHOST"
export PGPORT="$PGPORT"
export PGDATABASE="$PGDATABASE"
export PGUSER="$PGUSER"
export PGPASSWORD="$PGPASSWORD"
export PGSSL="$PGSSL"
```

Do not edit `.env` defaults to PostgreSQL until the staging checklist passes.

## Exact Backup Commands

Create a timestamped backup directory:

```bash
mkdir -p "backup/postgres-cutover-$(date +%Y%m%d-%H%M%S)"
```

Back up SQLite DB files without mutating them:

```bash
TS="$(date +%Y%m%d-%H%M%S)"; mkdir -p "backup/postgres-cutover-$TS"; cp -p storage/studiestalk.db "backup/postgres-cutover-$TS/studiestalk.db"; cp -p storage/studiestalk.db-wal "backup/postgres-cutover-$TS/studiestalk.db-wal" 2>/dev/null || true; cp -p storage/studiestalk.db-shm "backup/postgres-cutover-$TS/studiestalk.db-shm" 2>/dev/null || true
```

Export the SQLite source snapshot used for PostgreSQL import:

```bash
node scripts/export-sqlite-to-json.js
```

Dump the target PostgreSQL database before importing:

```bash
/bin/zsh -lc 'set -a; source .env; set +a; pg_dump "$DATABASE_URL" --format=custom --file "backup/postgres-cutover-$(date +%Y%m%d-%H%M%S)/postgres-before-import.dump"'
```

If `DATABASE_URL` is not used, run:

```bash
/bin/zsh -lc 'set -a; source .env; set +a; PGPASSWORD="$PGPASSWORD" pg_dump --host "$PGHOST" --port "$PGPORT" --username "$PGUSER" --dbname "$PGDATABASE" --format=custom --file "backup/postgres-cutover-$(date +%Y%m%d-%H%M%S)/postgres-before-import.dump"'
```

## Exact Import And Smoke Commands

Apply schema:

```bash
/bin/zsh -lc 'set -a; source .env; set +a; node db/apply-postgres-schema.js'
```

Export, transform, import, and verify:

```bash
node scripts/export-sqlite-to-json.js
node scripts/transform-export-for-postgres.js
/bin/zsh -lc 'set -a; source .env; set +a; node scripts/import-json-to-postgres.js'
/bin/zsh -lc 'set -a; source .env; set +a; node scripts/verify-postgres-import.js'
```

Run syntax checks:

```bash
node --check server/env.js
node --check server.js
node --check server/repositories/authRepository.js
node --check server/repositories/channelRepository.js
node --check server/repositories/registrationRepository.js
node --check server/repositories/schoolRequestRepository.js
node --check server/repositories/userRepository.js
node --check server/repositories/workspaceRepository.js
node --check scripts/import-json-to-postgres.js
node --check scripts/verify-postgres-import.js
node --check scripts/full-postgres-cutover-smoke.js
```

Run the full PostgreSQL cutover smoke:

```bash
/bin/zsh -lc 'set -a; source .env; set +a; node scripts/full-postgres-cutover-smoke.js'
```

If local native modules were rebuilt for Node 18 and the shell resolves another
Node version, use the known-good local binary:

```bash
/bin/zsh -lc 'set -a; source .env; set +a; /Users/jannatuladny/.nvm/versions/node/v18.20.8/bin/node scripts/full-postgres-cutover-smoke.js'
```

## Staging App Boot Command

Use this command to boot the full app in PostgreSQL-default mode for manual
staging validation:

```bash
/bin/zsh -lc 'set -a; source .env; set +a; DB_ENGINE=postgres BILLING_DB_ENGINE=postgres TASKS_DB_ENGINE=postgres ATTENDANCE_DB_ENGINE=postgres CHANNELS_DB_ENGINE=postgres MESSAGES_DB_ENGINE=postgres node server.js'
```

Node 18 variant:

```bash
/bin/zsh -lc 'set -a; source .env; set +a; DB_ENGINE=postgres BILLING_DB_ENGINE=postgres TASKS_DB_ENGINE=postgres ATTENDANCE_DB_ENGINE=postgres CHANNELS_DB_ENGINE=postgres MESSAGES_DB_ENGINE=postgres /Users/jannatuladny/.nvm/versions/node/v18.20.8/bin/node server.js'
```

## Manual Staging Checklist

- Login: super-admin and school-admin login work, `/api/auth/me` loads, refresh works, logout revokes refresh.
- Registration: invite link create/load/complete works for student and teacher; duplicate email/phone/name-DOB errors match current responses.
- Password reset: forgot-password creates a reset, completion changes password, old temp/login state is cleared.
- School request create-workspace: request review, approve, create workspace, temp password email path, default channels, admin membership.
- Admin overview: counts, recent activity, schools list, request counts, audit rows.
- Billing: create invoice, list billing, mark paid, payment appears.
- Channels/messages: create channel, add member, post message, reply, react, list messages.
- Tasks/homework: create task, comment, list task state, homework channel still auto-created for class channels.

## Final Cutover Command

Run only after import, verification, full smoke, and manual staging validation
all pass:

```bash
/bin/zsh -lc 'set -a; source .env; set +a; DB_ENGINE=postgres BILLING_DB_ENGINE=postgres TASKS_DB_ENGINE=postgres ATTENDANCE_DB_ENGINE=postgres CHANNELS_DB_ENGINE=postgres MESSAGES_DB_ENGINE=postgres node server.js'
```

## Exact Rollback Commands

Stop the PostgreSQL-backed app process, then start SQLite-default runtime:

```bash
/bin/zsh -lc 'set -a; source .env; set +a; DB_ENGINE=sqlite BILLING_DB_ENGINE=sqlite TASKS_DB_ENGINE=sqlite ATTENDANCE_DB_ENGINE=sqlite CHANNELS_DB_ENGINE=sqlite MESSAGES_DB_ENGINE=sqlite node server.js'
```

If deployment config was edited, revert these values:

```bash
DB_ENGINE=sqlite
BILLING_DB_ENGINE=sqlite
TASKS_DB_ENGINE=sqlite
ATTENDANCE_DB_ENGINE=sqlite
CHANNELS_DB_ENGINE=sqlite
MESSAGES_DB_ENGINE=sqlite
```

Validate rollback:

```bash
node scripts/runtime-domain-smoke.js sqlite
node scripts/tasks-rehearsal-smoke.js sqlite
node scripts/attendance-rehearsal-smoke.js sqlite
```

## Retry Rules

- Do not delete SQLite backups until PostgreSQL has run through production
  traffic and manual validation.
- If rollback is needed, keep PostgreSQL untouched for diagnosis.
- Before retrying cutover, rerun schema apply, import, verify, and full smoke.
