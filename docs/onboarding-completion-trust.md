# Onboarding Completion Trust

## Source Of Truth
- Server repository evidence remains the source of truth.
- The client may request navigation or status changes, but required completion still depends on real workspace evidence.

## Preserved Trust Rules
- Required steps cannot be skipped.
- Required steps cannot be completed without real evidence, except `welcome`.
- Activation is revalidated server-side at activation time.
- Deferred onboarding stays `skipped`, not `completed`.
- Legacy suppression only suppresses auto-open; it does not mark onboarding complete.

## Hardening Added
- Activation failures now log `onboarding_activation_blocked`.
- Billing and profile writes now have stronger validation before they can contribute to readiness.
- Retry-sensitive setup routes are safer to replay without fabricating extra evidence.
