# Upload Security Hardening

## Current Policy

Max upload size:
- `UPLOAD_MAX_FILE_BYTES` if configured
- otherwise `25 MB` default for `/api/uploads`
- workspace logos remain capped at `2 MB`

Blocked extensions:
- `.app`
- `.bat`
- `.cmd`
- `.com`
- `.cpl`
- `.css`
- `.dll`
- `.exe`
- `.hta`
- `.htm`
- `.html`
- `.jar`
- `.js`
- `.jsp`
- `.jspx`
- `.mjs`
- `.msi`
- `.php`
- `.phar`
- `.ps1`
- `.py`
- `.rb`
- `.scr`
- `.sh`
- `.svg`
- `.svgz`
- `.ts`
- `.vbs`
- `.wsf`
- `.xhtml`
- `.xml`

Allowed MIME policy:
- images: png, jpeg/jpg, webp, gif, heic/heif
- PDF: `application/pdf`
- common documents: txt, csv, doc/docx, xls/xlsx, ppt/pptx, rtf
- audio/video currently needed by the app: webm, mp4, mp3, wav, ogg, m4a, mov

Filename and path handling:
- original names are normalized before being echoed back or used in headers
- on-disk upload names are generated, not user supplied
- upload and attachment reads resolve against a fixed root and reject traversal attempts
- general uploads no longer depend on public static serving for access control

Serving policy:
- managed uploads now require a permitted user context and are checked against `files_registry`
- safe response headers are added: `X-Content-Type-Options: nosniff`
- inline rendering is limited to safe previewable MIME types
- untrusted web-content types are blocked at upload time

Security events added:
- `security.login_rate_limited`
- `security.csrf_rejected`
- `security.upload_rejected`
- `security.forbidden_file_access`
- `security.path_traversal_attempt`

## Remaining Production Recommendations

- Add content-based type validation for high-risk formats instead of MIME/extension checks only.
- Add malware scanning or quarantine for uploaded and inbound-email attachments.
- Revisit whether `/api/uploads` should require authentication in addition to CSRF.
- Revisit whether public workspace logos are acceptable for the deployment model.
- Add retention and cleanup policy for orphaned upload files on disk.
- Consider stronger per-route authorization for null-channel files if more file surfaces are added later.
