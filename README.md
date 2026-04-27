# StudiesTalk

StudiesTalk is a multi-tenant language-school platform built on Node.js, Express, SQLite/PostgreSQL-ready data access, and a vanilla-JS frontend. The current codebase supports school workspaces, live classes, onboarding and policy gates, attendance, homework, messaging, built-in email tooling, AI usage tracking, and deployment hardening work for staging.

## Current product surface

### Core platform

- multi-tenant workspaces with tenant isolation
- roles: `student`, `teacher`, `admin`, `school_admin`, `super_admin`
- JWT access + refresh token auth
- CSRF protection
- login-attempt and account-security hardening
- onboarding state machine and policy acceptance gates

### Live classes

- Jitsi-backed live sessions
- waiting room and teacher/admin approval flow
- teacher/admin host auto-join for JWT-capable Jitsi deployments
- raise hand state
- live attendance lifecycle tracking
- whiteboard / slide state sync
- polling / quizzes
- breakout rooms
- recording consent and recording storage foundation

Important constraint:

- public `meet.jit.si` cannot provide StudiesTalk moderator JWT auto-host
- use `8x8.vc` JaaS or self-hosted Jitsi for automatic host mode

### Coursework and communication

- channels and direct messages
- announcements
- homework / assignments
- tasks
- attendance sessions and class attendance
- calendar events
- built-in school email inbox, templates, replies, and logs

### AI and billing foundation

- AI runtime sessions
- AI usage ledger
- AI budget settings
- workspace billing
- invoices and payments

## Current runtime posture

- development default: SQLite
- production recommendation: PostgreSQL
- deployable file storage modes:
  - `FILE_STORAGE_ADAPTER=local`
  - `FILE_STORAGE_ADAPTER=s3|s3_compatible|r2` with S3-compatible env configured
- staging/production should run on Node.js 20

## Project structure

```text
.
├── public/
│   ├── app.js
│   ├── index.html
│   ├── styles.refactor.css
│   ├── css/
│   │   └── homework.css
│   ├── live-presenter.html
│   ├── live-presenter.js
│   └── ...
├── server/
│   ├── config/
│   ├── onboarding/
│   ├── policy/
│   ├── repositories/
│   ├── routes/
│   ├── services/
│   └── utils/
├── scripts/
│   ├── preflight.js
│   ├── cleanup-demo-data.js
│   ├── *-smoke.js
│   ├── backup-sqlite.js
│   └── restore-sqlite-backup.js
├── db/
│   └── schema/
├── docs/
├── storage/
├── uploads/
└── server.js
```

## Frontend structure

- `public/index.html` is the main app shell
- `public/app.js` contains the main client runtime
- `public/styles.refactor.css` is the main stylesheet
- `public/css/homework.css` now holds homework-channel-specific styles extracted from the main stylesheet
- `public/live-presenter.*` contains the live presenter surface

## Backend structure

- `server.js` wires the Express app, health endpoints, auth/session flow, live-class routes, uploads, and platform APIs
- `server/env.js` is the runtime env contract and production blocker validator
- `server/repositories/` contains SQLite/PostgreSQL-aware data access logic
- `server/services/` contains feature services such as Jitsi token generation, file storage, and media processing
- `server/config/` contains runtime configuration helpers, including Jitsi config

## Database shape

The schema has moved beyond the older simplified `tasks/submissions/live_classes` description. The current runtime includes tables and behaviors around:

- `workspaces`
- `users`
- `channels`
- `messages`, `replies`, `message_reactions`
- `dms`, `dm_messages`, `dm_replies`
- `homework_items`, `homework_submissions`, `homework_completions`
- `attendance_sessions`, `attendance_records`
- `class_attendance`, `class_attendance_records`
- `live_sessions`
- `live_session_participants`
- `live_attendance`
- `slide_state`
- `live_session_polls`, `live_session_poll_options`, `live_session_poll_responses`
- `live_breakout_rooms`, `live_breakout_room_members`
- `live_session_recording`, `live_session_recordings`
- `workspace_email_logs`, `inbound_emails`, `email_replies`
- `ai_runtime_sessions`, `ai_usage_ledger`, `ai_budget_settings`
- `workspace_billing`, `invoices`, `payments`
- `policy_acceptances`
- `workspace_onboarding`, `workspace_onboarding_steps`, `workspace_onboarding_events`

See [docs/database-schema.md](/Users/jannatuladny/cat-6.1/docs/database-schema.md).

## Install and run

```bash
source ~/.nvm/nvm.sh
nvm use 20 || nvm install 20
npm install
npm run dev
```

Normal server start:

```bash
npm start
```

## Preflight and smoke

Preflight:

```bash
npm run preflight
```

Current smoke bundle:

```bash
npm run test:all:smoke
```

`test:all:smoke` covers the current non-PostgreSQL smoke set:

- runtime
- tasks
- attendance
- security
- account security
- onboarding
- policy acceptance
- tenant isolation
- file storage
- live controls
- whiteboard
- breakout rooms
- polling
- recording consent
- recording storage

## Database maintenance

SQLite backup helpers:

```bash
npm run backup:sqlite
npm run verify:backup
node scripts/restore-sqlite-backup.js --from backup/<file>.db --confirm-restore
```

Demo/default data cleanup:

```bash
npm run cleanup:demo:dry
npm run cleanup:demo
```

See [docs/database-cleanup.md](/Users/jannatuladny/cat-6.1/docs/database-cleanup.md).

## Deployment docs

- [docs/staging-deployment-checklist.md](/Users/jannatuladny/cat-6.1/docs/staging-deployment-checklist.md)
- [docs/production-deployment-runbook.md](/Users/jannatuladny/cat-6.1/docs/production-deployment-runbook.md)
- [docs/production-rollback-runbook.md](/Users/jannatuladny/cat-6.1/docs/production-rollback-runbook.md)
- [docs/postgres-staging-rehearsal.md](/Users/jannatuladny/cat-6.1/docs/postgres-staging-rehearsal.md)

## High-signal feature docs

- [docs/live-class-production-controls.md](/Users/jannatuladny/cat-6.1/docs/live-class-production-controls.md)
- [docs/live-class-breakout-rooms.md](/Users/jannatuladny/cat-6.1/docs/live-class-breakout-rooms.md)
- [docs/live-class-polling-quizzes.md](/Users/jannatuladny/cat-6.1/docs/live-class-polling-quizzes.md)
- [docs/live-recording-storage-playback.md](/Users/jannatuladny/cat-6.1/docs/live-recording-storage-playback.md)
- [docs/onboarding-production-readiness.md](/Users/jannatuladny/cat-6.1/docs/onboarding-production-readiness.md)
- [docs/policy-acceptance-flow.md](/Users/jannatuladny/cat-6.1/docs/policy-acceptance-flow.md)
- [docs/file-storage-security.md](/Users/jannatuladny/cat-6.1/docs/file-storage-security.md)
- [docs/ui-polish-system.md](/Users/jannatuladny/cat-6.1/docs/ui-polish-system.md)

## Known current deployment blockers

- multi-instance deployment is not ready while storage is local-disk only
- `meet.jit.si` cannot do JWT moderator auto-host

## Health endpoints

- `GET /health`
- `GET /health/deep`
- `GET /api/ai/health`
