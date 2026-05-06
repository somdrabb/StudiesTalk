# Route Isolation Matrix

Generated: 2026-05-03T20:08:31.150Z

Route isolation score: 95/100
Total routes: 431
Priority counts: {"ok":329,"P2":102}
Auth counts: {"public":39,"yes":392}
Group counts: {"other":138,"admin/platform owner":95,"workspace":16,"calendar/live":50,"reports/export":10,"AI/search":28,"email":26,"billing":15,"onboarding":14,"homework":7,"notification":32}
Review by group: {"admin/platform owner":2,"calendar/live":26,"other":46,"email":4,"workspace":5,"onboarding":9,"billing":2,"AI/search":8}

## Review Summary

Routes with explicit auth or intentional-public classification: 431/431
Intentional public routes: 39
Routes still requiring deeper ownership review: 102

## P2 Review Groups

| Group | Count | Example routes |
|---|---:|---|
| other | 46 | GET /api/events<br>POST /api/uploads<br>GET /api/file-stats<br>POST /api/files/:fileId/pin<br>POST /api/files/:fileId/delete |
| calendar/live | 26 | GET /api/calendar/events<br>POST /api/calendar/events<br>PATCH /api/calendar/events/:id<br>DELETE /api/calendar/events/:id<br>PATCH /api/live-sessions/:sessionId |
| onboarding | 9 | GET /api/workspaces/:workspaceId/onboarding<br>PATCH /api/workspaces/:workspaceId/onboarding<br>PATCH /api/workspaces/:workspaceId/onboarding/steps/:stepId<br>POST /api/workspaces/:workspaceId/onboarding/activate<br>GET /api/onboarding/:workspaceId |
| AI/search | 8 | POST /api/ai/chat<br>GET /api/ai/budget<br>GET /api/ai/budget/summary<br>POST /api/ai/usage<br>POST /api/ai/runtime/start |
| workspace | 5 | GET /api/workspaces/:workspaceId/profile<br>POST /api/workspaces/:workspaceId/profile/registration<br>PATCH /api/workspaces/:workspaceId/profile<br>GET /api/workspaces/:workspaceId/policy<br>POST /api/workspaces/:workspaceId/policy/accept |
| email | 4 | GET /api/workspaces/:workspaceId/email-settings<br>POST /api/workspaces/:workspaceId/email-settings<br>POST /api/workspaces/:workspaceId/email-settings/test<br>GET /api/workspaces/:workspaceId/email-logs/:logId |
| admin/platform owner | 2 | GET /api/legal/required-acceptance<br>POST /api/legal/:documentType/accept |
| billing | 2 | GET /api/workspaces/:workspaceId/billing-profile<br>PATCH /api/workspaces/:workspaceId/billing-profile |

## Matrix

| Group | Method | Path | Auth Required | CSRF Required | Role Required | Workspace Ownership | Entity Ownership Helper | Audit Proof | Public Reason | Priority | Location |
|---|---|---|---|---|---|---|---|---|---|---|---|
| other | GET | `/privacy` | intentional-public | n/a | public | public | public | n/a | Public page or legal/static entry point. | ok | server.js:5673 |
| other | GET | `/terms` | intentional-public | n/a | public | public | public | n/a | Public page or legal/static entry point. | ok | server.js:5677 |
| other | GET | `/impressum` | intentional-public | n/a | public | public | public | n/a | Public page or legal/static entry point. | ok | server.js:5681 |
| other | GET | `/dpa` | intentional-public | n/a | public | public | public | n/a | Public page or legal/static entry point. | ok | server.js:5685 |
| other | GET | `/trust` | intentional-public | n/a | public | public | public | n/a | Public page or legal/static entry point. | ok | server.js:5689 |
| admin/platform owner | GET | `/api/legal/settings` | intentional-public | n/a | public | public | public | n/a | Public legal settings needed by unauthenticated pages. | ok | server.js:5693 |
| admin/platform owner | GET | `/api/admin/legal-settings` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:5710 |
| admin/platform owner | PUT | `/api/admin/legal-settings` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:5723 |
| admin/platform owner | POST | `/api/admin/legal-settings/publish` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:5741 |
| admin/platform owner | GET | `/api/admin/legal-versions` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:5767 |
| admin/platform owner | GET | `/api/admin/legal/subprocessors` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:5773 |
| admin/platform owner | POST | `/api/admin/legal/subprocessors` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:5779 |
| admin/platform owner | PATCH | `/api/admin/legal/subprocessors/:id` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:5791 |
| admin/platform owner | DELETE | `/api/admin/legal/subprocessors/:id` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:5803 |
| admin/platform owner | POST | `/api/admin/legal-versions` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:5812 |
| admin/platform owner | GET | `/api/admin/data-governance/retention` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:5835 |
| admin/platform owner | POST | `/api/admin/data-governance/retention` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:5841 |
| admin/platform owner | PUT | `/api/admin/legal-versions/:id` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:5849 |
| admin/platform owner | POST | `/api/admin/legal-versions/:id/publish` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:5867 |
| admin/platform owner | GET | `/api/public/legal-settings` | intentional-public | n/a | public | public | public | n/a | Intentional public API namespace. | ok | server.js:5897 |
| admin/platform owner | GET | `/api/public/legal/:documentType` | intentional-public | n/a | public | public | public | n/a | Intentional public API namespace. | ok | server.js:5905 |
| other | GET | `/api/public/settings` | intentional-public | n/a | public | public | public | n/a | Intentional public API namespace. | ok | server.js:5931 |
| admin/platform owner | GET | `/api/legal/required-acceptance` | yes | n/a | review | yes | self check | yes |  | P2 | server.js:5941 |
| admin/platform owner | POST | `/api/legal/:documentType/accept` | yes | yes-or-limited | review | yes | self check | yes |  | P2 | server.js:5964 |
| workspace | GET | `/api/workspace/support-access-log` | yes | n/a | yes | yes | self check | yes |  | ok | server.js:6060 |
| other | GET | `/admin` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:6220 |
| other | POST | `/admin/backup-db` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:6224 |
| other | GET | `/uploads/*` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:6238 |
| other | GET | `/.well-known/appspecific/com.chrome.devtools.json` | intentional-public | n/a | public | public | public | n/a | Public page or legal/static entry point. | ok | server.js:6330 |
| other | GET | `/register` | intentional-public | n/a | public | public | public | n/a | Public page or legal/static entry point. | ok | server.js:6334 |
| calendar/live | GET | `/attendance/check-in` | intentional-public | n/a | public | public | public | n/a | Public attendance check-in token flow. | ok | server.js:6338 |
| calendar/live | GET | `/api/attendance/check-in/public` | intentional-public | n/a | public | public | public | n/a | Public attendance check-in token flow. | ok | server.js:6342 |
| other | GET | `<dynamic>` | intentional-public | n/a | public | public | public | n/a | Presenter static route for live class entry. | ok | server.js:6357 |
| other | POST | `/api/register/otp/send` | intentional-public | yes-or-limited | public | public | public | n/a | Registration/invite flow with limiter or token validation. | ok | server.js:6361 |
| other | POST | `/api/register/otp/verify` | intentional-public | yes-or-limited | public | public | public | n/a | Registration/invite flow with limiter or token validation. | ok | server.js:6388 |
| other | POST | `/api/register/mobile-otp/send` | intentional-public | yes-or-limited | public | public | public | n/a | Registration/invite flow with limiter or token validation. | ok | server.js:6414 |
| other | POST | `/api/register/mobile-otp/verify` | intentional-public | yes-or-limited | public | public | public | n/a | Registration/invite flow with limiter or token validation. | ok | server.js:6451 |
| other | GET | `/api/register/mobile-otp/status` | intentional-public | n/a | public | public | public | n/a | Registration/invite flow with limiter or token validation. | ok | server.js:6506 |
| other | GET | `/api/register/session` | intentional-public | n/a | public | public | public | n/a | Registration/invite flow with limiter or token validation. | ok | server.js:6510 |
| other | POST | `/api/register/session` | intentional-public | yes-or-limited | public | public | public | n/a | Registration/invite flow with limiter or token validation. | ok | server.js:6518 |
| other | GET | `/api/register/session` | intentional-public | n/a | public | public | public | n/a | Registration/invite flow with limiter or token validation. | ok | server.js:6538 |
| other | POST | `/api/register/session` | intentional-public | yes-or-limited | public | public | public | n/a | Registration/invite flow with limiter or token validation. | ok | server.js:6546 |
| other | POST | `/api/register/request-review` | intentional-public | yes-or-limited | public | public | public | n/a | Registration/invite flow with limiter or token validation. | ok | server.js:6566 |
| other | GET | `/reset-password` | intentional-public | n/a | public | public | public | n/a | Public page or legal/static entry point. | ok | server.js:6627 |
| other | POST | `/api/register/send-link` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server.js:6793 |
| other | GET | `/api/register/link/:token` | intentional-public | n/a | public | public | public | n/a | Registration/invite flow with limiter or token validation. | ok | server.js:6951 |
| other | POST | `/api/register/complete` | intentional-public | yes-or-limited | public | public | public | n/a | Registration/invite flow with limiter or token validation. | ok | server.js:6988 |
| other | GET | `/api/register/invite-info` | intentional-public | n/a | public | public | public | n/a | Registration/invite flow with limiter or token validation. | ok | server.js:7223 |
| calendar/live | GET | `/api/calendar/events` | yes | n/a | review | yes | self check | review |  | P2 | server.js:10912 |
| calendar/live | POST | `/api/calendar/events` | yes | yes-or-limited | review | yes | self check | yes |  | P2 | server.js:11023 |
| calendar/live | PATCH | `/api/calendar/events/:id` | yes | yes-or-limited | review | yes | self check | yes |  | P2 | server.js:11115 |
| calendar/live | DELETE | `/api/calendar/events/:id` | yes | yes-or-limited | review | yes | self check | yes |  | P2 | server.js:11198 |
| other | GET | `/api/events` | yes | n/a | review | yes | self check | yes |  | P2 | server.js:13013 |
| other | POST | `/api/uploads` | yes | yes-or-limited | review | yes | repository-scoped query | review |  | P2 | server.js:13196 |
| other | POST | `/api/file-events` | yes | yes-or-limited | yes | yes | assertFileAccess | review |  | ok | server.js:13332 |
| other | GET | `/api/analytics/files` | yes | n/a | yes | yes | assertFileAccess | review |  | ok | server.js:13405 |
| other | GET | `/api/file-stats` | yes | n/a | review | yes | assertFileAccess | review |  | P2 | server.js:13479 |
| other | POST | `/api/file-stats/increment` | yes | yes-or-limited | yes | yes | assertFileAccess | review |  | ok | server.js:13530 |
| other | GET | `/api/files/registry` | yes | n/a | yes | yes | repository-scoped query | review |  | ok | server.js:13592 |
| other | POST | `/api/files/:fileId/pin` | yes | yes-or-limited | review | yes | repository-scoped query | review |  | P2 | server.js:13669 |
| other | POST | `/api/files/:fileId/delete` | yes | yes-or-limited | review | yes | self check | review |  | P2 | server.js:13701 |
| other | POST | `/api/files/:fileId/replace` | yes | yes-or-limited | review | yes | self check | review |  | P2 | server.js:13720 |
| workspace | GET | `/api/workspaces` | yes | n/a | yes | yes | self check | review |  | ok | server.js:13807 |
| workspace | POST | `/api/workspaces` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | review |  | ok | server.js:13840 |
| workspace | DELETE | `/api/workspaces/:workspaceId` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | review |  | ok | server.js:13936 |
| workspace | POST | `/api/workspaces/:workspaceId/logo` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | review |  | ok | server.js:13953 |
| other | POST | `/api/schools/request` | intentional-public | yes-or-limited | public | public | public | n/a | Public school onboarding request. | ok | server.js:14006 |
| admin/platform owner | GET | `/api/admin/school-requests` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14044 |
| admin/platform owner | GET | `/api/admin/school-requests-counts` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14083 |
| admin/platform owner | GET | `/api/admin/requests/counts` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14092 |
| admin/platform owner | GET | `/api/admin/requests` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14147 |
| admin/platform owner | POST | `/api/admin/school-requests/:id/approve` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14273 |
| admin/platform owner | POST | `/api/admin/school-requests/:id/create-workspace` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14290 |
| admin/platform owner | POST | `/api/admin/school-requests/:id/reject` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14467 |
| admin/platform owner | POST | `/api/admin/school-requests/:id/flag` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14484 |
| admin/platform owner | POST | `/api/admin/school-requests/bulk` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14501 |
| admin/platform owner | POST | `/api/admin/requests/bulk` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14517 |
| reports/export | GET | `/api/admin/requests/export.csv` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14662 |
| reports/export | POST | `/api/admin/requests/export.csv` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14693 |
| admin/platform owner | GET | `/api/admin/security/overview` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14717 |
| admin/platform owner | GET | `/api/admin/security/top-attacks` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14769 |
| AI/search | GET | `/api/admin/security/failed-by-ip` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14780 |
| admin/platform owner | POST | `/api/admin/security/ip-block` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14796 |
| admin/platform owner | POST | `/api/admin/security/ip-unblock` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14822 |
| admin/platform owner | GET | `/api/admin/security/sessions` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14841 |
| admin/platform owner | POST | `/api/admin/security/sessions/:id/revoke` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14852 |
| admin/platform owner | POST | `/api/admin/security/users/:userId/revoke-all-sessions` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14869 |
| admin/platform owner | GET | `/api/admin/security/events` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14886 |
| admin/platform owner | GET | `/api/admin/security/dashboard` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:14907 |
| reports/export | GET | `/api/admin/security/events/export.csv` | yes | n/a | yes | yes | self check | yes |  | ok | server.js:14940 |
| email | GET | `/api/workspaces/:workspaceId/email-settings` | yes | n/a | review | yes | self check | review |  | P2 | server.js:14969 |
| email | POST | `/api/workspaces/:workspaceId/email-settings` | yes | yes-or-limited | review | yes | self check | review |  | P2 | server.js:15010 |
| email | POST | `/api/workspaces/:workspaceId/email-settings/test` | yes | yes-or-limited | review | yes | self check | review |  | P2 | server.js:15047 |
| email | GET | `/api/workspaces/:workspaceId/email-templates` | yes | n/a | yes | yes | repository-scoped query | review |  | ok | server.js:15166 |
| email | GET | `/api/workspaces/:workspaceId/email-templates/:templateKey` | yes | n/a | yes | yes | repository-scoped query | review |  | ok | server.js:15177 |
| email | PUT | `/api/workspaces/:workspaceId/email-templates/:templateKey` | yes | yes-or-limited | yes | yes | repository-scoped query | review |  | ok | server.js:15195 |
| email | POST | `/api/workspaces/:workspaceId/email-templates/:templateKey/reset` | yes | yes-or-limited | yes | yes | repository-scoped query | review |  | ok | server.js:15238 |
| email | POST | `/api/workspaces/:workspaceId/email-templates/:templateKey/test` | yes | yes-or-limited | yes | yes | repository-scoped query | review |  | ok | server.js:15255 |
| email | GET | `/api/workspaces/:workspaceId/email-inbox` | yes | n/a | yes | yes | self check | review |  | ok | server.js:15382 |
| email | GET | `/api/admin/inbox` | yes | n/a | yes | yes | self check | yes |  | ok | server.js:15406 |
| other | POST | `<dynamic>` | yes | yes-or-limited | yes | yes | self check | review |  | ok | server.js:15472 |
| other | POST | `<dynamic>` | yes | yes-or-limited | review | yes | self check | review |  | P2 | server.js:15606 |
| other | POST | `<dynamic>` | yes | yes-or-limited | review | yes | self check | review |  | P2 | server.js:15643 |
| other | POST | `<dynamic>` | yes | yes-or-limited | review | yes | self check | review |  | P2 | server.js:15671 |
| other | POST | `<dynamic>` | yes | yes-or-limited | review | yes | self check | review |  | P2 | server.js:15707 |
| other | GET | `<dynamic>` | yes | n/a | review | yes | self check | review |  | P2 | server.js:15737 |
| other | GET | `<dynamic>` | yes | n/a | review | yes | self check | review |  | P2 | server.js:15776 |
| other | POST | `<dynamic>` | yes | yes-or-limited | yes | yes | canTakeAttendance | review |  | ok | server.js:15822 |
| calendar/live | GET | `/api/classes/:channelId/students` | yes | n/a | yes | yes | canTakeAttendance | review |  | ok | server.js:15934 |
| calendar/live | GET | `/api/classes/:channelId/attendance` | yes | n/a | yes | yes | canTakeAttendance | review |  | ok | server.js:16099 |
| calendar/live | POST | `/api/classes/:channelId/attendance/save` | yes | yes-or-limited | yes | yes | canTakeAttendance | review |  | ok | server.js:16165 |
| calendar/live | POST | `/api/classes/:channelId/attendance/session-code` | yes | yes-or-limited | yes | yes | canTakeAttendance | yes |  | ok | server.js:16346 |
| calendar/live | POST | `/api/attendance/check-in` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server.js:16421 |
| calendar/live | POST | `/api/attendance/check-in/guest` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server.js:16514 |
| calendar/live | POST | `/api/classes/:channelId/attendance/records/:studentId` | yes | yes-or-limited | yes | yes | canTakeAttendance | yes |  | ok | server.js:16658 |
| calendar/live | GET | `/api/students/:studentId/attendance` | yes | n/a | yes | yes | canTakeAttendance | yes |  | ok | server.js:16722 |
| calendar/live | POST | `/api/classes/:channelId/attendance/records/:studentId/certificate` | yes | yes-or-limited | yes | yes | canTakeAttendance | yes |  | ok | server.js:16742 |
| reports/export | GET | `/api/classes/:channelId/attendance/report` | yes | n/a | yes | yes | canTakeAttendance | review |  | ok | server.js:16870 |
| reports/export | GET | `/api/classes/:channelId/attendance/report.csv` | yes | n/a | yes | yes | canTakeAttendance | review |  | ok | server.js:16905 |
| other | GET | `/api/analytics/school-overview` | yes | n/a | yes | yes | validateAttendanceReportStudentFilter | review |  | ok | server.js:16938 |
| other | GET | `/api/analytics/teacher-overview` | yes | n/a | yes | yes | self check | review |  | ok | server.js:16965 |
| other | GET | `/api/analytics/student-overview` | yes | n/a | yes | yes | self check | review |  | ok | server.js:17004 |
| other | GET | `/api/students/:studentId/performance` | yes | n/a | yes | yes | self check | review |  | ok | server.js:17044 |
| billing | GET | `/api/billing/me` | yes | n/a | yes | yes | self check | review |  | ok | server.js:17062 |
| billing | GET | `/api/billing/students` | yes | n/a | yes | yes | self check | review |  | ok | server.js:17076 |
| email | GET | `/api/workspaces/:workspaceId/email-logs` | yes | n/a | yes | yes | self check | review |  | ok | server.js:17121 |
| email | GET | `/api/workspaces/:workspaceId/email-logs/:logId` | yes | n/a | review | yes | self check | review |  | P2 | server.js:17147 |
| other | GET | `<dynamic>` | yes | n/a | review | yes | self check | review |  | P2 | server.js:17178 |
| workspace | GET | `/api/workspaces/:workspaceId/profile` | yes | n/a | review | yes | self check | review |  | P2 | server.js:17203 |
| workspace | POST | `/api/workspaces/:workspaceId/profile/registration` | yes | yes-or-limited | review | yes | repository-scoped query | review |  | P2 | server.js:17247 |
| workspace | PATCH | `/api/workspaces/:workspaceId/profile` | yes | yes-or-limited | review | yes | repository-scoped query | review |  | P2 | server.js:17277 |
| onboarding | GET | `/api/workspaces/:workspaceId/onboarding` | yes | n/a | review | yes | self check | yes |  | P2 | server.js:17741 |
| onboarding | PATCH | `/api/workspaces/:workspaceId/onboarding` | yes | yes-or-limited | review | yes | self check | yes |  | P2 | server.js:17757 |
| billing | GET | `/api/workspaces/:workspaceId/billing-profile` | yes | n/a | review | yes | self check | yes |  | P2 | server.js:17799 |
| billing | PATCH | `/api/workspaces/:workspaceId/billing-profile` | yes | yes-or-limited | review | yes | self check | yes |  | P2 | server.js:17811 |
| onboarding | PATCH | `/api/workspaces/:workspaceId/onboarding/steps/:stepId` | yes | yes-or-limited | review | yes | self check | yes |  | P2 | server.js:17869 |
| onboarding | POST | `/api/workspaces/:workspaceId/onboarding/activate` | yes | yes-or-limited | review | yes | self check | yes |  | P2 | server.js:17905 |
| onboarding | GET | `/api/onboarding/:workspaceId` | yes | n/a | review | yes | self check | review |  | P2 | server.js:17982 |
| onboarding | POST | `/api/onboarding/:workspaceId/start` | yes | yes-or-limited | review | yes | self check | review |  | P2 | server.js:17993 |
| onboarding | POST | `/api/onboarding/:workspaceId/auto-open-seen` | yes | yes-or-limited | review | yes | self check | review |  | P2 | server.js:18008 |
| onboarding | POST | `/api/onboarding/:workspaceId/defer` | yes | yes-or-limited | review | yes | self check | review |  | P2 | server.js:18024 |
| onboarding | POST | `/api/onboarding/:workspaceId/resume` | yes | yes-or-limited | review | yes | self check | review |  | P2 | server.js:18040 |
| onboarding | POST | `/api/onboarding/:workspaceId/steps/:stepKey` | yes | yes-or-limited | yes | yes | self check | review |  | ok | server.js:18056 |
| onboarding | POST | `/api/onboarding/:workspaceId/steps/:stepKey/complete` | yes | yes-or-limited | yes | yes | self check | review |  | ok | server.js:18077 |
| onboarding | POST | `/api/onboarding/:workspaceId/steps/:stepKey/skip` | yes | yes-or-limited | yes | yes | self check | review |  | ok | server.js:18094 |
| onboarding | POST | `/api/onboarding/:workspaceId/complete` | yes | yes-or-limited | yes | yes | self check | review |  | ok | server.js:18111 |
| onboarding | GET | `/api/onboarding/:workspaceId/activation` | yes | n/a | yes | yes | self check | yes |  | ok | server.js:18154 |
| other | GET | `<dynamic>` | yes | n/a | yes | yes | self check | yes |  | ok | server.js:18170 |
| other | POST | `<dynamic>` | yes | yes-or-limited | yes | yes | self check | yes |  | ok | server.js:18218 |
| other | POST | `<dynamic>` | yes | yes-or-limited | yes | yes | repository-scoped query | review |  | ok | server.js:18388 |
| other | PATCH | `/api/users/:userId/native-language` | yes | yes-or-limited | yes | yes | self check | yes |  | ok | server.js:18556 |
| other | PATCH | `/api/users/:userId` | yes | yes-or-limited | yes | yes | self check | review |  | ok | server.js:18603 |
| other | DELETE | `/api/users/:userId` | yes | yes-or-limited | yes | yes | self check | yes |  | ok | server.js:18680 |
| other | GET | `/api/users/me/preferences` | yes | n/a | yes | yes | self check | yes |  | ok | server.js:18706 |
| other | POST | `/api/users/me/preferences` | yes | yes-or-limited | yes | yes | self check | yes |  | ok | server.js:18730 |
| other | POST | `/api/login` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server.js:18992 |
| other | POST | `/api/auth/login` | intentional-public | yes-or-limited | public | public | public | n/a | Authentication bootstrap/recovery flow. | ok | server.js:18993 |
| other | POST | `/api/auth/mfa/setup/start` | intentional-public | yes-or-limited | public | public | public | n/a | Authentication bootstrap/recovery flow. | ok | server.js:18995 |
| other | POST | `/api/auth/mfa/verify` | intentional-public | yes-or-limited | public | public | public | n/a | Authentication bootstrap/recovery flow. | ok | server.js:19031 |
| other | GET | `/api/auth/me` | yes | n/a | review | yes | self check | yes |  | P2 | server.js:19121 |
| other | GET | `/api/auth/csrf` | intentional-public | n/a | public | public | public | n/a | Authentication bootstrap/recovery flow. | ok | server.js:19150 |
| other | POST | `/api/auth/forgot-password` | intentional-public | yes-or-limited | public | public | public | n/a | Authentication bootstrap/recovery flow. | ok | server.js:19155 |
| other | POST | `/api/auth/reset-password/complete` | intentional-public | yes-or-limited | public | public | public | n/a | Authentication bootstrap/recovery flow. | ok | server.js:19204 |
| other | POST | `/api/auth/refresh` | intentional-public | yes-or-limited | public | public | public | n/a | Authentication bootstrap/recovery flow. | ok | server.js:19295 |
| other | POST | `/api/auth/logout` | yes | yes-or-limited | yes | yes | self check | yes |  | ok | server.js:19378 |
| other | GET | `/api/tasks` | yes | n/a | review | yes | self check | review |  | P2 | server.js:19552 |
| other | POST | `/api/tasks` | yes | yes-or-limited | review | yes | self check | review |  | P2 | server.js:19582 |
| other | PATCH | `/api/tasks/:id` | yes | yes-or-limited | review | yes | self check | review |  | P2 | server.js:19627 |
| other | POST | `/api/tasks/:id/comments` | yes | yes-or-limited | review | yes | resolveHomeworkRequestContext | review |  | P2 | server.js:19685 |
| other | GET | `/api/tasks/:id/comments` | yes | n/a | yes | yes | resolveHomeworkRequestContext | review |  | ok | server.js:19717 |
| other | POST | `/api/task-reactions/toggle` | yes | yes-or-limited | yes | yes | resolveHomeworkRequestContext | review |  | ok | server.js:19741 |
| other | GET | `/api/class-memberships` | yes | n/a | yes | yes | self check | review |  | ok | server.js:19814 |
| other | POST | `/api/class-memberships` | yes | yes-or-limited | review | yes | self check | review |  | P2 | server.js:19844 |
| other | GET | `/api/user-class-memberships` | yes | n/a | review | yes | self check | review |  | P2 | server.js:19889 |
| workspace | GET | `/api/workspaces/:workspaceId/policy` | yes | n/a | review | yes | self check | review |  | P2 | server.js:19919 |
| other | GET | `/api/policy/acceptance` | yes | n/a | review | yes | self check | review |  | P2 | server.js:19954 |
| workspace | POST | `/api/workspaces/:workspaceId/policy/accept` | yes | yes-or-limited | review | yes | assertChannelAccess | review |  | P2 | server.js:19988 |
| other | POST | `/api/policy/accept` | yes | yes-or-limited | yes | yes | assertChannelAccess | review |  | ok | server.js:20039 |
| other | GET | `/api/channels/:channelId/members` | yes | n/a | yes | yes | assertChannelAccess | review |  | ok | server.js:20090 |
| other | POST | `/api/channels/:channelId/members` | yes | yes-or-limited | yes | yes | assertChannelAccess | review |  | ok | server.js:20101 |
| other | DELETE | `/api/channels/:channelId/members` | yes | yes-or-limited | yes | yes | assertChannelAccess | review |  | ok | server.js:20154 |
| homework | GET | `/api/homework/channels/:channelId/board` | yes | n/a | yes | yes | assertChannelAccess | review |  | ok | server.js:20202 |
| homework | POST | `/api/homework/channels/:channelId/items` | yes | yes-or-limited | yes | yes | resolveHomeworkRequestContext | review |  | ok | server.js:20226 |
| homework | PATCH | `/api/homework/items/:itemId` | yes | yes-or-limited | yes | yes | resolveHomeworkRequestContext | review |  | ok | server.js:20306 |
| homework | DELETE | `/api/homework/items/:itemId` | yes | yes-or-limited | yes | yes | resolveHomeworkRequestContext | review |  | ok | server.js:20388 |
| homework | POST | `/api/homework/items/:itemId/submissions` | yes | yes-or-limited | yes | yes | resolveHomeworkRequestContext | review |  | ok | server.js:20415 |
| homework | POST | `/api/homework/submissions/:submissionId/review` | yes | yes-or-limited | yes | yes | resolveHomeworkRequestContext | review |  | ok | server.js:20492 |
| homework | POST | `/api/homework/submissions/:submissionId/comments` | yes | yes-or-limited | yes | yes | resolveHomeworkRequestContext | review |  | ok | server.js:20533 |
| other | DELETE | `<dynamic>` | yes | yes-or-limited | yes | yes | self check | review |  | ok | server.js:20575 |
| other | GET | `<dynamic>` | yes | n/a | yes | yes | self check | review |  | ok | server.js:20632 |
| other | POST | `<dynamic>` | yes | yes-or-limited | yes | yes | self check | review |  | ok | server.js:20667 |
| other | PATCH | `<dynamic>` | yes | yes-or-limited | yes | yes | self check | yes |  | ok | server.js:20744 |
| other | DELETE | `<dynamic>` | yes | yes-or-limited | yes | yes | self check | yes |  | ok | server.js:20778 |
| other | GET | `/api/channels/:channelId/messages` | yes | n/a | yes | yes | assertChannelAccess | review |  | ok | server.js:20921 |
| other | DELETE | `/api/channels/:channelId/messages/clear` | yes | yes-or-limited | yes | yes | assertChannelAccess | yes |  | ok | server.js:21024 |
| other | GET | `/api/culture/prefs` | yes | n/a | yes | yes | assertChannelAccess | yes |  | ok | server.js:21054 |
| other | POST | `/api/culture/prefs` | yes | yes-or-limited | review | yes | assertChannelAccess | review |  | P2 | server.js:21075 |
| other | POST | `/api/translate` | yes | yes-or-limited | review | yes | assertChannelAccess | review |  | P2 | server.js:21103 |
| AI/search | GET | `/api/search` | yes | n/a | yes | yes | assertDmAccess | review |  | ok | server.js:21316 |
| other | POST | `/api/channels/:channelId/messages` | yes | yes-or-limited | review | yes | assertChannelAccess | review |  | P2 | server.js:21459 |
| other | GET | `/api/channels/:channelId/announcements` | yes | n/a | review | yes | review | review |  | P2 | server.js:21620 |
| other | POST | `/api/channels/:channelId/announcements` | yes | yes-or-limited | yes | yes | review | review |  | P2 | server.js:21646 |
| other | POST | `/api/announcements/:announcementId/read` | yes | yes-or-limited | yes | yes | assertChannelAccess | review |  | ok | server.js:21690 |
| other | DELETE | `/api/channels/:channelId/announcements/:announcementId` | yes | yes-or-limited | yes | yes | assertChannelAccess | review |  | ok | server.js:21731 |
| other | GET | `/api/channels/:channelId/culture-pref` | yes | n/a | yes | yes | assertChannelAccess | review |  | ok | server.js:21766 |
| other | POST | `/api/channels/:channelId/culture-pref` | yes | yes-or-limited | yes | yes | assertChannelAccess | review |  | ok | server.js:21782 |
| other | PATCH | `/api/messages/:messageId` | yes | yes-or-limited | yes | yes | assertChannelAccess | review |  | ok | server.js:21805 |
| other | DELETE | `/api/messages/:messageId` | yes | yes-or-limited | yes | yes | assertChannelAccess | yes |  | ok | server.js:25376 |
| other | POST | `/api/channels/:channelId/messages/:messageId/replies` | yes | yes-or-limited | yes | yes | assertChannelAccess | yes |  | ok | server.js:25413 |
| other | POST | `/api/messages/:messageId/reactions` | yes | yes-or-limited | yes | yes | assertChannelAccess | review |  | ok | server.js:25455 |
| other | POST | `/api/replies/:replyId/reactions` | yes | yes-or-limited | yes | yes | assertChannelAccess | review |  | ok | server.js:25480 |
| calendar/live | GET | `/api/live-sessions` | yes | n/a | yes | yes | assertChannelAccess | review |  | ok | server.js:25510 |
| calendar/live | POST | `/api/live-sessions` | yes | yes-or-limited | yes | yes | canUserViewLiveSession | review |  | ok | server.js:25561 |
| calendar/live | PATCH | `/api/live-sessions/:sessionId` | yes | yes-or-limited | yes | yes | review | review |  | P2 | server.js:25702 |
| calendar/live | DELETE | `/api/live-sessions/:sessionId` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:25810 |
| calendar/live | GET | `/api/live-sessions/:sessionId/state` | yes | n/a | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:25829 |
| calendar/live | POST | `/api/live-sessions/:sessionId/polls` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:25845 |
| calendar/live | GET | `/api/live-sessions/:sessionId/polls` | yes | n/a | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:25890 |
| other | POST | `/api/live-polls/:pollId/open` | yes | yes-or-limited | review | yes | repository-scoped query | review |  | P2 | server.js:25923 |
| other | POST | `/api/live-polls/:pollId/close` | yes | yes-or-limited | review | yes | repository-scoped query | review |  | P2 | server.js:25947 |
| other | POST | `/api/live-polls/:pollId/responses` | yes | yes-or-limited | review | yes | repository-scoped query | review |  | P2 | server.js:25971 |
| other | GET | `/api/live-polls/:pollId/results` | yes | n/a | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:26045 |
| other | DELETE | `/api/live-polls/:pollId` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:26077 |
| calendar/live | POST | `/api/live-sessions/:sessionId/breakout-rooms` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:26101 |
| calendar/live | GET | `/api/live-sessions/:sessionId/breakout-rooms` | yes | n/a | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:26136 |
| other | POST | `/api/live-breakout-rooms/:roomId/open` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:26163 |
| other | POST | `/api/live-breakout-rooms/:roomId/close` | yes | yes-or-limited | review | yes | review | review |  | P2 | server.js:26191 |
| other | POST | `/api/live-breakout-rooms/:roomId/members` | yes | yes-or-limited | review | yes | review | review |  | P2 | server.js:26219 |
| other | DELETE | `/api/live-breakout-rooms/:roomId/members/:userId` | yes | yes-or-limited | review | yes | review | review |  | P2 | server.js:26266 |
| other | POST | `/api/live-breakout-rooms/:roomId/join` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:26298 |
| other | POST | `/api/live-breakout-rooms/:roomId/leave` | yes | yes-or-limited | yes | yes | resolveLiveSessionAccess | review |  | ok | server.js:26369 |
| calendar/live | POST | `/api/live-sessions/:sessionId/start-recording` | yes | yes-or-limited | yes | yes | resolveLiveSessionAccess | review |  | ok | server.js:26411 |
| calendar/live | POST | `/api/live-sessions/:sessionId/stop-recording` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:26455 |
| calendar/live | POST | `/api/live-sessions/:sessionId/request-join` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:26476 |
| calendar/live | POST | `/api/live-sessions/:sessionId/recording-consent` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:26561 |
| calendar/live | GET | `/api/live-sessions/:sessionId/recordings` | yes | n/a | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:26666 |
| other | GET | `/api/live-recordings/:recordingId/playback` | yes | n/a | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:26708 |
| other | DELETE | `/api/live-recordings/:recordingId` | yes | yes-or-limited | yes | yes | resolveLiveSessionAccess | review |  | ok | server.js:26770 |
| calendar/live | POST | `/api/live-sessions/:sessionId/recordings/attach-dev-file` | yes | yes-or-limited | yes | yes | resolveLiveSessionAccess | review |  | ok | server.js:26810 |
| calendar/live | POST | `/api/live-sessions/:sessionId/participants/:userId/approve` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:26892 |
| calendar/live | POST | `/api/live-sessions/:sessionId/participants/:userId/deny` | yes | yes-or-limited | yes | yes | resolveLiveSessionAccess | review |  | ok | server.js:26940 |
| calendar/live | POST | `/api/live-sessions/:sessionId/join` | yes | yes-or-limited | yes | yes | resolveLiveSessionAccess | review |  | ok | server.js:26990 |
| calendar/live | POST | `/api/live-sessions/:sessionId/leave` | yes | yes-or-limited | yes | yes | resolveLiveSessionAccess | review |  | ok | server.js:27124 |
| calendar/live | POST | `/api/live-sessions/:sessionId/hand/raise` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:27179 |
| calendar/live | POST | `/api/live-sessions/:sessionId/hand/lower` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:27227 |
| calendar/live | GET | `/api/live-sessions/:sessionId/whiteboard/stream` | yes | n/a | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:27278 |
| calendar/live | GET | `/api/live-sessions/:sessionId/whiteboard/state` | yes | n/a | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:27312 |
| calendar/live | POST | `/api/live-sessions/:sessionId/whiteboard/draw` | yes | yes-or-limited | review | yes | resolveLiveSessionAccess | review |  | P2 | server.js:27330 |
| calendar/live | POST | `/api/live-sessions/:sessionId/whiteboard/erase` | yes | yes-or-limited | yes | yes | resolveLiveSessionAccess | review |  | ok | server.js:27366 |
| calendar/live | POST | `/api/live-sessions/:sessionId/whiteboard/clear` | yes | yes-or-limited | yes | yes | resolveLiveSessionAccess | review |  | ok | server.js:27402 |
| calendar/live | GET | `/api/live-sessions/:sessionId/attendance` | yes | n/a | yes | yes | resolveLiveSessionAccess | review |  | ok | server.js:27424 |
| calendar/live | POST | `/api/live-sessions/:sessionId/attendance` | yes | yes-or-limited | yes | yes | resolveLiveSessionAccess | review |  | ok | server.js:27441 |
| calendar/live | GET | `/api/live-sessions/:sessionId/slides/stream` | yes | n/a | yes | yes | canUserViewLiveSession | review |  | ok | server.js:27521 |
| calendar/live | GET | `/api/live-sessions/:sessionId/slides/state` | yes | n/a | review | yes | assertDmAccess | review |  | P2 | server.js:27553 |
| calendar/live | POST | `/api/live-sessions/:sessionId/slides/page` | yes | yes-or-limited | review | yes | assertDmAccess | review |  | P2 | server.js:27576 |
| calendar/live | POST | `/api/live-sessions/:sessionId/slides/deck` | yes | yes-or-limited | review | yes | assertDmAccess | review |  | P2 | server.js:27616 |
| calendar/live | POST | `/api/live-sessions/:sessionId/end` | yes | yes-or-limited | review | yes | assertDmAccess | review |  | P2 | server.js:27645 |
| other | POST | `/api/dms/:dmId/messages/:messageId/replies` | yes | yes-or-limited | review | yes | assertDmAccess | review |  | P2 | server.js:27657 |
| other | POST | `/api/dm-replies/:replyId/reactions` | yes | yes-or-limited | yes | yes | assertDmAccess | review |  | ok | server.js:27737 |
| other | GET | `/api/dms` | yes | n/a | yes | yes | assertDmAccess | review |  | ok | server.js:27815 |
| other | POST | `/api/dms` | yes | yes-or-limited | review | yes | assertDmAccess | review |  | P2 | server.js:27859 |
| other | DELETE | `/api/dms/:dmId` | yes | yes-or-limited | review | yes | assertDmAccess | review |  | P2 | server.js:27898 |
| other | GET | `/api/dms/:dmId/members` | yes | n/a | review | yes | assertDmAccess | review |  | P2 | server.js:27925 |
| other | POST | `/api/dms/:dmId/members` | yes | yes-or-limited | review | yes | assertDmAccess | review |  | P2 | server.js:27949 |
| other | DELETE | `/api/dms/:dmId/members` | yes | yes-or-limited | review | yes | assertDmAccess | review |  | P2 | server.js:27985 |
| other | GET | `/api/dms/:dmId/messages` | yes | n/a | review | yes | assertDmAccess | review |  | P2 | server.js:28013 |
| other | POST | `/api/dms/:dmId/messages` | yes | yes-or-limited | review | yes | assertDmAccess | review |  | P2 | server.js:28032 |
| other | POST | `/api/dms/:dmId/messages/:messageId/reactions` | yes | yes-or-limited | yes | yes | assertDmAccess | review |  | ok | server.js:28096 |
| AI/search | GET | `/api/knowledge/search` | yes | n/a | yes | yes | self check | review |  | ok | server.js:29608 |
| AI/search | POST | `/api/knowledge/upsert` | yes | yes-or-limited | yes | yes | self check | review |  | ok | server.js:29619 |
| AI/search | POST | `/api/ai/chat` | yes | yes-or-limited | yes | review | review | review |  | P2 | server.js:29902 |
| AI/search | POST | `/api/ai/chat_stream` | yes | yes-or-limited | yes | yes | self check | review |  | ok | server.js:29958 |
| AI/search | GET | `/api/ai/budget` | yes | n/a | review | yes | self check | review |  | P2 | server.js:30060 |
| AI/search | GET | `/api/ai/budget/summary` | yes | n/a | review | yes | self check | review |  | P2 | server.js:30080 |
| AI/search | POST | `/api/ai/usage` | yes | yes-or-limited | review | yes | review | review |  | P2 | server.js:30094 |
| other | POST | `<dynamic>` | yes | yes-or-limited | review | yes | review | review |  | P2 | server.js:30190 |
| AI/search | POST | `/api/ai/runtime/start` | yes | yes-or-limited | review | yes | repository-scoped query | review |  | P2 | server.js:30269 |
| AI/search | POST | `/api/ai/runtime/heartbeat` | yes | yes-or-limited | review | yes | repository-scoped query | review |  | P2 | server.js:30285 |
| AI/search | POST | `/api/ai/runtime/end` | yes | yes-or-limited | review | yes | repository-scoped query | review |  | P2 | server.js:30303 |
| AI/search | POST | `/api/ai/conversation/start` | yes | yes-or-limited | review | yes | repository-scoped query | review |  | P2 | server.js:30341 |
| AI/search | POST | `/api/ai/conversation/:id/messages` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | review |  | ok | server.js:30358 |
| AI/search | GET | `/api/ai/conversation/latest` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:30398 |
| AI/search | GET | `/api/ai/conversation/:id` | yes | n/a | yes | yes | self check | yes |  | ok | server.js:30425 |
| AI/search | POST | `/api/ai/conversation/:id/end` | yes | yes-or-limited | yes | yes | self check | yes |  | ok | server.js:30443 |
| admin/platform owner | GET | `/api/admin/me` | yes | n/a | yes | yes | self check | yes |  | ok | server.js:30520 |
| email | GET | `/api/admin/owner-email-settings` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:30563 |
| email | POST | `/api/admin/owner-email-settings` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:30569 |
| email | POST | `/api/admin/owner-email-settings/test` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:30583 |
| email | GET | `/api/admin/workspace-email-settings/:workspaceId` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31040 |
| email | POST | `/api/admin/workspace-email-settings/:workspaceId` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31048 |
| email | POST | `/api/admin/workspace-email-settings/:workspaceId/test` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31092 |
| email | GET | `/api/admin/email-control/overview` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31124 |
| email | GET | `/api/admin/email-control/logs` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31131 |
| email | GET | `/api/admin/email-control/settings` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31142 |
| email | POST | `/api/admin/email-control/owner` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31149 |
| email | POST | `/api/admin/email-control/workspace` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31169 |
| email | POST | `/api/admin/email-control/test-send` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31229 |
| email | POST | `/api/admin/email-control/logs/:id/retry` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31338 |
| email | GET | `/api/admin/email-control/templates` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31400 |
| admin/platform owner | GET | `/api/admin/workspaces` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31407 |
| admin/platform owner | GET | `/api/admin/approved-requests-missing-workspace` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31413 |
| admin/platform owner | POST | `/api/admin/workspaces/upsert` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31447 |
| admin/platform owner | DELETE | `/api/admin/workspaces/:workspaceId` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31491 |
| admin/platform owner | GET | `/api/admin/users` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31516 |
| admin/platform owner | PATCH | `/api/admin/users/:id` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31548 |
| admin/platform owner | DELETE | `/api/admin/users/:id` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31580 |
| admin/platform owner | GET | `/api/admin/overview` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31600 |
| billing | GET | `/api/admin/billing/:workspaceId` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31632 |
| billing | PATCH | `/api/admin/billing/:workspaceId/profile` | yes | yes-or-limited | yes | yes | self check | yes |  | ok | server.js:31657 |
| billing | GET | `/api/admin/billing/stripe/status` | yes | n/a | yes | yes | self check | yes |  | ok | server.js:31685 |
| billing | POST | `/api/admin/billing/stripe/workspaces/:workspaceId/checkout-session` | yes | yes-or-limited | yes | yes | self check | yes |  | ok | server.js:31691 |
| billing | POST | `/api/admin/billing/stripe/workspaces/:workspaceId/portal-session` | yes | yes-or-limited | yes | yes | self check | yes |  | ok | server.js:31725 |
| billing | POST | `/api/billing/create-checkout-session` | yes | yes-or-limited | yes | yes | self check | yes |  | ok | server.js:31751 |
| billing | GET | `/api/billing/customer-portal` | yes | n/a | yes | yes | self check | yes |  | ok | server.js:31801 |
| billing | POST | `/api/billing/webhook` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31854 |
| billing | POST | `/api/billing/stripe/webhook` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31855 |
| billing | POST | `/api/admin/invoices` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31857 |
| billing | POST | `/api/admin/invoices/:invoiceId/mark-paid` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31924 |
| admin/platform owner | GET | `/api/admin/workspace-settings/:workspaceId` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31947 |
| admin/platform owner | PUT | `/api/admin/workspace-settings/:workspaceId` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31966 |
| admin/platform owner | GET | `/api/admin/audit` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31985 |
| admin/platform owner | GET | `/api/admin/secrets` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:31993 |
| admin/platform owner | GET | `/api/admin/secrets/:provider` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:32004 |
| admin/platform owner | PUT | `/api/admin/secrets/:provider/:keyName` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:32021 |
| admin/platform owner | POST | `/api/admin/secrets/:provider/:keyName/rotate` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:32041 |
| admin/platform owner | DELETE | `/api/admin/secrets/:provider/:keyName` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:32060 |
| admin/platform owner | POST | `/api/admin/secrets/:provider/test` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server.js:32078 |
| other | GET | `/health` | intentional-public | n/a | public | public | public | n/a | Health/status endpoint; safe response only. | ok | server.js:32211 |
| other | GET | `/health/deep` | intentional-public | n/a | public | public | public | n/a | Health/status endpoint; safe response only. | ok | server.js:32219 |
| AI/search | GET | `/api/ai/health` | intentional-public | n/a | public | public | public | n/a | Health/status endpoint; safe response only. | ok | server.js:32224 |
| calendar/live | GET | `/api/classes/:channelId/meta` | yes | n/a | yes | yes | repository-scoped query | review |  | ok | server.js:32329 |
| calendar/live | PUT | `/api/classes/:channelId/meta` | yes | yes-or-limited | yes | yes | review | review |  | P2 | server.js:32355 |
| AI/search | GET | `/` | yes | n/a | yes | yes | self check | review |  | ok | server/routes/admin.aiBudget.routes.js:28 |
| AI/search | GET | `/default` | yes | n/a | yes | yes | self check | review |  | ok | server/routes/admin.aiBudget.routes.js:40 |
| AI/search | POST | `/default` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | review |  | ok | server/routes/admin.aiBudget.routes.js:58 |
| AI/search | POST | `/workspace/:id` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | review |  | ok | server/routes/admin.aiBudget.routes.js:84 |
| AI/search | POST | `/` | yes | yes-or-limited | yes | yes | repository-scoped query | review |  | ok | server/routes/admin.aiBudget.routes.js:109 |
| AI/search | GET | `/workspace/:id/usage` | yes | n/a | yes | yes | repository-scoped query | review |  | ok | server/routes/admin.aiBudget.routes.js:139 |
| AI/search | POST | `/reset` | yes | yes-or-limited | yes | yes | repository-scoped query | review |  | ok | server/routes/admin.aiBudget.routes.js:151 |
| admin/platform owner | GET | `/overview` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server/routes/admin.costControl.routes.js:36 |
| admin/platform owner | GET | `/workspaces/:workspaceId/summary` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/admin.costControl.routes.js:48 |
| admin/platform owner | GET | `/providers/:providerKey/summary` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/admin.costControl.routes.js:64 |
| admin/platform owner | GET | `/limits` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/admin.costControl.routes.js:80 |
| admin/platform owner | POST | `/limits` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/admin.costControl.routes.js:93 |
| admin/platform owner | DELETE | `/limits/:id` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/admin.costControl.routes.js:125 |
| admin/platform owner | GET | `/alerts` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/admin.costControl.routes.js:139 |
| AI/search | POST | `/alerts/:id/acknowledge` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/admin.costControl.routes.js:151 |
| reports/export | GET | `/export.csv` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/admin.costControl.routes.js:163 |
| admin/platform owner | GET | `/` | yes | n/a | yes | yes | self check | yes |  | ok | server/routes/admin.paymentGateways.routes.js:41 |
| admin/platform owner | GET | `/events` | yes | n/a | yes | yes | self check | yes |  | ok | server/routes/admin.paymentGateways.routes.js:45 |
| admin/platform owner | POST | `/active-provider` | yes | yes-or-limited | yes | yes | self check | yes |  | ok | server/routes/admin.paymentGateways.routes.js:49 |
| admin/platform owner | POST | `/:provider/test` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server/routes/admin.paymentGateways.routes.js:55 |
| admin/platform owner | POST | `/:provider/rotate` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/admin.paymentGateways.routes.js:61 |
| admin/platform owner | POST | `/:provider` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/admin.paymentGateways.routes.js:67 |
| admin/platform owner | DELETE | `/:provider/:keyName` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/admin.paymentGateways.routes.js:73 |
| notification | GET | `/campaigns` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:46 |
| notification | POST | `/campaigns` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:54 |
| notification | GET | `/campaigns/:id` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:60 |
| notification | PATCH | `/campaigns/:id` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:64 |
| notification | DELETE | `/campaigns/:id` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:70 |
| notification | POST | `/campaigns/:id/estimate` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:76 |
| notification | POST | `/campaigns/:id/build-deliveries` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:80 |
| notification | POST | `/campaigns/:id/send` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:86 |
| notification | POST | `/campaigns/:id/send-in-app` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:100 |
| notification | POST | `/campaigns/:id/send-email` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:114 |
| notification | POST | `/campaigns/:id/send-sms` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:128 |
| notification | POST | `/campaigns/:id/cancel` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:142 |
| notification | GET | `/campaigns/:id/stats` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:148 |
| notification | GET | `/deliveries` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:152 |
| notification | POST | `/deliveries/:id/retry` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:164 |
| notification | POST | `/deliveries/:id/retry-in-app` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:174 |
| notification | POST | `/deliveries/:id/retry-email` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:184 |
| notification | POST | `/deliveries/:id/retry-sms` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:194 |
| notification | GET | `/automation-rules` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:204 |
| notification | POST | `/automation-rules` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:208 |
| notification | PATCH | `/automation-rules` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:214 |
| notification | DELETE | `/automation-rules` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:221 |
| notification | PATCH | `/automation-rules/:id` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:228 |
| notification | DELETE | `/automation-rules/:id` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:234 |
| notification | POST | `/automation-rules/:id/test` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:240 |
| notification | GET | `/templates` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:249 |
| notification | POST | `/templates` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/notificationControl.routes.js:253 |
| other | GET | `/global` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server/routes/platformControl.routes.js:36 |
| other | PATCH | `/global` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformControl.routes.js:47 |
| other | POST | `/global/reset` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformControl.routes.js:59 |
| workspace | GET | `/workspaces/:workspaceId` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformControl.routes.js:71 |
| workspace | PATCH | `/workspaces/:workspaceId` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformControl.routes.js:85 |
| workspace | DELETE | `/workspaces/:workspaceId` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformControl.routes.js:100 |
| workspace | GET | `/effective/:workspaceId` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformControl.routes.js:114 |
| workspace | GET | `/features/:workspaceId` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformControl.routes.js:128 |
| workspace | GET | `/providers/:workspaceId` | yes | n/a | yes | yes | requireSuperAdmin + audit | yes |  | ok | server/routes/platformControl.routes.js:142 |
| other | GET | `/subscription-plans` | yes | n/a | yes | yes | requireSuperAdmin + audit | yes |  | ok | server/routes/platformControl.routes.js:156 |
| admin/platform owner | GET | `/operations/health` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:47 |
| admin/platform owner | GET | `/operations/logs/summary` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:51 |
| admin/platform owner | GET | `/operations/jobs` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:55 |
| admin/platform owner | POST | `/operations/test-provider/:providerKey` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:59 |
| admin/platform owner | GET | `/backups/status` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:65 |
| admin/platform owner | POST | `/backups/run` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:69 |
| admin/platform owner | GET | `/backups/history` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:75 |
| admin/platform owner | GET | `/backups/evidence` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:79 |
| admin/platform owner | POST | `/backups/restore-dry-run` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:83 |
| admin/platform owner | GET | `/workspaces/lifecycle` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:89 |
| admin/platform owner | POST | `/workspaces/:workspaceId/${routeAction}` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:103 |
| admin/platform owner | POST | `/support/impersonation/start` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:117 |
| admin/platform owner | POST | `/support/impersonation/end` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:138 |
| admin/platform owner | GET | `/support/impersonation/active` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:147 |
| reports/export | GET | `/support/audit/export` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:160 |
| admin/platform owner | GET | `/incidents` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:171 |
| admin/platform owner | POST | `/incidents` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:175 |
| admin/platform owner | PATCH | `/incidents/:id` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:181 |
| AI/search | POST | `/maintenance` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:187 |
| admin/platform owner | GET | `/data-governance/overview` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:193 |
| reports/export | POST | `/data-governance/export/:workspaceId` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:197 |
| admin/platform owner | POST | `/data-governance/delete-request` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:209 |
| admin/platform owner | GET | `/data-governance/delete-requests` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:221 |
| notification | GET | `/notifications` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:225 |
| notification | POST | `/notifications` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:229 |
| notification | POST | `/notifications/:id/send` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:235 |
| notification | POST | `/notifications/:id/retry` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:241 |
| notification | DELETE | `/notifications/:id` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:247 |
| admin/platform owner | GET | `/subscription-automation/overview` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:253 |
| admin/platform owner | POST | `/subscription-automation/sync` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:257 |
| admin/platform owner | PATCH | `/subscription-automation/workspaces/:workspaceId` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:263 |
| admin/platform owner | GET | `/branding` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:269 |
| admin/platform owner | PATCH | `/branding/platform` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:273 |
| admin/platform owner | PATCH | `/branding/workspaces/:workspaceId` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:279 |
| AI/search | POST | `/branding/domains/:workspaceId/verify` | yes | yes-or-limited | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:285 |
| reports/export | GET | `/reports/overview` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:291 |
| reports/export | GET | `/reports/export.csv` | yes | n/a | yes | yes | audit/security event | yes |  | ok | server/routes/platformOwnerControl.routes.js:295 |
| other | GET | `/` | yes | n/a | yes | yes | super admin platform owner boundary | yes |  | ok | server/routes/platformSettings.routes.js:122 |
| other | PUT | `/` | yes | yes-or-limited | yes | yes | super admin platform owner boundary | yes |  | ok | server/routes/platformSettings.routes.js:134 |
