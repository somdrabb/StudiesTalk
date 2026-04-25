# Onboarding Step Rules

## Required Steps

Required steps block activation:

- `welcome`
- `school_profile`
- `staff_setup`
- `academic_structure`
- `student_setup`
- `live_class_setup`
- `launch_checklist`

Optional steps can be skipped:

- `communication_setup`
- `homework_setup`
- `ai_setup`
- `billing_setup`

## Evidence Rules

### `welcome`

- Marked complete when the wizard is started or the admin explicitly continues past the intro step.

### `school_profile`

Evidence is complete when:

- workspace name exists
- timezone exists in workspace settings or opening-hours metadata
- contact email exists from school email settings or workspace admin email

### `staff_setup`

Evidence is complete when:

- at least one active `teacher` user exists in the workspace

### `academic_structure`

Evidence is complete when:

- at least one class channel exists beyond the default `general` and `announcements` channels

### `student_setup`

Evidence is complete when:

- at least one active `student` user exists
- demo/test student records also count for preparation mode

### `communication_setup`

Evidence is complete when either is true:

- at least one announcement exists in a workspace channel
- school email settings are configured

### `live_class_setup`

Evidence is complete when:

- at least one live session exists for the workspace

### `homework_setup`

Evidence is complete when:

- at least one homework item exists
- or at least one task exists

### `ai_setup`

Evidence is complete when:

- `ai_budget_settings.monthly_cap_eur` is set

### `billing_setup`

Evidence is complete when either is true:

- workspace billing status is `active`
- billing email exists in workspace billing

### `launch_checklist`

Evidence is derived from required MVP setup:

- `welcome`
- `school_profile`
- `staff_setup`
- `academic_structure`
- `student_setup`
- `live_class_setup`

If all of the above are complete, launch checklist becomes complete.

## Wizard Navigation Rules

- `Back` moves the current in-session wizard view to the previous step.
- `Save and continue` persists the current step state and advances the server-side `current_step`.
- If evidence already exists, `Save and continue` marks the step `completed`.
- If evidence is still missing, `Save and continue` stores `in_progress` and advances the wizard.
- `Skip for now` is a workspace-level defer action. It sets onboarding status to `skipped`, allows full app access, and keeps onboarding resumable later.
- Optional steps may still be left incomplete without blocking activation.
- `Activate workspace` is only enabled when all required steps are complete.

## Role Rules

- Forced onboarding applies to `school_admin`
- `super_admin` is excluded from forced onboarding
- teacher and student roles are not forced into the admin onboarding flow

## Server Gate Rules

- While onboarding is incomplete, authenticated `school_admin` API access is limited to setup-safe routes.
- Unrelated APIs return `403` with `code = onboarding_required`.
- The gate is lifted when onboarding status becomes `completed` or `skipped`.
- The gate decision is workspace-scoped and keyed from the authenticated school admin workspace.
- Temporary in-memory gate caching is short-lived and is invalidated on onboarding state writes.
