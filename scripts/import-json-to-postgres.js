#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DEFAULT_IN_DIR = path.join(process.cwd(), 'output', 'postgres-cutover', 'postgres-transform');
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

async function loadExistingTableSet(client) {
  const result = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  `);
  return new Set(result.rows.map((row) => String(row.table_name || '').toLowerCase()));
}

async function loadTableColumns(client, tableNames) {
  const tables = Array.from(tableNames);
  if (!tables.length) return new Map();

  const result = await client.query(`
    SELECT table_name, column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
    ORDER BY table_name, ordinal_position
  `, [tables]);

  const columnsByTable = new Map(tables.map((table) => [table, new Map()]));
  for (const row of result.rows) {
    const table = String(row.table_name || '').toLowerCase();
    const column = String(row.column_name || '').toLowerCase();
    if (!columnsByTable.has(table)) columnsByTable.set(table, new Map());
    columnsByTable.get(table).set(column, {
      dataType: String(row.data_type || '').toLowerCase(),
      udtName: String(row.udt_name || '').toLowerCase()
    });
  }
  return columnsByTable;
}

async function loadForeignKeyGraph(client, tableNames) {
  const tables = Array.from(tableNames);
  if (!tables.length) return new Map();

  const result = await client.query(`
    SELECT
      child_ns.nspname AS child_schema,
      child.relname AS child_table,
      parent_ns.nspname AS parent_schema,
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

function sortTablesForImport(entries, dependencyGraph) {
  const entriesByTable = new Map(entries.map((entry) => [entry.table, entry]));
  const remainingParents = new Map();
  const dependents = new Map();

  for (const entry of entries) {
    const table = entry.table;
    const parents = new Set(
      Array.from(dependencyGraph.get(table) || []).filter((parent) => entriesByTable.has(parent))
    );
    remainingParents.set(table, parents);
    if (!dependents.has(table)) dependents.set(table, new Set());
    for (const parent of parents) {
      if (!dependents.has(parent)) dependents.set(parent, new Set());
      dependents.get(parent).add(table);
    }
  }

  const ready = entries
    .filter((entry) => (remainingParents.get(entry.table) || new Set()).size === 0)
    .map((entry) => entry.table);
  const ordered = [];
  const seen = new Set();

  while (ready.length) {
    const table = ready.shift();
    if (seen.has(table)) continue;
    seen.add(table);
    ordered.push(entriesByTable.get(table));
    for (const child of dependents.get(table) || []) {
      const parents = remainingParents.get(child);
      parents.delete(table);
      if (parents.size === 0) ready.push(child);
    }
  }

  for (const entry of entries) {
    if (!seen.has(entry.table)) ordered.push(entry);
  }

  return ordered;
}

function applyDependencySkips(entries, dependencyGraph, skippedReasonByTable) {
  const remaining = new Map(entries.map((entry) => [entry.table, entry]));
  let changed = true;

  while (changed) {
    changed = false;
    for (const [table, entry] of Array.from(remaining.entries())) {
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

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeImportStatus({
  importedTables,
  skippedTables,
  tableStats,
  repairedRows,
  skippedOrphanRows
}) {
  ensureParentDir(IMPORT_STATUS_PATH);
  fs.writeFileSync(IMPORT_STATUS_PATH, JSON.stringify({
    importedTables,
    skippedTables,
    tableStats,
    repaired_rows: repairedRows,
    skipped_orphan_rows: skippedOrphanRows
  }, null, 2));
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

function coerceEpochToIso(value) {
  if (value === null || value === undefined || value === '') return value;
  if (value instanceof Date) return value.toISOString();

  const numeric = typeof value === 'number'
    ? value
    : (/^-?\d+(?:\.\d+)?$/.test(String(value).trim()) ? Number(value) : NaN);
  if (!Number.isFinite(numeric)) return value;

  const ms = Math.abs(numeric) >= 1e12 ? numeric : numeric * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString();
}

function normalizeValueForColumn(value, columnMeta) {
  if (!columnMeta) return value;

  const dataType = columnMeta.dataType;
  const udtName = columnMeta.udtName;
  if (value === null || value === undefined) return value;

  if (dataType === 'timestamp with time zone' || dataType === 'timestamp without time zone') {
    return coerceEpochToIso(value);
  }

  if (dataType === 'date') {
    const isoValue = coerceEpochToIso(value);
    if (typeof isoValue === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(isoValue)) {
      return isoValue.slice(0, 10);
    }
    return isoValue;
  }

  if (dataType === 'boolean' && (udtName === 'bool' || udtName === 'boolean')) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === '1' || normalized === 'true') return true;
    if (normalized === '0' || normalized === 'false') return false;
  }

  return value;
}

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeEpochMs(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  const text = String(value).trim();
  if (!text) return fallback;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  return fallback;
}

function normalizeJsonText(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return String(value);
  }
}

async function loadReferenceSet(client, tableName, columnName = 'id') {
  const result = await client.query(
    `SELECT ${quoteIdent(columnName)} AS value FROM ${quoteIdent(tableName)}`
  );
  return new Set(
    result.rows
      .map((row) => normalizeText(row.value))
      .filter(Boolean)
  );
}

async function prepareRowsForImport(client, tableName, rows, actualColumns) {
  const repairedRows = [];
  const skippedOrphanRows = [];
  const outputRows = [];
  const now = Date.now();

  const recordRepair = (reason) => repairedRows.push(reason);
  const recordSkip = (reason) => skippedOrphanRows.push(reason);

  if (tableName === 'refresh_tokens' || tableName === 'password_resets') {
    const userIds = await loadReferenceSet(client, 'users', 'id');
    const workspaceIds = tableName === 'password_resets'
      ? await loadReferenceSet(client, 'workspaces', 'id')
      : null;

    for (const row of rows) {
      const normalizedUserId = normalizeText(row.user_id);
      if (!normalizedUserId || !userIds.has(normalizedUserId)) {
        recordSkip('orphaned_auth_records');
        continue;
      }

      const nextRow = { ...row, user_id: normalizedUserId };
      if (tableName === 'refresh_tokens') {
        const normalizedCreatedAt = normalizeEpochMs(row.created_at, normalizeEpochMs(row.issued_at, now));
        const normalizedIssuedAt = normalizeEpochMs(row.issued_at, normalizedCreatedAt);
        if (normalizedCreatedAt !== row.created_at) recordRepair('created_at_fallback');
        if (normalizedIssuedAt !== row.issued_at) recordRepair('issued_at_fallback');
        nextRow.created_at = normalizedCreatedAt;
        nextRow.issued_at = normalizedIssuedAt;
      }

      if (tableName === 'password_resets') {
        const workspaceId = normalizeText(row.workspace_id);
        if (workspaceId && workspaceIds && !workspaceIds.has(workspaceId)) {
          nextRow.workspace_id = null;
          recordRepair('workspace_id_to_null');
        } else {
          nextRow.workspace_id = workspaceId;
        }
        nextRow.created_at = normalizeEpochMs(row.created_at, now);
        nextRow.expires_at = normalizeEpochMs(row.expires_at, nextRow.created_at);
        nextRow.used = normalizeBoolean(row.used, Boolean(row.used_at));
        if (nextRow.created_at !== row.created_at) recordRepair('created_at_fallback');
        if (nextRow.expires_at !== row.expires_at) recordRepair('expires_at_fallback');
        if (nextRow.used !== row.used) recordRepair('used_normalized');
      }

      outputRows.push(nextRow);
    }

    return { rows: outputRows, repairedRows, skippedOrphanRows };
  }

  if (tableName === 'security_events') {
    const userIds = await loadReferenceSet(client, 'users', 'id');
    const workspaceIds = await loadReferenceSet(client, 'workspaces', 'id');

    for (const row of rows) {
      const nextRow = { ...row };
      const normalizedType = normalizeText(row.type) || normalizeText(row.event_type) || 'unknown';
      const normalizedCreatedAt = normalizeEpochMs(row.created_at, now);
      const normalizedSeverity = normalizeText(row.severity) || 'info';
      const workspaceId = normalizeText(row.workspace_id);
      const actorUserId = normalizeText(row.actor_user_id);
      const targetUserId = normalizeText(row.target_user_id);

      if (!normalizeText(row.type) && !normalizeText(row.event_type)) recordRepair('type_fallback');
      if (normalizedCreatedAt !== row.created_at) recordRepair('created_at_fallback');
      if (!normalizeText(row.severity)) recordRepair('severity_fallback');

      nextRow.type = normalizedType;
      nextRow.created_at = normalizedCreatedAt;
      nextRow.severity = normalizedSeverity;
      nextRow.payload = normalizeJsonText(row.payload);

      if (workspaceId && workspaceIds.has(workspaceId)) {
        nextRow.workspace_id = workspaceId;
      } else {
        if (workspaceId) recordRepair('workspace_id_to_null');
        nextRow.workspace_id = null;
      }

      if (actorUserId && userIds.has(actorUserId)) {
        nextRow.actor_user_id = actorUserId;
      } else {
        if (actorUserId) recordRepair('actor_user_id_to_null');
        nextRow.actor_user_id = null;
      }

      if (targetUserId && userIds.has(targetUserId)) {
        nextRow.target_user_id = targetUserId;
      } else {
        if (targetUserId) recordRepair('target_user_id_to_null');
        nextRow.target_user_id = null;
      }

      if (actualColumns.has('event_type')) {
        nextRow.event_type = normalizedType;
        if (!normalizeText(row.event_type)) recordRepair('event_type_backfilled');
      }

      outputRows.push(nextRow);
    }

    return { rows: outputRows, repairedRows, skippedOrphanRows };
  }

  if (tableName === 'registration_sessions') {
    for (const row of rows) {
      const nextRow = { ...row };
      nextRow.email_verified = normalizeBoolean(row.email_verified, false);
      nextRow.mobile_verified = normalizeBoolean(row.mobile_verified, false);
      nextRow.created_at = normalizeEpochMs(row.created_at, now);
      nextRow.last_updated = normalizeEpochMs(row.last_updated, nextRow.created_at);
      outputRows.push(nextRow);
    }
    return { rows: outputRows, repairedRows, skippedOrphanRows };
  }

  if (tableName === 'register_otps') {
    for (const row of rows) {
      const nextRow = { ...row };
      nextRow.code = normalizeText(row.code) || normalizeText(row.otp_hash) || '';
      nextRow.created_at = normalizeEpochMs(row.created_at, now);
      nextRow.expires_at = normalizeEpochMs(row.expires_at, nextRow.created_at);
      outputRows.push(nextRow);
    }
    return { rows: outputRows, repairedRows, skippedOrphanRows };
  }

  if (tableName === 'registration_links') {
    const workspaceIds = await loadReferenceSet(client, 'workspaces', 'id');
    const channelIds = await loadReferenceSet(client, 'channels', 'id');
    const userIds = await loadReferenceSet(client, 'users', 'id');
    for (const row of rows) {
      const workspaceId = normalizeText(row.workspace_id);
      if (!workspaceId || !workspaceIds.has(workspaceId)) {
        recordSkip('missing_workspace_id');
        continue;
      }
      const nextRow = { ...row, workspace_id: workspaceId };
      const channelId = normalizeText(row.channel_id);
      nextRow.channel_id = channelId && channelIds.has(channelId) ? channelId : null;
      if (channelId && !nextRow.channel_id) recordRepair('channel_id_to_null');
      const createdBy = normalizeText(row.created_by_user_id);
      nextRow.created_by_user_id = createdBy && userIds.has(createdBy) ? createdBy : null;
      if (createdBy && !nextRow.created_by_user_id) recordRepair('created_by_user_id_to_null');
      nextRow.email = normalizeText(row.email) || '';
      nextRow.role = normalizeText(row.role) || 'student';
      nextRow.created_at = normalizeText(row.created_at) || new Date(now).toISOString();
      nextRow.expires_at = normalizeEpochMs(row.expires_at, now);
      nextRow.used = normalizeBoolean(row.used, Boolean(row.used_at));
      outputRows.push(nextRow);
    }
    return { rows: outputRows, repairedRows, skippedOrphanRows };
  }

  if (tableName === 'homework_completions') {
    const homeworkIds = await loadReferenceSet(client, 'homework_items', 'id');
    const userIds = await loadReferenceSet(client, 'users', 'id');

    for (const row of rows) {
      const homeworkId = normalizeText(row.homework_id);
      const studentId = normalizeText(row.student_id);
      if (!homeworkId || !homeworkIds.has(homeworkId)) {
        recordSkip('missing_homework_id');
        continue;
      }
      if (!studentId || !userIds.has(studentId)) {
        recordSkip('missing_student_id');
        continue;
      }
      outputRows.push({
        ...row,
        homework_id: homeworkId,
        student_id: studentId
      });
    }

    return { rows: outputRows, repairedRows, skippedOrphanRows };
  }

  return { rows, repairedRows, skippedOrphanRows };
}

function summarizeCounts(items) {
  const counts = new Map();
  for (const item of items) {
    counts.set(item, Number(counts.get(item) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => a.reason.localeCompare(b.reason));
}

function printCountSummary(label, entries) {
  console.log(`[summary] ${label}: ${entries.length}`);
  for (const entry of entries) {
    console.log(`- ${entry.table}: count=${entry.count}${entry.reason ? ` reason=${entry.reason}` : ''}`);
  }
}

async function main() {
  const inDir = process.argv[2] || DEFAULT_IN_DIR;
  const manifestPath = path.join(inDir, 'manifest.json');
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

  const client = await pool.connect();
  try {
    const migratedTables = loadMigratedTableSet();
    const existingTables = await loadExistingTableSet(client);
    const existingMigratedTables = Array.from(migratedTables).filter((table) => existingTables.has(table));
    const tableColumns = await loadTableColumns(client, existingMigratedTables);
    const skippedReasonByTable = new Map();
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
      const filePath = path.join(inDir, entry.file);
      const rows = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const manifestColumns = collectRowColumns(rows);
      const actualColumns = tableColumns.get(tableName) || new Map();
      const missingColumns = Array.from(manifestColumns).filter((column) => !actualColumns.has(column)).sort();
      if (missingColumns.length) {
        skippedReasonByTable.set(
          tableName,
          `manifest columns missing in Postgres table: ${missingColumns.join(', ')}`
        );
        continue;
      }
      candidateEntries.push({
        table: tableName,
        file: entry.file,
        rows
      });
    }

    const dependencyGraph = await loadForeignKeyGraph(client, existingMigratedTables);
    const importEntries = applyDependencySkips(candidateEntries, dependencyGraph, skippedReasonByTable);
    const orderedEntries = sortTablesForImport(importEntries, dependencyGraph);
    const importedTables = [];
    const runtimeSkippedReasonByTable = new Map(skippedReasonByTable);
    const tableStats = {};
    const repairedRowsSummary = [];
    const skippedOrphanRowsSummary = [];

    await client.query('BEGIN');
    if (orderedEntries.length) {
      await client.query(
        `TRUNCATE TABLE ${orderedEntries.map((entry) => quoteIdent(entry.table)).join(', ')} RESTART IDENTITY CASCADE`
      );
    }

    for (const entry of orderedEntries) {
      const tableName = entry.table;
      const rows = entry.rows;
      const blockedBy = Array.from(dependencyGraph.get(tableName) || [])
        .filter((parent) => runtimeSkippedReasonByTable.has(parent))
        .sort();
      if (blockedBy.length) {
        runtimeSkippedReasonByTable.set(
          tableName,
          `depends on skipped migrated table(s): ${blockedBy.join(', ')}`
        );
        continue;
      }

      console.log(`[import] ${tableName}: ${rows.length} rows`);
      await client.query(`SAVEPOINT import_${tableName}`);
      try {
        const actualColumns = tableColumns.get(tableName) || new Map();
        const prepared = await prepareRowsForImport(client, tableName, rows, actualColumns);
        const rowsToInsert = prepared.rows;
        tableStats[tableName] = {
          sourceRows: rows.length,
          importedRows: rowsToInsert.length,
          repairedRows: prepared.repairedRows.length,
          skippedOrphanRows: prepared.skippedOrphanRows.length
        };

        for (const entry of summarizeCounts(prepared.repairedRows)) {
          repairedRowsSummary.push({ table: tableName, count: entry.count, reason: entry.reason });
        }
        for (const entry of summarizeCounts(prepared.skippedOrphanRows)) {
          skippedOrphanRowsSummary.push({ table: tableName, count: entry.count, reason: entry.reason });
        }

        if (prepared.repairedRows.length) {
          console.log(`[repair] ${tableName}: ${prepared.repairedRows.length} repaired rows`);
        }
        if (prepared.skippedOrphanRows.length) {
          console.log(`[skip-orphan] ${tableName}: ${prepared.skippedOrphanRows.length} skipped orphan rows`);
        }

        if (rowsToInsert.length) {
          const columns = Array.from(collectRowColumns(rowsToInsert));
          const columnMeta = tableColumns.get(tableName) || new Map();
          const quotedColumns = columns.map(quoteIdent).join(', ');
          const valueGroups = [];
          const params = [];

          rowsToInsert.forEach((row, rowIndex) => {
            const placeholders = columns.map((_column, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`);
            valueGroups.push(`(${placeholders.join(', ')})`);
            columns.forEach((column) => {
              params.push(normalizeValueForColumn(row[column], columnMeta.get(String(column).toLowerCase())));
            });
          });

          await client.query(
            `INSERT INTO ${quoteIdent(tableName)} (${quotedColumns}) VALUES ${valueGroups.join(', ')}`,
            params
          );
        }

        await client.query(`RELEASE SAVEPOINT import_${tableName}`);
        importedTables.push(tableName);
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT import_${tableName}`);
        await client.query(`RELEASE SAVEPOINT import_${tableName}`);
        runtimeSkippedReasonByTable.set(
          tableName,
          `insert failed: ${String(error && error.message ? error.message : error)}`
        );
        console.log(`[skip] ${tableName}: ${runtimeSkippedReasonByTable.get(tableName)}`);
        continue;
      }
    }

    await client.query('COMMIT');
    const skippedTables = Array.from(runtimeSkippedReasonByTable.entries())
      .map(([table, reason]) => ({ table, reason }))
      .sort((a, b) => a.table.localeCompare(b.table));
    writeImportStatus({
      importedTables,
      skippedTables,
      tableStats,
      repairedRows: repairedRowsSummary,
      skippedOrphanRows: skippedOrphanRowsSummary
    });
    printTableSummary('imported tables', importedTables);
    printTableSummary('skipped tables', skippedTables);
    printCountSummary('repaired_rows', repairedRowsSummary);
    printCountSummary('skipped_orphan_rows', skippedOrphanRowsSummary);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[import-json-to-postgres] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
