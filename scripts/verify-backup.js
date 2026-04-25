#!/usr/bin/env node
'use strict';

const {
  findLatestBackup,
  parseArgValue,
  resolveAppPath,
  verifyBackupTables
} = require('./sqlite-backup-utils');

function resolveBackupFile() {
  const explicit = parseArgValue('--file');
  if (explicit) {
    return resolveAppPath(explicit, explicit);
  }
  const latest = findLatestBackup();
  if (!latest) {
    throw new Error('No backup file found. Create one with npm run backup:sqlite first.');
  }
  return latest;
}

function main() {
  const backupFile = resolveBackupFile();
  const result = verifyBackupTables(backupFile, [
    'workspaces',
    'users',
    'channels',
    'messages',
    'files_registry'
  ]);

  console.log('[verify-backup] backup:', backupFile);
  console.log('[verify-backup] tables:', result.tables.length);
  console.log('[verify-backup] key counts:', JSON.stringify(result.tableCounts));
}

try {
  main();
} catch (err) {
  console.error('[verify-backup] failed:', err?.message || err);
  process.exit(1);
}
