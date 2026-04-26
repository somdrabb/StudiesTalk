# Live Recording Retention

Date: 2026-04-26

## Current Foundation

Each stored live recording metadata row includes:

- `retention_until`
- `deleted_at`
- `status`

Delete behavior is currently soft delete:

- API marks `status = deleted`
- API stamps `deleted_at`
- playback and list routes stop serving deleted rows

The underlying object is not purged immediately in this phase.

## Why Soft Delete First

Immediate destructive deletion is the wrong default for school recordings until the cleanup workflow is explicit and tested.

This phase keeps:

- reversible operational review
- audit continuity
- a safe foundation for later cleanup jobs

## Future Cleanup Work

Scheduled cleanup should later:

1. find rows where `deleted_at` is set or `retention_until` has passed
2. delete the managed object from storage
3. write deletion audit events
4. keep only the minimum tombstone metadata required by policy

That cleanup job is not implemented in this phase.

## Recommended Future Inputs

- workspace retention policy
- legal hold override
- class/session override
- delete approval workflow for protected recordings
