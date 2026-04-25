# Live Class Production Controls

Date: 2026-04-26

## Phase 1 Scope

This phase adds production controls for live classes without implementing recording.

Included:

- server-backed waiting room state
- teacher/admin approval and denial
- student raise-hand state
- improved live attendance lifecycle data
- tenant and role hardening for live-session access
- minimal teacher/admin UI for waiting room and raised hands

Not included:

- session recording
- playback
- recording retention

## Waiting Room

Live join state is stored per session and participant.

States:

- `pending`
- `approved`
- `denied`
- `joined`
- `left`

Student flow:

1. student requests to join
2. participant record is stored as `pending`
3. teacher/admin approves or denies
4. only `approved` users can complete `/join`

Teacher/admin flow:

- same-workspace teacher/admin can approve or deny participants
- same-workspace teacher/admin can bypass the waiting room for themselves

Tenant behavior:

- cross-workspace attempts return `403 { "error": "Forbidden", "code": "tenant_forbidden" }`
- `super_admin` remains blocked from private school live-session content by default

## Raise Hand

Raise-hand state is tracked per session participant.

Stored:

- `hand_status`
- `hand_raised_at`
- `hand_lowered_at`

Behavior:

- joined students can raise and lower their own hand
- teacher/admin can lower another participant's hand
- non-managers cannot control other users

## Attendance

Live attendance is now lifecycle-aware rather than join-only.

Tracked:

- join requested
- approved
- denied
- joined
- left
- approximate duration in seconds
- participant role
- workspace and session scope

Legacy `live_attendance` writes are still updated for compatibility.

## UI

Phase 1 UI keeps the existing live-class layout and adds:

- request-join / pending / denied button states in the session list
- attendance modal sections for:
  - waiting room
  - raised hands
  - participant lifecycle status
- approve / deny controls for managers
- lower-hand controls for managers
- student raise/lower hand action from the session list once joined

## Audit Events

Safe audit/security events now include:

- `live_join_requested`
- `live_join_approved`
- `live_join_denied`
- `live_joined`
- `live_left`
- `live_hand_raised`
- `live_hand_lowered`
- `security.forbidden_live_access_attempt`

Event payloads exclude private live-session content.
