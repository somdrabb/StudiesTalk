# Onboarding System Design

## Purpose

School admins should not land directly in the full workspace on first login when the workspace is still unconfigured. The onboarding system introduces:

- a dedicated onboarding wizard surface in the SPA
- persistent onboarding state in the database
- evidence-based completion and activation metrics
- a persistent admin dashboard checklist card until onboarding is complete

Super admins are not forced into the wizard.

## Step List

1. `welcome`
2. `school_profile`
3. `staff_setup`
4. `academic_structure`
5. `student_setup`
6. `communication_setup`
7. `live_class_setup`
8. `homework_setup`
9. `ai_setup`
10. `billing_setup`
11. `launch_checklist`

## Frontend Surfaces

- `#onboardingRoot`: onboarding shell
- `#onboardingSummarySection`: premium school/admin/readiness cards
- `#onboardingSidebar`: progress rail / step picker
- `#onboardingProgress`: hero progress card
- `#onboardingStepBody`: current step content area
- `#onboardingChecklistCard`: activation checklist sidebar
- `#dashboardChecklistMount`: persistent school-admin checklist card in the admin overview/profile panel
- `#adminResumeSetupBtn`: persistent settings entry point for incomplete onboarding

## UI Modes

- Guided mode
  - default for newly auto-opened school-admin onboarding
  - shows one focused step at a time
  - hides the progress rail and checklist sidebar
  - keeps a compact premium summary card strip visible
- Dashboard mode
  - used for deferred, resumed, and partially completed onboarding
  - keeps the progress rail, activation checklist, and full information-card summary visible
  - includes both `Resume setup` and `View setup checklist` entry points

## First-Login Enforcement

- Only authenticated `school_admin` users participate in forced onboarding.
- Auto-open now depends on onboarding visibility state rather than raw status alone.
- `visibility.shouldAutoOpen` is true only when:
  - onboarding is not `completed`
  - onboarding is not `skipped`
  - the first guided auto-open has not already been acknowledged
  - legacy setup evidence is not present
- Legacy setup evidence suppresses auto-open when:
  - at least two core setup signals are already complete
  - or activation score is at least `30`
  - or the workspace already has teachers plus classes
  - or students plus classes
  - or live sessions plus classes
- `super_admin` is explicitly excluded.
- Deferred onboarding keeps app access open and leaves setup resumable later.

## Server-Side Gate

The hardened flow now includes a server-side onboarding gate for authenticated `school_admin` users.

- The gate runs centrally for `/api/*`
- It allows only onboarding-safe bootstrap and setup routes until onboarding is completed
- It blocks unrelated APIs such as analytics, messaging, AI runtime, and other non-setup surfaces
- `super_admin` is explicitly excluded from this gate

Blocked responses use:

```json
{
  "error": "Onboarding required before full workspace access.",
  "code": "onboarding_required",
  "onboarding": {
    "status": "in_progress",
    "currentStep": "school_profile",
    "activationReady": false,
    "progress": {
      "completed": 1,
      "total": 11,
      "requiredCompleted": 1,
      "requiredTotal": 7,
      "requiredRemaining": 6
    },
    "completedAt": null
  }
}
```

This response shape is additive and only applies to blocked requests.

## Gate Allowlist Domains

The allowlist intentionally permits only setup-safe domains:

- auth/session bootstrap
- onboarding read/write/activation
- workspace profile and logo
- school email settings and templates
- user creation/listing needed for teacher/student setup
- class/channel creation and class membership changes
- announcements
- live sessions
- homework setup
- admin AI budget setup

This boundary is documented inline in `server.js` as a migration/security boundary.

## Storage Model

### SQLite

SQLite bootstrap in `server.js` creates:

- `workspace_onboarding`
- `workspace_onboarding_steps`
- `workspace_onboarding_events`
- `workspace_activation_metrics`

### PostgreSQL

PostgreSQL parity lives in `db/schema/pg/011_onboarding.sql` with the same table set.

## Route Contracts

### Canonical workspace onboarding routes

- `GET /api/workspaces/:workspaceId/onboarding`
  - returns `{ onboarding }`
- `PATCH /api/workspaces/:workspaceId/onboarding/steps/:stepId`
  - accepts `status`, `currentStep`, `note`, `meta`
  - valid statuses: `pending`, `in_progress`, `completed`, `skipped`
  - returns `{ onboarding }`
- `POST /api/workspaces/:workspaceId/onboarding/activate`
  - completes onboarding if activation-ready
  - returns `{ onboarding }`

### Compatibility routes

Legacy/alternate onboarding routes under `/api/onboarding/:workspaceId/...` remain available and map to the same repository behavior.

## Activation Metrics

Metrics are recalculated from real workspace evidence and stored in `workspace_activation_metrics`.

Tracked metrics:

- teachers count
- students count
- classes count
- channels count
- live sessions count
- homework count
- announcements count
- AI enabled
- billing ready
- activation score

## Activation Score

Weighted scoring is evidence-driven:

- school profile: `10`
- staff setup: `10`
- academic structure: `15`
- student setup: `15`
- live class setup: `15`
- homework setup: `10`
- announcements configured: `10`
- billing ready: `10`
- AI enabled: `5`

Maximum score: `100`

## Real Flow Reuse

The wizard does not invent fake setup data. It wraps existing flows:

- school profile: existing workspace profile/settings form
- staff: teacher registration modal
- academic structure: existing class/channel creation flow
- students: student registration modal
- communication: existing school email / announcements flows
- live class: existing live session modal
- homework: existing homework assignment modal
- AI: existing AI budget endpoint and prompt flow
- billing: existing workspace billing bootstrap and readiness data

## Verification

`scripts/onboarding-smoke.js` now verifies two layers:

- repository/evidence flow in temporary SQLite storage
- real HTTP gate behavior against a spawned server process

The HTTP phase verifies:

- onboarding GET is allowed while gated
- an unrelated API is blocked with `code=onboarding_required`
- an allowed setup API still works
- activation removes the gate and restores unrelated API access
