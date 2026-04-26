# Live Class Breakout Rooms

## Scope

Phase 6 adds teacher-controlled breakout rooms on top of the existing live-session controls. The implementation is app-orchestrated and session-scoped. It does not require Jitsi admin APIs or server-side room orchestration.

## Model

Tables:

- `live_breakout_rooms`
- `live_breakout_room_members`

Room fields:

- `id`
- `workspace_id`
- `session_id`
- `name`
- `status`: `draft | open | closed`
- `created_by_user_id`
- `opened_at`
- `closed_at`
- `created_at`

Member fields:

- `id`
- `room_id`
- `user_id`
- `role`
- `assigned_at`
- `joined_at`
- `left_at`

## Permissions

- `teacher`, `school_admin`, and workspace admins can create, open, close, assign, and remove breakout rooms.
- Students cannot create, open, close, assign, or remove.
- Students can join only:
  - the same workspace
  - the same live session
  - an assigned room
  - an open room
  - after they already pass the waiting-room and recording-consent gates for the live session
- Cross-tenant access returns:

```json
{ "error": "Forbidden", "code": "tenant_forbidden" }
```

- `super_admin` remains blocked from private school live-session content by default.

## Jitsi Strategy

Breakout rooms are app-level rooms. Each room gets a deterministic Jitsi room name derived from:

- `workspace_id`
- `session_id`
- `breakout_room_id`

That keeps the control plane inside StudiesTalk while letting the client open a separate meeting link safely.

## UI

The live controls modal now includes:

- create room form
- room list
- participant assignment
- open/close controls
- member list with removal controls

The live-room panel shows assigned breakout rooms with join and leave actions.

## Limitations

- No automatic participant shuffling yet
- No timed breakout countdown yet
- No server-side Jitsi moderation handoff yet
- No transcript, recording, export, or attendance export yet

## Future Improvements

- random or balanced room assignment
- presenter-only room lock
- timed breakout return-to-main-room flow
- room chat/whiteboard isolation
- export-ready breakout attendance summaries
