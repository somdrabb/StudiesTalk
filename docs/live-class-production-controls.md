# Live Class Production Controls

Date: 2026-04-26

## Scope status

This document started as the Phase 1 hardening pass and now needs to be read together with the later live-class extensions already present in the repo.

Included:

- server-backed waiting room state
- teacher/admin approval and denial
- student raise-hand state
- improved live attendance lifecycle data
- tenant and role hardening for live-session access
- minimal teacher/admin UI for waiting room and raised hands
- breakout-room support
- live polling / quizzes
- whiteboard / slide-state sync
- recording consent and recording storage foundation
- moderator JWT join handling for JWT-capable Jitsi deployments

Not included:

- finished cross-provider recording productization
- generic object-storage-backed media deployment

Related docs:

- [docs/live-class-breakout-rooms.md](/Users/jannatuladny/cat-6.1/docs/live-class-breakout-rooms.md)
- [docs/live-class-polling-quizzes.md](/Users/jannatuladny/cat-6.1/docs/live-class-polling-quizzes.md)
- [docs/live-recording-storage-playback.md](/Users/jannatuladny/cat-6.1/docs/live-recording-storage-playback.md)

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
- `teacher`, `admin`, and `school_admin` are the moderator-capable host roles in the current app
- public `meet.jit.si` still cannot honor StudiesTalk-issued moderator JWTs; automatic host mode requires `8x8.vc` JaaS or self-hosted Jitsi

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

Current live-class UI keeps the existing layout and adds:

- request-join / pending / denied button states in the session list
- attendance modal sections for:
  - waiting room
  - raised hands
  - participant lifecycle status
- approve / deny controls for managers
- lower-hand controls for managers
- student raise/lower hand action from the session list once joined
- breakout-room controls
- polling controls
- whiteboard presenter flows
- host/opening state copy for moderator-capable joins

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
