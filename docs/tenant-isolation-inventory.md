# Tenant Isolation Inventory

## Scope

This inventory focuses on routes that resolve or expose school-scoped content by `workspaceId`, `channelId`, `messageId`, `fileId`, `userId`, `homeworkId`, `liveSessionId`, or `emailId`.

## Route Inventory

| Route group | Resource keys | Current access check | Risk | Required fix | Status |
| --- | --- | --- | --- | --- | --- |
| `GET /api/channels` | `workspaceId` | Auth, permission, workspace check | High | Deny cross-workspace content reads and deny super-admin private-content browsing | Hardened |
| `GET/POST /api/channels/:channelId/messages` | `channelId` | Previously only task-channel special cases | Critical | Resolve channel workspace from DB, require same-workspace access, block super-admin private-content reads | Hardened |
| `PATCH/DELETE /api/messages/:messageId` | `messageId` | Author checks, no shared tenant gate | Critical | Resolve message -> channel -> workspace before edit/delete | Hardened |
| `POST /api/channels/:channelId/messages/:messageId/replies` | `channelId`, `messageId` | Parent message check only | High | Require channel access before thread reply write | Hardened |
| `POST /api/messages/:messageId/reactions`, `POST /api/replies/:replyId/reactions` | `messageId`, `replyId` | Resource existence only | High | Resolve parent workspace and require channel access | Hardened |
| `GET /uploads/*` | upload URL -> file registry | File-registry lookup with old super-admin bypass | Critical | Remove super-admin bypass, require workspace and membership-aware file access | Hardened |
| `GET /api/files/registry`, `POST /api/files/:fileId/{pin,delete,replace}` | `workspaceId`, `fileId` | File registry checks with old super-admin bypass | High | Deny super-admin private browsing, require file access assertions | Hardened |
| `GET/POST/DELETE /api/channels/:channelId/members` | `channelId`, `userId` | Mixed workspace checks | Medium | Reuse channel assertions before membership mutation or list | Hardened |
| `GET/POST /api/homework/channels/:channelId/board|items` and item/submission routes | `channelId`, `itemId`, `submissionId` | Homework helpers with school-admin/super-admin visibility | Critical | Deny super-admin content access, enforce same-workspace homework-channel visibility | Hardened |
| `GET/POST/PATCH/DELETE /api/live-sessions*` | `workspaceId`, `sessionId` | Teacher/admin live helpers with super-admin-adjacent workspace bypass | High | Deny super-admin private-content reads and require workspace-aligned live-session checks | Hardened |
| `GET /api/dms`, `GET/POST/DELETE /api/dms/:dmId*`, DM reactions/replies | `dmId`, `messageId`, `replyId`, `userId` | Member/creator checks, no explicit workspace model | Critical | Infer DM workspace from participants, block mixed-workspace DMs, block super-admin access | Hardened |
| `GET /api/admin/inbox*`, attachment routes | `emailId`, `attachmentId` | Mailbox viewer model treated super-admin as mailbox admin | High | Remove super-admin mailbox admin status for school-private inbox content | Hardened |
| `GET /api/analytics/files`, file stats helpers | `workspaceId`, file URLs | Header-based admin checks | Medium | Replace trust in client workspace/header with authenticated workspace assertions | Deferred |
| `GET /api/search` | `workspaceId`, message text | Workspace query filter with fallback broadening | High | Remove fallback broadening and add shared channel/message scoping | Deferred |

## Repository/Helper Notes

| Area | Observation | Risk | Status |
| --- | --- | --- | --- |
| `workspaceIdFromRequest` and `resolveRequestedWorkspaceId` | Safe for same-workspace defaults, unsafe if used as sole authorization source | High | Mitigated by new resource assertions on hardened routes |
| File registry access | Previously allowed super-admin and trusted workspace selection too much | Critical | Hardened |
| DM model | No explicit `workspace_id` column on `dms` | Critical | Runtime protections added, schema redesign still recommended |
| Homework visibility | Relied on homework-channel view helpers with admin-style bypass | High | Hardened by denying super-admin content access |
| Live-session visibility | Admin-style viewer checks allowed platform-role ambiguity | High | Hardened |

## Deferred Follow-up

- Add explicit `workspace_id` to `dms` and DM message tables to remove inferred-workspace logic.
- Harden `search`, analytics/file stat endpoints, and any remaining header-driven legacy routes with the same shared assertions.
- Move tenant/resource assertions into repository-backed service helpers so SQLite/PostgreSQL paths stay consistent during migration.
