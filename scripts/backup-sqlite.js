#!/usr/bin/env node
'use strict';

const {
  backupSqlite,
  buildBackupPath,
  getSqliteDbPath,
  parseArgValue,
  recordBackupEvent
} = require('./sqlite-backup-utils');

async function main() {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const label = parseArgValue('--label') || 'manual';
  const sourceDbPath = getSqliteDbPath();
  const backupPath = buildBackupPath({ label });
  const result = await backupSqlite({ sourceDbPath, backupPath, label });
  recordBackupEvent({
    type: 'backup',
    status: 'completed',
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    filePath: result.backupPath,
    sizeBytes: result.sizeBytes,
    checksum: result.checksum,
    actor: process.env.USER || process.env.LOGNAME || 'cli'
  });

  console.log('[backup-sqlite] source:', sourceDbPath);
  console.log('[backup-sqlite] backup:', result.backupPath);
  console.log('[backup-sqlite] manifest:', result.manifestPath);
}

main().catch((err) => {
  try {
    recordBackupEvent({
      type: 'backup',
      status: 'failed',
      error: err?.message || String(err),
      actor: process.env.USER || process.env.LOGNAME || 'cli'
    });
  } catch (_eventErr) {}
  console.error('[backup-sqlite] failed:', err?.message || err);
  process.exit(1);
});
