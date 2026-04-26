# Live Recording Permissions

Date: 2026-04-26

## Default Rules

Recording playback is private school content.

Default access:

- teacher: allowed in same workspace
- school admin / admin: allowed in same workspace
- student: denied unless session playback is explicitly enabled
- super admin: denied by default for private school recordings
- cross-workspace requester: denied with `tenant_forbidden`

## Student Playback Rule

Students can access recording list and playback only when all of these are true:

1. same workspace
2. user can view the live session
3. session-level student playback is enabled
4. participant has recording consent stored

If any of these fail, playback is denied.

## Tenant Violation Response

Cross-tenant and super-admin private-content violations return:

```json
{ "error": "Forbidden", "code": "tenant_forbidden" }
```

## Audit Events

The storage/playback layer emits safe events only:

- `recording_object_attached`
- `recording_playback_opened`
- `recording_deleted`
- `recording_access_denied`

No media body, transcript, or private content is written to audit logs.
