# Upload Security Inventory

## Routes Found

`POST /api/uploads`
- Purpose: general chat/material upload endpoint.
- Storage: `UPLOADS_DIR` (defaults to `uploads/`), randomized disk filename.
- Registry tables: none at upload time; later referenced through `files_registry`.
- Max size: `UPLOAD_MAX_FILE_BYTES`, env-backed, default `25 MB`.
- MIME/type checks: blocked executable/script/web-content extensions and MIME types; allowed set is limited to images, PDF, common office/text docs, and currently used audio/video formats.
- Filename/path handling: original filename normalized for metadata; on-disk filename is generated as `timestamp-random.ext`; no user-controlled path segments.
- Authorization: no login required on the route itself; CSRF required for mutation.
- Audit/security logging: rejected uploads log `security.upload_rejected`.

`POST /api/workspaces/:workspaceId/logo`
- Purpose: workspace logo upload from data URL.
- Storage: `UPLOADS_DIR/workspaces/:workspaceId/logo.(png|jpg|webp)`.
- Registry tables: none.
- Max size: fixed `2 MB`.
- MIME/type checks: only `image/png`, `image/jpeg`, `image/jpg`, `image/webp` data URLs.
- Filename/path handling: fixed normalized target filename `logo.ext`.
- Authorization: workspace manager only, same-workspace enforced.
- Audit/security logging: no dedicated security event on rejection today.

`GET /uploads/*`
- Purpose: serves registry-backed uploads and workspace logos.
- Storage: `UPLOADS_DIR`.
- Registry tables: `files_registry` for managed file access; workspace logos are served directly from `UPLOADS_DIR/workspaces/:workspaceId`.
- Max size: n/a.
- MIME/type checks: response MIME comes from registry record or safe logo type inference.
- Filename/path handling: path resolved with safe root check; traversal attempts rejected.
- Authorization: workspace logos remain public; other managed uploads require authenticated or legacy header-based user context and are scoped by workspace plus channel/uploader access.
- Audit/security logging: forbidden reads log `security.forbidden_file_access`; traversal attempts log `security.path_traversal_attempt`.

`GET /api/admin/inbox/:emailId/attachments/:attachmentId`
`GET /api/admin/inbox/:emailId/attachments/:attachmentId/view`
- Purpose: email attachment download/preview.
- Storage: `storage/email_attachments/`.
- Registry tables: none; metadata lives in `inbound_emails.attachments_json`.
- Max size: inherited from inbound email persistence, not request-uploaded here.
- MIME/type checks: inline preview is limited to PDF and common image formats.
- Filename/path handling: stored attachment name resolved under `storage/email_attachments` with traversal protection.
- Authorization: mailbox viewer scope enforced by workspace/user mailbox visibility.
- Audit/security logging: invalid path attempts now log `security.path_traversal_attempt`.

`POST /api/admin/inbox/:emailId/reply`
- Purpose: attaches existing stored inbox attachments to outbound replies.
- Storage: reads from `storage/email_attachments/`.
- Registry tables: none.
- Max size/type/path handling: inherited from stored attachment metadata.
- Authorization: admin mailbox scope enforced.

`POST /api/files/:fileId/pin`
`POST /api/files/:fileId/delete`
`POST /api/files/:fileId/replace`
`GET /api/files/registry`
- Purpose: registry-backed file state and metadata operations.
- Storage: metadata only; file bytes remain in `UPLOADS_DIR`.
- Registry tables: `files_registry`, plus indirect analytics via `file_events` and `file_stats`; homework links use `homework_item_files` and `homework_submission_files`.
- Authorization: now scoped to requester workspace and accessible file rows; student list access is limited to owned/null-channel/member-channel files.
- Audit/security logging: forbidden access logs `security.forbidden_file_access`.

## Storage Locations

`uploads/`
- General uploaded files, env override `UPLOADS_DIR`.

`uploads/workspaces/:workspaceId/`
- Workspace logos.

`storage/email_attachments/`
- Inbound email attachment persistence.

## File Registry Tables

`files_registry`
- Canonical metadata for uploaded chat/material files.

`file_events`
- View/download/open event stream.

`file_stats`
- Aggregated view/download counters.

`homework_item_files`
- Links files to homework items.

`homework_submission_files`
- Links files to homework submissions.

`inbound_emails.attachments_json`
- Email attachment metadata, not a relational registry table.

## Current Gaps And Risks

- Workspace logos remain publicly readable because they are used as branding assets; this is intentional but still a public file surface.
- `/api/uploads` still relies on CSRF rather than requiring auth. That preserves current frontend behavior but allows anonymous safe-file uploads in dev if a caller can obtain a CSRF token.
- File authorization is workspace/channel/uploader aware for managed uploads, but null-channel registry rows still resolve to workspace-level access.
- MIME checks are extension/MIME based, not content-sniffing or malware scanning.
- Email attachment persistence is not governed by the same upload policy because those files arrive from mailbox sync, not browser uploads.
