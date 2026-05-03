# Route Isolation Matrix

Generated: 2026-05-03T13:21:03.203Z

Route isolation score: 68/100
Total routes: 431
Priority counts: {"ok":202,"P2":229}
Auth counts: {"yes":407,"public":24}

## Review Summary

Routes with explicit auth or intentional-public classification: 431/431
Intentional public routes: 24
Routes still requiring deeper ownership review: 229

## Matrix

| Method | Path | Auth Required | CSRF Required | Role Required | Workspace Ownership | Entity Ownership Helper | Public Reason | Priority | Location |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/privacy` | yes | n/a | yes | public | public | Public page or legal/static entry point. | ok | server.js:5673 |
| GET | `/terms` | yes | n/a | yes | public | public | Public page or legal/static entry point. | ok | server.js:5677 |
| GET | `/impressum` | yes | n/a | yes | public | public | Public page or legal/static entry point. | ok | server.js:5681 |
| GET | `/dpa` | yes | n/a | yes | public | public | Public page or legal/static entry point. | ok | server.js:5685 |
| GET | `/trust` | yes | n/a | yes | public | public | Public page or legal/static entry point. | ok | server.js:5689 |
| GET | `/api/legal/settings` | yes | n/a | yes | public | public | Public legal settings needed by unauthenticated pages. | ok | server.js:5693 |
| GET | `/api/admin/legal-settings` | yes | n/a | yes | review | review |  | P2 | server.js:5710 |
| PUT | `/api/admin/legal-settings` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:5723 |
| POST | `/api/admin/legal-settings/publish` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:5741 |
| GET | `/api/admin/legal-versions` | yes | n/a | yes | review | review |  | P2 | server.js:5767 |
| GET | `/api/admin/legal/subprocessors` | yes | n/a | yes | review | review |  | P2 | server.js:5773 |
| POST | `/api/admin/legal/subprocessors` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:5779 |
| PATCH | `/api/admin/legal/subprocessors/:id` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:5791 |
| DELETE | `/api/admin/legal/subprocessors/:id` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:5803 |
| POST | `/api/admin/legal-versions` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:5812 |
| GET | `/api/admin/data-governance/retention` | yes | n/a | yes | review | review |  | P2 | server.js:5835 |
| POST | `/api/admin/data-governance/retention` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:5841 |
| PUT | `/api/admin/legal-versions/:id` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:5849 |
| POST | `/api/admin/legal-versions/:id/publish` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:5867 |
| GET | `/api/public/legal-settings` | yes | n/a | public | public | public | Intentional public API namespace. | ok | server.js:5897 |
| GET | `/api/public/legal/:documentType` | yes | n/a | public | public | public | Intentional public API namespace. | ok | server.js:5905 |
| GET | `/api/public/settings` | yes | n/a | public | public | public | Intentional public API namespace. | ok | server.js:5931 |
| GET | `/api/legal/required-acceptance` | yes | n/a | review | review | review |  | P2 | server.js:5941 |
| POST | `/api/legal/:documentType/accept` | yes | yes-or-limited | review | review | repository-scoped query |  | P2 | server.js:5964 |
| GET | `/api/workspace/support-access-log` | yes | n/a | yes | yes | review |  | ok | server.js:6060 |
| GET | `/admin` | yes | n/a | yes | yes | review |  | ok | server.js:6220 |
| POST | `/admin/backup-db` | yes | yes-or-limited | yes | yes | review |  | ok | server.js:6224 |
| GET | `/uploads/*` | yes | n/a | review | yes | review |  | ok | server.js:6238 |
| GET | `/.well-known/appspecific/com.chrome.devtools.json` | intentional-public | n/a | public | public | public | Public page or legal/static entry point. | ok | server.js:6330 |
| GET | `/register` | intentional-public | n/a | public | public | public | Public page or legal/static entry point. | ok | server.js:6334 |
| GET | `/attendance/check-in` | intentional-public | n/a | public | public | public | Public attendance check-in token flow. | ok | server.js:6338 |
| GET | `/api/attendance/check-in/public` | intentional-public | n/a | public | public | public | Public attendance check-in token flow. | ok | server.js:6342 |
| GET | `<dynamic>` | intentional-public | n/a | public | public | public | Presenter static route for live class entry. | ok | server.js:6357 |
| POST | `/api/register/otp/send` | intentional-public | yes-or-limited | public | public | public | Registration/invite flow with limiter or token validation. | ok | server.js:6361 |
| POST | `/api/register/otp/verify` | intentional-public | yes-or-limited | public | public | public | Registration/invite flow with limiter or token validation. | ok | server.js:6388 |
| POST | `/api/register/mobile-otp/send` | intentional-public | yes-or-limited | public | public | public | Registration/invite flow with limiter or token validation. | ok | server.js:6414 |
| POST | `/api/register/mobile-otp/verify` | intentional-public | yes-or-limited | public | public | public | Registration/invite flow with limiter or token validation. | ok | server.js:6451 |
| GET | `/api/register/mobile-otp/status` | intentional-public | n/a | public | public | public | Registration/invite flow with limiter or token validation. | ok | server.js:6506 |
| GET | `/api/register/session` | intentional-public | n/a | public | public | public | Registration/invite flow with limiter or token validation. | ok | server.js:6510 |
| POST | `/api/register/session` | intentional-public | yes-or-limited | public | public | public | Registration/invite flow with limiter or token validation. | ok | server.js:6518 |
| GET | `/api/register/session` | intentional-public | n/a | public | public | public | Registration/invite flow with limiter or token validation. | ok | server.js:6538 |
| POST | `/api/register/session` | yes | yes-or-limited | public | public | public | Registration/invite flow with limiter or token validation. | ok | server.js:6546 |
| POST | `/api/register/request-review` | yes | yes-or-limited | public | public | public | Registration/invite flow with limiter or token validation. | ok | server.js:6566 |
| GET | `/reset-password` | yes | n/a | yes | yes | repository-scoped query | Public page or legal/static entry point. | ok | server.js:6627 |
| POST | `/api/register/send-link` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:6793 |
| GET | `/api/register/link/:token` | intentional-public | n/a | public | public | public | Registration/invite flow with limiter or token validation. | ok | server.js:6951 |
| POST | `/api/register/complete` | intentional-public | yes-or-limited | public | public | public | Registration/invite flow with limiter or token validation. | ok | server.js:6988 |
| GET | `/api/register/invite-info` | intentional-public | n/a | yes | yes | repository-scoped query | Registration/invite flow with limiter or token validation. | ok | server.js:7223 |
| GET | `/api/calendar/events` | yes | n/a | review | yes | repository-scoped query |  | ok | server.js:10912 |
| POST | `/api/calendar/events` | yes | yes-or-limited | review | review | repository-scoped query |  | P2 | server.js:11023 |
| PATCH | `/api/calendar/events/:id` | yes | yes-or-limited | review | review | repository-scoped query |  | P2 | server.js:11115 |
| DELETE | `/api/calendar/events/:id` | yes | yes-or-limited | review | review | repository-scoped query |  | P2 | server.js:11198 |
| GET | `/api/events` | yes | n/a | review | review | review |  | P2 | server.js:13013 |
| POST | `/api/uploads` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:13196 |
| POST | `/api/file-events` | yes | yes-or-limited | yes | yes | assertFileAccess |  | ok | server.js:13332 |
| GET | `/api/analytics/files` | yes | n/a | yes | yes | repository-scoped query |  | ok | server.js:13405 |
| GET | `/api/file-stats` | yes | n/a | review | yes | assertFileAccess |  | ok | server.js:13479 |
| POST | `/api/file-stats/increment` | yes | yes-or-limited | yes | yes | assertFileAccess |  | ok | server.js:13530 |
| GET | `/api/files/registry` | yes | n/a | yes | yes | repository-scoped query |  | ok | server.js:13592 |
| POST | `/api/files/:fileId/pin` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:13669 |
| POST | `/api/files/:fileId/delete` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:13701 |
| POST | `/api/files/:fileId/replace` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:13720 |
| GET | `/api/workspaces` | yes | n/a | yes | yes | repository-scoped query |  | ok | server.js:13807 |
| POST | `/api/workspaces` | yes | yes-or-limited | yes | review | repository-scoped query |  | P2 | server.js:13840 |
| DELETE | `/api/workspaces/:workspaceId` | yes | yes-or-limited | yes | review | repository-scoped query |  | P2 | server.js:13936 |
| POST | `/api/workspaces/:workspaceId/logo` | yes | yes-or-limited | review | review | repository-scoped query |  | P2 | server.js:13953 |
| POST | `/api/schools/request` | yes | yes-or-limited | yes | public | public | Public school onboarding request. | ok | server.js:14006 |
| GET | `/api/admin/school-requests` | yes | n/a | yes | review | review |  | P2 | server.js:14044 |
| GET | `/api/admin/school-requests-counts` | yes | n/a | yes | review | review |  | P2 | server.js:14083 |
| GET | `/api/admin/requests/counts` | yes | n/a | yes | review | review |  | P2 | server.js:14092 |
| GET | `/api/admin/requests` | yes | n/a | yes | review | repository-scoped query |  | P2 | server.js:14147 |
| POST | `/api/admin/school-requests/:id/approve` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:14273 |
| POST | `/api/admin/school-requests/:id/create-workspace` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:14290 |
| POST | `/api/admin/school-requests/:id/reject` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:14467 |
| POST | `/api/admin/school-requests/:id/flag` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:14484 |
| POST | `/api/admin/school-requests/bulk` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:14501 |
| POST | `/api/admin/requests/bulk` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:14517 |
| GET | `/api/admin/requests/export.csv` | yes | n/a | yes | review | review |  | P2 | server.js:14662 |
| POST | `/api/admin/requests/export.csv` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:14693 |
| GET | `/api/admin/security/overview` | yes | n/a | yes | review | review |  | P2 | server.js:14717 |
| GET | `/api/admin/security/top-attacks` | yes | n/a | yes | review | review |  | P2 | server.js:14769 |
| GET | `/api/admin/security/failed-by-ip` | yes | n/a | yes | review | review |  | P2 | server.js:14780 |
| POST | `/api/admin/security/ip-block` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:14796 |
| POST | `/api/admin/security/ip-unblock` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:14822 |
| GET | `/api/admin/security/sessions` | yes | n/a | yes | review | review |  | P2 | server.js:14841 |
| POST | `/api/admin/security/sessions/:id/revoke` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:14852 |
| POST | `/api/admin/security/users/:userId/revoke-all-sessions` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:14869 |
| GET | `/api/admin/security/events` | yes | n/a | yes | review | review |  | P2 | server.js:14886 |
| GET | `/api/admin/security/dashboard` | yes | n/a | yes | yes | repository-scoped query |  | ok | server.js:14907 |
| GET | `/api/admin/security/events/export.csv` | yes | n/a | yes | yes | repository-scoped query |  | ok | server.js:14940 |
| GET | `/api/workspaces/:workspaceId/email-settings` | yes | n/a | review | yes | repository-scoped query |  | ok | server.js:14969 |
| POST | `/api/workspaces/:workspaceId/email-settings` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:15010 |
| POST | `/api/workspaces/:workspaceId/email-settings/test` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:15047 |
| GET | `/api/workspaces/:workspaceId/email-templates` | yes | n/a | review | review | review |  | P2 | server.js:15166 |
| GET | `/api/workspaces/:workspaceId/email-templates/:templateKey` | yes | n/a | review | review | review |  | P2 | server.js:15177 |
| PUT | `/api/workspaces/:workspaceId/email-templates/:templateKey` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:15195 |
| POST | `/api/workspaces/:workspaceId/email-templates/:templateKey/reset` | yes | yes-or-limited | yes | yes | repository-scoped query |  | ok | server.js:15238 |
| POST | `/api/workspaces/:workspaceId/email-templates/:templateKey/test` | yes | yes-or-limited | yes | yes | repository-scoped query |  | ok | server.js:15255 |
| GET | `/api/workspaces/:workspaceId/email-inbox` | yes | n/a | review | review | review |  | P2 | server.js:15382 |
| GET | `/api/admin/inbox` | yes | n/a | review | yes | repository-scoped query |  | ok | server.js:15406 |
| POST | `<dynamic>` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:15472 |
| POST | `<dynamic>` | yes | yes-or-limited | review | review | review |  | P2 | server.js:15606 |
| POST | `<dynamic>` | yes | yes-or-limited | review | review | review |  | P2 | server.js:15643 |
| POST | `<dynamic>` | yes | yes-or-limited | review | review | review |  | P2 | server.js:15671 |
| POST | `<dynamic>` | yes | yes-or-limited | review | review | review |  | P2 | server.js:15707 |
| GET | `<dynamic>` | yes | n/a | review | review | review |  | P2 | server.js:15737 |
| GET | `<dynamic>` | yes | n/a | review | review | review |  | P2 | server.js:15776 |
| POST | `<dynamic>` | yes | yes-or-limited | review | review | review |  | P2 | server.js:15822 |
| GET | `/api/classes/:channelId/students` | yes | n/a | yes | yes | canTakeAttendance |  | ok | server.js:15934 |
| GET | `/api/classes/:channelId/attendance` | yes | n/a | yes | yes | canTakeAttendance |  | ok | server.js:16099 |
| POST | `/api/classes/:channelId/attendance/save` | yes | yes-or-limited | yes | yes | canTakeAttendance |  | ok | server.js:16165 |
| POST | `/api/classes/:channelId/attendance/session-code` | yes | yes-or-limited | yes | yes | canTakeAttendance |  | ok | server.js:16346 |
| POST | `/api/attendance/check-in` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:16421 |
| POST | `/api/attendance/check-in/guest` | yes | yes-or-limited | review | review | ensureChannelIsClass |  | P2 | server.js:16514 |
| POST | `/api/classes/:channelId/attendance/records/:studentId` | yes | yes-or-limited | yes | yes | canTakeAttendance |  | ok | server.js:16658 |
| GET | `/api/students/:studentId/attendance` | yes | n/a | yes | yes | canTakeAttendance |  | ok | server.js:16722 |
| POST | `/api/classes/:channelId/attendance/records/:studentId/certificate` | yes | yes-or-limited | yes | yes | canTakeAttendance |  | ok | server.js:16742 |
| GET | `/api/classes/:channelId/attendance/report` | yes | n/a | yes | yes | canTakeAttendance |  | ok | server.js:16870 |
| GET | `/api/classes/:channelId/attendance/report.csv` | yes | n/a | yes | yes | canTakeAttendance |  | ok | server.js:16905 |
| GET | `/api/analytics/school-overview` | yes | n/a | yes | review | review |  | P2 | server.js:16938 |
| GET | `/api/analytics/teacher-overview` | yes | n/a | yes | review | repository-scoped query |  | P2 | server.js:16965 |
| GET | `/api/analytics/student-overview` | yes | n/a | review | review | repository-scoped query |  | P2 | server.js:17004 |
| GET | `/api/students/:studentId/performance` | yes | n/a | review | yes | repository-scoped query |  | ok | server.js:17044 |
| GET | `/api/billing/me` | yes | n/a | review | yes | repository-scoped query |  | ok | server.js:17062 |
| GET | `/api/billing/students` | yes | n/a | review | yes | repository-scoped query |  | ok | server.js:17076 |
| GET | `/api/workspaces/:workspaceId/email-logs` | yes | n/a | review | yes | repository-scoped query |  | ok | server.js:17121 |
| GET | `/api/workspaces/:workspaceId/email-logs/:logId` | yes | n/a | review | yes | repository-scoped query |  | ok | server.js:17147 |
| GET | `<dynamic>` | yes | n/a | review | yes | repository-scoped query |  | ok | server.js:17178 |
| GET | `/api/workspaces/:workspaceId/profile` | yes | n/a | review | yes | repository-scoped query |  | ok | server.js:17203 |
| POST | `/api/workspaces/:workspaceId/profile/registration` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:17247 |
| PATCH | `/api/workspaces/:workspaceId/profile` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:17277 |
| GET | `/api/workspaces/:workspaceId/onboarding` | yes | n/a | review | review | review |  | P2 | server.js:17741 |
| PATCH | `/api/workspaces/:workspaceId/onboarding` | yes | yes-or-limited | review | review | review |  | P2 | server.js:17757 |
| GET | `/api/workspaces/:workspaceId/billing-profile` | yes | n/a | review | review | review |  | P2 | server.js:17799 |
| PATCH | `/api/workspaces/:workspaceId/billing-profile` | yes | yes-or-limited | review | review | review |  | P2 | server.js:17811 |
| PATCH | `/api/workspaces/:workspaceId/onboarding/steps/:stepId` | yes | yes-or-limited | review | review | review |  | P2 | server.js:17869 |
| POST | `/api/workspaces/:workspaceId/onboarding/activate` | yes | yes-or-limited | review | review | review |  | P2 | server.js:17905 |
| GET | `/api/onboarding/:workspaceId` | yes | n/a | review | review | review |  | P2 | server.js:17982 |
| POST | `/api/onboarding/:workspaceId/start` | yes | yes-or-limited | review | review | review |  | P2 | server.js:17993 |
| POST | `/api/onboarding/:workspaceId/auto-open-seen` | yes | yes-or-limited | review | review | review |  | P2 | server.js:18008 |
| POST | `/api/onboarding/:workspaceId/defer` | yes | yes-or-limited | review | review | review |  | P2 | server.js:18024 |
| POST | `/api/onboarding/:workspaceId/resume` | yes | yes-or-limited | review | review | review |  | P2 | server.js:18040 |
| POST | `/api/onboarding/:workspaceId/steps/:stepKey` | yes | yes-or-limited | review | review | review |  | P2 | server.js:18056 |
| POST | `/api/onboarding/:workspaceId/steps/:stepKey/complete` | yes | yes-or-limited | review | review | review |  | P2 | server.js:18077 |
| POST | `/api/onboarding/:workspaceId/steps/:stepKey/skip` | yes | yes-or-limited | yes | yes | review |  | ok | server.js:18094 |
| POST | `/api/onboarding/:workspaceId/complete` | yes | yes-or-limited | yes | yes | review |  | ok | server.js:18111 |
| GET | `/api/onboarding/:workspaceId/activation` | yes | n/a | yes | yes | repository-scoped query |  | ok | server.js:18154 |
| GET | `<dynamic>` | yes | n/a | yes | yes | repository-scoped query |  | ok | server.js:18170 |
| POST | `<dynamic>` | yes | yes-or-limited | yes | yes | repository-scoped query |  | ok | server.js:18218 |
| POST | `<dynamic>` | yes | yes-or-limited | yes | yes | repository-scoped query |  | ok | server.js:18388 |
| PATCH | `/api/users/:userId/native-language` | yes | yes-or-limited | yes | yes | review |  | ok | server.js:18556 |
| PATCH | `/api/users/:userId` | yes | yes-or-limited | yes | yes | review |  | ok | server.js:18603 |
| DELETE | `/api/users/:userId` | yes | yes-or-limited | yes | yes | review |  | ok | server.js:18680 |
| GET | `/api/users/me/preferences` | yes | n/a | yes | review | review |  | P2 | server.js:18706 |
| POST | `/api/users/me/preferences` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:18730 |
| POST | `/api/login` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:18992 |
| POST | `/api/auth/login` | yes | yes-or-limited | yes | public | public | Authentication bootstrap/recovery flow. | ok | server.js:18993 |
| POST | `/api/auth/mfa/setup/start` | intentional-public | yes-or-limited | yes | public | public | Authentication bootstrap/recovery flow. | ok | server.js:18995 |
| POST | `/api/auth/mfa/verify` | intentional-public | yes-or-limited | yes | public | repository-scoped query | Authentication bootstrap/recovery flow. | ok | server.js:19031 |
| GET | `/api/auth/me` | yes | n/a | review | review | review |  | P2 | server.js:19121 |
| GET | `/api/auth/csrf` | intentional-public | n/a | public | public | public | Authentication bootstrap/recovery flow. | ok | server.js:19150 |
| POST | `/api/auth/forgot-password` | intentional-public | yes-or-limited | public | public | public | Authentication bootstrap/recovery flow. | ok | server.js:19155 |
| POST | `/api/auth/reset-password/complete` | intentional-public | yes-or-limited | public | public | public | Authentication bootstrap/recovery flow. | ok | server.js:19204 |
| POST | `/api/auth/refresh` | yes | yes-or-limited | yes | public | public | Authentication bootstrap/recovery flow. | ok | server.js:19295 |
| POST | `/api/auth/logout` | yes | yes-or-limited | yes | review | repository-scoped query |  | P2 | server.js:19378 |
| GET | `/api/tasks` | yes | n/a | review | review | review |  | P2 | server.js:19552 |
| POST | `/api/tasks` | yes | yes-or-limited | review | review | review |  | P2 | server.js:19582 |
| PATCH | `/api/tasks/:id` | yes | yes-or-limited | review | review | review |  | P2 | server.js:19627 |
| POST | `/api/tasks/:id/comments` | yes | yes-or-limited | review | review | review |  | P2 | server.js:19685 |
| GET | `/api/tasks/:id/comments` | yes | n/a | review | yes | review |  | ok | server.js:19717 |
| POST | `/api/task-reactions/toggle` | yes | yes-or-limited | yes | yes | review |  | ok | server.js:19741 |
| GET | `/api/class-memberships` | yes | n/a | review | yes | repository-scoped query |  | ok | server.js:19814 |
| POST | `/api/class-memberships` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:19844 |
| GET | `/api/user-class-memberships` | yes | n/a | review | yes | repository-scoped query |  | ok | server.js:19889 |
| GET | `/api/workspaces/:workspaceId/policy` | yes | n/a | review | review | review |  | P2 | server.js:19919 |
| GET | `/api/policy/acceptance` | yes | n/a | review | review | review |  | P2 | server.js:19954 |
| POST | `/api/workspaces/:workspaceId/policy/accept` | yes | yes-or-limited | review | review | review |  | P2 | server.js:19988 |
| POST | `/api/policy/accept` | yes | yes-or-limited | yes | yes | assertChannelAccess |  | ok | server.js:20039 |
| GET | `/api/channels/:channelId/members` | yes | n/a | yes | yes | assertChannelAccess |  | ok | server.js:20090 |
| POST | `/api/channels/:channelId/members` | yes | yes-or-limited | yes | yes | assertChannelAccess |  | ok | server.js:20101 |
| DELETE | `/api/channels/:channelId/members` | yes | yes-or-limited | yes | yes | assertChannelAccess |  | ok | server.js:20154 |
| GET | `/api/homework/channels/:channelId/board` | yes | n/a | review | review | review |  | P2 | server.js:20202 |
| POST | `/api/homework/channels/:channelId/items` | yes | yes-or-limited | review | review | review |  | P2 | server.js:20226 |
| PATCH | `/api/homework/items/:itemId` | yes | yes-or-limited | review | review | review |  | P2 | server.js:20306 |
| DELETE | `/api/homework/items/:itemId` | yes | yes-or-limited | review | review | review |  | P2 | server.js:20388 |
| POST | `/api/homework/items/:itemId/submissions` | yes | yes-or-limited | review | review | review |  | P2 | server.js:20415 |
| POST | `/api/homework/submissions/:submissionId/review` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:20492 |
| POST | `/api/homework/submissions/:submissionId/comments` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:20533 |
| DELETE | `<dynamic>` | yes | yes-or-limited | yes | yes | review |  | ok | server.js:20575 |
| GET | `<dynamic>` | yes | n/a | yes | yes | review |  | ok | server.js:20632 |
| POST | `<dynamic>` | yes | yes-or-limited | yes | yes | review |  | ok | server.js:20667 |
| PATCH | `<dynamic>` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:20744 |
| DELETE | `<dynamic>` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:20778 |
| GET | `/api/channels/:channelId/messages` | yes | n/a | review | yes | assertChannelAccess |  | ok | server.js:20921 |
| DELETE | `/api/channels/:channelId/messages/clear` | yes | yes-or-limited | yes | yes | assertChannelAccess |  | ok | server.js:21024 |
| GET | `/api/culture/prefs` | yes | n/a | review | yes | assertChannelAccess |  | ok | server.js:21054 |
| POST | `/api/culture/prefs` | yes | yes-or-limited | review | yes | assertChannelAccess |  | ok | server.js:21075 |
| POST | `/api/translate` | yes | yes-or-limited | review | yes | review |  | ok | server.js:21103 |
| GET | `/api/search` | yes | n/a | yes | yes | assertMessageAccess |  | ok | server.js:21316 |
| POST | `/api/channels/:channelId/messages` | yes | yes-or-limited | review | yes | assertChannelAccess |  | ok | server.js:21459 |
| GET | `/api/channels/:channelId/announcements` | yes | n/a | review | review | review |  | P2 | server.js:21620 |
| POST | `/api/channels/:channelId/announcements` | yes | yes-or-limited | review | review | review |  | P2 | server.js:21646 |
| POST | `/api/announcements/:announcementId/read` | yes | yes-or-limited | yes | yes | assertChannelAccess |  | ok | server.js:21690 |
| DELETE | `/api/channels/:channelId/announcements/:announcementId` | yes | yes-or-limited | yes | yes | assertChannelAccess |  | ok | server.js:21731 |
| GET | `/api/channels/:channelId/culture-pref` | yes | n/a | yes | yes | assertChannelAccess |  | ok | server.js:21766 |
| POST | `/api/channels/:channelId/culture-pref` | yes | yes-or-limited | yes | yes | assertChannelAccess |  | ok | server.js:21782 |
| PATCH | `/api/messages/:messageId` | yes | yes-or-limited | yes | yes | assertMessageAccess |  | ok | server.js:21805 |
| DELETE | `/api/messages/:messageId` | yes | yes-or-limited | yes | yes | assertChannelAccess |  | ok | server.js:25376 |
| POST | `/api/channels/:channelId/messages/:messageId/replies` | yes | yes-or-limited | review | yes | assertChannelAccess |  | ok | server.js:25413 |
| POST | `/api/messages/:messageId/reactions` | yes | yes-or-limited | yes | yes | assertChannelAccess |  | ok | server.js:25455 |
| POST | `/api/replies/:replyId/reactions` | yes | yes-or-limited | yes | yes | assertChannelAccess |  | ok | server.js:25480 |
| GET | `/api/live-sessions` | yes | n/a | yes | yes | repository-scoped query |  | ok | server.js:25510 |
| POST | `/api/live-sessions` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:25561 |
| PATCH | `/api/live-sessions/:sessionId` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:25702 |
| DELETE | `/api/live-sessions/:sessionId` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:25810 |
| GET | `/api/live-sessions/:sessionId/state` | yes | n/a | review | yes | resolveLiveSessionAccess |  | ok | server.js:25829 |
| POST | `/api/live-sessions/:sessionId/polls` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:25845 |
| GET | `/api/live-sessions/:sessionId/polls` | yes | n/a | review | yes | resolveLiveSessionAccess |  | ok | server.js:25890 |
| POST | `/api/live-polls/:pollId/open` | yes | yes-or-limited | review | yes | review |  | ok | server.js:25923 |
| POST | `/api/live-polls/:pollId/close` | yes | yes-or-limited | review | yes | review |  | ok | server.js:25947 |
| POST | `/api/live-polls/:pollId/responses` | yes | yes-or-limited | review | yes | review |  | ok | server.js:25971 |
| GET | `/api/live-polls/:pollId/results` | yes | n/a | review | yes | resolveLiveSessionAccess |  | ok | server.js:26045 |
| DELETE | `/api/live-polls/:pollId` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:26077 |
| POST | `/api/live-sessions/:sessionId/breakout-rooms` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:26101 |
| GET | `/api/live-sessions/:sessionId/breakout-rooms` | yes | n/a | review | yes | resolveLiveSessionAccess |  | ok | server.js:26136 |
| POST | `/api/live-breakout-rooms/:roomId/open` | yes | yes-or-limited | review | yes | review |  | ok | server.js:26163 |
| POST | `/api/live-breakout-rooms/:roomId/close` | yes | yes-or-limited | review | yes | review |  | ok | server.js:26191 |
| POST | `/api/live-breakout-rooms/:roomId/members` | yes | yes-or-limited | review | yes | review |  | ok | server.js:26219 |
| DELETE | `/api/live-breakout-rooms/:roomId/members/:userId` | yes | yes-or-limited | review | yes | review |  | ok | server.js:26266 |
| POST | `/api/live-breakout-rooms/:roomId/join` | yes | yes-or-limited | review | yes | review |  | ok | server.js:26298 |
| POST | `/api/live-breakout-rooms/:roomId/leave` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:26369 |
| POST | `/api/live-sessions/:sessionId/start-recording` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:26411 |
| POST | `/api/live-sessions/:sessionId/stop-recording` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:26455 |
| POST | `/api/live-sessions/:sessionId/request-join` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:26476 |
| POST | `/api/live-sessions/:sessionId/recording-consent` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:26561 |
| GET | `/api/live-sessions/:sessionId/recordings` | yes | n/a | review | yes | resolveLiveSessionAccess |  | ok | server.js:26666 |
| GET | `/api/live-recordings/:recordingId/playback` | yes | n/a | review | yes | review |  | ok | server.js:26708 |
| DELETE | `/api/live-recordings/:recordingId` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:26770 |
| POST | `/api/live-sessions/:sessionId/recordings/attach-dev-file` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:26810 |
| POST | `/api/live-sessions/:sessionId/participants/:userId/approve` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:26892 |
| POST | `/api/live-sessions/:sessionId/participants/:userId/deny` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:26940 |
| POST | `/api/live-sessions/:sessionId/join` | yes | yes-or-limited | yes | yes | resolveLiveSessionAccess |  | ok | server.js:26990 |
| POST | `/api/live-sessions/:sessionId/leave` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:27124 |
| POST | `/api/live-sessions/:sessionId/hand/raise` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:27179 |
| POST | `/api/live-sessions/:sessionId/hand/lower` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:27227 |
| GET | `/api/live-sessions/:sessionId/whiteboard/stream` | yes | n/a | review | yes | resolveLiveSessionAccess |  | ok | server.js:27278 |
| GET | `/api/live-sessions/:sessionId/whiteboard/state` | yes | n/a | review | yes | resolveLiveSessionAccess |  | ok | server.js:27312 |
| POST | `/api/live-sessions/:sessionId/whiteboard/draw` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:27330 |
| POST | `/api/live-sessions/:sessionId/whiteboard/erase` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:27366 |
| POST | `/api/live-sessions/:sessionId/whiteboard/clear` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:27402 |
| GET | `/api/live-sessions/:sessionId/attendance` | yes | n/a | review | yes | resolveLiveSessionAccess |  | ok | server.js:27424 |
| POST | `/api/live-sessions/:sessionId/attendance` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess |  | ok | server.js:27441 |
| GET | `/api/live-sessions/:sessionId/slides/stream` | yes | n/a | review | yes | review |  | ok | server.js:27521 |
| GET | `/api/live-sessions/:sessionId/slides/state` | yes | n/a | review | yes | review |  | ok | server.js:27553 |
| POST | `/api/live-sessions/:sessionId/slides/page` | yes | yes-or-limited | review | yes | review |  | ok | server.js:27576 |
| POST | `/api/live-sessions/:sessionId/slides/deck` | yes | yes-or-limited | review | yes | assertDmAccess |  | ok | server.js:27616 |
| POST | `/api/live-sessions/:sessionId/end` | yes | yes-or-limited | review | yes | assertDmAccess |  | ok | server.js:27645 |
| POST | `/api/dms/:dmId/messages/:messageId/replies` | yes | yes-or-limited | review | yes | assertDmAccess |  | ok | server.js:27657 |
| POST | `/api/dm-replies/:replyId/reactions` | yes | yes-or-limited | yes | yes | assertDmAccess |  | ok | server.js:27737 |
| GET | `/api/dms` | yes | n/a | yes | yes | assertDmAccess |  | ok | server.js:27815 |
| POST | `/api/dms` | yes | yes-or-limited | review | yes | assertDmAccess |  | ok | server.js:27859 |
| DELETE | `/api/dms/:dmId` | yes | yes-or-limited | review | yes | assertDmAccess |  | ok | server.js:27898 |
| GET | `/api/dms/:dmId/members` | yes | n/a | review | yes | assertDmAccess |  | ok | server.js:27925 |
| POST | `/api/dms/:dmId/members` | yes | yes-or-limited | review | yes | assertDmAccess |  | ok | server.js:27949 |
| DELETE | `/api/dms/:dmId/members` | yes | yes-or-limited | review | yes | assertDmAccess |  | ok | server.js:27985 |
| GET | `/api/dms/:dmId/messages` | yes | n/a | review | yes | assertDmAccess |  | ok | server.js:28013 |
| POST | `/api/dms/:dmId/messages` | yes | yes-or-limited | review | yes | assertDmAccess |  | ok | server.js:28032 |
| POST | `/api/dms/:dmId/messages/:messageId/reactions` | yes | yes-or-limited | yes | yes | assertDmAccess |  | ok | server.js:28096 |
| GET | `/api/knowledge/search` | yes | n/a | yes | review | review |  | P2 | server.js:29608 |
| POST | `/api/knowledge/upsert` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:29619 |
| POST | `/api/ai/chat` | yes | yes-or-limited | review | review | review |  | P2 | server.js:29902 |
| POST | `/api/ai/chat_stream` | yes | yes-or-limited | review | review | review |  | P2 | server.js:29958 |
| GET | `/api/ai/budget` | yes | n/a | review | review | review |  | P2 | server.js:30060 |
| GET | `/api/ai/budget/summary` | yes | n/a | review | review | review |  | P2 | server.js:30080 |
| POST | `/api/ai/usage` | yes | yes-or-limited | review | review | review |  | P2 | server.js:30094 |
| POST | `<dynamic>` | yes | yes-or-limited | review | review | review |  | P2 | server.js:30190 |
| POST | `/api/ai/runtime/start` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:30269 |
| POST | `/api/ai/runtime/heartbeat` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:30285 |
| POST | `/api/ai/runtime/end` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:30303 |
| POST | `/api/ai/conversation/start` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:30341 |
| POST | `/api/ai/conversation/:id/messages` | yes | yes-or-limited | review | yes | repository-scoped query |  | ok | server.js:30358 |
| GET | `/api/ai/conversation/latest` | yes | n/a | yes | yes | repository-scoped query |  | ok | server.js:30398 |
| GET | `/api/ai/conversation/:id` | yes | n/a | yes | yes | repository-scoped query |  | ok | server.js:30425 |
| POST | `/api/ai/conversation/:id/end` | yes | yes-or-limited | yes | yes | repository-scoped query |  | ok | server.js:30443 |
| GET | `/api/admin/me` | yes | n/a | yes | review | repository-scoped query |  | P2 | server.js:30520 |
| GET | `/api/admin/owner-email-settings` | yes | n/a | yes | yes | repository-scoped query |  | ok | server.js:30563 |
| POST | `/api/admin/owner-email-settings` | yes | yes-or-limited | yes | yes | repository-scoped query |  | ok | server.js:30569 |
| POST | `/api/admin/owner-email-settings/test` | yes | yes-or-limited | yes | yes | repository-scoped query |  | ok | server.js:30583 |
| GET | `/api/admin/workspace-email-settings/:workspaceId` | yes | n/a | yes | review | review |  | P2 | server.js:31040 |
| POST | `/api/admin/workspace-email-settings/:workspaceId` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:31048 |
| POST | `/api/admin/workspace-email-settings/:workspaceId/test` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:31092 |
| GET | `/api/admin/email-control/overview` | yes | n/a | yes | review | review |  | P2 | server.js:31124 |
| GET | `/api/admin/email-control/logs` | yes | n/a | yes | review | review |  | P2 | server.js:31131 |
| GET | `/api/admin/email-control/settings` | yes | n/a | yes | review | review |  | P2 | server.js:31142 |
| POST | `/api/admin/email-control/owner` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:31149 |
| POST | `/api/admin/email-control/workspace` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:31169 |
| POST | `/api/admin/email-control/test-send` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:31229 |
| POST | `/api/admin/email-control/logs/:id/retry` | yes | yes-or-limited | yes | review | repository-scoped query |  | P2 | server.js:31338 |
| GET | `/api/admin/email-control/templates` | yes | n/a | yes | review | review |  | P2 | server.js:31400 |
| GET | `/api/admin/workspaces` | yes | n/a | yes | review | review |  | P2 | server.js:31407 |
| GET | `/api/admin/approved-requests-missing-workspace` | yes | n/a | yes | review | review |  | P2 | server.js:31413 |
| POST | `/api/admin/workspaces/upsert` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:31447 |
| DELETE | `/api/admin/workspaces/:workspaceId` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:31491 |
| GET | `/api/admin/users` | yes | n/a | yes | review | review |  | P2 | server.js:31516 |
| PATCH | `/api/admin/users/:id` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:31548 |
| DELETE | `/api/admin/users/:id` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:31580 |
| GET | `/api/admin/overview` | yes | n/a | yes | review | review |  | P2 | server.js:31600 |
| GET | `/api/admin/billing/:workspaceId` | yes | n/a | yes | review | review |  | P2 | server.js:31632 |
| PATCH | `/api/admin/billing/:workspaceId/profile` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:31657 |
| GET | `/api/admin/billing/stripe/status` | yes | n/a | yes | yes | review |  | ok | server.js:31685 |
| POST | `/api/admin/billing/stripe/workspaces/:workspaceId/checkout-session` | yes | yes-or-limited | yes | yes | review |  | ok | server.js:31691 |
| POST | `/api/admin/billing/stripe/workspaces/:workspaceId/portal-session` | yes | yes-or-limited | yes | yes | review |  | ok | server.js:31725 |
| POST | `/api/billing/create-checkout-session` | yes | yes-or-limited | yes | yes | review |  | ok | server.js:31751 |
| GET | `/api/billing/customer-portal` | yes | n/a | yes | yes | review |  | ok | server.js:31801 |
| POST | `/api/billing/webhook` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:31854 |
| POST | `/api/billing/stripe/webhook` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:31855 |
| POST | `/api/admin/invoices` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:31857 |
| POST | `/api/admin/invoices/:invoiceId/mark-paid` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:31924 |
| GET | `/api/admin/workspace-settings/:workspaceId` | yes | n/a | yes | review | review |  | P2 | server.js:31947 |
| PUT | `/api/admin/workspace-settings/:workspaceId` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:31966 |
| GET | `/api/admin/audit` | yes | n/a | yes | review | review |  | P2 | server.js:31985 |
| GET | `/api/admin/secrets` | yes | n/a | yes | review | review |  | P2 | server.js:31993 |
| GET | `/api/admin/secrets/:provider` | yes | n/a | yes | review | review |  | P2 | server.js:32004 |
| PUT | `/api/admin/secrets/:provider/:keyName` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:32021 |
| POST | `/api/admin/secrets/:provider/:keyName/rotate` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:32041 |
| DELETE | `/api/admin/secrets/:provider/:keyName` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:32060 |
| POST | `/api/admin/secrets/:provider/test` | yes | yes-or-limited | yes | review | review |  | P2 | server.js:32078 |
| GET | `/health` | intentional-public | n/a | yes | public | public | Health/status endpoint; safe response only. | ok | server.js:32211 |
| GET | `/health/deep` | intentional-public | n/a | yes | yes | repository-scoped query | Health/status endpoint; safe response only. | ok | server.js:32219 |
| GET | `/api/ai/health` | intentional-public | n/a | yes | yes | repository-scoped query | Health/status endpoint; safe response only. | ok | server.js:32224 |
| GET | `/api/classes/:channelId/meta` | yes | n/a | yes | yes | review |  | ok | server.js:32329 |
| PUT | `/api/classes/:channelId/meta` | yes | yes-or-limited | review | yes | review |  | ok | server.js:32355 |
| GET | `/` | yes | n/a | yes | public | public | Public page or legal/static entry point. | ok | server/routes/admin.aiBudget.routes.js:28 |
| GET | `/default` | yes | n/a | yes | review | review |  | P2 | server/routes/admin.aiBudget.routes.js:40 |
| POST | `/default` | yes | yes-or-limited | yes | review | review |  | P2 | server/routes/admin.aiBudget.routes.js:58 |
| POST | `/workspace/:id` | yes | yes-or-limited | yes | yes | repository-scoped query |  | ok | server/routes/admin.aiBudget.routes.js:84 |
| POST | `/` | yes | yes-or-limited | yes | yes | repository-scoped query | Public page or legal/static entry point. | ok | server/routes/admin.aiBudget.routes.js:109 |
| GET | `/workspace/:id/usage` | yes | n/a | yes | yes | repository-scoped query |  | ok | server/routes/admin.aiBudget.routes.js:139 |
| POST | `/reset` | yes | yes-or-limited | yes | yes | repository-scoped query |  | ok | server/routes/admin.aiBudget.routes.js:151 |
| GET | `/overview` | yes | n/a | review | review | review |  | P2 | server/routes/admin.costControl.routes.js:36 |
| GET | `/workspaces/:workspaceId/summary` | yes | n/a | review | review | review |  | P2 | server/routes/admin.costControl.routes.js:48 |
| GET | `/providers/:providerKey/summary` | yes | n/a | review | review | review |  | P2 | server/routes/admin.costControl.routes.js:64 |
| GET | `/limits` | yes | n/a | review | review | review |  | P2 | server/routes/admin.costControl.routes.js:80 |
| POST | `/limits` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/admin.costControl.routes.js:93 |
| DELETE | `/limits/:id` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/admin.costControl.routes.js:125 |
| GET | `/alerts` | yes | n/a | review | review | review |  | P2 | server/routes/admin.costControl.routes.js:139 |
| POST | `/alerts/:id/acknowledge` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/admin.costControl.routes.js:151 |
| GET | `/export.csv` | yes | n/a | review | review | review |  | P2 | server/routes/admin.costControl.routes.js:163 |
| GET | `/` | yes | n/a | public | public | public | Public page or legal/static entry point. | ok | server/routes/admin.paymentGateways.routes.js:41 |
| GET | `/events` | yes | n/a | review | review | review |  | P2 | server/routes/admin.paymentGateways.routes.js:45 |
| POST | `/active-provider` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/admin.paymentGateways.routes.js:49 |
| POST | `/:provider/test` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/admin.paymentGateways.routes.js:55 |
| POST | `/:provider/rotate` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/admin.paymentGateways.routes.js:61 |
| POST | `/:provider` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/admin.paymentGateways.routes.js:67 |
| DELETE | `/:provider/:keyName` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/admin.paymentGateways.routes.js:73 |
| GET | `/campaigns` | yes | n/a | review | review | review |  | P2 | server/routes/notificationControl.routes.js:46 |
| POST | `/campaigns` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:54 |
| GET | `/campaigns/:id` | yes | n/a | review | review | review |  | P2 | server/routes/notificationControl.routes.js:60 |
| PATCH | `/campaigns/:id` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:64 |
| DELETE | `/campaigns/:id` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:70 |
| POST | `/campaigns/:id/estimate` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:76 |
| POST | `/campaigns/:id/build-deliveries` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:80 |
| POST | `/campaigns/:id/send` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:86 |
| POST | `/campaigns/:id/send-in-app` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:100 |
| POST | `/campaigns/:id/send-email` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:114 |
| POST | `/campaigns/:id/send-sms` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:128 |
| POST | `/campaigns/:id/cancel` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:142 |
| GET | `/campaigns/:id/stats` | yes | n/a | review | review | review |  | P2 | server/routes/notificationControl.routes.js:148 |
| GET | `/deliveries` | yes | n/a | review | review | review |  | P2 | server/routes/notificationControl.routes.js:152 |
| POST | `/deliveries/:id/retry` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:164 |
| POST | `/deliveries/:id/retry-in-app` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:174 |
| POST | `/deliveries/:id/retry-email` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:184 |
| POST | `/deliveries/:id/retry-sms` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:194 |
| GET | `/automation-rules` | yes | n/a | review | review | review |  | P2 | server/routes/notificationControl.routes.js:204 |
| POST | `/automation-rules` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:208 |
| PATCH | `/automation-rules` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:214 |
| DELETE | `/automation-rules` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:221 |
| PATCH | `/automation-rules/:id` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:228 |
| DELETE | `/automation-rules/:id` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:234 |
| POST | `/automation-rules/:id/test` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:240 |
| GET | `/templates` | yes | n/a | review | review | review |  | P2 | server/routes/notificationControl.routes.js:249 |
| POST | `/templates` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/notificationControl.routes.js:253 |
| GET | `/global` | yes | n/a | review | review | review |  | P2 | server/routes/platformControl.routes.js:36 |
| PATCH | `/global` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformControl.routes.js:47 |
| POST | `/global/reset` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformControl.routes.js:59 |
| GET | `/workspaces/:workspaceId` | yes | n/a | review | review | review |  | P2 | server/routes/platformControl.routes.js:71 |
| PATCH | `/workspaces/:workspaceId` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformControl.routes.js:85 |
| DELETE | `/workspaces/:workspaceId` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformControl.routes.js:100 |
| GET | `/effective/:workspaceId` | yes | n/a | review | review | review |  | P2 | server/routes/platformControl.routes.js:114 |
| GET | `/features/:workspaceId` | yes | n/a | review | review | review |  | P2 | server/routes/platformControl.routes.js:128 |
| GET | `/providers/:workspaceId` | yes | n/a | review | review | review |  | P2 | server/routes/platformControl.routes.js:142 |
| GET | `/subscription-plans` | yes | n/a | review | review | review |  | P2 | server/routes/platformControl.routes.js:156 |
| GET | `/operations/health` | yes | n/a | yes | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:47 |
| GET | `/operations/logs/summary` | yes | n/a | yes | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:51 |
| GET | `/operations/jobs` | yes | n/a | yes | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:55 |
| POST | `/operations/test-provider/:providerKey` | yes | yes-or-limited | yes | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:59 |
| GET | `/backups/status` | yes | n/a | yes | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:65 |
| POST | `/backups/run` | yes | yes-or-limited | yes | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:69 |
| GET | `/backups/history` | yes | n/a | yes | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:75 |
| GET | `/backups/evidence` | yes | n/a | yes | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:79 |
| POST | `/backups/restore-dry-run` | yes | yes-or-limited | yes | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:83 |
| GET | `/workspaces/lifecycle` | yes | n/a | yes | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:89 |
| POST | `/workspaces/:workspaceId/${routeAction}` | yes | yes-or-limited | yes | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:103 |
| POST | `/support/impersonation/start` | yes | yes-or-limited | yes | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:117 |
| POST | `/support/impersonation/end` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:138 |
| GET | `/support/impersonation/active` | yes | n/a | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:147 |
| GET | `/support/audit/export` | yes | n/a | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:160 |
| GET | `/incidents` | yes | n/a | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:171 |
| POST | `/incidents` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:175 |
| PATCH | `/incidents/:id` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:181 |
| POST | `/maintenance` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:187 |
| GET | `/data-governance/overview` | yes | n/a | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:193 |
| POST | `/data-governance/export/:workspaceId` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:197 |
| POST | `/data-governance/delete-request` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:209 |
| GET | `/data-governance/delete-requests` | yes | n/a | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:221 |
| GET | `/notifications` | yes | n/a | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:225 |
| POST | `/notifications` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:229 |
| POST | `/notifications/:id/send` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:235 |
| POST | `/notifications/:id/retry` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:241 |
| DELETE | `/notifications/:id` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:247 |
| GET | `/subscription-automation/overview` | yes | n/a | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:253 |
| POST | `/subscription-automation/sync` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:257 |
| PATCH | `/subscription-automation/workspaces/:workspaceId` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:263 |
| GET | `/branding` | yes | n/a | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:269 |
| PATCH | `/branding/platform` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:273 |
| PATCH | `/branding/workspaces/:workspaceId` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:279 |
| POST | `/branding/domains/:workspaceId/verify` | yes | yes-or-limited | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:285 |
| GET | `/reports/overview` | yes | n/a | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:291 |
| GET | `/reports/export.csv` | yes | n/a | review | review | review |  | P2 | server/routes/platformOwnerControl.routes.js:295 |
| GET | `/` | yes | n/a | public | public | public | Public page or legal/static entry point. | ok | server/routes/platformSettings.routes.js:122 |
| PUT | `/` | yes | yes-or-limited | public | public | public | Public page or legal/static entry point. | ok | server/routes/platformSettings.routes.js:134 |
