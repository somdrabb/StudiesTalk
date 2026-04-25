#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DEFAULT_MANIFEST = path.join(process.cwd(), 'output', 'postgres-cutover', 'postgres-transform', 'manifest.json');
const PG_SCHEMA_DIR = path.join(process.cwd(), 'db', 'schema', 'pg');
const IMPORT_STATUS_PATH = path.join(process.cwd(), 'output', 'postgres-cutover', 'postgres-import-status.json');

function quoteIdent(name) {
  return `"${String(name || '').replace(/"/g, '""')}"`;
}

function loadMigratedTableSet() {
  if (!fs.existsSync(PG_SCHEMA_DIR)) {
    throw new Error(`Missing Postgres schema directory: ${PG_SCHEMA_DIR}`);
  }

  const tables = new Set();
  const schemaFiles = fs.readdirSync(PG_SCHEMA_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const file of schemaFiles) {
    const sql = fs.readFileSync(path.join(PG_SCHEMA_DIR, file), 'utf8');
    const matches = sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?([a-zA-Z0-9_]+)"?/gi);
    for (const match of matches) {
      tables.add(String(match[1] || '').toLowerCase());
    }
  }

  return tables;
}

async function loadExistingTableSet(pool) {
  const result = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  `);
  return new Set(result.rows.map((row) => String(row.table_name || '').toLowerCase()));
}

async function loadTableColumns(pool, tableNames) {
  const tables = Array.from(tableNames);
  if (!tables.length) return new Map();

  const result = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
    ORDER BY table_name, ordinal_position
  `, [tables]);

  const columnsByTable = new Map(tables.map((table) => [table, new Set()]));
  for (const row of result.rows) {
    const table = String(row.table_name || '').toLowerCase();
    const column = String(row.column_name || '').toLowerCase();
    if (!columnsByTable.has(table)) columnsByTable.set(table, new Set());
    columnsByTable.get(table).add(column);
  }
  return columnsByTable;
}

async function loadForeignKeyGraph(pool, tableNames) {
  const tables = Array.from(tableNames);
  if (!tables.length) return new Map();

  const result = await pool.query(`
    SELECT
      child.relname AS child_table,
      parent.relname AS parent_table
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    WHERE con.contype = 'f'
      AND child_ns.nspname = 'public'
      AND parent_ns.nspname = 'public'
      AND child.relname = ANY($1::text[])
      AND parent.relname = ANY($1::text[])
  `, [tables]);

  const graph = new Map(tables.map((table) => [table, new Set()]));
  for (const row of result.rows) {
    const child = String(row.child_table || '').toLowerCase();
    const parent = String(row.parent_table || '').toLowerCase();
    if (child && parent && child !== parent && graph.has(child)) {
      graph.get(child).add(parent);
    }
  }
  return graph;
}

function applyDependencySkips(entries, dependencyGraph, skippedReasonByTable) {
  const remaining = new Map(entries.map((entry) => [entry.table, entry]));
  let changed = true;

  while (changed) {
    changed = false;
    for (const [table] of Array.from(remaining.entries())) {
      const blockedBy = Array.from(dependencyGraph.get(table) || [])
        .filter((parent) => skippedReasonByTable.has(parent))
        .sort();
      if (!blockedBy.length) continue;
      skippedReasonByTable.set(
        table,
        `depends on skipped migrated table(s): ${blockedBy.join(', ')}`
      );
      remaining.delete(table);
      changed = true;
    }
  }

  return Array.from(remaining.values());
}

function printTableSummary(label, entries) {
  console.log(`[summary] ${label}: ${entries.length}`);
  for (const entry of entries) {
    if (typeof entry === 'string') {
      console.log(`- ${entry}`);
      continue;
    }
    console.log(`- ${entry.table}: ${entry.reason}`);
  }
}

function collectRowColumns(rows) {
  const columns = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row || {})) {
      columns.add(String(key).toLowerCase());
    }
  }
  return columns;
}

async function main() {
  const manifestPath = process.argv[2] || DEFAULT_MANIFEST;
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing manifest: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined
  });

  let failed = false;
  const mismatches = [];
  const verifiedTables = [];
  let repairedRowsSummary = [];
  let skippedOrphanRowsSummary = [];
  try {
    const migratedTables = loadMigratedTableSet();
    const existingTables = await loadExistingTableSet(pool);
    const existingMigratedTables = Array.from(migratedTables).filter((table) => existingTables.has(table));
    const tableColumns = await loadTableColumns(pool, existingMigratedTables);
    const dependencyGraph = await loadForeignKeyGraph(pool, existingMigratedTables);
    const skippedReasonByTable = new Map();
    const importStatus = fs.existsSync(IMPORT_STATUS_PATH)
      ? JSON.parse(fs.readFileSync(IMPORT_STATUS_PATH, 'utf8'))
      : null;
    const importedTableAllowlist = importStatus && Array.isArray(importStatus.importedTables)
      ? new Set(importStatus.importedTables.map((table) => String(table || '').toLowerCase()))
      : null;
    const importedTableStats = importStatus && importStatus.tableStats && typeof importStatus.tableStats === 'object'
      ? importStatus.tableStats
      : {};
    repairedRowsSummary = Array.isArray(importStatus?.repaired_rows) ? importStatus.repaired_rows : [];
    skippedOrphanRowsSummary = Array.isArray(importStatus?.skipped_orphan_rows) ? importStatus.skipped_orphan_rows : [];
    if (importStatus && Array.isArray(importStatus.skippedTables)) {
      for (const entry of importStatus.skippedTables) {
        const table = String(entry && entry.table || '').toLowerCase();
        const reason = String(entry && entry.reason || 'skipped during import');
        if (table) skippedReasonByTable.set(table, reason);
      }
    }
    const candidateEntries = [];

    for (const entry of manifest.tables || []) {
      const tableName = String(entry.table || '').toLowerCase();
      if (!migratedTables.has(tableName)) {
        skippedReasonByTable.set(tableName, 'not present in db/schema/pg/*.sql');
        continue;
      }
      if (!existingTables.has(tableName)) {
        skippedReasonByTable.set(tableName, 'schema file exists but relation is not created in Postgres yet');
        continue;
      }
      const filePath = path.join(path.dirname(manifestPath), entry.file);
      const rows = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const manifestColumns = collectRowColumns(rows);
      const actualColumns = tableColumns.get(tableName) || new Set();
      const missingColumns = Array.from(manifestColumns).filter((column) => !actualColumns.has(column)).sort();
      if (missingColumns.length) {
        skippedReasonByTable.set(
          tableName,
          `manifest columns missing in Postgres table: ${missingColumns.join(', ')}`
        );
        continue;
      }
      if (importedTableAllowlist && !importedTableAllowlist.has(tableName)) {
        if (!skippedReasonByTable.has(tableName)) {
          skippedReasonByTable.set(tableName, 'not imported in the most recent migrated-tables-only import run');
        }
        continue;
      }
      const tableStats = importedTableStats[tableName] || {};
      candidateEntries.push({
        table: tableName,
        expected: Number(
          tableStats.importedRows !== undefined
            ? tableStats.importedRows
            : (entry.rows || 0)
        )
      });
    }

    const entriesToVerify = applyDependencySkips(candidateEntries, dependencyGraph, skippedReasonByTable);
    const skippedTables = Array.from(skippedReasonByTable.entries())
      .map(([table, reason]) => ({ table, reason }))
      .sort((a, b) => a.table.localeCompare(b.table));

    for (const entry of entriesToVerify) {
      const tableName = entry.table;
      const result = await pool.query(`SELECT COUNT(*)::bigint AS c FROM ${quoteIdent(tableName)}`);
      const actual = Number(result.rows[0]?.c || 0);
      const expected = entry.expected;
      const ok = actual === expected;
      if (!ok) failed = true;
      verifiedTables.push(tableName);
      if (!ok) mismatches.push({ table: tableName, expected, actual });
      console.log(`[verify] ${tableName}: expected=${expected} actual=${actual} ${ok ? 'OK' : 'MISMATCH'}`);
    }

    const aggregateChecks = [
      { label: 'workspaces', sql: 'SELECT COUNT(*)::bigint AS c FROM workspaces' },
      { label: 'users', sql: 'SELECT COUNT(*)::bigint AS c FROM users' },
      { label: 'channels', sql: 'SELECT COUNT(*)::bigint AS c FROM channels' },
      { label: 'messages', sql: 'SELECT COUNT(*)::bigint AS c FROM messages' },
      { label: 'users_by_role', sql: "SELECT COALESCE(role, 'unknown') AS label, COUNT(*)::bigint AS c FROM users GROUP BY COALESCE(role, 'unknown') ORDER BY label" },
      { label: 'audit_log', sql: 'SELECT COUNT(*)::bigint AS c FROM audit_log' },
      { label: 'invoices_open_total', sql: "SELECT COALESCE(SUM(amount_cents), 0)::bigint AS c FROM invoices WHERE lower(COALESCE(status, '')) = 'open'" },
      { label: 'payments_total', sql: 'SELECT COALESCE(SUM(amount_cents), 0)::bigint AS c FROM payments' },
      { label: 'tasks_total', sql: 'SELECT COUNT(*)::bigint AS c FROM tasks' },
      { label: 'homework_submissions_total', sql: 'SELECT COUNT(*)::bigint AS c FROM homework_submissions' },
      { label: 'attendance_records_total', sql: 'SELECT COUNT(*)::bigint AS c FROM attendance_records' }
    ];

    for (const check of aggregateChecks) {
      try {
        const result = await pool.query(check.sql);
        if (result.rows.length === 1 && Object.prototype.hasOwnProperty.call(result.rows[0], 'c')) {
          console.log(`[aggregate] ${check.label}: ${result.rows[0]?.c || 0}`);
        } else {
          console.log(`[aggregate] ${check.label}: ${JSON.stringify(result.rows)}`);
        }
      } catch (_err) {
        // table may not exist yet in partial migrations
      }
    }

    if (mismatches.length) {
      console.log('[mismatches]');
      mismatches.forEach((entry) => {
        console.log(`- ${entry.table}: expected=${entry.expected} actual=${entry.actual}`);
      });
    }

    printTableSummary('verified tables', verifiedTables);
    printTableSummary('skipped tables', skippedTables);
    printTableSummary('repaired_rows', repairedRowsSummary.map((entry) => ({
      table: String(entry.table || ''),
      reason: `count=${Number(entry.count || 0)}${entry.reason ? ` reason=${entry.reason}` : ''}`
    })));
    printTableSummary('skipped_orphan_rows', skippedOrphanRowsSummary.map((entry) => ({
      table: String(entry.table || ''),
      reason: `count=${Number(entry.count || 0)}${entry.reason ? ` reason=${entry.reason}` : ''}`
    })));
  } finally {
    await pool.end();
  }

  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error('[verify-postgres-import] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
