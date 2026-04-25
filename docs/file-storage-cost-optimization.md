# File Storage Cost Optimization

Date: 2026-04-25

## Strategy

The primary cost optimization is structural:

- store file metadata in the database
- store file objects outside the database

This prevents SQLite/PostgreSQL from carrying PDF, image, audio, and video blobs, which keeps backups smaller, reduces write amplification, and improves query performance.

## Database Reduction Model

Only metadata is retained in relational storage:

- identifiers and ownership
- MIME type and size
- storage key and checksum
- permissions and timestamps
- analytics counters and events

No file body is stored in `files_registry`.

## Object Storage Readiness

The storage service supports:

- local disk in development and single-node deployments
- an S3/R2-compatible placeholder for production object storage

This keeps the app-side contract stable while allowing production to move to lower-cost object storage later.

## Deduplication Savings

Checksum-based deduplication reduces duplicate object writes for repeated uploads of the same file inside the same workspace.

Savings come from:

- single stored object for repeated teacher/student re-uploads
- reduced backup size
- reduced future object-storage footprint

## Encryption Without Blob Inflation in DB

App-level encryption happens before persistence to object storage. The database stores only encryption metadata:

- `storage_mode`
- `encryption_key_id`
- `encryption_iv`
- `encryption_tag`

That preserves privacy without pushing encrypted blobs into the database.

## Type-Based Limits

Type caps keep storage growth predictable:

- image: 10 MB
- document/PDF: 25 MB
- audio: 50 MB
- video: 200 MB

Effective enforcement is the smaller of the type cap and `UPLOAD_MAX_FILE_BYTES`.

## Recommended Production Path

For production:

1. keep `files_registry` metadata-only
2. move managed storage from local disk to R2/S3-compatible storage
3. enable `FILE_STORAGE_ENCRYPTION_ENABLED=true` for private school files
4. keep encryption keys outside the database
5. add lifecycle cleanup for deleted and unreferenced objects

## Next Cost Improvements

- add background garbage collection for unreferenced managed objects
- add retention rules for deleted files and expired course materials
- add image/audio/video transcoding policy per channel/purpose
- add storage usage reporting by workspace and by MIME family
