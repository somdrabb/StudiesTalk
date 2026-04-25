# Production Deployment Runbook

## Local Preflight

```sh
npm run preflight
node --check server.js
node --check server/env.js
node --check scripts/backup-sqlite.js
node --check scripts/restore-sqlite-backup.js
node --check scripts/verify-backup.js
```

## Env Checklist

- `NODE_ENV=production`
- `PORT`
- `APP_BASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `COOKIE_SECURE=true`
- `DB_ENGINE=sqlite` unless intentionally rehearsing PostgreSQL
- `DB_PATH`
- `DB_BACKUP_DIR`
- `UPLOADS_DIR`
- email provider vars only if email is intentionally enabled
- OpenAI/Twilio vars only if those features are intentionally enabled

## Database Backup

```sh
npm run backup:sqlite
npm run verify:backup
```

Recommended retention:
- keep at least 7 daily backups
- keep at least 4 weekly backups
- keep at least 3 monthly backups

## Smoke Tests

```sh
npm run test:all:smoke
```

## Start Command

```sh
NODE_ENV=production node server.js
```

## Post-Deploy Checks

```sh
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/health/deep
```

Then verify:
- login works
- `/api/auth/me` works
- logout works
- one upload works
- one guarded upload rejection works
- backup directory is writable
- request logs include request IDs

## If Something Fails

- Use [production-rollback-runbook.md](/Users/jannatuladny/cat-6.1/docs/production-rollback-runbook.md).
- Keep the latest SQLite backup artifact before retrying deployment.
