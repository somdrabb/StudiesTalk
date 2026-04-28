#!/usr/bin/env node
'use strict';

const ENV = require('../server/env');

function main() {
  console.log('[preflight] nodeEnv:', ENV.NODE_ENV);
  console.log('[preflight] appBaseUrl:', ENV.BASE_URL || '(not configured)');
  console.log('[preflight] dbEngine:', ENV.DB_ENGINE);
  console.log('[preflight] databaseUrlConfigured:', ENV.DATABASE_URL ? 'yes' : 'no');
  console.log('[preflight] uploadsDir:', ENV.UPLOADS_DIR);
  console.log('[preflight] backupDir:', ENV.DB_BACKUP_DIR);
  console.log('[preflight] fileStorageAdapter:', ENV.FILE_STORAGE_ADAPTER);
  console.log('[preflight] jitsiDomain:', ENV.JITSI_DOMAIN || '(not configured)');
  if (ENV.ENV_VALIDATION?.warnings?.length) {
    console.log('[preflight] env warnings:');
    for (const warning of ENV.ENV_VALIDATION.warnings) {
      console.log(`- ${warning}`);
    }
  } else {
    console.log('[preflight] env warnings: none');
  }
  if (ENV.ENV_VALIDATION?.errors?.length) {
    console.log('[preflight] env blockers:');
    for (const error of ENV.ENV_VALIDATION.errors) {
      console.log(`- ${error}`);
    }
  } else {
    console.log('[preflight] env blockers: none');
  }
  console.log('[preflight] summary:', JSON.stringify(ENV.ENV_VALIDATION?.summary || {}, null, 2));
}

try {
  main();
} catch (err) {
  console.error('[preflight] failed:', err?.message || err);
  process.exit(1);
}
