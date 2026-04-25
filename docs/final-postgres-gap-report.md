# Final PostgreSQL Gap Report

This report captures the remaining direct SQLite runtime usage on production
request paths after the final pre-cutover pass. It is intended to drive the
last migration steps before making `DB_ENGINE=postgres` the default.

## Summary

Production-critical domains already rehearsable on PostgreSQL:

- `auth/session` login, refresh, logout
- `admin overview`
- `schools` admin workspace list/upsert/delete
- `settings`
- `audit`
- `billing`
- `tasks`
- `school requests` create/list/count/export/status update
- `school request -> create workspace`
- `registration session / OTP / invite flows`
- `password reset request/complete`
- `channels/messages/replies/reactions`

Production-critical domain still partially blocked:

- none identified in the final production-critical pass

Non-critical domains still SQLite-only or direct-SQL:

- calendar
- live sessions / slides
- DMs
- uploads / file analytics
- email inbox / templates / logs
- AI runtime / knowledge
- policy acceptance
- analytics helpers
- placement tests / speaking and writing reviews

## Runtime Gaps

| File | Domain | Runtime criticality | PostgreSQL migration status | Exact next action |
|---|---|---:|---|---|
| [server.js](/Users/jannatuladny/cat-6.1/server.js:9511) + repositories | school request workspace bootstrap | production-critical | migrated | Covered by `workspaceRepository.createApprovedWorkspaceWithAdmin` and `scripts/full-postgres-cutover-smoke.js`; keep SQLite default until full smoke passes. |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:3077) + [registrationRepository.js](/Users/jannatuladny/cat-6.1/server/repositories/registrationRepository.js:1) | registration OTP/session/invite | production-critical | migrated | Covered by `registrationRepository`, `userRepository.completeInviteRegistration`, and full cutover smoke. |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:12496) + [authRepository.js](/Users/jannatuladny/cat-6.1/server/repositories/authRepository.js:1) | password reset request/complete | production-critical | migrated | Covered by `authRepository` password-reset methods, `userRepository.updatePasswordAfterReset`, and full cutover smoke. |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:6943) | calendar | secondary | pending | Add `calendarRepository` and migrate CRUD for `calendar_events` and `calendar_event_targets`. |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:16829) | live sessions / slides | secondary | pending | Add `liveSessionRepository` for `live_sessions`, `live_attendance`, and `slide_state`. |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:17516) | DMs | secondary | pending | Split DM flows into `dmRepository` and migrate member/message/reply/reaction routes. |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:8758) | uploads / file analytics | secondary | pending | Add `fileRepository` for `file_events`, `file_stats`, and registry-side analytics. |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:10249) | workspace email settings / templates / inbox | secondary | pending | Add `workspaceEmailRepository` plus `inboundEmailRepository`; stop hitting SQLite directly from request handlers. |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:19289) | knowledge / AI runtime | secondary | pending | Add repositories for `knowledge_items`, `ai_*`, and budget/runtime/session tables. |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:13290) | policy acceptance | secondary | pending | Add `policyRepository` for `policy_acceptances`. |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:11433) | analytics helpers | secondary | partial | Replace direct sync SQLite analytics reads with repository-backed async summary helpers. |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:421) | SQLite bootstrap/migrations | infra | partial | Move startup schema mutation out of `server.js` into explicit migrators/runbooks before default cutover. |

## Remaining Tables Not Yet Migrated To `db/schema/pg/*.sql`

### Production-Critical

- none

### Required Before Cutover

These are not part of the current production-critical smoke, but they are active
runtime features. If any are required during the staging or production cutover
window, migrate them before switching; otherwise disable or avoid these features
until their post-cutover migration lands.

- `ai_runtime_sessions`
- `ai_usage_ledger`
- `calendar_event_targets`
- `calendar_events`
- `file_events`
- `file_stats`
- `inbound_emails`
- `knowledge_items`
- `live_attendance`
- `live_sessions`
- `policy_acceptances`
- `slide_state`
- `user_preferences`
- `workspace_email_logs`
- `workspace_email_templates`

### Optional Post-Cutover Migration

These are secondary product/history features. They should be migrated after the
default runtime switch unless staging confirms they are needed immediately.

- `ai_budget_settings`
- `ai_conversation_messages`
- `ai_conversations`
- `certificates`
- `class_attendance`
- `class_attendance_records`
- `speaking_reviews`
- `student_notes`
- `student_progress`
- `test_answers`
- `test_attempts`
- `test_channels`
- `test_options`
- `test_sections`
- `test_tasks`
- `transcript_items`
- `writing_reviews`

### Archival / Log-Only

- `deleted_inbound_emails`
- `dm_message_reaction_users`
- `email_events`
- `email_replies`
- `ip_blocklist`
- `orphaned_attendance_notifications_archive`
- `orphaned_attendance_records_archive`
- `orphaned_attendance_sessions_archive`
- `orphaned_file_events_archive`
- `orphaned_files_registry_archive`
- `orphaned_homework_item_files_archive`
- `orphaned_homework_items_archive`
- `orphaned_homework_submission_comments_archive`
- `orphaned_homework_submission_files_archive`
- `orphaned_homework_submissions_archive`
- `orphaned_registration_links_archive`
- `orphaned_workspace_class_meta_archive`

## Full Rehearsal Status

`scripts/full-postgres-cutover-smoke.js` now exercises the repository-backed
production domains with:

- auth/session
- admin overview
- schools
- settings
- audit
- billing
- tasks
- school requests
- channels/messages
- school request create-workspace
- registration invite complete
- password reset request/complete

The final production-critical blockers from this pass have been moved behind
repository adapters. Do not switch the default runtime until import,
verification, and the full Postgres smoke pass against the target database.
