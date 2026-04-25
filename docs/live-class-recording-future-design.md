# Live Class Recording Future Design

Date: 2026-04-26

Recording is intentionally out of scope for the current live-class controls pass.

When recording is added later, production requirements should include the following.

## Consent

- explicit recording consent before capture starts
- school-configurable consent text
- participant role-aware consent rules
- consent evidence stored with timestamp and actor

## Visible Recording Indicator

- always-visible recording badge in the live room
- clear start/stop messaging
- no silent recording mode

## Storage

- encrypted object storage for recordings
- metadata-only database records
- no video/audio blobs in relational storage
- key management outside the database

## Retention Policy

- workspace-configurable retention windows
- legal hold / policy override path if needed
- automatic expiry and purge jobs

## Playback Permissions

- same-workspace authorization only
- role-aware playback rules
- class/session-specific visibility
- `super_admin` blocked from private school playback by default

## Deletion Workflow

- explicit delete action
- background object deletion
- tombstone / audit record for deletion
- eventual purge of derived media and transcripts

## Audit Trail

- recording started
- recording stopped
- consent accepted/declined
- playback access
- download/export access
- deletion requested/completed

Audit logs should never store private media content, only identifiers and safe metadata.
