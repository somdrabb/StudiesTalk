# StudiesTalk Backup and Restore

Backup without restore testing is not enough.

## PostgreSQL backup

Use `pg_dump` against the production database:

```bash
pg_dump "$DATABASE_URL" --format=custom --file studiestalk-$(date +%F).dump
```

Plain SQL export alternative:

```bash
pg_dump "$DATABASE_URL" --format=plain --file studiestalk-$(date +%F).sql
```

## PostgreSQL restore

Custom-format restore:

```bash
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" studiestalk-2026-04-28.dump
```

Plain SQL restore:

```bash
psql "$DATABASE_URL" -f studiestalk-2026-04-28.sql
```

## Uploads backup

If local uploads are still enabled:

```bash
tar -czf studiestalk-uploads-$(date +%F).tar.gz /app/uploads
```

For Docker Compose hosts:

```bash
docker run --rm -v studiestalk_uploads_data:/source -v "$PWD":/backup alpine tar -czf /backup/studiestalk-uploads-$(date +%F).tar.gz -C /source .
```

## Recommended daily cron

Example nightly PostgreSQL backup:

```bash
0 2 * * * /usr/bin/pg_dump "$DATABASE_URL" --format=custom --file /var/backups/studiestalk/studiestalk-$(date +\%F).dump
```

Example nightly uploads backup:

```bash
30 2 * * * /bin/tar -czf /var/backups/studiestalk/studiestalk-uploads-$(date +\%F).tar.gz /app/uploads
```

## Restore test process

At least regularly:

1. Create a fresh PostgreSQL test database
2. Restore the latest dump
3. Restore uploads if you still use local storage
4. Run `npm run db:migrate:pg`
5. Run `npm run test:postgres:migration`
6. Start the app against the restored environment
7. Validate login, legal pages, and one or two critical workflows

## SQLite local/dev note

SQLite backup helpers remain for local development:

```bash
npm run backup:sqlite
npm run verify:backup
node scripts/restore-sqlite-backup.js --from backup/<file>.db --confirm-restore
```
