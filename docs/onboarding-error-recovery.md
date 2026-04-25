# Onboarding Error Recovery

## Frontend Recovery Behavior
- Guided mode keeps users inside onboarding on recoverable failures.
- Inline onboarding errors now use `formatOnboardingUiError(...)` in [public/app.js](/Users/jannatuladny/cat-6.1/public/app.js).
- Backend validation messages remain readable and are surfaced in the onboarding alert area.

## Backend Recovery Behavior
- Validation errors return clean `400` responses.
- Activation failures return the current onboarding payload so the UI can retry from the same state.
- Profile and billing writes do not expose raw stack traces.

## UX Outcome
- The user sees what failed instead of being thrown out of onboarding.
- Retry remains possible for profile, billing, activation, and setup actions.
