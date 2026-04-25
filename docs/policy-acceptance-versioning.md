# Policy Acceptance Versioning

## Current Resolution Order

1. `workspace_settings_admin.settings_json.policyAcceptance.version`
2. `platform_settings.workspace_policy_version_default`
3. hard fallback `2026-04-23`

## Stored Acceptance Version

- Acceptance rows store the accepted version in:
  - `policy_acceptances.version`

## Re-acceptance Behavior

- Same version:
  - no prompt for returning users
- New version:
  - prompt again before workspace access

## Practical Default

- Seeded platform value:
  - `2026-04-23`

Update that platform setting or the workspace override to force the next checkpoint cycle.
