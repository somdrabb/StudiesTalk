# Policy Acceptance Inventory

## Existing Data Sources

- Workspace identity
  - `workspaces.id`
  - `workspaces.name`
  - `workspaces.admin_email`
- School profile
  - `workspace_profile.street`
  - `workspace_profile.house_number`
  - `workspace_profile.postal_code`
  - `workspace_profile.city`
  - `workspace_profile.state`
  - `workspace_profile.country`
  - `workspace_profile.phone`
  - `workspace_profile.website`
- Communication contact fallback
  - `workspace_email_settings.reply_to_email`
- Workspace-level override storage
  - `workspace_settings_admin.settings_json`
- Platform-level default storage
  - `platform_settings.key = 'workspace_policy_version_default'`

## Existing Acceptance Storage

- Existing table already present in SQLite runtime:
  - `policy_acceptances`
- Existing stored fields reused:
  - `id`
  - `user_id`
  - `workspace_id`
  - `version`
  - `accepted_at`
- Existing uniqueness reused:
  - `UNIQUE (user_id, workspace_id, version)`

## Current Flow Before This Change

- Login:
  - `POST /api/auth/login`
  - page reload
  - `POST /api/auth/refresh`
  - `GET /api/auth/me`
- School admin onboarding gate:
  - server-side middleware in `server/onboarding/onboardingGuard.js`
  - client-side auto-open in `public/app.js`
- Existing policy behavior:
  - acceptance checked by `GET /api/policy/acceptance`
  - acceptance written by `POST /api/policy/accept`
  - UI redirected users into the in-workspace `Privacy & Rules` channel
  - this was not a true pre-workspace gate

## Safe Insertion Point

- Server:
  - keep onboarding guard first
  - insert policy guard after onboarding guard on `/api`
  - expose gate state on `GET /api/auth/me`
- Client:
  - after auth bootstrap and after onboarding completion
  - before `loadServerData()` and before channel/workspace navigation
- Result:
  - school admins still finish onboarding first
  - policy acceptance becomes the next blocking step before workspace entry
