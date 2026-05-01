#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  checksumFile,
  findLatestBackup,
  openSqlite,
  parseArgValue,
  recordBackupEvent,
  resolveAppPath,
  verifyBackupTables
} = require('./sqlite-backup-utils');

function resolveBackupFile() {
  const explicit = parseArgValue('--file');
  if (explicit) return resolveAppPath(explicit, path.resolve(explicit));
  const latest = findLatestBackup();
  if (!latest) throw new Error('No backup file found. Create one with npm run backup:sqlite first.');
  return latest;
}

function main() {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  let tempFile = '';
  try {
    const backupFile = resolveBackupFile();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studiestalk-restore-test-'));
    tempFile = path.join(tempDir, path.basename(backupFile));
    fs.copyFileSync(backupFile, tempFile);

    const verification = verifyBackupTables(tempFile, [
      'workspaces',
      'users',
      'channels',
      'messages'
    ]);
    const db = openSqlite(tempFile, { readonly: true, fileMustExist: true });
    try {
      db.prepare('SELECT COUNT(*) AS count FROM sqlite_master WHERE type = ?').get('table');
    } finally {
      db.close();
    }

    const event = recordBackupEvent({
      type: 'restore_test',
      status: 'completed',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      filePath: backupFile,
      sizeBytes: fs.statSync(backupFile).size,
      checksum: checksumFile(backupFile),
      actor: process.env.USER || process.env.LOGNAME || 'cli'
    });

    console.log('[restore-test-sqlite] backup:', backupFile);
    console.log('[restore-test-sqlite] temp copy:', tempFile);
    console.log('[restore-test-sqlite] key counts:', JSON.stringify(verification.tableCounts));
    console.log('[restore-test-sqlite] event:', event.id);
  } catch (err) {
    try {
      recordBackupEvent({
        type: 'restore_test',
        status: 'failed',
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        filePath: tempFile || null,
        actor: process.env.USER || process.env.LOGNAME || 'cli',
        error: err?.message || String(err)
      });
    } catch (_eventErr) {}
    throw err;
  }
}

try {
  main();
} catch (err) {
  console.error('[restore-test-sqlite] failed:', err?.message || err);
  process.exit(1);
}
