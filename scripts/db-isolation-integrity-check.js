#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOC_PATH = path.join(ROOT, 'docs', 'db-isolation-integrity-report.md');

function readSchemaText() {
  const schemaDir = path.join(ROOT, 'db', 'schema');
  const chunks = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (/\.(sql|js)$/.test(entry)) chunks.push(fs.readFileSync(full, 'utf8'));
    }
  }
  walk(schemaDir);
  return chunks.join('\n');
}

function normalizeIssue(issue) {
  return {
    id: issue.id,
    severity: issue.severity || 'review',
    table: issue.table || '',
    description: issue.description || '',
    count: Number(issue.count || 0)
  };
}

function staticSchemaCheck() {
  const schema = readSchemaText();
  const requiredWorkspaceTables = [
    'users',
    'channels',
    'messages',
    'homework_items',
    'attendance_sessions',
    'attendance_records',
    'workspace_billing',
    'invoices',
    'payments',
    'notification_deliveries'
  ];
  const issues = [];
  for (const table of requiredWorkspaceTables) {
    if (!new RegExp(`\\b${table}\\b`, 'i').test(schema)) {
      issues.push(normalizeIssue({
        id: `${table}_missing`,
        severity: 'high',
        table,
        description: `${table} table was not found in schema text.`,
        count: 1
      }));
    }
  }
  if (!/\bworkspace_id\b/i.test(schema)) {
    issues.push(normalizeIssue({
      id: 'workspace_id_missing',
      severity: 'critical',
      description: 'No workspace_id columns were found in schema text.',
      count: 1
    }));
  }
  const score = scoreIntegrity({ issues, checkedTables: requiredWorkspaceTables.length });
  const result = { mode: 'static', checkedTables: requiredWorkspaceTables.length, issues, score };
  writeReport(result);
  assert.strictEqual(issues.filter((issue) => issue.severity === 'critical').length, 0, 'critical schema isolation issues found');
  return result;
}

function getColumns(db, table) {
  return db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all().map((row) => row.name);
}

function tableExists(tables, name) {
  return tables.includes(name);
}

function sqliteIntegrityCheck(dbPath) {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
    const has = (name) => tables.includes(name);
    const issues = [];
    const orphanChecks = [];
    const workspaceTablesExpected = [
      'users',
      'channels',
      'messages',
      'homework_items',
      'homework_submissions',
      'attendance_sessions',
      'attendance_records',
      'workspace_billing',
      'invoices',
      'payments',
      'notification_campaigns',
      'notification_deliveries',
      'workspace_email_logs',
      'ai_conversations',
      'ai_usage_events'
    ];
    function count(sql) {
      return Number(db.prepare(sql).get()?.count || 0);
    }
    function addCountIssue(id, table, description, sql, severity = 'high') {
      if (!sql) return;
      const value = count(sql);
      orphanChecks.push([id, value]);
      if (value > 0) issues.push(normalizeIssue({ id, table, description, count: value, severity }));
    }
    function hasColumns(table, names) {
      if (!has(table)) return false;
      const columns = getColumns(db, table);
      return names.every((name) => columns.includes(name));
    }

    for (const table of workspaceTablesExpected) {
      if (!has(table)) continue;
      const columns = getColumns(db, table);
      if (!columns.includes('workspace_id')) {
        const derived = ['messages', 'homework_submissions', 'notification_campaigns'].includes(table);
        issues.push(normalizeIssue({
          id: `${table}_missing_workspace_id`,
          severity: derived ? 'review' : 'high',
          table,
          description: derived
            ? `${table} does not have workspace_id and must be scoped through parent/target/delivery rows in every query.`
            : `${table} is expected to include workspace_id.`,
          count: 1
        }));
      }
    }

    if (hasColumns('users', ['workspace_id']) && has('workspaces')) {
      addCountIssue('users_without_workspace', 'users', 'Users with unknown workspace_id.', `SELECT COUNT(*) AS count FROM users u LEFT JOIN workspaces w ON w.id = u.workspace_id WHERE u.workspace_id IS NOT NULL AND w.id IS NULL`);
    }
    if (hasColumns('channels', ['workspace_id']) && has('workspaces')) {
      addCountIssue('channels_without_workspace', 'channels', 'Channels with unknown workspace_id.', `SELECT COUNT(*) AS count FROM channels c LEFT JOIN workspaces w ON w.id = c.workspace_id WHERE c.workspace_id IS NOT NULL AND w.id IS NULL`);
    }
    if (hasColumns('messages', ['channel_id']) && has('channels')) {
      addCountIssue('messages_without_channel', 'messages', 'Messages without a valid channel.', `SELECT COUNT(*) AS count FROM messages m LEFT JOIN channels c ON c.id = m.channel_id WHERE c.id IS NULL`);
    }
    if (hasColumns('channel_members', ['channel_id', 'user_id']) && hasColumns('channels', ['workspace_id']) && hasColumns('users', ['workspace_id'])) {
      addCountIssue('channel_member_workspace_mismatch', 'channel_members', 'Channel member user belongs to a different workspace than the channel.', `
        SELECT COUNT(*) AS count
        FROM channel_members cm
        JOIN channels c ON c.id = cm.channel_id
        JOIN users u ON u.id = cm.user_id
        WHERE COALESCE(c.workspace_id, '') <> COALESCE(u.workspace_id, '')
      `);
    }
    if (hasColumns('homework_items', ['workspace_id']) && hasColumns('channels', ['workspace_id'])) {
      const columns = getColumns(db, 'homework_items');
      const channelColumn = columns.includes('channel_id') ? 'channel_id' : (columns.includes('class_channel_id') ? 'class_channel_id' : '');
      if (channelColumn) {
        addCountIssue('homework_item_channel_workspace_mismatch', 'homework_items', 'Homework item workspace differs from its channel/class workspace.', `
          SELECT COUNT(*) AS count
          FROM homework_items h
          JOIN channels c ON c.id = h.${channelColumn}
          WHERE COALESCE(h.workspace_id, '') <> COALESCE(c.workspace_id, '')
        `);
      }
    }
    if (hasColumns('homework_submissions', ['item_id', 'student_user_id']) && hasColumns('homework_items', ['id', 'workspace_id']) && hasColumns('users', ['id', 'workspace_id'])) {
      addCountIssue('homework_submission_workspace_mismatch', 'homework_submissions', 'Homework submission student workspace differs from item workspace.', `
        SELECT COUNT(*) AS count
        FROM homework_submissions hs
        JOIN homework_items h ON h.id = hs.item_id
        JOIN users u ON u.id = hs.student_user_id
        WHERE COALESCE(h.workspace_id, '') <> COALESCE(u.workspace_id, '')
      `);
    }
    if (hasColumns('attendance_records', ['session_id']) && has('attendance_sessions')) {
      addCountIssue('attendance_records_without_session', 'attendance_records', 'Attendance record without a valid session.', `SELECT COUNT(*) AS count FROM attendance_records ar LEFT JOIN attendance_sessions s ON s.id = ar.session_id WHERE ar.session_id IS NOT NULL AND s.id IS NULL`);
    }
    if (hasColumns('attendance_records', ['session_id', 'student_user_id']) && hasColumns('attendance_sessions', ['id', 'workspace_id']) && hasColumns('users', ['id', 'workspace_id'])) {
      addCountIssue('attendance_record_workspace_mismatch', 'attendance_records', 'Attendance record student workspace differs from session workspace.', `
        SELECT COUNT(*) AS count
        FROM attendance_records ar
        JOIN attendance_sessions s ON s.id = ar.session_id
        JOIN users u ON u.id = ar.student_user_id
        WHERE COALESCE(s.workspace_id, '') <> COALESCE(u.workspace_id, '')
      `);
    }
    if (hasColumns('workspace_billing', ['workspace_id']) && has('workspaces')) {
      addCountIssue('billing_without_workspace', 'workspace_billing', 'Billing row with unknown workspace_id.', `SELECT COUNT(*) AS count FROM workspace_billing wb LEFT JOIN workspaces w ON w.id = wb.workspace_id WHERE w.id IS NULL`);
    }
    for (const table of ['invoices', 'payments', 'notification_deliveries']) {
      if (hasColumns(table, ['workspace_id']) && has('workspaces')) {
        addCountIssue(`${table}_without_workspace`, table, `${table} rows with unknown workspace_id.`, `SELECT COUNT(*) AS count FROM ${table} t LEFT JOIN workspaces w ON w.id = t.workspace_id WHERE t.workspace_id IS NOT NULL AND w.id IS NULL`);
      }
    }
    if (hasColumns('direct_messages', ['id']) && hasColumns('dm_participants', ['dm_id', 'user_id']) && hasColumns('users', ['id', 'workspace_id'])) {
      addCountIssue('dm_mixed_workspace_participants', 'dm_participants', 'DM participants span more than one workspace.', `
        SELECT COUNT(*) AS count
        FROM (
          SELECT dp.dm_id
          FROM dm_participants dp
          JOIN users u ON u.id = dp.user_id
          GROUP BY dp.dm_id
          HAVING COUNT(DISTINCT COALESCE(u.workspace_id, '')) > 1
        ) mixed
      `);
    }
    const score = scoreIntegrity({ issues, checkedTables: tables.length });
    const result = { mode: 'sqlite', dbPath, checkedTables: tables.length, orphanChecks, issues, score };
    writeReport(result);
    const failing = issues.filter((issue) => ['critical', 'high'].includes(issue.severity) && issue.count > 0);
    assert.deepStrictEqual(failing, [], `isolation integrity issues found: ${JSON.stringify(failing)}`);
    return result;
  } finally {
    db.close();
  }
}

function scoreIntegrity({ issues = [], checkedTables = 0 } = {}) {
  const high = issues.filter((issue) => ['critical', 'high'].includes(issue.severity) && issue.count > 0).length;
  const review = issues.filter((issue) => issue.severity === 'review').length;
  const base = checkedTables > 0 ? 100 : 85;
  return Math.max(0, Math.round(base - high * 12 - review * 2));
}

function buildReport(result) {
  const issues = Array.isArray(result.issues) ? result.issues : [];
  const lines = [];
  lines.push('# DB Isolation Integrity Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Mode: ${result.mode}`);
  lines.push(`DB path: ${result.dbPath || 'schema static review'}`);
  lines.push(`Checked tables: ${result.checkedTables || 0}`);
  lines.push(`DB integrity score: ${result.score}/100`);
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  if (!issues.length) {
    lines.push('No critical/high DB isolation integrity issues were detected by this checker.');
  } else {
    lines.push('| Severity | Check | Table | Count | Description |');
    lines.push('|---|---|---|---|---|');
    for (const issue of issues) {
      lines.push(`| ${issue.severity} | ${issue.id} | ${issue.table || ''} | ${issue.count} | ${issue.description} |`);
    }
  }
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('This checker validates common workspace_id presence, orphan rows, and cross-workspace foreign-key mismatches where table/column names are discoverable in the current SQLite database. It does not replace database-level foreign keys or route-level authorization tests.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeReport(result, targetPath = DOC_PATH) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, buildReport(result));
  return targetPath;
}

function runIntegrityCheck() {
  const defaultDbPath = path.join(ROOT, 'storage', 'studiestalk.db');
  const dbPath = process.env.DB_PATH || process.env.SQLITE_DB_PATH || defaultDbPath;
  if (dbPath && fs.existsSync(dbPath)) return sqliteIntegrityCheck(dbPath);
  return staticSchemaCheck();
}

if (require.main === module) {
  const result = runIntegrityCheck();
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

module.exports = {
  runIntegrityCheck,
  sqliteIntegrityCheck,
  staticSchemaCheck,
  scoreIntegrity,
  buildReport,
  writeReport
};
