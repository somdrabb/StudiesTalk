#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function readSchemaText() {
  const root = path.resolve(__dirname, '..');
  const schemaDir = path.join(root, 'db', 'schema');
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
  for (const table of requiredWorkspaceTables) {
    assert.ok(new RegExp(`\\b${table}\\b`, 'i').test(schema), `schema should include ${table}`);
  }
  assert.ok(/\bworkspace_id\b/i.test(schema), 'schema must define workspace_id columns');
  return { mode: 'static', checkedTables: requiredWorkspaceTables.length };
}

function sqliteIntegrityCheck(dbPath) {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
    const has = (name) => tables.includes(name);
    const orphanChecks = [];
    function count(sql) {
      return Number(db.prepare(sql).get()?.count || 0);
    }
    if (has('users') && has('workspaces')) {
      orphanChecks.push(['users_without_workspace', count(`SELECT COUNT(*) AS count FROM users u LEFT JOIN workspaces w ON w.id = u.workspace_id WHERE u.workspace_id IS NOT NULL AND w.id IS NULL`)]);
    }
    if (has('channels') && has('workspaces')) {
      orphanChecks.push(['channels_without_workspace', count(`SELECT COUNT(*) AS count FROM channels c LEFT JOIN workspaces w ON w.id = c.workspace_id WHERE c.workspace_id IS NOT NULL AND w.id IS NULL`)]);
    }
    if (has('messages') && has('channels')) {
      orphanChecks.push(['messages_without_channel', count(`SELECT COUNT(*) AS count FROM messages m LEFT JOIN channels c ON c.id = m.channel_id WHERE c.id IS NULL`)]);
    }
    if (has('attendance_records') && has('attendance_sessions')) {
      orphanChecks.push(['attendance_records_without_session', count(`SELECT COUNT(*) AS count FROM attendance_records ar LEFT JOIN attendance_sessions s ON s.id = ar.session_id WHERE ar.session_id IS NOT NULL AND s.id IS NULL`)]);
    }
    const failing = orphanChecks.filter(([, value]) => value > 0);
    assert.deepStrictEqual(failing, [], `orphaned isolation rows found: ${JSON.stringify(failing)}`);
    return { mode: 'sqlite', dbPath, orphanChecks };
  } finally {
    db.close();
  }
}

function runIntegrityCheck() {
  const dbPath = process.env.DB_PATH || process.env.SQLITE_DB_PATH || '';
  if (dbPath && fs.existsSync(dbPath)) return sqliteIntegrityCheck(dbPath);
  return staticSchemaCheck();
}

if (require.main === module) {
  const result = runIntegrityCheck();
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

module.exports = {
  runIntegrityCheck
};
