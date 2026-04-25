#!/usr/bin/env node
'use strict';

const {
  backupSqlite,
  buildBackupPath,
  getSqliteDbPath,
  parseArgValue
} = require('./sqlite-backup-utils');

async function main() {
  const label = parseArgValue('--label') || 'manual';
  const sourceDbPath = getSqliteDbPath();
  const backupPath = buildBackupPath({ label });
  const result = await backupSqlite({ sourceDbPath, backupPath, label });

  console.log('[backup-sqlite] source:', sourceDbPath);
  console.log('[backup-sqlite] backup:', result.backupPath);
  console.log('[backup-sqlite] manifest:', result.manifestPath);
}

main().catch((err) => {
  console.error('[backup-sqlite] failed:', err?.message || err);
  process.exit(1);
});
