#!/usr/bin/env node
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'schema', 'pg');
const TABLE_NAME = 'schema_migrations';

function listMigrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d+_.*\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
}

async function loadAppliedMigrations(client) {
  const result = await client.query(`SELECT id FROM ${TABLE_NAME}`);
  return new Set(result.rows.map((row) => String(row.id)));
}

async function applyMigration(client, filename) {
  const fullPath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(fullPath, 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO ${TABLE_NAME} (id, applied_at) VALUES ($1, $2)`,
      [filename, new Date().toISOString()]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(`Migration failed for ${filename}: ${error.message}`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL || !String(process.env.DATABASE_URL).trim()) {
    throw new Error('DATABASE_URL is required to run PostgreSQL migrations.');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: String(process.env.PGSSL || '').trim().toLowerCase() === 'true'
      ? { rejectUnauthorized: false }
      : undefined
  });

  try {
    const client = await pool.connect();
    try {
      await ensureMigrationsTable(client);
      const applied = await loadAppliedMigrations(client);
      const files = listMigrationFiles();
      for (const filename of files) {
        if (applied.has(filename)) {
          console.log(`[db:migrate:pg] skipped ${filename}`);
          continue;
        }
        await applyMigration(client, filename);
        console.log(`[db:migrate:pg] applied ${filename}`);
      }
      console.log('[db:migrate:pg] complete');
    } finally {
      client.release();
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[db:migrate:pg] failed:', error.message || error);
  process.exit(1);
});
