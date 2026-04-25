# PostgreSQL Import Scope

This document describes what `scripts/import-json-to-postgres.js` and
`scripts/verify-postgres-import.js` currently handle when importing the
transformed SQLite export into PostgreSQL.

The scripts now limit themselves to tables that:

- exist in `db/schema/pg/*.sql`
- already exist as live relations in the target PostgreSQL database
- have manifest columns that match the current PostgreSQL table shape
- do not depend on another migrated table that was skipped earlier

## Importable Now

These tables currently import and verify successfully in PostgreSQL:

- `announcements`
- `audit_log`
- `audit_logs`
- `channels`
- `register_otps`
- `registration_review_requests`
- `registration_sessions`
- `workspace_billing`
- `workspace_class_meta`
- `workspace_email_settings`
- `workspace_settings_admin`
- `workspaces`

## Migrated In Schema But Not Importable Yet

These tables already exist in `db/schema/pg/*.sql`, but the current import
still skips them because either:

- the PostgreSQL table shape does not match the exported JSON shape yet, or
- they depend on a skipped migrated table

Schema-shape mismatch:

- `login_attempts`
- `message_reactions`
- `message_translations`
- `messages`
- `password_resets`
- `refresh_tokens`
- `revoked_access_tokens`
- `school_requests`
- `security_events`
- `users`
- `workspace_profile`

Dependency-blocked by skipped migrated tables:

- `announcement_reads`
- `attendance_notifications`
- `attendance_records`
- `attendance_sessions`
- `channel_members`
- `dm_members`
- `dm_message_reactions`
- `dm_messages`
- `dm_replies`
- `dm_reply_reaction_users`
- `dm_reply_reactions`
- `dms`
- `files_registry`
- `homework_completions`
- `homework_item_files`
- `homework_items`
- `homework_submission_comments`
- `homework_submission_files`
- `homework_submissions`
- `invoices`
- `message_reaction_users`
- `password_history`
- `payments`
- `replies`
- `reply_reaction_users`
- `reply_reactions`
- `task_comments`
- `task_reactions`
- `tasks`
- `user_channel_prefs`
- `workspace_members`

## Still SQLite-Only

These tables are still SQLite-only for import purposes because they do not yet
exist in `db/schema/pg/*.sql`:

- `ai_budget_settings`
- `ai_conversation_messages`
- `ai_conversations`
- `ai_runtime_sessions`
- `ai_usage_ledger`
- `calendar_event_targets`
- `calendar_events`
- `certificates`
- `class_attendance`
- `class_attendance_records`
- `deleted_inbound_emails`
- `dm_message_reaction_users`
- `email_events`
- `email_replies`
- `file_events`
- `file_stats`
- `inbound_emails`
- `ip_blocklist`
- `knowledge_items`
- `live_attendance`
- `live_sessions`
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
- `platform_settings`
- `policy_acceptances`
- `registration_links`
- `slide_state`
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
- `user_preferences`
- `workspace_email_logs`
- `workspace_email_templates`
- `writing_reviews`

## Notes

- Verification is intentionally scoped to the same importable subset, so
  missing-schema tables are reported separately instead of causing a false
  import failure.
- SQLite remains the default runtime engine. The runtime smoke rehearsal only
  switches the channels/messages domain to PostgreSQL when invoked with
  `node scripts/runtime-domain-smoke.js postgres`.
