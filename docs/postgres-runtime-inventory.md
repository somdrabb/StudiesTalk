# PostgreSQL Runtime Inventory

This inventory tracks remaining direct SQLite usage that must move behind
repository adapters before a full PostgreSQL runtime cutover.

## Progress Summary

- Migrated domains:
  - `billing`
  - `tasks / assignments`
  - `announcements`
  - `audit`
- Partially migrated domains:
  - `workspaces / settings`
  - `attendance`
  - `channels`
  - `messages`
  - `users`
  - `auth / sessions`
- Remaining blockers:
  - `server.js` still owns SQLite bootstrap/schema migration work
  - attendance analytics and dashboard helpers remain synchronous/direct
  - user analytics helpers remain SQLite-pinned
  - DM/message search flows are still direct
  - auth/session runtime remains SQLite-owned beyond the shared deletion boundary
- Estimated cutover readiness:
  - `82%`

Status legend:

- `done`: routed through a repository adapter already
- `partial-boundary`: some runtime surface moved, but server.js still has direct SQL
- `pending`: still owned directly by SQLite/server.js
- `blocked`: known dependency prevents safe migration in this pass
- `infra`: low-level adapter/bootstrap usage, not a domain repository

## Summary

| File | Domain | SQLite usage | Repository target | Status |
|---|---|---|---|---|
| [server.js](/Users/jannatuladny/cat-6.1/server.js:421) | bootstrap/runtime | `new Database`, pragmas, schema bootstrap, migrations | `db/sqlite.js`, domain repositories, startup migrator | `infra` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:423) | billing | repository boundary already present | `billingRepository.js` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:430) | tasks / assignments | repository boundary already present | `tasksRepository.js` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:439) | attendance | runtime routes behind repository, analytics still direct | `attendanceRepository.js` | `partial-boundary` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:20868) | workspaces / settings | admin workspace CRUD, settings, and class meta behind repository; broader workspace access still direct elsewhere | `workspaceRepository.js` | `partial-boundary` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:15009) | announcements | announcement list/create/read/delete now repository-backed | `announcementRepository.js` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:1209) | audit | audit writes and admin audit reads now repository-backed | `auditRepository.js` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:13606) | channels | channel list/create/update/delete/member routes use repository; bootstrap/default-channel helpers still direct | `channelRepository.js` | `partial-boundary` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:14040) | messages | channel list/create/edit/delete/reply/reaction routes use repository; search/DM/translation helpers still direct | `messageRepository.js` | `partial-boundary` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:20973) | users | admin user routes and shared lookup helpers moved; analytics/directory/runtime CRUD still direct | `userRepository.js` | `partial-boundary` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:3453) | auth / sessions | shared delete-user auth cleanup extracted; login/session runtime remains SQLite-owned | `authRepository.js` | `partial-boundary` |
| [server/services/inboundEmail.service.js](/Users/jannatuladny/cat-6.1/server/services/inboundEmail.service.js:569) | inbound email | SQLite table-introspection / DB-coupled service calls | `inboundEmailRepository.js` or `emailRepository.js` | `pending` |
| [db/sqlite.js](/Users/jannatuladny/cat-6.1/db/sqlite.js:1) | adapter | direct sqlite implementation | standardized db adapter | `infra` |
| [db/postgres.js](/Users/jannatuladny/cat-6.1/db/postgres.js:1) | adapter | postgres implementation | standardized db adapter | `infra` |

## Domain Detail

### Workspaces / Settings

| File:Line | SQL usage | Repository target | Status |
|---|---|---|---|
| [server.js](/Users/jannatuladny/cat-6.1/server.js:20868) | `GET /api/admin/workspaces` | `workspaceRepository.listAdminWorkspaces` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:20923) | `POST /api/admin/workspaces/upsert` | `workspaceRepository.upsertWorkspace` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:20955) | `DELETE /api/admin/workspaces/:workspaceId` | `workspaceRepository.deleteWorkspaceCascade` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:21174) | `GET /api/admin/workspace-settings/:workspaceId` | `workspaceRepository.getWorkspaceSettings` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:21190) | `PUT /api/admin/workspace-settings/:workspaceId` | `workspaceRepository.saveWorkspaceSettings` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:21297) | `workspace_class_meta` + class meta routes/helpers | `workspaceRepository.getClassMeta/upsertClassMeta/countChannelMembers` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:7768) | broader workspace lookups still direct in other flows | `workspaceRepository.js` | `partial-boundary` |

### Announcements

| File:Line | SQL usage | Repository target | Status |
|---|---|---|---|
| [server.js](/Users/jannatuladny/cat-6.1/server.js:15009) | `GET /api/channels/:channelId/announcements` | `announcementRepository.listAnnouncements` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:15023) | `POST /api/channels/:channelId/announcements` | `announcementRepository.createAnnouncement` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:15061) | `POST /api/announcements/:announcementId/read` | `announcementRepository.markAnnouncementRead` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:15101) | `DELETE /api/channels/:channelId/announcements/:announcementId` | `announcementRepository.deleteAnnouncement` | `done` |

### Attendance

| File:Line | SQL usage | Repository target | Status |
|---|---|---|---|
| [server.js](/Users/jannatuladny/cat-6.1/server.js:4797) | permission/roster helper still uses direct SQLite reads | `attendanceRepository` + future `channelRepository/userRepository` | `partial-boundary` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:11373) | class attendance load route | `attendanceRepository.getOrCreateSession/listStatuses` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:11418) | attendance save route | `attendanceRepository.upsertRecords/notifications` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:11586) | student attendance history route | `attendanceRepository.listStudentAttendance` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:14145) | channel delete/remap attendance cleanup now repository-backed | `attendanceRepository.reassignChannelAttendance/deleteChannelAttendanceData` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:4424) | AI summary still queries `attendance_records` directly | `attendanceRepository.getWorkspaceSummary` | `partial-boundary` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:15548) | analytics attendance summary still direct | `attendanceRepository.getStudentAttendanceSummary` | `partial-boundary` |

### Audit

| File:Line | SQL usage | Repository target | Status |
|---|---|---|---|
| [server.js](/Users/jannatuladny/cat-6.1/server.js:1209) | writes to `audit_logs` | `auditRepository.writeAuditLog` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:3410) | writes to legacy `audit_log` | `auditRepository.writeLegacyAuditLog` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:21074) | admin overview recent audit query | `auditRepository.listRecentLegacyAudit` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:21206) | `GET /api/admin/audit` | `auditRepository.listLegacyAudit` | `done` |

### Channels

| File:Line | SQL usage | Repository target | Status |
|---|---|---|---|
| [server.js](/Users/jannatuladny/cat-6.1/server.js:7282) | default/derived channel bootstrap helpers still direct | `channelRepository.ensureDefaults` | `pending` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:13359) | channel membership get/add/remove routes | `channelRepository.getChannelMembers/addChannelMember/removeChannelMember` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:13606) | list/create/update/delete routes | `channelRepository.listChannels/createChannel/updateChannel/deleteChannel` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:7807) | reserved task channel merge/remap helper still direct | `channelRepository.mergeDuplicateChannels` | `pending` |

### Messages

| File:Line | SQL usage | Repository target | Status |
|---|---|---|---|
| [server.js](/Users/jannatuladny/cat-6.1/server.js:14040) | channel message aggregation helper | `messageRepository.listChannelMessages` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:14194) | `GET /api/channels/:channelId/messages` | `messageRepository.listChannelMessages` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:14672) | `POST /api/channels/:channelId/messages` | `messageRepository.createChannelMessage` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:14891) | `PATCH /api/messages/:messageId` | `messageRepository.updateMessage` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:16773) | `DELETE /api/messages/:messageId` | `messageRepository.deleteMessage` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:16808) | channel replies | `messageRepository.createReply` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:16843) | channel message reactions | `messageRepository.toggleMessageReaction` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:16864) | channel reply reactions | `messageRepository.toggleReplyReaction` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:14100) | message search/DM list/create/delete/members/messages still direct | `messageRepository.js` or `dmRepository.js` | `pending` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:5048) | message translation cache writes | `messageRepository.translationCache` | `pending` |

### Users

| File:Line | SQL usage | Repository target | Status |
|---|---|---|---|
| [server.js](/Users/jannatuladny/cat-6.1/server.js:20973) | admin list/update/delete user routes | `userRepository.listAdminUsers/updateUserRoleStatus/deleteUserMembershipRecords` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:15254) | workspace-scoped user helper + assigned-student helper now routed to repo | `userRepository.getWorkspaceScopedUser/getAssignedStudentRowsForTeacher` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:2297) | username generation / signup / directory helpers still direct | `userRepository` | `pending` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:2401) | email log user resolution still direct | `userRepository.getUserById/getUserByEmail` | `pending` |

### Auth / Sessions

| File:Line | SQL usage | Repository target | Status |
|---|---|---|---|
| [server.js](/Users/jannatuladny/cat-6.1/server.js:3453) | shared delete-user auth cleanup | `authRepository.deleteUserAuthState` | `done` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:779) | login/session revocation tables and checks still direct | `authRepository.js` | `blocked` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:1852) | registration session state still direct | `authRepository.js` | `pending` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:3011) | register OTP / signup helpers still direct | `authRepository.js` | `pending` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:12596) | login flow writes audits/session state | `authRepository.js` + `auditRepository.js` | `blocked` |

## Infrastructure Detail

| File:Line | SQL usage | Repository target | Status |
|---|---|---|---|
| [server.js](/Users/jannatuladny/cat-6.1/server.js:675) | SQLite pragmas, WAL, busy timeout | startup database bootstrap | `infra` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:705) | schema bootstrap and `ALTER TABLE` migrations | dedicated schema migrator | `infra` |
| [server.js](/Users/jannatuladny/cat-6.1/server.js:6177) | SQLite-only foreign key table rewrites | one-time SQLite migrator script | `infra` |
| [server/services/inboundEmail.service.js](/Users/jannatuladny/cat-6.1/server/services/inboundEmail.service.js:569) | direct table existence checks | repository or db adapter abstraction | `pending` |

## Cutover Readiness Notes

- `billing`, `tasks`, and the runtime `attendance` routes already demonstrate the adapter-boundary pattern that the remaining domains should follow.
- The current blocking concentration is `server.js`; it still owns schema creation, migrations, and most runtime SQL directly.
- Full cutover is not safe until:
  - the requested remaining domains are moved behind repositories
  - bootstrap/schema work is removed from the request-serving path
  - auth/session revocation tables are repository-backed
  - end-to-end smoke coverage spans admin, auth, messaging, channels, and school request workflows
