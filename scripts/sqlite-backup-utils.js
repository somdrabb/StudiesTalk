#!/usr/bin/env node
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.join(process.cwd(), 'storage', 'studiestalk.db');
const DEFAULT_BACKUP_DIR = path.join(process.cwd(), 'backup');
const BACKUP_PREFIX = 'studiestalk-sqlite-backup';

function resolveAppPath(inputPath, fallbackAbsPath) {
  const raw = String(inputPath || '').trim();
  if (!raw) return fallbackAbsPath;
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

function getSqliteDbPath() {
  return resolveAppPath(process.env.DB_PATH, DEFAULT_DB_PATH);
}

function getBackupDir() {
  return resolveAppPath(process.env.DB_BACKUP_DIR, DEFAULT_BACKUP_DIR);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function timestamp() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function buildBackupPath({ backupDir = getBackupDir(), label = 'manual' } = {}) {
  const safeLabel = String(label || 'manual').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  ensureDir(backupDir);
  return path.join(backupDir, `${BACKUP_PREFIX}-${safeLabel}-${timestamp()}.db`);
}

function buildManifestPath(backupPath) {
  return `${backupPath}.json`;
}

function writeBackupManifest({ backupPath, sourceDbPath, label }) {
  const manifestPath = buildManifestPath(backupPath);
  const metadata = {
    createdAt: new Date().toISOString(),
    label: String(label || 'manual'),
    sourceDbPath,
    backupPath,
    backupSizeBytes: fs.existsSync(backupPath) ? fs.statSync(backupPath).size : 0,
    walPresentAtBackup: fs.existsSync(`${sourceDbPath}-wal`),
    shmPresentAtBackup: fs.existsSync(`${sourceDbPath}-shm`)
  };
  fs.writeFileSync(manifestPath, JSON.stringify(metadata, null, 2));
  return manifestPath;
}

function openSqlite(filePath, options = {}) {
  return new Database(filePath, options);
}

async function backupSqlite({ sourceDbPath = getSqliteDbPath(), backupPath, label = 'manual' } = {}) {
  if (!backupPath) {
    throw new Error('backupPath is required');
  }
  if (!fs.existsSync(sourceDbPath)) {
    throw new Error(`SQLite database not found: ${sourceDbPath}`);
  }

  ensureDir(path.dirname(backupPath));
  const sourceDb = openSqlite(sourceDbPath);
  try {
    sourceDb.pragma('busy_timeout = 5000');
    sourceDb.pragma('wal_checkpoint(PASSIVE)');
    if (typeof sourceDb.backup === 'function') {
      await sourceDb.backup(backupPath);
    } else {
      fs.copyFileSync(sourceDbPath, backupPath);
    }
  } finally {
    sourceDb.close();
  }

  const manifestPath = writeBackupManifest({ backupPath, sourceDbPath, label });
  return { backupPath, manifestPath };
}

function listBackups(backupDir = getBackupDir()) {
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir)
    .filter((name) => name.startsWith(`${BACKUP_PREFIX}-`) && name.endsWith('.db'))
    .map((name) => path.join(backupDir, name))
    .sort((a, b) => {
      const aTime = fs.statSync(a).mtimeMs;
      const bTime = fs.statSync(b).mtimeMs;
      return bTime - aTime;
    });
}

function findLatestBackup(backupDir = getBackupDir()) {
  return listBackups(backupDir)[0] || null;
}

function verifyBackupTables(filePath, requiredTables = ['workspaces', 'users', 'channels']) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Backup file not found: ${filePath}`);
  }
  const db = openSqlite(filePath, { readonly: true, fileMustExist: true });
  try {
    const tables = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
    `).all().map((row) => String(row.name || ''));
    const tableCounts = {};
    for (const table of requiredTables) {
      if (!tables.includes(table)) {
        throw new Error(`Required table missing in backup: ${table}`);
      }
      const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
      tableCounts[table] = Number(row?.n || 0);
    }
    return { tables, tableCounts };
  } finally {
    db.close();
  }
}

function parseArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return '';
  return String(process.argv[index + 1] || '').trim();
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

module.exports = {
  BACKUP_PREFIX,
  buildBackupPath,
  buildManifestPath,
  backupSqlite,
  ensureDir,
  findLatestBackup,
  getBackupDir,
  getSqliteDbPath,
  hasFlag,
  listBackups,
  openSqlite,
  parseArgValue,
  resolveAppPath,
  timestamp,
  verifyBackupTables
};
