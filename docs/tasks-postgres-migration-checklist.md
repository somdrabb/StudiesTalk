# Tasks / Assignments PostgreSQL Migration Checklist

This checklist covers only the Tasks / Assignments domain rehearsal. It does not
switch the full app to PostgreSQL.

## Scope

- `server.js` still owns auth/session and the rest of the runtime through SQLite.
- Tasks / Assignments SQL is behind `server/repositories/tasksRepository.js`.
- Rehearsal uses `TASKS_DB_ENGINE=postgres`.
- `DB_ENGINE` stays `sqlite`.
- Auth/session stays on SQLite.
- Billing remains independent behind `BILLING_DB_ENGINE`.

## Converted Routes

- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `POST /api/tasks/:id/comments`
- `GET /api/tasks/:id/comments`
- `POST /api/task-reactions/toggle`
- `GET /api/homework/channels/:channelId/board`
- `POST /api/homework/channels/:channelId/items`
- `PATCH /api/homework/items/:itemId`
- `DELETE /api/homework/items/:itemId`
- `POST /api/homework/items/:itemId/submissions`
- `POST /api/homework/submissions/:submissionId/review`
- `POST /api/homework/submissions/:submissionId/comments`

## PostgreSQL Rehearsal Setup

1. Keep `DB_ENGINE=sqlite`.
2. Set `TASKS_DB_ENGINE=postgres`.
3. Apply schema with `npm run db:pg:schema`.
4. Copy matching core rows into PostgreSQL before rehearsal:
   - `workspaces`
   - `users`
   - `channels`
   - `channel_members`
5. Keep the same IDs in SQLite and PostgreSQL so SQLite auth/channel checks align with PostgreSQL task records.

## Compatibility Notes

- Task timestamps stay numeric epoch milliseconds in both engines.
- Homework timestamps are app-generated text strings in both engines to preserve the frontend JSON shape.
- Homework ordering is normalized explicitly:
  - open due dates first
  - null/empty due dates last
  - stable tiebreakers by timestamp and `id`
- Integer flags stay `0` / `1` across engines for:
  - `isLocked`
  - `isArchived`
  - `isLate`
  - `pinned`
  - `deleted`
- Homework attachment writes mirror linked file registry rows into PostgreSQL when `TASKS_DB_ENGINE=postgres`.

## Validation Checklist

- [ ] App starts with `DB_ENGINE=sqlite` and `TASKS_DB_ENGINE=postgres`
- [ ] Login/auth still reads from SQLite
- [ ] `GET /api/tasks` returns `{ tasks: [...] }`
- [ ] `POST /api/tasks` returns `{ task }`
- [ ] `PATCH /api/tasks/:id` returns `{ task }`
- [ ] `GET /api/tasks/:id/comments` returns `{ comments: [...] }`
- [ ] `POST /api/task-reactions/toggle` still returns `{ on: true|false }`
- [ ] Homework board returns `{ channel, permissions, items }`
- [ ] Homework item create returns `{ item }`
- [ ] Homework item update returns `{ item }`
- [ ] Student submission returns `{ submission, item }`
- [ ] Teacher review returns `{ submission, item }`
- [ ] Submission comment returns `{ submission, item }`
- [ ] Homework delete returns `{ ok: true, itemId }`
- [ ] Archived homework no longer appears in board results

## Smoke Test

Run the repo smoke test against both adapters:

```bash
node scripts/tasks-rehearsal-smoke.js sqlite
node scripts/tasks-rehearsal-smoke.js postgres
```

The PostgreSQL run still expects SQLite auth/channel seed data plus matching core
rows in PostgreSQL.
