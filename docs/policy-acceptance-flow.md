# Policy Acceptance Flow

## New `school_admin`

1. Login succeeds.
2. Server and client enforce onboarding first.
3. After onboarding is completed, the policy guard becomes active.
4. The policy checkpoint is shown.
5. User can:
   - Accept and continue
   - Logout
6. After acceptance, the workspace shell hydrates and normal entry continues.
7. Smoke coverage now treats this as a required handoff:
   - protected workspace APIs stay `403 policy_acceptance_required` after onboarding completion
   - the smoke accepts the current workspace policy through the real acceptance route
   - the same protected APIs must return `200` only after acceptance

## New `student` / `teacher` / other workspace member

1. Login succeeds.
2. `GET /api/auth/me` includes `policyGate`.
3. If the current workspace version is not accepted, the checkpoint opens before workspace hydration.
4. Normal channels and workspace APIs remain blocked until acceptance is written.

## Returning User

- If the current workspace version already has a matching acceptance row, the checkpoint is skipped.

## Version Change

- When the current version changes, the guard looks for the new `(user, workspace, version)` tuple.
- Old accepted versions remain stored but do not satisfy the new gate.

## Exemption Rule

- `super_admin` is exempt by default.
