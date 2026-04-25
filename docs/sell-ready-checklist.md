# StudiesTalk Sell-Ready Checklist

This audit is aimed at the gap between "the software works" and "a language school or private teacher can buy it and start using it without developer help."

It is based on the current codebase and runtime behavior in `server.js`, `public/app.js`, `public/index.html`, `README.md`, `.env.example`, and related docs.

## Overall Assessment

StudiesTalk is already beyond prototype level. It has real product surface:

- multi-tenant workspaces
- role-based auth
- school registration and approval flow
- student/teacher invite onboarding
- homework, attendance, live sessions, AI, email, and billing tables

But it is not yet "sell-ready" as a service.

The main problem is not missing features. The main problem is productization:

- onboarding still assumes internal knowledge
- some UI promises outrun implementation
- tenant boundaries are strong in many places but not consistently centralized
- backup exists, restore does not
- billing is administrative, not customer-facing commerce
- there is no clean path for a solo private teacher product tier

## Customer Journey Audit

### 1. School Admin Onboarding

Current flow:

- Public login/register surface exists in `public/index.html`.
- A school can submit a request through `/api/schools/request`.
- A super admin reviews and approves in the admin panel.
- Approval creates the workspace and sends a temporary-password email.
- School admin logs in, changes password, then can invite or directly create teachers/students.

What works:

- There is a real request -> approval -> workspace creation flow.
- Workspace approval is enforced at login.
- School profile and school email settings exist.

What blocks productization:

- School onboarding is not self-serve. It requires super-admin approval and internal admin operations.
- The UI says "Register your school", but the actual journey is still an application/review workflow, not instant activation.
- There is no setup wizard after first login for:
  - branding
  - payment setup
  - first class creation
  - teacher invite
  - student import
- No customer-facing onboarding checklist or "next steps" dashboard exists.

### 2. Teacher Onboarding

Current flow:

- School admins can create teachers directly with `/api/users`.
- School admins can also send teacher registration links through `/api/register/send-link`.
- Invite links open `public/register.html` and complete account creation through `/api/register/complete`.

What works:

- Invite-based onboarding exists.
- Direct teacher creation exists.
- Class assignment can happen during admin-side registration.

What blocks productization:

- Teacher onboarding is entirely school-admin driven.
- There is no dedicated first-login experience for teachers.
- No "teacher setup" path exists for:
  - assigned classes review
  - profile completion
  - teaching language setup
  - email/live/homework readiness
- Roles are technically present, but the teacher product narrative is still thin.

### 3. Student Onboarding

Current flow:

- Students can be created directly by school admins.
- Students can receive a registration link.
- Student registration flow is reasonably complete and includes phone/emergency/course info.

What works:

- Invite-link onboarding is real.
- Student billing summary endpoint exists.
- Student analytics/dashboard exists.

What blocks productization:

- There is no obvious "student welcome" or first-use orientation.
- No parent/guardian communication workflow is visible.
- No polished post-registration path explains what the student should do next.
- Mobile OTP exists, but is still optional and not clearly presented as a trusted onboarding policy.

### 4. Private Teacher Solo Onboarding

Current state:

- There is no real private-teacher product flow.
- A solo teacher can theoretically be represented as a one-person workspace, but the product copy, onboarding, and billing are built around schools/workspaces.

Blocker:

- This is the largest product gap if private teachers are a target customer.
- Current onboarding assumes:
  - a school workspace
  - school approval/admin process
  - school admin inviting others

Recommendation:

- Do not market to private teachers yet unless you intentionally define a "solo school" SKU and onboarding path.

## What A First-Time Customer Still Cannot Do Reliably Without Developer Help

1. Activate a school instantly without waiting for internal approval.
2. Restore from backup using a documented recovery procedure.
3. Understand deployment requirements without engineering help.
4. Configure production email and OTP safely without environment/operator help.
5. Configure billing in a customer-facing way.
6. Use SSO even though Google/Microsoft buttons appear in the login UI.
7. Onboard as a solo private teacher through a purpose-built flow.
8. Rely on every workspace-sensitive route using one consistent tenant-enforcement model.
9. Understand plan limits, upgrade path, or what "paid" means in-product.
10. Trust that planner/calendar data is server-backed across devices; parts of the planner still use browser local storage.

## Role Clarity Audit

### Roles Present

The product is built around:

- `student`
- `teacher`
- `school_admin`
- `admin`
- `super_admin`

### Good Signs

- Permissions are defined centrally in `server.js`.
- Many operational routes use `authRequired`, `requirePermission`, and `requireWorkspaceAccess`.
- Analytics has school/teacher/student-specific views.

### Gaps

1. The distinction between `admin` and `school_admin` is not product-clear.
   - For customers, that is likely confusing unless one is strictly internal.
2. Some older routes still rely on headers such as `x-admin` / `x-super-admin` instead of only token-based auth.
   - That is a productization and security smell.
3. Teacher permissions look narrow on the backend, but the UI exposes broader behavior in places.
4. The app still contains some legacy/admin-era assumptions that feel operator-centric, not tenant-customer-centric.

## Deployment / Backup / Restore Readiness

### What Exists

- `DB_PATH` is configurable via env.
- DB backups exist in code through `backupDatabase()`.
- Scheduled backups can run via `DB_BACKUP_INTERVAL_HOURS`.
- `.env.example` documents core runtime variables.
- README explains SQLite/WAL and recommends PostgreSQL for production.

### What Is Missing

- No documented restore runbook.
- No restore verification procedure.
- No retention policy for backups.
- No health check / readiness / liveness strategy.
- No deployment automation for the main app itself.
- `SERVER_SETUP.md` is focused on Jitsi/TURN infrastructure, not full StudiesTalk deployment.
- No documented production checklist for:
  - reverse proxy
  - TLS
  - secrets management
  - uploads volume
  - backup restore drill
  - log rotation
  - monitoring/alerts

### Productization Conclusion

The app is backup-capable, but not restore-ready.

For a sellable SaaS, restore matters more than backup existence.

## Multi-Tenant Isolation Audit

### Strong Areas

- Workspace is the main tenant boundary.
- Many routes correctly scope by workspace.
- `requireWorkspaceAccess(...)` is used in important user/channel routes.
- Several helper functions use workspace-scoped lookup patterns such as `getWorkspaceScopedUser(...)`.

### Weak Areas

1. Workspace derivation sometimes falls back to `'default'`.
   - That is dangerous in a SaaS context.
2. Tenant enforcement is not uniformly centralized across all older routes.
3. Some endpoints still rely on mixed auth styles:
   - token auth
   - derived workspace from auth
   - legacy headers
4. There are still manual cascade/delete code paths in admin operations, which increases the risk of missing a tenant-owned table in future changes.
5. Client-side planner data is still stored in browser local storage, which is not multi-device or centrally governed.

### Sellability Conclusion

Tenant isolation is better than many early SaaS products, but not yet consistent enough to claim strong enterprise-grade isolation.

## Billing / Product Plan Readiness

### What Exists

- `workspace_billing`
- `invoices`
- `payments`
- student billing summary endpoints
- admin billing views
- invoice creation and manual mark-paid flow

### What Does Not Exist Yet

- no real customer-facing subscription purchase flow
- no Stripe or hosted checkout integration
- no self-serve upgrade/downgrade
- no tax/VAT handling
- no invoice delivery/customer billing portal
- no dunning, failed-payment handling, or subscription lifecycle UX
- no plan page that clearly defines limits

### Product Conclusion

Billing exists as back-office accounting, not as a sellable SaaS purchase experience.

That is enough for internal demos and manually managed pilots. It is not enough for product-led sales.

## Critical Blockers

1. No true self-serve activation for schools.
2. No solo private teacher onboarding path.
3. Billing is manual/admin-only, not customer self-serve.
4. Backup exists but restore process is undocumented and untested.
5. Tenant isolation is not yet enforced through one single consistent pattern across the whole codebase.
6. Login UI shows Google/Microsoft SSO buttons, but no matching implemented flow is visible in the frontend runtime.
7. Planner/calendar user-facing data still depends partly on browser local storage instead of backend persistence.
8. Role model is technically present but not product-clear for customers.
9. Deployment documentation is incomplete for non-developer operators.
10. First-login onboarding is weak for school admins, teachers, and students.

## Medium-Priority Improvements

1. Replace all legacy `x-admin` / `x-super-admin` update/delete assumptions with token-based role checks.
2. Create a guided first-login setup wizard for school admins.
3. Add a teacher welcome/setup flow.
4. Add a student welcome flow with clear first actions.
5. Add visible workspace plan/usage UI.
6. Add a restore command/runbook and documented recovery drill.
7. Remove or hide unfinished SSO buttons until SSO is real.
8. Standardize tenant enforcement around reusable workspace-scoped helpers.
9. Add customer-facing deployment doc for hosted or managed installation.
10. Add operations basics:
   - backup retention
   - alerting
   - health checks
   - error reporting

## Quick Wins For Demos

1. Hide Google/Microsoft SSO buttons if they are not live.
2. Add a simple "Getting started" checklist for school admins after first login.
3. Add a visible plan card:
   - current plan
   - AI budget
   - pending invoices
4. Add sample/demo data seed instructions for one language school.
5. Add a support/contact panel inside the app.
6. Add a plain-language role explainer in settings/admin UI.
7. Add a backup/last-backup status display for operators.

## Recommended First Paying Customer Profile

Best first paying customer:

- one language school
- one decision-maker who is also an active school admin
- 2 to 8 teachers
- 20 to 150 students
- willing to accept manual billing during pilot
- willing to work with invite-based onboarding
- not requiring enterprise SSO
- not requiring parent portals, compliance reviews, or multi-branch finance workflows yet

Why:

- The current product is strongest for a small school with an engaged operator.
- It is not yet strongest for:
  - solo private teachers
  - large schools with IT/compliance requirements
  - product-led self-serve onboarding

## Recommended Next Steps

### Before Selling Widely

1. Define one target SKU first:
   - language school pilot
   - not private teacher and not enterprise at the same time
2. Create a school-admin setup wizard:
   - school profile
   - first class
   - first teacher
   - first student import/invite
   - billing/plan page
3. Replace misleading login UI elements that are not implemented.
4. Write a restore runbook and test it from backup.
5. Standardize tenant enforcement in legacy routes.
6. Decide whether manual billing is acceptable for the first paid pilot.

### Before Self-Serve SaaS

1. Add real subscription checkout and lifecycle billing.
2. Add instant workspace activation or a clear approval SLA workflow.
3. Build a true solo-teacher onboarding path if that segment matters.
4. Move planner data fully server-side.
5. Add operator-grade deployment and monitoring docs.

## Top 10 Blockers To Selling StudiesTalk

1. No self-serve customer activation for schools.
2. No real private-teacher product path.
3. Billing is not yet a customer-buyable SaaS experience.
4. Restore/recovery is not operationally documented.
5. Some tenant enforcement still relies on mixed/legacy patterns.
6. SSO appears in UI but is not evidently implemented.
7. First-time onboarding after login is weak.
8. Planner has client-side local-storage behavior that weakens trust and cross-device consistency.
9. Role model is not yet product-clear for customers.
10. Deployment/operations are still engineering-led, not operator-friendly.

## Bottom Line

StudiesTalk is close to being saleable as a managed pilot for a small language school.

It is not yet ready for:

- self-serve SaaS sales
- enterprise sales
- a polished solo private-teacher product

The shortest path to revenue is:

1. target one small language school profile
2. tighten onboarding and tenant safety
3. keep billing manual for the first pilot
4. document restore/deployment so the service can be operated confidently
