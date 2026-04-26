# Attendance Privacy

Phase 1 attendance is designed to avoid high-risk school surveillance patterns.

Explicitly not included:
- face recognition
- geofencing
- parent notification automation

Privacy boundaries:
- same-workspace access only
- students can only check in themselves
- teacher/admin/school admin can manage attendance only for their workspace class
- `super_admin` is blocked from private class attendance by default
- cross-workspace access returns `tenant_forbidden`

Certificate handling:
- medical certificates use managed file storage
- blobs are not stored in the database
- DB stores metadata references only
- access is enforced with the existing tenant-aware file access checks

Audit events:
- `attendance.checkin_code_created`
- `attendance.checkin_completed`
- `attendance.manual_status_updated`
- `attendance.certificate_uploaded`

Operational note:
- the current teacher UI renders a code-first check-in panel and a local QR-style matrix preview
- production QR image generation can be upgraded later without changing attendance ownership or storage rules
