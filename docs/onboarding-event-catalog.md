# Onboarding Event Catalog

## Storage

Onboarding events are stored in `workspace_onboarding_events`.

Implementation:

- [server/repositories/onboardingRepository.js](/Users/jannatuladny/cat-6.1/server/repositories/onboardingRepository.js)

## Event Names

Current event names:

- `onboarding_created`
- `onboarding_started`
- `onboarding_step_entered`
- `onboarding_step_updated`
- `onboarding_step_completed`
- `onboarding_step_skipped`
- `onboarding_activation_attempted`
- `onboarding_completed`

## Emission Rules

### `onboarding_created`

Emitted when the workspace onboarding row is first provisioned.

### `onboarding_started`

Emitted only when onboarding moves from `not_started` into active setup.

### `onboarding_step_entered`

Emitted when `current_step` changes.

Duplicate step-entered events are avoided when the requested current step is already active.

### `onboarding_step_updated`

Emitted for non-terminal step saves such as `pending` or `in_progress`.

### `onboarding_step_completed`

Emitted only when the repository accepts completion of a step.

### `onboarding_step_skipped`

Emitted only when a skippable step is actually skipped.

### `onboarding_activation_attempted`

Emitted on activation requests before final completion logic runs.

Payload includes:

- `activationReady`
- `requiredRemaining`

### `onboarding_completed`

Emitted when workspace onboarding is successfully activated/completed.

## Data Hygiene

- secrets and tokens are not written into onboarding event payloads
- step meta is validated and size-bounded before persistence
- duplicate no-op updates do not emit new step update events
