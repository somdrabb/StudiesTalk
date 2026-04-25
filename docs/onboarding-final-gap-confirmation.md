# Onboarding Final Gap Confirmation

## Confirmed Pre-hardening Gaps
- Several onboarding-allowlisted setup routes still relied on repeated route-local workspace comparisons instead of one strict shared pattern.
- `GET|POST /api/workspaces/:workspaceId/email-settings` and `GET|PATCH|POST /api/workspaces/:workspaceId/profile*` accepted broad free-form payloads with weak server validation.
- `PATCH /api/workspaces/:workspaceId/billing-profile` validated email only lightly and allowed effectively empty updates.
- Retry-sensitive onboarding setup routes could still duplicate side effects when the same request was replayed:
  - `POST /api/users`
  - `POST /api/channels`
  - `POST /api/live-sessions`
  - `POST /api/homework/channels/:channelId/items`
- Activation attempts logged an attempt event, but blocked activations did not log a distinct blocked event.
- Guided-mode UI error rendering showed basic messages but did not format backend validation detail payloads cleanly.

## Confirmed Strengths Already Present
- Repository-backed onboarding state machine was already transactional for onboarding-state writes in both SQLite and PostgreSQL adapters.
- Step completion already revalidated evidence server-side in the onboarding repository.
- Activation already revalidated readiness from real workspace evidence before completion.
- Legacy-school suppression and skip/resume semantics were already in place.

## Scope Closed In This Pass
- Strict shared workspace assertion applied to profile and email settings routes.
- Stronger validation added for email, phone, URL, timezone, registration text, opening-hours values, and billing contact fields.
- Optional idempotency support added to retry-sensitive creation routes.
- Activation blocked events added.
- Billing update event added.
- Guided onboarding now formats backend validation failures more cleanly.

## Still Intentionally Deferred
- Persistent cross-route idempotency key storage independent of object-shape matching.
- Deeper legal entity and tax/VAT validation.
- Rich per-field UI validation hints beyond the current inline error summary.
