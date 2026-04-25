#!/usr/bin/env node
'use strict';

const ENV = require('../server/env');

function main() {
  console.log('[preflight] nodeEnv:', ENV.NODE_ENV);
  console.log('[preflight] appBaseUrl:', ENV.BASE_URL || '(not configured)');
  console.log('[preflight] dbEngine:', ENV.DB_ENGINE);
  console.log('[preflight] uploadsDir:', ENV.UPLOADS_DIR);
  console.log('[preflight] backupDir:', ENV.DB_BACKUP_DIR);
  if (ENV.ENV_VALIDATION?.warnings?.length) {
    console.log('[preflight] env warnings:');
    for (const warning of ENV.ENV_VALIDATION.warnings) {
      console.log(`- ${warning}`);
    }
  } else {
    console.log('[preflight] env warnings: none');
  }
}

try {
  main();
} catch (err) {
  console.error('[preflight] failed:', err?.message || err);
  process.exit(1);
}
