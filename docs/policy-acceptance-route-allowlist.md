# Policy Acceptance Route Allowlist

## Guard Order

1. Onboarding guard
2. Policy acceptance guard

This preserves the required sequence for new `school_admin` users:

1. authenticate
2. finish onboarding if enforced
3. accept current workspace policy
4. enter workspace

## Routes Allowed Through The Policy Guard

- `^/api/auth/`
- `GET /api/workspaces`
- onboarding routes already required for school-admin setup
- `GET /api/workspaces/:workspaceId/policy`
- `POST /api/workspaces/:workspaceId/policy/accept`
- legacy compatibility:
  - `GET /api/policy/acceptance`
  - `POST /api/policy/accept`

## Routes Blocked Until Acceptance

- workspace channel reads
- direct message reads
- channel message reads/writes
- workspace shell data hydration
- other normal authenticated workspace APIs

## Server Response Shape

- HTTP status:
  - `403`
- code:
  - `policy_acceptance_required`
- payload:
  - `policyGate.required`
  - `policyGate.version`
  - `policyGate.accepted`
  - `policyGate.acceptedAt`
  - `policyGate.exempt`
