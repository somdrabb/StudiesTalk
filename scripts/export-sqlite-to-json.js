#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'storage', 'studiestalk.db');
const DEFAULT_OUT_DIR = path.join(process.cwd(), 'output', 'postgres-cutover', 'sqlite-export');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizeFilename(name) {
  return String(name || '').replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function main() {
  const dbPath = process.argv[2] || DEFAULT_DB_PATH;
  const outDir = process.argv[3] || DEFAULT_OUT_DIR;
  const requestedTables = process.argv.slice(4);

  ensureDir(outDir);

  const db = new Database(dbPath, { readonly: true });
  const tableRows = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name ASC
  `).all();

  const tableNames = requestedTables.length
    ? requestedTables
    : tableRows.map((row) => String(row.name || ''));

  const manifest = {
    source: dbPath,
    exportedAt: new Date().toISOString(),
    tables: []
  };

  tableNames.forEach((tableName) => {
    const safeTableName = String(tableName || '').trim();
    if (!safeTableName) return;
    const rows = db.prepare(`SELECT * FROM "${safeTableName.replace(/"/g, '""')}"`).all();
    const fileName = `${sanitizeFilename(safeTableName)}.json`;
    const filePath = path.join(outDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(rows, null, 2));
    manifest.tables.push({
      table: safeTableName,
      rows: rows.length,
      file: fileName
    });
    console.log(`[export] ${safeTableName}: ${rows.length} rows`);
  });

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  db.close();
}

main();
