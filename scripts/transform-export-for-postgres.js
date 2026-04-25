#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_IN_DIR = path.join(process.cwd(), 'output', 'postgres-cutover', 'sqlite-export');
const DEFAULT_OUT_DIR = path.join(process.cwd(), 'output', 'postgres-cutover', 'postgres-transform');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeValue(key, value) {
  if (value === undefined) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return value;
    if (/(_at|date|createdAt|updatedAt|paidAt|reviewedAt|returnedAt|submittedAt)$/i.test(key)) {
      return value;
    }
  }
  return value;
}

function main() {
  const inDir = process.argv[2] || DEFAULT_IN_DIR;
  const outDir = process.argv[3] || DEFAULT_OUT_DIR;
  ensureDir(outDir);

  const manifestPath = path.join(inDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing manifest: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const transformedManifest = {
    source: manifest.source,
    transformedAt: new Date().toISOString(),
    tables: []
  };

  for (const entry of manifest.tables || []) {
    const inPath = path.join(inDir, entry.file);
    const outPath = path.join(outDir, entry.file);
    const rows = JSON.parse(fs.readFileSync(inPath, 'utf8'));
    const transformed = rows.map((row) => {
      const next = {};
      Object.entries(row || {}).forEach(([key, value]) => {
        next[key] = normalizeValue(key, value);
      });
      return next;
    });
    fs.writeFileSync(outPath, JSON.stringify(transformed, null, 2));
    transformedManifest.tables.push({
      table: entry.table,
      rows: transformed.length,
      file: entry.file
    });
    console.log(`[transform] ${entry.table}: ${transformed.length} rows`);
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(transformedManifest, null, 2));
}

main();
