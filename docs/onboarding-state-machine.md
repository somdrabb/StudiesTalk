# Onboarding State Machine

## Source Of Truth

The server repository is the source of truth for onboarding state.

Primary implementation:

- [server/repositories/onboardingRepository.js](/Users/jannatuladny/cat-6.1/server/repositories/onboardingRepository.js)

Persistence:

- `workspace_onboarding`
- `workspace_onboarding_steps`
- `workspace_onboarding_events`
- `workspace_activation_metrics`

## Step Statuses

Normalized statuses:

- `pending`
- `in_progress`
- `completed`
- `skipped`

Workspace-level statuses:

- `not_started`
- `in_progress`
- `completed`
- `skipped`

## Transition Rules

### Current step

- `current_step` is stored on `workspace_onboarding`.
- Current step can be updated independently from step status.
- SPA navigation now persists current step through the onboarding API instead of keeping it only in browser memory.

### Required steps

Required steps cannot be skipped:

- `welcome`
- `school_profile`
- `staff_setup`
- `academic_structure`
- `student_setup`
- `live_class_setup`
- `launch_checklist`

### Completion spoof protection

Only `welcome` can be manually completed without server evidence.

All other steps require real server-side evidence:

- `school_profile`
  requires workspace name, timezone, and contact/reply-to email
- `staff_setup`
  requires at least one active teacher
- `academic_structure`
  requires at least one non-default class channel
- `student_setup`
  requires at least one student
- `communication_setup`
  requires announcement or email configuration
- `live_class_setup`
  requires at least one live session
- `homework_setup`
  requires homework/task data
- `ai_setup`
  requires AI budget data
- `billing_setup`
  requires billing contact email, invoice contact name, and readiness review or active billing state
- `launch_checklist`
  is derived from required-step evidence

Stored `completed` step state no longer overrides missing evidence for substantive steps.

## Derived Steps

`launch_checklist` is server-derived.

It becomes complete only when all required setup steps except itself are complete from valid evidence.

This prevents client-only launch spoofing.

## Activation Rules

Activation succeeds only when `activationReady === true`.

That is computed server-side from required-step completion, not from client intent.

Repository enforcement:

- `activateWorkspace(...)` re-reads onboarding summary
- if activation is not ready, it throws `onboarding_activation_not_ready`
- completion stamps:
  - `status = completed`
  - `current_step = launch_checklist`
  - `completed_at`
  - `completed_by_user_id`

## Validation Rules

The repository rejects:

- unknown step IDs
- invalid status names
- required-step skips
- step completion without evidence
- malformed meta payloads
- oversized meta payloads

API layer additionally bounds:

- `currentStep`
- billing profile inputs

## Persistence Guarantees

Progress now survives:

- page refresh
- browser reopen
- logout/login

Because:

- step status is persisted in DB
- current step is persisted in DB
- onboarding summary is refetched from the server on bootstrap

Multi-tab is still eventual-consistency rather than push-synced, but persisted state is durable across reloads.
