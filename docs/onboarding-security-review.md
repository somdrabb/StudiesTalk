# Onboarding Security Review

## Scope

This review covers onboarding-specific tenant safety and abuse resistance.

Relevant files:

- [server.js](/Users/jannatuladny/cat-6.1/server.js)
- [server/onboarding/onboardingGuard.js](/Users/jannatuladny/cat-6.1/server/onboarding/onboardingGuard.js)
- [server/repositories/onboardingRepository.js](/Users/jannatuladny/cat-6.1/server/repositories/onboardingRepository.js)

## Server-Side Scope Enforcement

### Workspace scoping

`getOnboardingRequester()` enforces:

- authenticated requester
- workspace-settings capability
- route `workspaceId` must match requester workspace
- `super_admin` exception only where intended

Result:

- a `school_admin` cannot read or update another workspace’s onboarding state

### Guard enforcement

The onboarding guard uses the authenticated user workspace from the token context, not a client-supplied route parameter, when deciding whether onboarding is incomplete.

That prevents trivial route-param-based bypasses of the incomplete-onboarding gate.

## Payload Validation

Current protections:

- unknown step IDs rejected
- unknown `currentStep` values rejected
- invalid statuses rejected
- onboarding meta must be an object
- oversized onboarding meta rejected
- billing email validated
- billing profile text fields length-bounded

## Spoof Resistance

### Step completion

The repository no longer trusts client-declared `completed` status for substantive steps.

Only `welcome` can be manually completed.
All other completions must be backed by server-side evidence.

### Activation

Activation cannot be forced from the client:

- API route re-reads onboarding state
- repository re-checks activation readiness
- launch completion is derived from required-step evidence

## Remaining Security Notes

- onboarding guard allowlist entries still rely on each allowlisted route’s own workspace access controls
- multi-process deployments would need distributed cache invalidation if the short onboarding guard cache becomes operationally significant
- the current SPA still uses client workspace context for UX, but not as a trust boundary
