# Staging Deployment Checklist

## Required decisions

- Choose runtime host:
  - VPS
  - Render web service + persistent disk
  - Railway service + persistent volume
- Choose database:
  - recommended: PostgreSQL
  - acceptable only for single-node rehearsal: SQLite on persistent disk
- Choose Jitsi mode:
  - `8x8.vc` JaaS or self-hosted Jitsi for moderator auto-host
  - do not expect JWT host mode on `meet.jit.si`

## Current blockers

- Multi-instance deployment still needs shared storage discipline.
- If you keep `FILE_STORAGE_ADAPTER=local`, treat staging as single-instance unless you add shared-disk semantics.
- Public `meet.jit.si` still cannot provide automatic JWT host mode.

## Required environment

- start from [.env.staging.example](/Users/jannatuladny/cat-6.1/.env.staging.example)
- set strong values for:
  - `JWT_ACCESS_SECRET`
  - `JWT_REFRESH_SECRET`
- set:
  - `NODE_ENV=production`
  - `APP_BASE_URL=https://...`
  - `COOKIE_SECURE=true`
- configure either:
  - PostgreSQL `DATABASE_URL`
  - or SQLite persistent disk path for single-node rehearsal
- configure persistent disk paths for:
  - `UPLOADS_DIR`
  - `FILE_STORAGE_LOCAL_ROOT`
  - `DB_BACKUP_DIR`
- if using S3-compatible storage, configure:
  - `FILE_STORAGE_ADAPTER=s3|s3_compatible|r2`
  - `S3_ENDPOINT`
  - `S3_REGION`
  - `S3_BUCKET`
  - `S3_ACCESS_KEY_ID`
  - `S3_SECRET_ACCESS_KEY`
  - `S3_FORCE_PATH_STYLE`

## Pre-deploy checks

```bash
source ~/.nvm/nvm.sh
nvm use 20
npm install
npm run preflight
node --check server.js
node --check server/env.js
npm run test:all:smoke
```

## Database checks

- PostgreSQL user can connect and create/update application data
- backups and restore path documented
- migration/cutover plan chosen before production use

## File storage checks

- local mode:
  - upload root exists and is writable
  - managed file root exists and is writable
  - backup directory exists and is writable
  - disk capacity is monitored
- S3-compatible mode:
  - bucket exists
  - access key is scoped to the intended bucket
  - endpoint, region, and path-style setting are correct
  - one upload and one download work end to end

## Post-deploy checks

```bash
curl -fsS https://your-staging-host/health
curl -fsS https://your-staging-host/health/deep
```

Verify:

- login works
- upload works
- backup directory is writable
- live class can open
- teacher/admin host behavior matches current Jitsi mode

## Rollback preparation

- keep last database backup
- keep previous deploy artifact or image tag
- keep previous env set available
