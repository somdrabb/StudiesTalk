# PostgreSQL Staging Rehearsal

This is a staging rehearsal document. It does not change the default runtime.

## Goal

- Keep SQLite as the default safety path.
- Rehearse PostgreSQL import, verification, smoke tests, app boot, and rollback.

## 1. Apply Schema

```sh
node db/apply-postgres-schema.js
```

## 2. Export SQLite

```sh
node scripts/export-sqlite-to-json.js
```

## 3. Transform Export

```sh
node scripts/transform-export-for-postgres.js
```

## 4. Import Into PostgreSQL

```sh
node scripts/import-json-to-postgres.js
```

## 5. Verify Import

```sh
node scripts/verify-postgres-import.js
```

## 6. Run Smoke Tests

```sh
npm run test:security:smoke
npm run test:onboarding:smoke
npm run test:policy:smoke
```

If the environment requires unsandboxed localhost binding in your shell/session, run the same commands in the normal deployment shell outside restricted execution.

## 7. Start App In PostgreSQL Mode

```sh
DB_ENGINE=postgres \
BILLING_DB_ENGINE=postgres \
TASKS_DB_ENGINE=postgres \
ATTENDANCE_DB_ENGINE=postgres \
CHANNELS_DB_ENGINE=postgres \
MESSAGES_DB_ENGINE=postgres \
node server.js
```

## 8. Rollback Command

```sh
DB_ENGINE=sqlite \
BILLING_DB_ENGINE=sqlite \
TASKS_DB_ENGINE=sqlite \
ATTENDANCE_DB_ENGINE=sqlite \
CHANNELS_DB_ENGINE=sqlite \
MESSAGES_DB_ENGINE=sqlite \
node server.js
```

## Notes

- Do not delete SQLite backups during staging rehearsal.
- Keep `DB_PATH`, `UPLOADS_DIR`, and `backup/` untouched until PostgreSQL staging passes.
- Use [production-rollback-runbook.md](/Users/jannatuladny/cat-6.1/docs/production-rollback-runbook.md) if the deployed process must be reverted quickly.
