#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');

const result = spawnSync(process.execPath, ['scripts/tenant-isolation-smoke.js'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: process.env
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log('[tenant-isolation-hardening-smoke] passed');
