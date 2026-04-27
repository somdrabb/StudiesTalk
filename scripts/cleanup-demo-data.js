#!/usr/bin/env node
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const {
  backupSqlite,
  buildBackupPath,
  getSqliteDbPath,
  openSqlite
} = require('./sqlite-backup-utils');

const DEFAULT_UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const DEFAULT_MANAGED_ROOT = path.join(DEFAULT_UPLOADS_DIR, 'managed');
const REQUIRED_TABLES = [
  'workspaces',
  'users',
  'channels'
];
const ADMIN_ROLES = new Set(['admin', 'school_admin', 'super_admin']);

function parseArgs(argv) {
  const args = {
    dryRun: false,
    confirm: false,
    deleteOrphans: false,
    workspaceIds: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || '').trim();
    if (!token) continue;
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (token === '--confirm-cleanup') {
      args.confirm = true;
      continue;
    }
    if (token === '--delete-orphans') {
      args.deleteOrphans = true;
      continue;
    }
    if (token === '--workspace-id') {
      const next = String(argv[index + 1] || '').trim();
      if (next) {
        args.workspaceIds.push(next);
        index += 1;
      }
      continue;
    }
    if (token.startsWith('--workspace-id=')) {
      const value = token.slice('--workspace-id='.length).trim();
      if (value) args.workspaceIds.push(value);
    }
  }

  args.workspaceIds = [...new Set(args.workspaceIds.filter(Boolean))];
  return args;
}

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function quote(value) {
  return `"${String(value || '')}"`;
}

function pluralize(word, count) {
  return count === 1 ? word : `${word}s`;
}

function formatList(values, emptyLabel = '(none)') {
  const items = Array.isArray(values) ? values.filter(Boolean) : [];
  return items.length ? items.join(', ') : emptyLabel;
}

function chunkValues(values, size = 250) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function buildPlaceholders(values) {
  return values.map(() => '?').join(', ');
}

function collectWorkspaceRules(row, explicitWorkspaceIdSet) {
  const workspaceId = lower(row.id);
  const name = lower(row.name);
  const reasons = [];

  if (explicitWorkspaceIdSet.has(String(row.id))) {
    reasons.push('explicit workspace id');
  }

  if (workspaceId === 'default') reasons.push('workspace id "default"');
  if (/^legacy(?:$|[_-])/.test(workspaceId)) reasons.push('workspace id starts with legacy');
  if (/^demo(?:$|[_-])/.test(workspaceId)) reasons.push('workspace id starts with demo');
  if (/^test(?:$|[_-])/.test(workspaceId)) reasons.push('workspace id starts with test');
  if (/^muster(?:$|[_-])/.test(workspaceId)) reasons.push('workspace id starts with muster');
  if (/^ws_(?:onboarding_|policy_|security_|new_admin_|new_admin_policy_|live_|attendance_|runtime_|smoke_|tenant_iso_|auth_|auth_reset_|account_security_|file_storage_|pg_full_)/.test(workspaceId)) {
    reasons.push('smoke-test workspace id');
  }
  if (/^ws_other_/.test(workspaceId)) reasons.push('smoke-test secondary workspace id');
  if (/^http_ws_/.test(workspaceId)) reasons.push('http smoke workspace id');
  if (/^legacy_ws_/.test(workspaceId)) reasons.push('legacy smoke workspace id');

  if (name === 'worknest demo') reasons.push('known demo workspace name');
  if (/^studiestalk smoke school$/.test(name)) reasons.push('smoke workspace name');
  if (/^new admin smoke school$/.test(name)) reasons.push('smoke workspace name');
  if (/^attendance rehearsal workspace$/.test(name)) reasons.push('rehearsal workspace name');
  if (/^attendance workspace(?: b)?$/.test(name)) reasons.push('attendance smoke workspace name');
  if (/sprachschule duisburg/i.test(name) && /(demo|test|sample)/i.test(name)) {
    reasons.push('Sprachschule Duisburg sample/demo workspace name');
  }
  if (/^(?:legacy|demo|test|muster)(?:$|[\s_-])/.test(name)) {
    reasons.push('workspace name matches legacy/demo/test/muster prefix');
  }
  if (/(^|[\s_-])(smoke|rehearsal|sample)(?:$|[\s_-])/.test(name)) {
    reasons.push('workspace name marked smoke/rehearsal/sample');
  }

  return [...new Set(reasons)];
}

function resolveManagedRoot() {
  const uploadsDir = path.resolve(String(process.env.UPLOADS_DIR || DEFAULT_UPLOADS_DIR).trim() || DEFAULT_UPLOADS_DIR);
  const configured = String(process.env.FILE_STORAGE_LOCAL_ROOT || '').trim();
  return configured ? path.resolve(configured) : path.join(uploadsDir, 'managed');
}

function listFilesRecursively(rootDir) {
  const found = [];
  if (!fs.existsSync(rootDir)) return found;
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absPath);
      } else if (entry.isFile()) {
        found.push(absPath);
      }
    }
  }
  return found;
}

function removeEmptyParentDirs(rootDir, absPath) {
  let current = path.dirname(absPath);
  const normalizedRoot = path.resolve(rootDir);
  while (current.startsWith(normalizedRoot) && current !== normalizedRoot) {
    try {
      const entries = fs.readdirSync(current);
      if (entries.length) break;
      fs.rmdirSync(current);
      current = path.dirname(current);
    } catch (_err) {
      break;
    }
  }
}

function tableSet(db) {
  return new Set(
    db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
    `).all().map((row) => String(row.name || ''))
  );
}

function tableColumns(db, tableName) {
  return new Set(
    db.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => String(row.name || ''))
  );
}

function hasTable(tables, tableName) {
  return tables.has(tableName);
}

function hasColumn(columnMap, tableName, columnName) {
  return columnMap.get(tableName)?.has(columnName) || false;
}

function queryRows(db, sql, params = []) {
  return db.prepare(sql).all(...params);
}

function queryOne(db, sql, params = []) {
  return db.prepare(sql).get(...params) || null;
}

function queryCount(db, tableName, whereSql = '', params = []) {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${tableName}${whereSql ? ` WHERE ${whereSql}` : ''}`).get(...params);
  return Number(row?.c || 0);
}

function queryDistinctValues(db, tableName, columnName, whereSql = '', params = []) {
  const rows = db.prepare(`
    SELECT DISTINCT ${columnName} AS value
    FROM ${tableName}
    ${whereSql ? `WHERE ${whereSql}` : ''}
  `).all(...params);
  return rows
    .map((row) => row?.value)
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .map((value) => String(value));
}

function idsFromWorkspace(db, tables, columnMap, tableName, idColumn, workspaceIds) {
  if (!workspaceIds.length || !hasTable(tables, tableName) || !hasColumn(columnMap, tableName, 'workspace_id') || !hasColumn(columnMap, tableName, idColumn)) {
    return [];
  }
  const values = [];
  for (const chunk of chunkValues(workspaceIds)) {
    values.push(...queryDistinctValues(
      db,
      tableName,
      idColumn,
      `workspace_id IN (${buildPlaceholders(chunk)})`,
      chunk
    ));
  }
  return [...new Set(values)];
}

function idsFromChannel(db, tables, columnMap, tableName, idColumn, channelIds) {
  if (!channelIds.length || !hasTable(tables, tableName) || !hasColumn(columnMap, tableName, 'channel_id') || !hasColumn(columnMap, tableName, idColumn)) {
    return [];
  }
  const values = [];
  for (const chunk of chunkValues(channelIds)) {
    values.push(...queryDistinctValues(
      db,
      tableName,
      idColumn,
      `channel_id IN (${buildPlaceholders(chunk)})`,
      chunk
    ));
  }
  return [...new Set(values)];
}

function idsFromUser(db, tables, columnMap, tableName, idColumn, userColumn, userIds) {
  if (!userIds.length || !hasTable(tables, tableName) || !hasColumn(columnMap, tableName, userColumn) || !hasColumn(columnMap, tableName, idColumn)) {
    return [];
  }
  const values = [];
  for (const chunk of chunkValues(userIds)) {
    values.push(...queryDistinctValues(
      db,
      tableName,
      idColumn,
      `${userColumn} IN (${buildPlaceholders(chunk)})`,
      chunk
    ));
  }
  return [...new Set(values)];
}

function collectCandidateDms(db, tables, demoUserIds) {
  if (!demoUserIds.length || !hasTable(tables, 'dms') || !hasTable(tables, 'dm_members')) {
    return [];
  }

  const demoUsers = new Set(demoUserIds.map(String));
  const membershipRows = queryRows(db, 'SELECT dm_id AS dmId, user_id AS userId FROM dm_members');
  const membersByDm = new Map();
  for (const row of membershipRows) {
    const dmId = String(row.dmId || '');
    const userId = String(row.userId || '');
    if (!dmId || !userId) continue;
    if (!membersByDm.has(dmId)) membersByDm.set(dmId, []);
    membersByDm.get(dmId).push(userId);
  }

  const dms = queryRows(db, 'SELECT id, created_by FROM dms');
  const demoDmIds = [];
  for (const row of dms) {
    const dmId = String(row.id || '');
    const createdBy = String(row.created_by || '');
    const members = membersByDm.get(dmId) || [];
    const hasMembers = members.length > 0;
    const allMembersDemo = hasMembers && members.every((userId) => demoUsers.has(userId));
    const createdByDemo = createdBy && demoUsers.has(createdBy);
    if (allMembersDemo || (!hasMembers && createdByDemo)) {
      demoDmIds.push(dmId);
    }
  }
  return [...new Set(demoDmIds)];
}

function collectPlan(db, tables, columnMap, target) {
  const workspaceIds = target.workspaceIds;
  if (!workspaceIds.length) {
    return {
      workspaceIds: [],
      userIds: [],
      channelIds: [],
      announcementIds: [],
      attendanceSessionIds: [],
      homeworkIds: [],
      homeworkSubmissionIds: [],
      taskIds: [],
      liveSessionIds: [],
      pollIds: [],
      pollOptionIds: [],
      breakoutRoomIds: [],
      invoiceIds: [],
      testChannelIds: [],
      testSectionIds: [],
      testTaskIds: [],
      testAttemptIds: [],
      aiConversationIds: [],
      calendarEventIds: [],
      inboundEmailIds: [],
      deletedInboundMessageIds: [],
      workspaceEmailLogIds: [],
      fileIds: [],
      classAttendanceIds: [],
      messageIds: [],
      replyIds: [],
      dmIds: [],
      dmMessageIds: [],
      dmReplyIds: [],
      managedFileRows: []
    };
  }

  const userIds = idsFromWorkspace(db, tables, columnMap, 'users', 'id', workspaceIds);
  const channelIds = idsFromWorkspace(db, tables, columnMap, 'channels', 'id', workspaceIds);
  const announcementIds = idsFromWorkspace(db, tables, columnMap, 'announcements', 'id', workspaceIds);
  const attendanceSessionIds = idsFromWorkspace(db, tables, columnMap, 'attendance_sessions', 'id', workspaceIds);
  const homeworkIds = idsFromWorkspace(db, tables, columnMap, 'homework_items', 'id', workspaceIds);
  const homeworkSubmissionIds = idsFromWorkspace(db, tables, columnMap, 'homework_submissions', 'id', workspaceIds);
  const taskIds = idsFromWorkspace(db, tables, columnMap, 'tasks', 'id', workspaceIds);
  const liveSessionIds = idsFromWorkspace(db, tables, columnMap, 'live_sessions', 'id', workspaceIds);
  const pollIds = idsFromWorkspace(db, tables, columnMap, 'live_session_polls', 'id', workspaceIds);
  const breakoutRoomIds = idsFromWorkspace(db, tables, columnMap, 'live_breakout_rooms', 'id', workspaceIds);
  const invoiceIds = idsFromWorkspace(db, tables, columnMap, 'invoices', 'id', workspaceIds);
  const testChannelIds = idsFromWorkspace(db, tables, columnMap, 'test_channels', 'id', workspaceIds);
  const aiConversationIds = idsFromWorkspace(db, tables, columnMap, 'ai_conversations', 'id', workspaceIds);
  const calendarEventIds = idsFromWorkspace(db, tables, columnMap, 'calendar_events', 'id', workspaceIds);
  const inboundEmailIds = idsFromWorkspace(db, tables, columnMap, 'inbound_emails', 'id', workspaceIds);
  const workspaceEmailLogIds = idsFromWorkspace(db, tables, columnMap, 'workspace_email_logs', 'id', workspaceIds);
  const fileIds = idsFromWorkspace(db, tables, columnMap, 'files_registry', 'file_id', workspaceIds);
  const classAttendanceIds = idsFromChannel(db, tables, columnMap, 'class_attendance', 'id', channelIds);
  const messageIds = idsFromChannel(db, tables, columnMap, 'messages', 'id', channelIds);
  const replyIds = idsFromUser(db, tables, columnMap, 'replies', 'id', 'message_id', messageIds);
  const dmIds = collectCandidateDms(db, tables, userIds);
  const dmMessageIds = idsFromUser(db, tables, columnMap, 'dm_messages', 'id', 'dm_id', dmIds);
  const dmReplyIds = idsFromUser(db, tables, columnMap, 'dm_replies', 'id', 'dm_message_id', dmMessageIds);
  const pollOptionIds = idsFromUser(db, tables, columnMap, 'live_session_poll_options', 'id', 'poll_id', pollIds);
  const testSectionIds = idsFromUser(db, tables, columnMap, 'test_sections', 'id', 'test_channel_id', testChannelIds);
  const testTaskIds = idsFromUser(db, tables, columnMap, 'test_tasks', 'id', 'test_section_id', testSectionIds);
  const testAttemptIds = idsFromUser(db, tables, columnMap, 'test_attempts', 'id', 'test_channel_id', testChannelIds);

  const managedFileRows = hasTable(tables, 'files_registry')
    ? queryRows(
      db,
      `SELECT file_id, workspace_id, storage_key, storage_provider
       FROM files_registry
       WHERE workspace_id IN (${buildPlaceholders(workspaceIds)})`,
      workspaceIds
    )
    : [];

  const deletedInboundMessageIds = hasTable(tables, 'inbound_emails') && hasColumn(columnMap, 'inbound_emails', 'message_id')
    ? queryDistinctValues(
      db,
      'inbound_emails',
      'message_id',
      `workspace_id IN (${buildPlaceholders(workspaceIds)})`,
      workspaceIds
    )
    : [];

  return {
    workspaceIds,
    userIds,
    channelIds,
    announcementIds,
    attendanceSessionIds,
    homeworkIds,
    homeworkSubmissionIds,
    taskIds,
    liveSessionIds,
    pollIds,
    pollOptionIds,
    breakoutRoomIds,
    invoiceIds,
    testChannelIds,
    testSectionIds,
    testTaskIds,
    testAttemptIds,
    aiConversationIds,
    calendarEventIds,
    inboundEmailIds,
    deletedInboundMessageIds,
    workspaceEmailLogIds,
    fileIds,
    classAttendanceIds,
    messageIds,
    replyIds,
    dmIds,
    dmMessageIds,
    dmReplyIds,
    managedFileRows
  };
}

function addDeleteStep(steps, { table, whereSql, params = [], note }) {
  steps.push({ type: 'table', table, whereSql, params, note });
}

function addCompoundDeleteSteps(steps, tables, columnMap, tableName, columnName, ids, note) {
  if (!ids.length || !hasTable(tables, tableName) || !hasColumn(columnMap, tableName, columnName)) return;
  for (const chunk of chunkValues(ids)) {
    addDeleteStep(steps, {
      table: tableName,
      whereSql: `${columnName} IN (${buildPlaceholders(chunk)})`,
      params: chunk,
      note
    });
  }
}

function buildDeleteSteps(tables, columnMap, plan) {
  const steps = [];

  addCompoundDeleteSteps(steps, tables, columnMap, 'message_reaction_users', 'message_id', plan.messageIds, 'message reactions');
  addCompoundDeleteSteps(steps, tables, columnMap, 'message_reactions', 'message_id', plan.messageIds, 'message reactions');
  addCompoundDeleteSteps(steps, tables, columnMap, 'message_translations', 'message_id', plan.messageIds, 'message translations');
  addCompoundDeleteSteps(steps, tables, columnMap, 'reply_reaction_users', 'reply_id', plan.replyIds, 'reply reactions');
  addCompoundDeleteSteps(steps, tables, columnMap, 'reply_reactions', 'reply_id', plan.replyIds, 'reply reactions');
  addCompoundDeleteSteps(steps, tables, columnMap, 'replies', 'message_id', plan.messageIds, 'replies');
  addCompoundDeleteSteps(steps, tables, columnMap, 'announcement_reads', 'announcement_id', plan.announcementIds, 'announcement reads');
  addCompoundDeleteSteps(steps, tables, columnMap, 'messages', 'channel_id', plan.channelIds, 'channel messages');
  addCompoundDeleteSteps(steps, tables, columnMap, 'announcements', 'workspace_id', plan.workspaceIds, 'announcements');

  addCompoundDeleteSteps(steps, tables, columnMap, 'dm_reply_reaction_users', 'reply_id', plan.dmReplyIds, 'DM reply reactions');
  addCompoundDeleteSteps(steps, tables, columnMap, 'dm_reply_reactions', 'reply_id', plan.dmReplyIds, 'DM reply reactions');
  addCompoundDeleteSteps(steps, tables, columnMap, 'dm_replies', 'dm_message_id', plan.dmMessageIds, 'DM replies');
  addCompoundDeleteSteps(steps, tables, columnMap, 'dm_message_reaction_users', 'message_id', plan.dmMessageIds, 'DM message reactions');
  addCompoundDeleteSteps(steps, tables, columnMap, 'dm_message_reactions', 'message_id', plan.dmMessageIds, 'DM message reactions');
  addCompoundDeleteSteps(steps, tables, columnMap, 'dm_messages', 'dm_id', plan.dmIds, 'DM messages');
  addCompoundDeleteSteps(steps, tables, columnMap, 'dm_members', 'dm_id', plan.dmIds, 'DM members');
  addCompoundDeleteSteps(steps, tables, columnMap, 'dms', 'id', plan.dmIds, 'DM threads');

  addCompoundDeleteSteps(steps, tables, columnMap, 'task_comments', 'task_id', plan.taskIds, 'task comments');
  addCompoundDeleteSteps(steps, tables, columnMap, 'task_reactions', 'workspace_id', plan.workspaceIds, 'task reactions');
  addCompoundDeleteSteps(steps, tables, columnMap, 'tasks', 'workspace_id', plan.workspaceIds, 'tasks');

  addCompoundDeleteSteps(steps, tables, columnMap, 'homework_submission_comments', 'submission_id', plan.homeworkSubmissionIds, 'homework comments');
  addCompoundDeleteSteps(steps, tables, columnMap, 'homework_submission_files', 'submission_id', plan.homeworkSubmissionIds, 'homework submission files');
  addCompoundDeleteSteps(steps, tables, columnMap, 'homework_submissions', 'workspace_id', plan.workspaceIds, 'homework submissions');
  addCompoundDeleteSteps(steps, tables, columnMap, 'homework_item_files', 'item_id', plan.homeworkIds, 'homework item files');
  addCompoundDeleteSteps(steps, tables, columnMap, 'homework_completions', 'homework_id', plan.homeworkIds, 'homework completions');
  addCompoundDeleteSteps(steps, tables, columnMap, 'homework_items', 'workspace_id', plan.workspaceIds, 'homework items');

  addCompoundDeleteSteps(steps, tables, columnMap, 'attendance_notifications', 'session_id', plan.attendanceSessionIds, 'attendance notifications');
  addCompoundDeleteSteps(steps, tables, columnMap, 'attendance_records', 'session_id', plan.attendanceSessionIds, 'attendance records');
  addCompoundDeleteSteps(steps, tables, columnMap, 'attendance_sessions', 'workspace_id', plan.workspaceIds, 'attendance sessions');
  addCompoundDeleteSteps(steps, tables, columnMap, 'class_attendance_records', 'attendance_id', plan.classAttendanceIds, 'class attendance records');
  addCompoundDeleteSteps(steps, tables, columnMap, 'class_attendance', 'channel_id', plan.channelIds, 'class attendance');

  addCompoundDeleteSteps(steps, tables, columnMap, 'live_session_poll_responses', 'poll_id', plan.pollIds, 'live poll responses');
  addCompoundDeleteSteps(steps, tables, columnMap, 'live_session_poll_options', 'poll_id', plan.pollIds, 'live poll options');
  addCompoundDeleteSteps(steps, tables, columnMap, 'live_session_polls', 'workspace_id', plan.workspaceIds, 'live polls');
  addCompoundDeleteSteps(steps, tables, columnMap, 'live_breakout_room_members', 'room_id', plan.breakoutRoomIds, 'breakout members');
  addCompoundDeleteSteps(steps, tables, columnMap, 'live_breakout_rooms', 'workspace_id', plan.workspaceIds, 'breakout rooms');
  addCompoundDeleteSteps(steps, tables, columnMap, 'live_session_participants', 'workspace_id', plan.workspaceIds, 'live session participants');
  addCompoundDeleteSteps(steps, tables, columnMap, 'slide_state', 'live_session_id', plan.liveSessionIds, 'whiteboard / slide state');
  addCompoundDeleteSteps(steps, tables, columnMap, 'live_attendance', 'session_id', plan.liveSessionIds, 'live attendance');
  addCompoundDeleteSteps(steps, tables, columnMap, 'live_session_recordings', 'workspace_id', plan.workspaceIds, 'recordings');
  addCompoundDeleteSteps(steps, tables, columnMap, 'live_session_recording', 'workspace_id', plan.workspaceIds, 'recording controls');
  addCompoundDeleteSteps(steps, tables, columnMap, 'live_sessions', 'workspace_id', plan.workspaceIds, 'live sessions');

  addCompoundDeleteSteps(steps, tables, columnMap, 'calendar_event_targets', 'workspace_id', plan.workspaceIds, 'calendar targets');
  addCompoundDeleteSteps(steps, tables, columnMap, 'calendar_events', 'workspace_id', plan.workspaceIds, 'calendar events');

  addCompoundDeleteSteps(steps, tables, columnMap, 'workspace_email_logs', 'workspace_id', plan.workspaceIds, 'workspace email logs');
  addCompoundDeleteSteps(steps, tables, columnMap, 'email_events', 'workspace_id', plan.workspaceIds, 'email events');
  addCompoundDeleteSteps(steps, tables, columnMap, 'email_replies', 'inbound_email_id', plan.inboundEmailIds, 'email replies');
  addCompoundDeleteSteps(steps, tables, columnMap, 'inbound_emails', 'workspace_id', plan.workspaceIds, 'inbound emails');
  addCompoundDeleteSteps(steps, tables, columnMap, 'deleted_inbound_emails', 'message_id', plan.deletedInboundMessageIds, 'deleted inbound email markers');

  addCompoundDeleteSteps(steps, tables, columnMap, 'homework_submission_files', 'file_id', plan.fileIds, 'homework file links');
  addCompoundDeleteSteps(steps, tables, columnMap, 'homework_item_files', 'file_id', plan.fileIds, 'homework file links');
  addCompoundDeleteSteps(steps, tables, columnMap, 'file_events', 'workspace_id', plan.workspaceIds, 'file analytics');
  addCompoundDeleteSteps(steps, tables, columnMap, 'file_stats', 'workspace_id', plan.workspaceIds, 'file counters');
  addCompoundDeleteSteps(steps, tables, columnMap, 'files_registry', 'workspace_id', plan.workspaceIds, 'managed files registry');

  addCompoundDeleteSteps(steps, tables, columnMap, 'test_answers', 'attempt_id', plan.testAttemptIds, 'test answers');
  addCompoundDeleteSteps(steps, tables, columnMap, 'speaking_reviews', 'attempt_id', plan.testAttemptIds, 'speaking reviews');
  addCompoundDeleteSteps(steps, tables, columnMap, 'writing_reviews', 'attempt_id', plan.testAttemptIds, 'writing reviews');
  addCompoundDeleteSteps(steps, tables, columnMap, 'test_attempts', 'test_channel_id', plan.testChannelIds, 'test attempts');
  addCompoundDeleteSteps(steps, tables, columnMap, 'test_options', 'test_task_id', plan.testTaskIds, 'test options');
  addCompoundDeleteSteps(steps, tables, columnMap, 'transcript_items', 'task_id', plan.testTaskIds, 'transcript items');
  addCompoundDeleteSteps(steps, tables, columnMap, 'test_tasks', 'test_section_id', plan.testSectionIds, 'test tasks');
  addCompoundDeleteSteps(steps, tables, columnMap, 'test_sections', 'test_channel_id', plan.testChannelIds, 'test sections');
  addCompoundDeleteSteps(steps, tables, columnMap, 'test_channels', 'workspace_id', plan.workspaceIds, 'test channels');

  addCompoundDeleteSteps(steps, tables, columnMap, 'ai_conversation_messages', 'conversation_id', plan.aiConversationIds, 'AI conversation messages');
  addCompoundDeleteSteps(steps, tables, columnMap, 'ai_runtime_sessions', 'workspace_id', plan.workspaceIds, 'AI runtime sessions');
  addCompoundDeleteSteps(steps, tables, columnMap, 'ai_usage_ledger', 'workspace_id', plan.workspaceIds, 'AI usage ledger');
  addCompoundDeleteSteps(steps, tables, columnMap, 'ai_conversations', 'workspace_id', plan.workspaceIds, 'AI conversations');
  addCompoundDeleteSteps(steps, tables, columnMap, 'ai_budget_settings', 'workspace_id', plan.workspaceIds, 'AI budget settings');

  addCompoundDeleteSteps(steps, tables, columnMap, 'knowledge_items', 'workspace_id', plan.workspaceIds, 'knowledge items');
  addCompoundDeleteSteps(steps, tables, columnMap, 'student_notes', 'workspace_id', plan.workspaceIds, 'student notes');
  addCompoundDeleteSteps(steps, tables, columnMap, 'student_progress', 'workspace_id', plan.workspaceIds, 'student progress');
  addCompoundDeleteSteps(steps, tables, columnMap, 'certificates', 'workspace_id', plan.workspaceIds, 'certificates');

  addCompoundDeleteSteps(steps, tables, columnMap, 'payments', 'workspace_id', plan.workspaceIds, 'payments');
  addCompoundDeleteSteps(steps, tables, columnMap, 'invoices', 'workspace_id', plan.workspaceIds, 'invoices');
  addCompoundDeleteSteps(steps, tables, columnMap, 'workspace_billing', 'workspace_id', plan.workspaceIds, 'workspace billing');

  addCompoundDeleteSteps(steps, tables, columnMap, 'refresh_tokens', 'user_id', plan.userIds, 'refresh tokens');
  addCompoundDeleteSteps(steps, tables, columnMap, 'revoked_access_tokens', 'user_id', plan.userIds, 'revoked access tokens');
  addCompoundDeleteSteps(steps, tables, columnMap, 'password_history', 'user_id', plan.userIds, 'password history');
  addCompoundDeleteSteps(steps, tables, columnMap, 'password_resets', 'workspace_id', plan.workspaceIds, 'password resets');
  addCompoundDeleteSteps(steps, tables, columnMap, 'login_attempts', 'workspace_id', plan.workspaceIds, 'login attempts');
  addCompoundDeleteSteps(steps, tables, columnMap, 'policy_acceptances', 'workspace_id', plan.workspaceIds, 'policy acceptances');

  addCompoundDeleteSteps(steps, tables, columnMap, 'registration_links', 'workspace_id', plan.workspaceIds, 'registration links');
  addCompoundDeleteSteps(steps, tables, columnMap, 'orphaned_registration_links_archive', 'workspace_id', plan.workspaceIds, 'registration-link archive');
  addCompoundDeleteSteps(steps, tables, columnMap, 'workspace_email_templates', 'workspace_id', plan.workspaceIds, 'workspace email templates');
  addCompoundDeleteSteps(steps, tables, columnMap, 'workspace_email_settings', 'workspace_id', plan.workspaceIds, 'workspace email settings');
  addCompoundDeleteSteps(steps, tables, columnMap, 'workspace_profile', 'workspace_id', plan.workspaceIds, 'workspace profile');
  addCompoundDeleteSteps(steps, tables, columnMap, 'workspace_settings_admin', 'workspace_id', plan.workspaceIds, 'workspace admin settings');
  addCompoundDeleteSteps(steps, tables, columnMap, 'workspace_class_meta', 'workspace_id', plan.workspaceIds, 'workspace class metadata');
  addCompoundDeleteSteps(steps, tables, columnMap, 'workspace_onboarding_steps', 'workspace_id', plan.workspaceIds, 'workspace onboarding steps');
  addCompoundDeleteSteps(steps, tables, columnMap, 'workspace_onboarding_events', 'workspace_id', plan.workspaceIds, 'workspace onboarding events');
  addCompoundDeleteSteps(steps, tables, columnMap, 'workspace_onboarding', 'workspace_id', plan.workspaceIds, 'workspace onboarding');
  addCompoundDeleteSteps(steps, tables, columnMap, 'workspace_activation_metrics', 'workspace_id', plan.workspaceIds, 'workspace activation metrics');

  addCompoundDeleteSteps(steps, tables, columnMap, 'orphaned_attendance_notifications_archive', 'workspace_id', plan.workspaceIds, 'orphan attendance archive');
  addCompoundDeleteSteps(steps, tables, columnMap, 'orphaned_attendance_records_archive', 'workspace_id', plan.workspaceIds, 'orphan attendance archive');
  addCompoundDeleteSteps(steps, tables, columnMap, 'orphaned_attendance_sessions_archive', 'workspace_id', plan.workspaceIds, 'orphan attendance archive');
  addCompoundDeleteSteps(steps, tables, columnMap, 'orphaned_file_events_archive', 'workspace_id', plan.workspaceIds, 'orphan file archive');
  addCompoundDeleteSteps(steps, tables, columnMap, 'orphaned_files_registry_archive', 'workspace_id', plan.workspaceIds, 'orphan file archive');
  addCompoundDeleteSteps(steps, tables, columnMap, 'orphaned_homework_item_files_archive', 'workspace_id', plan.workspaceIds, 'orphan homework archive');
  addCompoundDeleteSteps(steps, tables, columnMap, 'orphaned_homework_items_archive', 'workspace_id', plan.workspaceIds, 'orphan homework archive');
  addCompoundDeleteSteps(steps, tables, columnMap, 'orphaned_homework_submission_comments_archive', 'workspace_id', plan.workspaceIds, 'orphan homework archive');
  addCompoundDeleteSteps(steps, tables, columnMap, 'orphaned_homework_submission_files_archive', 'workspace_id', plan.workspaceIds, 'orphan homework archive');
  addCompoundDeleteSteps(steps, tables, columnMap, 'orphaned_homework_submissions_archive', 'workspace_id', plan.workspaceIds, 'orphan homework archive');
  addCompoundDeleteSteps(steps, tables, columnMap, 'orphaned_workspace_class_meta_archive', 'workspace_id', plan.workspaceIds, 'orphan workspace metadata archive');

  addCompoundDeleteSteps(steps, tables, columnMap, 'workspace_members', 'workspace_id', plan.workspaceIds, 'workspace memberships');
  addCompoundDeleteSteps(steps, tables, columnMap, 'channel_members', 'channel_id', plan.channelIds, 'channel memberships');
  addCompoundDeleteSteps(steps, tables, columnMap, 'user_channel_prefs', 'channel_id', plan.channelIds, 'channel preferences');
  addCompoundDeleteSteps(steps, tables, columnMap, 'user_preferences', 'workspace_id', plan.workspaceIds, 'user preferences');
  addCompoundDeleteSteps(steps, tables, columnMap, 'users', 'workspace_id', plan.workspaceIds, 'workspace users');
  addCompoundDeleteSteps(steps, tables, columnMap, 'channels', 'workspace_id', plan.workspaceIds, 'workspace channels');
  addCompoundDeleteSteps(steps, tables, columnMap, 'workspaces', 'id', plan.workspaceIds, 'workspaces');

  return steps;
}

function summarizeDeleteSteps(db, steps) {
  const tableTotals = new Map();
  for (const step of steps) {
    const count = queryCount(db, step.table, step.whereSql, step.params);
    if (count <= 0) continue;
    tableTotals.set(step.table, (tableTotals.get(step.table) || 0) + count);
  }
  return [...tableTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([table, count]) => ({ table, count }));
}

function executeDeleteSteps(db, steps) {
  const runTx = db.transaction((allSteps) => {
    const totals = new Map();
    for (const step of allSteps) {
      const info = db.prepare(`DELETE FROM ${step.table} WHERE ${step.whereSql}`).run(...step.params);
      const changes = Number(info?.changes || 0);
      if (changes > 0) {
        totals.set(step.table, (totals.get(step.table) || 0) + changes);
      }
    }
    return [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([table, count]) => ({ table, count }));
  });
  return runTx(steps);
}

function buildManagedDeleteList(managedRoot, rows) {
  const normalizedRoot = path.resolve(managedRoot);
  return rows
    .map((row) => {
      const provider = lower(row.storage_provider || 'local_disk');
      const key = String(row.storage_key || '').trim();
      if (!key || provider !== 'local_disk') return null;
      const absPath = path.resolve(normalizedRoot, key);
      const metaPath = `${absPath}.meta.json`;
      return {
        fileId: String(row.file_id || ''),
        storageKey: key,
        absPath,
        metaPath
      };
    })
    .filter(Boolean);
}

function detectManagedOrphans(managedRoot, registryStorageKeys) {
  const rootDir = path.resolve(managedRoot);
  const registryKeySet = new Set(registryStorageKeys.map((value) => String(value)));
  const files = listFilesRecursively(rootDir);
  const orphans = [];
  for (const absPath of files) {
    const rel = path.relative(rootDir, absPath).split(path.sep).join('/');
    if (!rel || rel.startsWith('..')) continue;
    if (rel.endsWith('.meta.json')) {
      const base = rel.slice(0, -'.meta.json'.length);
      if (!registryKeySet.has(base)) {
        orphans.push({ relativePath: rel, absPath, kind: 'metadata' });
      }
      continue;
    }
    if (!registryKeySet.has(rel)) {
      orphans.push({ relativePath: rel, absPath, kind: 'file' });
    }
  }
  return orphans.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function deleteManagedFiles(managedRoot, filesToDelete) {
  const deleted = [];
  const failures = [];
  for (const item of filesToDelete) {
    for (const candidate of [item.absPath, item.metaPath]) {
      try {
        if (!fs.existsSync(candidate)) continue;
        fs.unlinkSync(candidate);
        removeEmptyParentDirs(managedRoot, candidate);
        deleted.push(candidate);
      } catch (err) {
        failures.push({ path: candidate, error: err?.message || String(err) });
      }
    }
  }
  return { deleted, failures };
}

function deleteOrphanFiles(managedRoot, orphans) {
  const deleted = [];
  const failures = [];
  for (const orphan of orphans) {
    try {
      if (!fs.existsSync(orphan.absPath)) continue;
      fs.unlinkSync(orphan.absPath);
      removeEmptyParentDirs(managedRoot, orphan.absPath);
      deleted.push(orphan.relativePath);
    } catch (err) {
      failures.push({ path: orphan.relativePath, error: err?.message || String(err) });
    }
  }
  return { deleted, failures };
}

function printHeader(title) {
  console.log(`\n=== ${title} ===`);
}

function printPlan(targetRows, planSummary, managedDeletes, orphanReport, args) {
  printHeader('Cleanup Candidates');
  if (!targetRows.length) {
    console.log('No demo/sample workspace data matched the cleanup rules.');
    return;
  }

  for (const row of targetRows) {
    const reasons = Array.isArray(row.reasons) ? row.reasons : [];
    console.log(`- ${row.id} | ${row.name} | rules: ${formatList(reasons)}`);
  }

  printHeader('Delete Plan');
  for (const item of planSummary) {
    console.log(`- ${item.table}: ${item.count}`);
  }
  if (!planSummary.length) {
    console.log('- No matching rows found in cleanup scope.');
  }

  printHeader('Managed File Deletes');
  console.log(`- registry-linked managed files: ${managedDeletes.length}`);
  if (managedDeletes.length) {
    for (const item of managedDeletes.slice(0, 20)) {
      console.log(`  - ${item.storageKey}`);
    }
    if (managedDeletes.length > 20) {
      console.log(`  - ... ${managedDeletes.length - 20} more`);
    }
  }

  printHeader('Orphan File Report');
  console.log(`- orphan managed files: ${orphanReport.length}`);
  if (orphanReport.length) {
    for (const item of orphanReport.slice(0, 20)) {
      console.log(`  - ${item.relativePath} [${item.kind}]`);
    }
    if (orphanReport.length > 20) {
      console.log(`  - ... ${orphanReport.length - 20} more`);
    }
    if (!args.deleteOrphans) {
      console.log('- orphans are only reported; pass --delete-orphans to remove them during a real cleanup run.');
    }
  }
}

function verifyPostCleanup(db, tablesBefore, targetedWorkspaceIds) {
  const integrity = queryOne(db, 'PRAGMA integrity_check');
  if (!integrity || String(integrity.integrity_check || '').toLowerCase() !== 'ok') {
    throw new Error(`PRAGMA integrity_check failed: ${JSON.stringify(integrity)}`);
  }

  for (const tableName of REQUIRED_TABLES) {
    if (tablesBefore.has(tableName) && !queryOne(db, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [tableName])) {
      throw new Error(`Required table is missing after cleanup: ${tableName}`);
    }
  }

  if (tablesBefore.has('users')) {
    const adminCountRow = queryOne(
      db,
      `SELECT COUNT(*) AS c FROM users WHERE lower(role) IN ('admin', 'school_admin', 'super_admin')`
    );
    const adminCount = Number(adminCountRow?.c || 0);
    if (adminCount < 1) {
      throw new Error('Cleanup would leave the platform without any admin/super_admin users.');
    }
  }

  if (tablesBefore.has('workspaces') && targetedWorkspaceIds.length) {
    for (const workspaceId of targetedWorkspaceIds) {
      const stillExists = queryOne(db, 'SELECT 1 FROM workspaces WHERE id = ? LIMIT 1', [workspaceId]);
      if (stillExists) {
        throw new Error(`Workspace ${workspaceId} still exists after cleanup.`);
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const isRealRun = !args.dryRun;

  if (isRealRun && !args.confirm) {
    throw new Error('Refusing to run without --confirm-cleanup');
  }

  const dbPath = getSqliteDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite database not found: ${dbPath}`);
  }

  const db = openSqlite(dbPath);
  let backupInfo = null;
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');

    const tables = tableSet(db);
    const columnMap = new Map([...tables].map((tableName) => [tableName, tableColumns(db, tableName)]));
    const explicitWorkspaceIdSet = new Set(args.workspaceIds);

    const workspaceRows = hasTable(tables, 'workspaces')
      ? queryRows(db, 'SELECT id, name, status, school_code, admin_email, created_at FROM workspaces ORDER BY lower(name), lower(id)')
      : [];

    const targetRows = workspaceRows
      .map((row) => ({
        ...row,
        reasons: collectWorkspaceRules(row, explicitWorkspaceIdSet)
      }))
      .filter((row) => row.reasons.length > 0);

    const targetWorkspaceIds = targetRows.map((row) => String(row.id));
    const plan = collectPlan(db, tables, columnMap, { workspaceIds: targetWorkspaceIds });
    const steps = buildDeleteSteps(tables, columnMap, plan);
    const planSummary = summarizeDeleteSteps(db, steps);

    const managedRoot = resolveManagedRoot();
    const managedDeletes = buildManagedDeleteList(managedRoot, plan.managedFileRows);
    const registryStorageKeys = hasTable(tables, 'files_registry')
      ? queryDistinctValues(db, 'files_registry', 'storage_key')
      : [];
    const orphanReport = fs.existsSync(managedRoot)
      ? detectManagedOrphans(managedRoot, registryStorageKeys)
      : [];

    printHeader('Mode');
    console.log(args.dryRun ? 'Dry run only. No data will be deleted.' : 'Real cleanup run.');
    console.log(`Database: ${dbPath}`);
    console.log(`Managed storage root: ${managedRoot}`);
    console.log(`Started at: ${nowIso()}`);

    printPlan(targetRows, planSummary, managedDeletes, orphanReport, args);

    if (!targetRows.length) {
      printHeader('Result');
      console.log('Nothing matched the cleanup rules. Exiting without changes.');
      return;
    }

    if (!args.dryRun) {
      backupInfo = await backupSqlite({
        sourceDbPath: dbPath,
        backupPath: buildBackupPath({ label: 'cleanup-demo-data' }),
        label: 'cleanup-demo-data'
      });
      printHeader('Backup');
      console.log(`- backup database: ${backupInfo.backupPath}`);
      console.log(`- backup manifest: ${backupInfo.manifestPath}`);

      const deletedTables = executeDeleteSteps(db, steps);
      const fileDeleteResult = deleteManagedFiles(managedRoot, managedDeletes);
      const orphanDeleteResult = args.deleteOrphans ? deleteOrphanFiles(managedRoot, orphanReport) : { deleted: [], failures: [] };

      verifyPostCleanup(db, tables, targetWorkspaceIds);

      printHeader('Deleted Rows');
      for (const item of deletedTables) {
        console.log(`- ${item.table}: ${item.count}`);
      }
      if (!deletedTables.length) {
        console.log('- No rows were deleted.');
      }

      printHeader('Managed File Cleanup');
      console.log(`- deleted managed file entries on disk: ${fileDeleteResult.deleted.length}`);
      if (fileDeleteResult.failures.length) {
        console.log(`- managed file delete failures: ${fileDeleteResult.failures.length}`);
        for (const failure of fileDeleteResult.failures.slice(0, 20)) {
          console.log(`  - ${failure.path}: ${failure.error}`);
        }
      }

      printHeader('Orphan File Cleanup');
      if (args.deleteOrphans) {
        console.log(`- deleted orphan files: ${orphanDeleteResult.deleted.length}`);
        if (orphanDeleteResult.failures.length) {
          console.log(`- orphan delete failures: ${orphanDeleteResult.failures.length}`);
          for (const failure of orphanDeleteResult.failures.slice(0, 20)) {
            console.log(`  - ${failure.path}: ${failure.error}`);
          }
        }
      } else {
        console.log('- orphan files were not deleted.');
      }

      printHeader('Verification');
      console.log('- PRAGMA integrity_check: ok');
      console.log(`- required tables verified: ${REQUIRED_TABLES.join(', ')}`);
      console.log('- admin/super_admin presence verified');
    } else {
      printHeader('Backup');
      console.log('- no backup created in dry-run mode');
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(`Cleanup failed: ${err?.message || err}`);
  process.exitCode = 1;
});
