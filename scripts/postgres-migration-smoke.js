#!/usr/bin/env node
'use strict';

require('dotenv').config();

const assert = require('assert');
const { spawnSync } = require('child_process');
const { Pool } = require('pg');

const TEST_DATABASE_URL = String(process.env.TEST_DATABASE_URL || '').trim();
const REQUIRED_TABLES = [
  'users',
  'workspaces',
  'channels',
  'messages',
  'workspace_members',
  'platform_legal_settings',
  'platform_legal_versions',
  'legal_acceptances',
  'live_session_recording',
  'live_session_recordings',
  'live_session_polls',
  'live_breakout_rooms',
  'attendance_sessions',
  'attendance_records'
];

function runMigration(databaseUrl) {
  const result = spawnSync(process.execPath, ['scripts/migrate-postgres.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl
    },
    stdio: 'inherit'
  });
  assert.strictEqual(result.status, 0, 'PostgreSQL migration runner failed');
}

async function main() {
  if (!TEST_DATABASE_URL) {
    console.log('[test:postgres:migration] skipped: TEST_DATABASE_URL is not set');
    return;
  }

  runMigration(TEST_DATABASE_URL);

  const pool = new Pool({
    connectionString: TEST_DATABASE_URL,
    ssl: String(process.env.PGSSL || '').trim().toLowerCase() === 'true'
      ? { rejectUnauthorized: false }
      : undefined
  });

  try {
    for (const tableName of REQUIRED_TABLES) {
      const result = await pool.query('SELECT to_regclass($1) AS table_name', [`public.${tableName}`]);
      assert.strictEqual(result.rows[0]?.table_name, tableName, `Missing table: ${tableName}`);
    }

    const migrations = await pool.query('SELECT COUNT(*)::int AS c FROM schema_migrations');
    assert.ok(Number(migrations.rows[0]?.c || 0) > 0, 'schema_migrations should contain applied rows');
    console.log('[test:postgres:migration] passed');
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[test:postgres:migration] failed:', error?.stack || error?.message || error);
  process.exit(1);
});
