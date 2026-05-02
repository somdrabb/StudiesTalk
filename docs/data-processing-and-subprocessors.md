# Data Processing And Subprocessors

This document covers the technical registry and evidence workflow for DPA/AVV and subprocessor maintenance. It is not legal advice.

## Subprocessor Registry

Admin endpoints:

- `GET /api/admin/legal/subprocessors`
- `POST /api/admin/legal/subprocessors`
- `PATCH /api/admin/legal/subprocessors/:id`
- `DELETE /api/admin/legal/subprocessors/:id`

Tracked fields:

- provider name
- service type
- data location
- purpose
- legal basis
- DPA availability
- privacy URL
- active flag

Typical providers include Stripe, OpenAI, Twilio, IONOS/SMTP, Jitsi/8x8, S3/R2 storage, and Sentry when enabled.

## Retention Configuration

Admin endpoints:

- `GET /api/admin/data-governance/retention`
- `POST /api/admin/data-governance/retention`

Tracked retention windows include audit logs, security logs, backups, files, deleted users, learning data, messages, recordings, and email logs.

## Export/Delete Process

Data governance request records include request ID, workspace ID, requester, request type, status, reason, approval fields, completion fields, evidence path, and affected table summary.

The coverage helper lists these domains:

- users
- workspaces
- messages
- DMs
- homework
- attendance
- live sessions
- files
- emails
- AI usage
- billing
- audit/security logs
- legal acceptances

Production teams should attach generated export reports or deletion evidence to the request record before marking it complete.
