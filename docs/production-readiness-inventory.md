# Production Readiness Inventory

## Current Runtime Mode

- Default runtime remains `sqlite`.
- `server.js` still opens SQLite directly and warns if `DB_ENGINE != sqlite`.
- Repository adapters already support staged PostgreSQL rehearsal for billing, tasks, attendance, channels, and messages.
- Current direction is SQLite-default with PostgreSQL rehearsal/cutover documented separately.

## Required Env Vars

Required in production:
- `NODE_ENV=production`
- `PORT`
- `APP_BASE_URL` or legacy `BASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

Required when SQLite runtime is used:
- `DB_PATH`

Required when PostgreSQL runtime is selected:
- `DATABASE_URL`
  or
- `PGHOST`
- `PGPORT`
- `PGDATABASE`
- `PGUSER`

Required when email sending is intentionally enabled:
- For Gmail:
  - `GMAIL_SMTP_USER`
  - `GMAIL_SMTP_PASS`
- For IONOS / SMTP:
  - `IONOS_SMTP_HOST`
  - `IONOS_SMTP_PORT`
  - `IONOS_SMTP_USER`
  - `IONOS_SMTP_PASS`

## Optional Env Vars

- `COOKIE_SECURE`
- `DB_BACKUP_DIR`
- `DB_BACKUP_INTERVAL_HOURS`
- `DB_BACKUP_ON_START`
- `UPLOADS_DIR`
- `UPLOAD_MAX_FILE_BYTES`
- `OPENAI_API_KEY`
- `OPENAI_REALTIME_MODEL`
- `OPENAI_REALTIME_URL`
- `OPENAI_REALTIME_VOICE`
- `AI_INPUT_TOKEN_RATE_EUR`
- `AI_OUTPUT_TOKEN_RATE_EUR`
- `AI_TIME_RATE_EUR_PER_SECOND`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_VERIFY_SERVICE_SID`
- `MOBILE_OTP_PROXY_URL`
- `IONOS_IMAP_*`
- `FFMPEG_MODE`
- `FFMPEG_PATH`
- `FFMPEG_STRICT`

## Current DB Setup

- Runtime DB file defaults to `storage/studiestalk.db`.
- SQLite runs in WAL mode in `server.js`.
- Automatic backup hooks already exist:
  - startup backup if `DB_BACKUP_ON_START=true`
  - scheduled backup if `DB_BACKUP_INTERVAL_HOURS > 0`
- PostgreSQL schema/apply/export/import/verify scripts already exist under `db/` and `scripts/`.

## Current Upload / Storage Setup

- Upload storage defaults to `uploads/`.
- Inbound email attachments persist in `storage/email_attachments/`.
- Backups default to `backup/`.
- Managed upload serving now uses guarded `/uploads/*` responses instead of open static serving for registry-backed files.

## Current Logging

- Morgan request logging is enabled.
- Request IDs are now attached to responses and request logs.
- Error middleware now returns `requestId` and avoids dumping secrets/tokens by default.
- Some subsystem logs remain verbose in development, but obvious SMTP/IMAP/token leaks were reduced in this pass.

## Current Backup / Restore

- App-level SQLite backup helper exists in `server.js`.
- New operator scripts:
  - `scripts/backup-sqlite.js`
  - `scripts/restore-sqlite-backup.js`
  - `scripts/verify-backup.js`
- Restore now requires explicit `--confirm-restore`.
- Backup verification opens the backup and checks key tables.

## Current External Services

- OpenAI realtime
- Google Translate
- Twilio SMS / Verify
- SMTP / Gmail / IONOS email
- IMAP inbound mailbox sync
- Jitsi
- Ollama/local AI endpoint
- ffmpeg

All remain optional by configuration except the core DB/auth/runtime env values.

## Production Blockers

- Main server runtime is still SQLite-first; high-write production should plan PostgreSQL staging before real cutover.
- SQLite backup/restore now exists, but restore has not yet been exercised by a dedicated automated smoke test.
- Some legacy debug logging remains in non-critical areas and should be kept under review before a public multi-tenant rollout.
- Health checks are now available, but there is still no external process supervisor config in-repo.
- No built-in log shipping/aggregation exists; production hosting should capture stdout/stderr.
- Backup retention is still an operational policy, not an enforced in-app lifecycle.
