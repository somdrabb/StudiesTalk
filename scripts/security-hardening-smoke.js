#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assertIncludes(file, needle, message) {
  assert.ok(read(file).includes(needle), message || `${file} should include ${needle}`);
}

function assertNotMatches(file, pattern, message) {
  assert.ok(!pattern.test(read(file)), message || `${file} should not match ${pattern}`);
}

function main() {
  assertIncludes('server.js', "app.use('/api/admin', authRequired)", 'admin APIs must require authenticated sessions');
  assertIncludes('server.js', "app.post('/api/uploads', authRequired", 'uploads must require authentication');
  assertIncludes('server.js', "app.get('/api/files/registry', authRequired", 'file registry must require authentication');
  assertIncludes('server.js', "app.post('/api/files/:fileId/delete', authRequired", 'file delete must require authentication');
  assertIncludes('server.js', "security.path_traversal_attempt", 'path traversal attempts must be logged');
  assertIncludes('server.js', "security.forbidden_file_access", 'forbidden file access must be logged');
  assertIncludes('server.js', "result: 'success'", 'audit metadata must record success');
  assertIncludes('server.js', "result: 'failure'", 'audit metadata must record failure');
  assertIncludes('server.js', "auth.mfa_success", 'MFA success must be audited');
  assertIncludes('server.js', "auth.mfa_failure", 'MFA failure must be audited');
  assertIncludes('admin/admin.js', 'confirmTypedAction', 'dangerous admin actions must require typed confirmation');
  assertIncludes('admin/admin.js', 'confirmNotificationSend', 'notification sends must show a send confirmation preview');

  const forbiddenHeaderPattern = /x-user-id|x-workspace-id|x-shop-id|x-user-role|x-admin|x-super-admin/i;
  for (const file of ['server.js', 'admin/admin.js']) {
    assertNotMatches(file, forbiddenHeaderPattern, `${file} must not trust legacy identity headers`);
  }

  console.log('[security-hardening-smoke] passed');
}

main();
