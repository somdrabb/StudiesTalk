# Production Rollback Runbook

## Immediate Rollback

1. Stop the current app process.
2. Confirm the most recent SQLite backup:

```sh
npm run verify:backup
```

3. Start the app back on the last known-safe SQLite runtime:

```sh
NODE_ENV=production DB_ENGINE=sqlite node server.js
```

## If DB File Must Be Restored

Restore only with explicit confirmation:

```sh
node scripts/restore-sqlite-backup.js --from backup/<backup-file>.db --confirm-restore
```

Then start:

```sh
NODE_ENV=production DB_ENGINE=sqlite node server.js
```

## Post-Rollback Checks

- `curl -fsS http://127.0.0.1:3000/health`
- `curl -fsS http://127.0.0.1:3000/health/deep`
- login works
- `/api/auth/me` works
- logout works
- uploads still write to the expected storage path

## Rollback Notes

- Do not overwrite the current DB without `--confirm-restore`.
- The restore script creates a pre-restore safety backup when a target DB already exists.
- Keep the failed deployment logs and the backup manifest for diagnosis before redeploying.
