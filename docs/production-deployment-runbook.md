# Production Deployment Runbook

## Current deployment posture

StudiesTalk is currently deployable with:

- Node.js 20
- single application instance
- PostgreSQL recommended
- local persistent disk file storage
- S3-compatible object storage, including Cloudflare R2 / AWS S3-compatible endpoints

StudiesTalk is not yet deployable with:

- horizontally scaled multi-instance file storage without shared disk
- public `meet.jit.si` moderator JWT auto-host expectations

## Production blockers enforced by preflight

- `NODE_ENV=production`
- `APP_BASE_URL` must be set and must use `https`
- `JWT_ACCESS_SECRET` must be non-default
- `JWT_REFRESH_SECRET` must be non-default
- `COOKIE_SECURE=true`
- if `DB_ENGINE=postgres`, PostgreSQL connection config must be present
- if `FILE_STORAGE_ADAPTER` is `s3`, `s3_compatible`, or `r2`, required S3 env vars must be present
- if `JITSI_DOMAIN=meet.jit.si` while JWT moderator mode is configured, preflight fails

## Local preflight

```bash
source ~/.nvm/nvm.sh
nvm use 20
npm install
npm run preflight
node --check server.js
node --check server/env.js
node --check scripts/backup-sqlite.js
node --check scripts/restore-sqlite-backup.js
node --check scripts/verify-backup.js
```

## Smoke tests

```bash
npm run test:all:smoke
```

`test:all:smoke` now includes the current non-PG smoke coverage:

- runtime
- tasks
- attendance
- security
- account security
- onboarding
- policy acceptance
- tenant isolation
- file storage
- live controls
- whiteboard
- breakout rooms
- polling
- recording consent
- recording storage

## PostgreSQL requirements

Recommended env:

- `DB_ENGINE=postgres`
- `BILLING_DB_ENGINE=postgres`
- `TASKS_DB_ENGINE=postgres`
- `ATTENDANCE_DB_ENGINE=postgres`
- `CHANNELS_DB_ENGINE=postgres`
- `MESSAGES_DB_ENGINE=postgres`
- `DATABASE_URL=postgresql://...`
- `PGSSL=true` for hosted providers

Operational requirements:

- one dedicated database per environment
- backups handled by provider or runbook
- connection credentials stored in platform secret manager
- verified restore path before production cutover

SQLite is still possible only for single-node rehearsal on persistent disk, but it is not the preferred production database.

## File storage requirements

Current supported modes:

- `FILE_STORAGE_ADAPTER=local`
- `FILE_STORAGE_ADAPTER=s3`
- `FILE_STORAGE_ADAPTER=s3_compatible`
- `FILE_STORAGE_ADAPTER=r2`

For local mode:

- persistent writable disk
- absolute paths for:
  - `UPLOADS_DIR`
  - `FILE_STORAGE_LOCAL_ROOT`
  - `DB_BACKUP_DIR`

For S3-compatible mode:

- required env:
  - `S3_ENDPOINT`
  - `S3_REGION`
  - `S3_BUCKET`
  - `S3_ACCESS_KEY_ID`
  - `S3_SECRET_ACCESS_KEY`
  - `S3_FORCE_PATH_STYLE`
- bucket credentials remain backend-only
- managed object metadata remains in the database, not object headers

## Jitsi requirements

For automatic teacher/admin host mode:

- use `8x8.vc` JaaS or self-hosted Jitsi
- configure:
  - `JITSI_DOMAIN`
  - `JITSI_APP_ID`
  - `JITSI_APP_SECRET`
  - `JITSI_JWT_AUDIENCE`
  - `JITSI_JWT_ISSUER`
  - `JITSI_JWT_SUBJECT`

Do not expect JWT moderator auto-host on:

- `JITSI_DOMAIN=meet.jit.si`

## Platform-specific deployment

### Render

Use when:

- single web service
- managed PostgreSQL
- persistent disk attached to the service

Steps:

1. Create PostgreSQL service.
2. Create web service with Node 20.
3. Choose file storage mode:
   - persistent disk mounted at `/var/lib/studiestalk`, or
   - S3-compatible storage
4. Set env from [.env.staging.example](/Users/jannatuladny/cat-6.1/.env.staging.example), adjusted for production.
5. If using local storage, set:
   - `UPLOADS_DIR=/var/lib/studiestalk/uploads`
   - `FILE_STORAGE_LOCAL_ROOT=/var/lib/studiestalk/uploads/managed`
   - `DB_BACKUP_DIR=/var/lib/studiestalk/backup`
6. If using S3-compatible storage, set:
   - `FILE_STORAGE_ADAPTER=s3`
   - `S3_ENDPOINT=...`
   - `S3_REGION=...`
   - `S3_BUCKET=...`
   - `S3_ACCESS_KEY_ID=...`
   - `S3_SECRET_ACCESS_KEY=...`
   - `S3_FORCE_PATH_STYLE=true|false`
7. Build command:
   - `npm install`
8. Start command:
   - `npm start`
9. Run `npm run preflight` before promotion.

Constraint:

- without persistent disk, local-storage mode is not acceptable

### Railway

Use when:

- single service
- managed PostgreSQL
- persistent volume mounted for uploads and backups

Steps:

1. Provision PostgreSQL.
2. Choose either:
   - a volume for local uploads/backups, or
   - S3-compatible object storage
3. Set env from [.env.staging.example](/Users/jannatuladny/cat-6.1/.env.staging.example).
4. If using local storage, point:
   - `UPLOADS_DIR`
   - `FILE_STORAGE_LOCAL_ROOT`
   - `DB_BACKUP_DIR`
   to the mounted volume path.
5. If using S3-compatible storage, set the `S3_*` env vars.
6. Run `npm run preflight`.
7. Deploy with `npm start`.

### VPS

Use when:

- you want full control
- local disk or S3-compatible storage is acceptable
- you want the least platform coupling

Steps:

1. Install Node.js 20.
2. Install PostgreSQL or point to managed PostgreSQL.
3. Choose storage mode:
   - local persistent directories, or
   - S3-compatible object storage
4. For local mode, create persistent directories, for example:
   - `/var/lib/studiestalk/uploads`
   - `/var/lib/studiestalk/uploads/managed`
   - `/var/backups/studiestalk`
5. Copy env from [.env.staging.example](/Users/jannatuladny/cat-6.1/.env.staging.example) and replace secrets.
6. Run:
   ```bash
   npm install
   npm run preflight
   npm run test:all:smoke
   npm start
   ```
7. Put the app behind HTTPS reverse proxy.

## Start command

```bash
npm start
```

## Post-deploy checks

```bash
curl -fsS https://your-host/health
curl -fsS https://your-host/health/deep
```

Then verify:

- login works
- `/api/auth/me` works
- logout works
- one upload works
- one guarded upload rejection works
- live class open path works
- backup directory is writable

## If something fails

- Use [production-rollback-runbook.md](/Users/jannatuladny/cat-6.1/docs/production-rollback-runbook.md)
- keep the latest backup artifact before retrying
- fix preflight blockers before redeploying
