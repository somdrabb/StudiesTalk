# Attendance Tracking

StudiesTalk attendance Phase 1 adds school-ready attendance without biometric or geolocation features.

Included:
- short-lived class check-in codes for teacher/admin managed sessions
- on-time vs late status based on `start_time` and `grace_period_minutes`
- manual teacher/admin updates for `present`, `late`, `absent`, `excused`
- excused absence notes and optional medical certificate upload
- class attendance reporting with weekly/monthly rollups
- CSV export

Primary routes:
- `GET /api/classes/:channelId/attendance`
- `POST /api/classes/:channelId/attendance/save`
- `POST /api/classes/:channelId/attendance/session-code`
- `POST /api/attendance/check-in`
- `POST /api/classes/:channelId/attendance/records/:studentId`
- `POST /api/classes/:channelId/attendance/records/:studentId/certificate`
- `GET /api/classes/:channelId/attendance/report`
- `GET /api/classes/:channelId/attendance/report.csv`

Status model:
- `present`
- `late`
- `absent`
- `excused`

Certificate storage:
- certificate files use the existing managed file storage layer
- database stores file metadata and foreign keys only
- certificate access stays tenant-protected through the managed upload access path

Current UI:
- teacher/admin attendance modal with code generation, status editing, notes, analytics, and CSV export
- student check-in input inside the same class attendance surface

Future improvements:
- actual QR image encoding instead of code-first panel rendering
- scheduled attendance windows
- bulk excused upload actions
- parent notification workflow after parent contact and consent model exist
