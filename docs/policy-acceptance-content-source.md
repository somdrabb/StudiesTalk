# Policy Acceptance Content Source

## Primary Source Fields

- School name:
  - `workspaces.name`
- Support email:
  - `workspace_email_settings.reply_to_email`
  - fallback `workspaces.admin_email`
- Phone:
  - `workspace_profile.phone`
- Website:
  - `workspace_profile.website`
- Address:
  - `workspace_profile.street`
  - `workspace_profile.house_number`
  - `workspace_profile.postal_code`
  - `workspace_profile.city`
  - `workspace_profile.state`
  - `workspace_profile.country`

## Version and Date

- Current policy version:
  - workspace override in `workspace_settings_admin.settings_json.policyAcceptance.version`
  - otherwise `platform_settings.workspace_policy_version_default`
- Last updated shown on the checkpoint:
  - current policy version value

## Fallback Rules

- Missing email, phone, website, or address render as:
  - `Not yet configured`

## Content Shape

- Summary cards:
  - EU-hosted infrastructure
  - no ads / no third-party tracking
  - encrypted communication
  - classroom-only usage
  - moderation and reporting
- Sections:
  - Data Controller & Legal Basis
  - Data Privacy (GDPR)
  - Communication Rules
  - Roles & Permissions
  - Safety & Moderation
  - Our Commitment
  - Contact

## Implementation

- Repository:
  - `server/repositories/policyRepository.js`
- SPA checkpoint renderer:
  - `public/app.js`
