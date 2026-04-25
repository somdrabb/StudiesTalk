# Onboarding Production Event Catalog

## Core Events
- `onboarding_created`
- `onboarding_started`
- `onboarding_auto_open_seen`
- `onboarding_resumed`
- `onboarding_deferred`
- `onboarding_step_entered`
- `onboarding_step_updated`
- `onboarding_step_completed`
- `onboarding_step_skipped`
- `onboarding_activation_attempted`
- `onboarding_activation_blocked`
- `onboarding_billing_info_updated`
- `onboarding_completed`

## Event Rules
- Do not log secrets, passwords, or tokens.
- Payloads remain small and operationally useful.
- No-op step writes are suppressed by repository logic.
- Auto-open acknowledgment remains one-time per workspace welcome step.

## Purpose
- support debugging
- support onboarding analytics
- support customer support investigations
- preserve trustworthy business-readiness history
