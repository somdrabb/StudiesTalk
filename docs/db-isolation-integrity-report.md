# DB Isolation Integrity Report

Generated: 2026-05-03T13:21:41.495Z

Mode: sqlite
DB path: /Users/jannatuladny/cat-6.1/storage/studiestalk.db
Checked tables: 154
DB integrity score: 96/100

## Findings

| Severity | Check | Table | Count | Description |
|---|---|---|---|---|
| review | messages_missing_workspace_id | messages | 1 | messages does not have workspace_id and must be scoped through parent/target/delivery rows in every query. |
| review | notification_campaigns_missing_workspace_id | notification_campaigns | 1 | notification_campaigns does not have workspace_id and must be scoped through parent/target/delivery rows in every query. |

## Scope

This checker validates common workspace_id presence, orphan rows, and cross-workspace foreign-key mismatches where table/column names are discoverable in the current SQLite database. It does not replace database-level foreign keys or route-level authorization tests.

