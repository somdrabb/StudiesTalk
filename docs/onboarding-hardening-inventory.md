# Onboarding Hardening Inventory

## Scope

This inventory reflects the current onboarding implementation in:

- [server.js](/Users/jannatuladny/cat-6.1/server.js)
- [server/repositories/onboardingRepository.js](/Users/jannatuladny/cat-6.1/server/repositories/onboardingRepository.js)
- [public/app.js](/Users/jannatuladny/cat-6.1/public/app.js)
- [db/schema/pg/011_onboarding.sql](/Users/jannatuladny/cat-6.1/db/schema/pg/011_onboarding.sql)
- [scripts/onboarding-smoke.js](/Users/jannatuladny/cat-6.1/scripts/onboarding-smoke.js)

The goal here is discovery only: what exists, how it behaves today, and where the hardening boundaries still matter.

## 1. Existing Onboarding Routes And Route Families

Current onboarding routes exist in two families plus one global gate:

### Canonical workspace-scoped routes

Defined in [server.js](/Users/jannatuladny/cat-6.1/server.js:11991):

- `GET /api/workspaces/:workspaceId/onboarding`
  - Ensures the row exists, then returns `{ onboarding }`.
- `PATCH /api/workspaces/:workspaceId/onboarding/steps/:stepId`
  - Accepts `status` in `completed|skipped|pending|in_progress`.
  - Accepts `note`, `currentStep`, `meta`.
  - Returns `{ onboarding }`.
- `POST /api/workspaces/:workspaceId/onboarding/activate`
  - Requires `activationReady`.
  - Returns `{ onboarding }`.

### Legacy onboarding routes

Defined in [server.js](/Users/jannatuladny/cat-6.1/server.js:12098):

- `GET /api/onboarding/:workspaceId`
- `POST /api/onboarding/:workspaceId/start`
- `POST /api/onboarding/:workspaceId/steps/:stepKey`
- `POST /api/onboarding/:workspaceId/steps/:stepKey/complete`
- `POST /api/onboarding/:workspaceId/steps/:stepKey/skip`
- `POST /api/onboarding/:workspaceId/complete`
- `GET /api/onboarding/:workspaceId/activation`

These still map to the same repository behavior and remain part of the compatibility surface.

### Server-side onboarding gate

Defined in [server.js](/Users/jannatuladny/cat-6.1/server.js:3194).

- Mounted as `app.use('/api', ...)`.
- Applies only to authenticated `school_admin`.
- Excludes `super_admin`.
- Allows only a narrow setup-safe allowlist until onboarding is `completed` or `skipped`.
- Returns `403` with `code: "onboarding_required"` for blocked APIs.

## 2. Existing Onboarding Repository Methods

The repository surface is shared across SQLite and PostgreSQL in [server/repositories/onboardingRepository.js](/Users/jannatuladny/cat-6.1/server/repositories/onboardingRepository.js:24).

Current public methods:

- `ensureWorkspaceOnboarding(input, userId)`
- `listWorkspaceOnboardingSteps(workspaceId)`
- `getWorkspaceOnboarding(workspaceId)`
- `startWorkspaceOnboarding(workspaceId, userId)`
- `saveOnboardingStep(workspaceId, stepKey, payload, userId)`
- `completeOnboardingStep(workspaceId, stepKey, userId, meta)`
- `skipOnboardingStep(workspaceId, stepKey, userId, meta)`
- `setCurrentOnboardingStep(workspaceId, stepKey)`
- `updateStep({ workspaceId, stepId, status, note, currentStep, userId, updatedAt, meta, eventType })`
- `appendOnboardingEvent(workspaceId, eventType, stepKey, userId, payload)`
- `computeActivationMetrics(workspaceId)`
- `getActivationMetrics(workspaceId)`
- `refreshActivationMetrics(workspaceId)`
- `completeWorkspaceOnboarding(workspaceId, userId)`
- `activateWorkspace({ workspaceId, completedAt, activatedAt, userId })`

Repository behavior today:

- `ensureWorkspaceOnboarding` auto-creates the workspace row plus all step rows.
- `getWorkspaceOnboarding` derives step evidence from real workspace data every time it runs.
- `updateStep` stores explicit step status and `meta_json`, but evidence can still auto-complete steps regardless of stored step status.
- `activateWorkspace` marks onboarding `completed`, but does not separately snapshot “why” activation was allowed beyond event logs and metrics rows.

## 3. Current First-Login Redirect Logic In The SPA Shell

Current SPA-first redirect logic lives in [public/app.js](/Users/jannatuladny/cat-6.1/public/app.js:320), [public/app.js](/Users/jannatuladny/cat-6.1/public/app.js:8252), and [public/app.js](/Users/jannatuladny/cat-6.1/public/app.js:31243).

Current behavior:

- After auth bootstrap, the SPA calls `shouldShowWorkspaceOnboarding()`.
- That function loads onboarding from `GET /api/workspaces/:workspaceId/onboarding`.
- If the authenticated user is `school_admin` and onboarding is not `completed` or `skipped`, the SPA opens `openOnboardingPanel()`.
- Initial app hydration is skipped while onboarding is required.
- `openRailSection()` redirects back into onboarding for all rail sections except `profile` and `admin` ([public/app.js](/Users/jannatuladny/cat-6.1/public/app.js:10865)).
- If a blocked API returns `403` with `code = onboarding_required`, `fetchJSON()` reopens onboarding automatically ([public/app.js](/Users/jannatuladny/cat-6.1/public/app.js:760)).

Conclusion:

- First-login behavior is no longer only “polite UI guidance”.
- It is now UI-driven first, with a server gate behind it for most API traffic.

## 4. Which APIs `school_admin` Can Still Access Before Onboarding Completion

Before onboarding completion, `school_admin` retains access only to the onboarding-safe allowlist in [server.js](/Users/jannatuladny/cat-6.1/server.js:3201).

Allowlisted families include:

- auth/session bootstrap
- workspace selector
- canonical and legacy onboarding read/write/activate routes
- workspace profile and logo setup
- workspace email settings and template routes
- user list/create routes
- student import
- user-class membership lookup
- channels create/list/update/delete and membership routes
- announcements create/list/delete
- live session create/list/update/delete/join/attendance
- homework create/update/delete/submission/review routes
- AI budget routes

Notably blocked by default:

- unrelated analytics
- normal dashboard data APIs not explicitly allowlisted
- any `/api` route outside the allowlist while onboarding remains incomplete

Important hardening observation:

- The current gate is allowlist-based, not capability-based.
- This is strong by default, but any new setup-relevant route added later must be intentionally added to the allowlist or it will be blocked.

## 5. Which Onboarding Steps Are Required vs Skippable

Source of truth is `ONBOARDING_ITEMS` in [server/repositories/onboardingRepository.js](/Users/jannatuladny/cat-6.1/server/repositories/onboardingRepository.js:6).

Required:

- `welcome`
- `school_profile`
- `staff_setup`
- `academic_structure`
- `student_setup`
- `live_class_setup`
- `launch_checklist`

Skippable:

- `communication_setup`
- `homework_setup`
- `ai_setup`
- `billing_setup`

Activation-ready rule:

- `activationReady` is true only when every required item is `completed`.
- `launch_checklist` is derived from core required evidence, not freeform UI state.

## 6. How Onboarding Completion Is Currently Stored

Storage is persistent and DB-backed.

SQLite bootstrap/migration lives in [server.js](/Users/jannatuladny/cat-6.1/server.js:1004).
PostgreSQL schema lives in [db/schema/pg/011_onboarding.sql](/Users/jannatuladny/cat-6.1/db/schema/pg/011_onboarding.sql:1).

Tables:

- `workspace_onboarding`
  - one row per workspace
  - stores overall `status`, `current_step`, `started_at`, `completed_at`, `started_by_user_id`, `completed_by_user_id`
- `workspace_onboarding_steps`
  - one row per workspace + step
  - stores explicit step `status`, timestamps, completer, and `meta_json`
- `workspace_onboarding_events`
  - append-only audit/event log
- `workspace_activation_metrics`
  - denormalized computed metrics and activation score

Completion is currently represented by:

- `workspace_onboarding.status = 'completed'`
- `workspace_onboarding.completed_at`
- `workspace_onboarding.completed_by_user_id`

The repository also recalculates evidence and metrics from real domain data on reads, so the effective onboarding view is partly stored state and partly derived state.

## 7. Whether Onboarding State Survives Refresh, Logout/Login, And Multi-Tab

### Refresh

Yes.

- Onboarding state is read back from the server on bootstrap.
- `loadWorkspaceOnboarding()` fetches current state from the API ([public/app.js](/Users/jannatuladny/cat-6.1/public/app.js:8208)).

### Logout/Login

Yes.

- State is persisted in DB, not only in memory.
- Workspace provisioning also auto-creates onboarding rows ([server.js](/Users/jannatuladny/cat-6.1/server.js:20817)).

### Multi-tab

Partially.

- Because state is persisted server-side, a reload in another tab sees the latest onboarding state.
- There is no `storage` event sync or `BroadcastChannel` in the SPA.
- `workspaceOnboarding` is cached in-memory per tab (`workspaceOnboardingLoadedFor`), so an already-open second tab can become temporarily stale until it refetches or hits a gated API.
- The server gate reduces risk because blocked requests force a refetch path through `fetchJSON()`.

Conclusion:

- Persistence survives refresh and relogin cleanly.
- Multi-tab consistency is eventual, not real-time.

## 8. Whether Onboarding Completion Is Enforced Only In UI Or Also In API Routes

Current enforcement is both UI and API.

### UI enforcement

- onboarding panel opens during bootstrap
- rail navigation redirects back into onboarding
- dashboard checklist remains visible until completion

### API enforcement

- `/api` onboarding gate blocks non-allowlisted requests for incomplete `school_admin` onboarding
- blocked response shape:
  - `403`
  - `code: "onboarding_required"`

Important nuance:

- Enforcement is broad across `/api`, but still centrally middleware-based.
- It is not a second per-route authorization model for every endpoint.
- Non-`/api` frontend navigation still depends on SPA behavior.

## 9. Which Existing Pages/Components Are Reused By Onboarding Steps

The onboarding wizard intentionally wraps existing flows rather than duplicating business logic. Main action mapping is in [public/app.js](/Users/jannatuladny/cat-6.1/public/app.js:7860).

Reused UI/domain flows:

- `school_profile`
  - opens existing admin/profile/settings surface via `showPanel("adminPanel")`, `openCurrentUserProfile()`, `mountUserProfileCardToAdminPanel()`
- `staff_setup`
  - reuses `openRegistrationModal(..., "teacher")`
- `academic_structure`
  - reuses class/channel creation via `handleAddChannel("classes")`
- `student_setup`
  - reuses `openRegistrationModal(..., "student")`
- `communication_setup`
  - reuses email panel or announcements channel via `openEmailPanel()` / `openStaticChannelByName("Announcements")`
- `live_class_setup`
  - reuses `openLiveSessionModal()`
- `homework_setup`
  - reuses `openHomeworkAssignmentModalForItem(...)`
- `ai_setup`
  - reuses existing AI budget API through `setAiBudgetFromOnboarding()`
- `billing_setup`
  - currently read/review only; it shows a toast rather than opening a dedicated billing editor
- checklist card shortcuts
  - resume setup
  - invite teacher
  - create class
  - add students

Conclusion:

- Most steps are real wrappers around existing flows.
- Billing is the weakest reuse area because it does not yet launch a real editable billing screen.

## 10. Whether There Are Edge Cases Around `workspaceId` Mismatches Or Tenant Leakage

### On onboarding routes themselves

The onboarding routes are relatively well-defended.

`getOnboardingRequester()` in [server.js](/Users/jannatuladny/cat-6.1/server.js:11975):

- requires `canManageWorkspaceSettings(user)`
- resolves `workspaceId`
- compares route workspace to authenticated user workspace
- allows cross-workspace access only for `super_admin`
- returns `403 Wrong workspace` on mismatch

This is the correct boundary for onboarding-specific routes.

### In the central gate

The gate itself does not trust arbitrary route params.

- It derives the workspace from the authenticated user object, not from request params ([server.js](/Users/jannatuladny/cat-6.1/server.js:3314)).
- That avoids a trivial route-param bypass for gate evaluation.

### Remaining tenant-safety observations

- The allowlist includes broad routes such as `GET|POST /api/users` and `GET|POST /api/channels`.
- Tenant safety for those routes depends on their own existing workspace access checks, not on the onboarding gate.
- The onboarding gate is not a tenant-isolation layer by itself.
- `workspaceIdFromRequest()` falls back to the authenticated user workspace or `'default'` ([server.js](/Users/jannatuladny/cat-6.1/server.js:3645)), so endpoints that rely on it without stronger route-level checks need separate review.
- In the SPA, `currentWorkspaceId`, `window.selectedWorkspaceId`, and `sessionUser.workspaceId` are normalized together in `persistSessionUser()` ([public/app.js](/Users/jannatuladny/cat-6.1/public/app.js:1298)), which is convenient but means client-side workspace context is mutable and should never be treated as a security boundary.

Conclusion:

- Onboarding route isolation is acceptable.
- Broader tenant leakage risk, if any, would come from existing allowlisted setup endpoints with weak workspace checks, not from the onboarding tables or wizard state itself.

## Additional Findings

### Auto-creation behavior already exists

- Workspace provisioning initializes onboarding automatically ([server.js](/Users/jannatuladny/cat-6.1/server.js:20817)).
- `getWorkspaceOnboarding()` also self-heals missing rows via `ensureWorkspaceOnboarding()`.

### Evidence-driven completion is stronger than UI-only status

- Repository evidence comes from live tables such as `users`, `channels`, `live_sessions`, `homework_items`, `workspace_billing`, `workspace_email_settings`, and `ai_budget_settings`.
- A step can effectively show as complete because evidence exists even if no one explicitly clicked “complete”.

### Cache boundary is short-lived

- Server gate cache TTL is `3000ms` ([server.js](/Users/jannatuladny/cat-6.1/server.js:3199)).
- Cache is invalidated on onboarding writes and activation.
- This is production-safe enough for correctness, but it is still an in-memory per-process cache.

## Current Hardening Baseline

The current system is no longer a fake UI-only wizard. It already has:

- persistent DB-backed onboarding state
- real domain evidence for completion
- canonical and compatibility APIs
- first-login SPA redirect
- server-side incomplete-onboarding API gate
- provisioning-time onboarding row creation
- smoke coverage for core flow

The most important remaining hardening themes after this inventory are:

- verifying tenant checks on all allowlisted setup routes
- reducing broad allowlist exposure where possible
- tightening multi-tab freshness if needed
- improving billing-step depth if a real editable billing surface exists or should exist
