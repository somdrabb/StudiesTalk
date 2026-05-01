#!/usr/bin/env node
'use strict';

const {
  checksumFile,
  findLatestBackup,
  parseArgValue,
  recordBackupEvent,
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
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const backupFile = resolveBackupFile();
  const result = verifyBackupTables(backupFile, [
    'workspaces',
    'users',
    'channels',
    'messages',
    'files_registry'
  ]);
  recordBackupEvent({
    type: 'verify',
    status: 'completed',
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    filePath: backupFile,
    sizeBytes: require('fs').statSync(backupFile).size,
    checksum: checksumFile(backupFile),
    actor: process.env.USER || process.env.LOGNAME || 'cli'
  });

  console.log('[verify-backup] backup:', backupFile);
  console.log('[verify-backup] tables:', result.tables.length);
  console.log('[verify-backup] key counts:', JSON.stringify(result.tableCounts));
}

try {
  main();
} catch (err) {
  try {
    recordBackupEvent({
      type: 'verify',
      status: 'failed',
      error: err?.message || String(err),
      actor: process.env.USER || process.env.LOGNAME || 'cli'
    });
  } catch (_eventErr) {}
  console.error('[verify-backup] failed:', err?.message || err);
  process.exit(1);
}
