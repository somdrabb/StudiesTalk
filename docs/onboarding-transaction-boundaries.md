# Onboarding Transaction Boundaries

## Existing Transactional Guarantees Preserved
- Repository onboarding lifecycle writes remain transactional in both SQLite and PostgreSQL:
  - onboarding creation
  - start
  - defer
  - resume
  - step updates
  - activation/completion

## Hardened In This Pass
- `PATCH /api/workspaces/:workspaceId/profile`
  - profile row upsert
  - workspace name update
  - executed in one SQLite transaction
- Post-write privacy-rules refresh remains intentionally outside the transaction so secondary rendering failures cannot roll back valid data.

## Reliability Notes
- Billing profile updates remain single-row repository updates.
- Activation still revalidates live evidence immediately before completion.
- UI-facing failures return recoverable messages without forcing the user out of onboarding.
