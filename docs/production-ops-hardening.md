# Production Ops Hardening

StudiesTalk production operations should run on Node.js 20.

```bash
nvm use 20
```

## Backup

Create a SQLite backup:

```bash
npm run backup:sqlite
```

Verify the latest backup:

```bash
npm run verify:backup
```

Run a safe restore test:

```bash
npm run restore:test
```

`restore:test` copies the latest backup into a temporary directory, opens the copy, checks core tables, and never overwrites the configured production database.

## Ops Evidence

Operational evidence is written as JSONL under:

```text
storage/ops/backup-events.jsonl
storage/ops/incident-events.jsonl
storage/ops/job-events.jsonl
storage/ops/request-events.jsonl
```

Use these files as lightweight SOC 2-style evidence for backups, restore tests, provider checks, incidents, maintenance changes, jobs, and request/error summaries.

Admin endpoints:

```text
GET /api/admin/backups/evidence
GET /api/admin/operations/logs/summary
GET /api/admin/operations/jobs
GET /api/admin/operations/health
```

These endpoints require authenticated `super_admin` access with MFA through the normal admin auth path.

## Sentry

Sentry is optional. The app starts normally when Sentry is not configured.

To enable Sentry, install `@sentry/node` and set:

```env
SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
SENTRY_ENVIRONMENT=production
```

Do not store Sentry DSNs or provider secrets in source control.

## Health

Use:

```text
GET /health
GET /health/deep
GET /api/admin/operations/health
```

Deep health includes database, storage, provider readiness, backup evidence, active incident/maintenance status, app version, Node version, uptime, and environment. Secret values are redacted or represented only as safe configured/missing status.

## Verification

Run before hosting:

```bash
nvm use 20
npm run preflight
npm run test:ops-hardening:smoke
npm run test:security:smoke
npm run test:tenant-isolation:smoke
```
