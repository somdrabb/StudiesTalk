# Final PostgreSQL Cutover Checklist

Do not switch the default runtime until every item in the must-pass section is
complete.

## Must Pass

- `node --check server/env.js`
- `node --check server.js`
- `node --check server/repositories/authRepository.js`
- `node --check server/repositories/channelRepository.js`
- `node --check server/repositories/registrationRepository.js`
- `node --check server/repositories/schoolRequestRepository.js`
- `node --check server/repositories/userRepository.js`
- `node --check server/repositories/workspaceRepository.js`
- `node --check scripts/import-json-to-postgres.js`
- `node --check scripts/verify-postgres-import.js`
- `node --check scripts/full-postgres-cutover-smoke.js`
- `/bin/zsh -lc 'set -a; source .env; set +a; node db/apply-postgres-schema.js'`
- `node scripts/export-sqlite-to-json.js`
- `node scripts/transform-export-for-postgres.js`
- `/bin/zsh -lc 'set -a; source .env; set +a; node scripts/import-json-to-postgres.js'`
- `/bin/zsh -lc 'set -a; source .env; set +a; node scripts/verify-postgres-import.js'`
- `/bin/zsh -lc 'set -a; source .env; set +a; node scripts/full-postgres-cutover-smoke.js'`

If the shell resolves a Node version incompatible with `better-sqlite3`, use:

- `/bin/zsh -lc 'set -a; source .env; set +a; /Users/jannatuladny/.nvm/versions/node/v18.20.8/bin/node scripts/full-postgres-cutover-smoke.js'`

## Manual Staging Validation

- Login: super-admin login, school-admin login, refresh, `/api/auth/me`, logout.
- Registration: send invite, load invite, complete invite, duplicate validation.
- Password reset: request reset, consume token, login with new password.
- School request create-workspace: submit request, approve, create workspace, verify admin and default channels.
- Admin overview: counts, schools, requests, audit list.
- Billing: create invoice, read billing, mark paid.
- Channels/messages: create class channel, add member, send message, reply, react, list messages.
- Tasks/homework: create task, add comment, verify class homework channel behavior.

## PostgreSQL Staging Boot Command

```bash
/bin/zsh -lc 'set -a; source .env; set +a; DB_ENGINE=postgres BILLING_DB_ENGINE=postgres TASKS_DB_ENGINE=postgres ATTENDANCE_DB_ENGINE=postgres CHANNELS_DB_ENGINE=postgres MESSAGES_DB_ENGINE=postgres node server.js'
```

Node 18 variant:

```bash
/bin/zsh -lc 'set -a; source .env; set +a; DB_ENGINE=postgres BILLING_DB_ENGINE=postgres TASKS_DB_ENGINE=postgres ATTENDANCE_DB_ENGINE=postgres CHANNELS_DB_ENGINE=postgres MESSAGES_DB_ENGINE=postgres /Users/jannatuladny/.nvm/versions/node/v18.20.8/bin/node server.js'
```

## Non-Critical SQLite-Only Decision

- Required before cutover if enabled during staging: calendar, live sessions/slides, uploads/file analytics, email inbox/templates/logs, AI runtime/knowledge, policy acceptance, user preferences.
- Optional post-cutover: certificates, legacy class attendance, student notes/progress, placement-test tables, speaking/writing reviews, transcripts.
- Archive only: deleted email/log tables, orphan archive tables, historical email events/replies, IP blocklist unless IP blocking must remain active.

## Must Remain SQLite-Safe

- Default `.env` runtime stays SQLite until the full PostgreSQL smoke passes repeatedly.
- Do not delete or mutate the SQLite database during rehearsal.
- No CSRF relaxation.
- No foreign-key disabling during import or runtime.

## Final Cutover Command

```bash
/bin/zsh -lc 'set -a; source .env; set +a; DB_ENGINE=postgres BILLING_DB_ENGINE=postgres TASKS_DB_ENGINE=postgres ATTENDANCE_DB_ENGINE=postgres CHANNELS_DB_ENGINE=postgres MESSAGES_DB_ENGINE=postgres node server.js'
```

## Rollback Command

```bash
/bin/zsh -lc 'set -a; source .env; set +a; DB_ENGINE=sqlite BILLING_DB_ENGINE=sqlite TASKS_DB_ENGINE=sqlite ATTENDANCE_DB_ENGINE=sqlite CHANNELS_DB_ENGINE=sqlite MESSAGES_DB_ENGINE=sqlite node server.js'
```
