# Onboarding Route Allowlist

## Purpose

The onboarding guard for incomplete `school_admin` users is explicit-allowlist based.

This is intentional:

- unrelated protected platform APIs are blocked by default
- setup-safe APIs stay available during onboarding
- new setup routes must be reviewed and added deliberately
- `super_admin` is always exempt

Implementation source:

- [server/onboarding/onboardingGuard.js](/Users/jannatuladny/cat-6.1/server/onboarding/onboardingGuard.js)

## Guarded Population

The guard applies only when all of the following are true:

- request is under `/api`
- requester is authenticated
- requester role is `school_admin`
- requester is not `super_admin`
- workspace onboarding status is neither `completed` nor `skipped`

Unchanged behavior:

- `super_admin` is never blocked by onboarding
- `teacher` is unchanged
- `student` is unchanged
- non-school-admin `admin` is unchanged unless product policy changes later

## Allowed Route Families

### Auth and session

- any `/api/auth/*`

These are required for login, logout, refresh, reset-password, and session bootstrap flows.

### System and health

- `GET /api/ai/health`

This remains available so operational/system checks are not coupled to onboarding state.

### Onboarding routes

- `GET /api/workspaces/:workspaceId/onboarding`
- `PATCH /api/workspaces/:workspaceId/onboarding/steps/:stepId`
- `POST /api/workspaces/:workspaceId/onboarding/activate`
- `GET /api/onboarding/:workspaceId`
- `POST /api/onboarding/:workspaceId/start`
- `POST /api/onboarding/:workspaceId/steps/:stepKey`
- `POST /api/onboarding/:workspaceId/steps/:stepKey/complete`
- `POST /api/onboarding/:workspaceId/steps/:stepKey/skip`
- `POST /api/onboarding/:workspaceId/complete`
- `GET /api/onboarding/:workspaceId/activation`

### Minimal workspace/profile data needed for onboarding

- `GET /api/workspaces`
- `GET|PATCH|POST /api/workspaces/:workspaceId/profile`
- `GET|PATCH|POST /api/workspaces/:workspaceId/profile/registration`
- `GET|PATCH /api/workspaces/:workspaceId/billing-profile`
- `POST /api/workspaces/:workspaceId/logo`

### Communication setup

- `GET|POST /api/workspaces/:workspaceId/email-settings`
- `POST /api/workspaces/:workspaceId/email-settings/test`
- `GET /api/workspaces/:workspaceId/email-templates`
- `GET|PUT /api/workspaces/:workspaceId/email-templates/:templateId`
- `POST /api/workspaces/:workspaceId/email-templates/:templateId/reset`
- `POST /api/workspaces/:workspaceId/email-templates/:templateId/test`

### Staff and student setup

- `GET|POST /api/users`
- `POST /api/workspaces/:workspaceId/students/import`
- `GET /api/user-class-memberships`

### Academic structure

- `GET|POST /api/channels`
- `PATCH|DELETE /api/channels/:channelId`
- `GET|POST|DELETE /api/channels/:channelId/members`
- `POST /api/channels/:channelId/members/:userId`
- `GET|POST /api/channels/:channelId/announcements`
- `DELETE /api/channels/:channelId/announcements/:announcementId`

### Live class setup

- `GET|POST /api/live-sessions`
- `PATCH|DELETE /api/live-sessions/:sessionId`
- `POST /api/live-sessions/:sessionId/join`
- `GET|POST /api/live-sessions/:sessionId/attendance`

### Homework setup

- `GET /api/homework/channels/:channelId/board`
- `POST /api/homework/channels/:channelId/items`
- `PATCH|DELETE /api/homework/items/:itemId`
- `POST /api/homework/items/:itemId/submissions`
- `POST /api/homework/submissions/:submissionId/review`
- `POST /api/homework/submissions/:submissionId/comments`

### AI setup

- `GET|POST|DELETE /api/admin/ai-budget`
- `GET|POST|DELETE /api/admin/ai-budget/reset`

## Blocked By Default

Any protected `/api` route not listed above is blocked for incomplete `school_admin` onboarding.

Blocked response contract:

```json
{
  "error": "Onboarding required before full workspace access.",
  "code": "onboarding_required",
  "onboarding": {
    "status": "in_progress",
    "currentStep": "school_profile",
    "activationReady": false,
    "progress": {
      "completed": 2,
      "total": 11,
      "requiredCompleted": 2,
      "requiredTotal": 7,
      "requiredRemaining": 5
    },
    "completedAt": null
  }
}
```

## Operational Notes

- The guard uses a short in-memory cache keyed by `workspaceId`.
- Cache entries are invalidated on onboarding write/activation routes.
- This cache is an optimization only, not a source of truth.
- Source of truth remains the onboarding repository and workspace evidence tables.

## Migration Boundary

The guard is repository-driven and runtime-neutral:

- SQLite remains the default runtime
- PostgreSQL compatibility remains through the existing repository adapter pattern
- response shape for blocked requests remains stable for the SPA
