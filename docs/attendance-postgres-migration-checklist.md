# Attendance PostgreSQL Migration Checklist

This checklist covers only the Attendance rehearsal path. It does not switch the
full app to PostgreSQL.

## Scope

- `DB_ENGINE` stays `sqlite`.
- Auth/session stays on SQLite.
- Attendance rehearsal uses `ATTENDANCE_DB_ENGINE=postgres`.
- Billing and Tasks remain independently controlled by their own adapters.
- The active Attendance scope includes:
  - `attendance_sessions`
  - `attendance_records`
  - `attendance_notifications`
- Legacy `class_attendance*` tables are not part of this rehearsal step.
- `live_attendance` is not part of this rehearsal step.

## Converted Runtime Surface

- `GET /api/classes/:channelId/attendance`
- `POST /api/classes/:channelId/attendance/save`
- `GET /api/students/:studentId/attendance`
- Channel-maintenance attendance writes:
  - duplicate-channel remap
  - channel deletion cleanup

## PostgreSQL Rehearsal Setup

1. Keep `DB_ENGINE=sqlite`.
2. Set `ATTENDANCE_DB_ENGINE=postgres`.
3. Apply schema with `npm run db:pg:schema`.
4. Copy matching core rows into PostgreSQL first:
   - `workspaces`
   - `users`
   - `channels`
5. Keep IDs identical between SQLite and PostgreSQL so SQLite auth/channel checks
   match PostgreSQL attendance rows.

## Response Compatibility

- `GET /api/classes/:channelId/attendance` still returns:
  - `channel`
  - `session_id`
  - `session_date`
  - `records`
  - `locked`
- `POST /api/classes/:channelId/attendance/save` still returns:
  - `ok`
  - `session_id`
  - `session_date`
  - `absentees_count`
  - `absence_emails`
- `GET /api/students/:studentId/attendance` still returns:
  - `records`

## PostgreSQL Differences Covered

- Session uniqueness uses `UNIQUE(channel_id, session_date)`.
- Attendance writes use `ON CONFLICT(session_id, student_user_id)`.
- Timestamp fields stay app-generated text strings for response compatibility.
- Ordering is explicit on session date, marked timestamp, and `id`.
- Notification dedupe uses `UNIQUE(session_id, student_user_id, type)`.
- Foreign keys are preserved for workspace, channel, session, student, and marker references.

## Validation Checklist

- [ ] App starts with `DB_ENGINE=sqlite` and `ATTENDANCE_DB_ENGINE=postgres`
- [ ] Teacher can load class attendance
- [ ] Admin can load the same class attendance
- [ ] Teacher can mark attendance
- [ ] Teacher can update attendance for the same session/date
- [ ] Student attendance history still returns the expected JSON shape
- [ ] Class/session summary counts still derive correctly from returned records
- [ ] Channel deletion cleanup does not leave orphaned attendance rows
- [ ] Duplicate-channel remap mirrors attendance rows through the repository

## Smoke Test

```bash
node scripts/attendance-rehearsal-smoke.js sqlite
node scripts/attendance-rehearsal-smoke.js postgres
```

Or via npm:

```bash
npm run test:attendance:smoke
npm run test:attendance:smoke:pg
```

## Known Residual Boundary

- Synchronous analytics/AI attendance summary helpers still remain SQLite-owned in
  this stage. The attendance runtime routes are migrated first, matching the staged
  adapter-boundary rehearsal pattern already used for other domains.
