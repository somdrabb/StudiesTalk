#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  backupSqlite,
  getSqliteDbPath,
  hasFlag,
  openSqlite,
  parseArgValue,
  resolveAppPath,
  timestamp
} = require('./sqlite-backup-utils');

function requireConfirmation() {
  if (!hasFlag('--confirm-restore')) {
    throw new Error('Refusing to restore without --confirm-restore');
  }
}

function resolveBackupFile() {
  const from = parseArgValue('--from');
  if (!from) {
    throw new Error('Provide --from <backup-file>');
  }
  const resolved = resolveAppPath(from, path.resolve(from));
  if (!fs.existsSync(resolved)) {
    throw new Error(`Backup file not found: ${resolved}`);
  }
  return resolved;
}

function verifyReadableSqlite(filePath) {
  const db = openSqlite(filePath, { readonly: true, fileMustExist: true });
  try {
    db.prepare('SELECT name FROM sqlite_master LIMIT 1').get();
  } finally {
    db.close();
  }
}

async function main() {
  requireConfirmation();

  const backupFile = resolveBackupFile();
  const targetDbPath = resolveAppPath(parseArgValue('--target'), getSqliteDbPath());

  verifyReadableSqlite(backupFile);

  if (fs.existsSync(targetDbPath)) {
    const safetyBackupPath = `${targetDbPath}.pre-restore-${timestamp()}.db`;
    const safety = await backupSqlite({
      sourceDbPath: targetDbPath,
      backupPath: safetyBackupPath,
      label: 'pre-restore'
    });
    console.log('[restore-sqlite-backup] safety backup:', safety.backupPath);
  }

  fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${targetDbPath}${suffix}`, { force: true });
  }
  fs.copyFileSync(backupFile, targetDbPath);

  verifyReadableSqlite(targetDbPath);

  console.log('[restore-sqlite-backup] restored from:', backupFile);
  console.log('[restore-sqlite-backup] target:', targetDbPath);
}

main().catch((err) => {
  console.error('[restore-sqlite-backup] failed:', err?.message || err);
  process.exit(1);
});
