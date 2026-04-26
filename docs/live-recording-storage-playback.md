# Live Recording Storage And Playback

Date: 2026-04-26

## Scope

This phase adds production-safe recording metadata, encrypted object storage reuse, playback authorization, and retention foundations.

It does not add real Jitsi/Jibri capture yet.

## Storage Model

Recordings use `live_session_recordings` as metadata only.

Stored fields:

- `id`
- `workspace_id`
- `session_id`
- `storage_key`
- `storage_provider`
- `storage_mode`
- `encryption_key_id`
- `encryption_iv`
- `encryption_tag`
- `checksum`
- `original_name`
- `mime_type`
- `size_bytes`
- `duration_seconds`
- `status`
- `started_at`
- `stopped_at`
- `created_by_user_id`
- `retention_until`
- `deleted_at`

Media bytes are not stored in SQLite or PostgreSQL.

## Storage Path

Phase 3 reuses the managed file storage layer:

- local disk adapter in development
- S3/R2-compatible abstraction boundary for production
- app-level AES-256-GCM encryption when file storage encryption is enabled

Recording playback streams from object storage through the app after authorization.

## Playback

Playback endpoint:

- `GET /api/live-recordings/:recordingId/playback`

Playback is blocked unless the requester passes live-session workspace, privacy, and recording permission checks.

## Dev Attach Route

For development and smoke coverage only:

- `POST /api/live-sessions/:id/recordings/attach-dev-file`

This route stores a small dev-provided object through the managed encrypted file storage layer. It is disabled in production mode.

It is only a storage and playback test harness. It is not production recording capture.
