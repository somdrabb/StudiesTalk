# PostgreSQL Rollback Runbook

Use this if a PostgreSQL cutover fails after the final switch.

## Rollback Principle

SQLite remains the safety net until the full PostgreSQL runtime is proven. Do not
delete or mutate the SQLite production database during rehearsal.

## Immediate Rollback

1. Stop the PostgreSQL-backed app process.
2. Remove the full cutover override:
   ```bash
   unset DB_ENGINE
   ```
3. Start the app on SQLite again:
   ```bash
   npm start
   ```

If deployment uses environment files or deployment config, revert `DB_ENGINE` to
`sqlite` there instead of relying on shell state.

## Validation After Rollback

- Login still works
- Admin overview loads
- Channels/messages still work
- Billing/tasks/attendance still work on their last known-safe path
- New writes are landing in SQLite again

## Data Safety Notes

- Keep the SQLite database file unchanged until PostgreSQL has passed cutover smoke
  tests and manual validation.
- Keep the export JSON artifacts used for PostgreSQL import.
- Keep a timestamped backup of the SQLite database before the final switch.

## Diagnose Before Retrying Cutover

- Re-run:
  ```bash
  node scripts/verify-postgres-import.js
  ```
- Check the inventory:
  - `docs/postgres-runtime-inventory.md`
- Confirm which domain still performs direct SQLite access in `server.js`
- Patch the missing repository boundary
- Re-run PostgreSQL smoke tests before attempting another full cutover
