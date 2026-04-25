# File Storage Security

Date: 2026-04-25

## Inventory

StudiesTalk file handling is split into two layers:

- Database metadata in `files_registry`, `file_events`, and `file_stats`
- File objects on disk under the managed storage root in development

Workspace logos remain on local disk as direct image files under `uploads/workspaces/<workspaceId>/logo.*`.
Managed school files such as PDFs, images, audio, and video are stored outside the database and referenced from `files_registry`.

## Metadata-Only Model Review

`files_registry` is the authoritative metadata table for managed files. It stores:

- `file_id`
- `workspace_id`
- `channel_id`
- `message_id`
- `uploader_id`
- `purpose`
- `file_name`
- `mime`
- `size_bytes`
- `url`
- `storage_key`
- `checksum`
- `storage_provider`
- `storage_mode`
- `encryption_key_id`
- `encryption_iv`
- `encryption_tag`
- `permissions`
- lifecycle flags and timestamps

It does not store file blobs.

This keeps SQLite/PostgreSQL focused on metadata, search, permissions, analytics, and relational integrity instead of binary payloads.

## Encryption Model

Private managed files can be encrypted before storage with AES-256-GCM.

- Encryption is controlled by `FILE_STORAGE_ENCRYPTION_ENABLED`
- The encryption key is supplied by `FILE_STORAGE_ENCRYPTION_KEY`
- The key id is stored as metadata via `FILE_STORAGE_ENCRYPTION_KEY_ID`
- Raw encryption keys are never stored in the database
- Each encrypted object stores a per-object IV and auth tag
- Download reads the encrypted object, verifies the auth tag, and decrypts on the app server before sending to an authorized client

Files marked `workspace_public` can remain plain if app-level encryption is disabled for that permission set. Current managed upload flow defaults to `workspace_private`.

## Storage Adapters

The application uses a storage service with adapter boundaries:

- `local_disk`: writes managed objects to a disk-backed storage root for development and single-node deployments
- `s3_compatible`: placeholder interface for future Cloudflare R2 / S3 / Wasabi / Hetzner Object Storage integration

The application route stays stable while the adapter changes underneath it.

## Download Path

`GET /uploads/*` now has two managed branches:

- legacy plain-disk files: served from the original upload path when `storage_key` is absent
- managed storage objects: served through the storage service, with decrypt-on-read when `storage_mode = encrypted`

This preserves existing uploads while allowing new uploads to move to encrypted managed storage.

## Deduplication

Managed objects use checksum-based deduplication inside a workspace boundary.

- checksum: SHA-256 of the plaintext file
- storage key: deterministic by `workspace_id + checksum + extension/mode`
- duplicate uploads reuse the same object storage key instead of writing another copy

Workspace-scoped dedup avoids a trivial cross-tenant equality signal.

## Safe Limits

Effective file limits are enforced by type and capped by `UPLOAD_MAX_FILE_BYTES`.

Defaults:

- images: 10 MB
- documents/PDF: 25 MB
- audio: 50 MB
- video: 200 MB

If `UPLOAD_MAX_FILE_BYTES` is lower than a type default, the lower value wins.

## Remaining Security Risks

- Managed object garbage collection is not implemented yet, so deleted/detached duplicate objects are not reclaimed automatically.
- Encryption is optional; if production enables it, key rotation and key escrow procedures still need an operational runbook.
- The S3-compatible adapter is still a placeholder and has not been integrated with a real object storage backend yet.
