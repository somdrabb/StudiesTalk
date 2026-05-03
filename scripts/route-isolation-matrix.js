#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ROUTE_RE = /\b(app|router)\.(get|post|put|patch|delete)\s*\((.*)$/;

function listRouteFiles() {
  const files = [path.join(ROOT, 'server.js')];
  const routesDir = path.join(ROOT, 'server', 'routes');
  if (fs.existsSync(routesDir)) {
    for (const entry of fs.readdirSync(routesDir)) {
      if (entry.endsWith('.js')) files.push(path.join(routesDir, entry));
    }
  }
  return files;
}

function extractPath(callSource) {
  const match = String(callSource || '').match(/^[^'"`]*(['"`])([^'"`]+)\1/);
  return match ? match[2] : '<dynamic>';
}

function classifyRoute(line, context, method, routePath, lineNumber, globalCsrfLine) {
  const text = `${line}\n${context}`;
  const mutating = !['get'].includes(method);
  const publicRoute = /^\/($|privacy|terms|impressum|dpa|trust|health|reset-password|register|attendance\/check-in|\.well-known)/.test(routePath)
    || /^\/api\/public\//.test(routePath)
    || /^\/api\/legal\/settings$/.test(routePath)
    || /^\/api\/register\/(otp|mobile-otp|session|request-review|link|invite-info|complete)/.test(routePath)
    || /^\/api\/schools\/request$/.test(routePath)
    || /^\/api\/auth\/(login|csrf|forgot-password|reset-password|refresh|mfa\/setup\/start|mfa\/verify)/.test(routePath)
    || /^\/api\/attendance\/check-in\/public$/.test(routePath)
    || /^\/api\/ai\/health$/.test(routePath)
    || /^\/health/.test(routePath)
    || (routePath === '<dynamic>' && /channels.*live.*presenter/.test(line));

  const auth =
    /authRequired|requireAccessToken|requireSuperAdmin|requirePermission|guard\s*\(|getAuthedUser\(req\)|getTenantAccessUser\(req\)|getEffectiveRequestUser\(req\)|attachAccessTokenIfPresent\(req\)|resolveLiveSessionAccess\(req|requireAdminAccess|handleAuthLogin/.test(text)
      ? 'yes'
      : (publicRoute ? 'public' : 'missing');
  const csrf =
    !mutating
      ? 'n/a'
      : (/csrfRequired|guard\s*\(|X-CSRF-Token|csrf_token|strictLimiter|authLimiter|passwordReset|registrationMutationLimiter|adminSensitiveMutationLimiter/.test(text) || lineNumber > globalCsrfLine ? 'yes-or-limited' : 'missing');
  const role =
    /requireSuperAdmin|requireAdmin|requirePermission|isWorkspaceAdmin|canTakeAttendance|Only admins|super_admin|school_admin|teacher/.test(text)
      ? 'yes'
      : (publicRoute ? 'public' : 'review');
  const ownership =
    /assert(Channel|Dm|Message|File|Homework)Access|requireWorkspaceAccess|denyTenantAccess|tenantForbidden|userWorkspaceId|getWorkspaceIdFromUser|canTakeAttendance|validateAttendanceReportStudentFilter|resolveTenant|workspace_id\s*=/.test(text)
      ? 'yes'
      : (publicRoute ? 'public' : 'review');

  const priority =
    auth === 'missing'
      ? 'P0'
      : (mutating && csrf === 'missing' ? 'P1' : (ownership === 'review' ? 'P2' : 'ok'));

  return { auth, csrf, role, ownership, priority };
}

function buildRouteMatrix() {
  const rows = [];
  for (const file of listRouteFiles()) {
    const rel = path.relative(ROOT, file);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const globalCsrfLine = rel === 'server.js'
      ? Math.max(0, lines.findIndex((item) => item.includes('app.use(csrfRequired)')) + 1)
      : 0;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const match = line.match(ROUTE_RE);
      if (!match) continue;
      const method = match[2].toUpperCase();
      const routePath = extractPath(match[3]);
      const context = lines.slice(i, Math.min(lines.length, i + 90)).join('\n');
      rows.push({
        file: rel,
        line: i + 1,
        method,
        path: routePath,
        ...classifyRoute(line, context, method.toLowerCase(), routePath, i + 1, globalCsrfLine)
      });
    }
  }
  return rows;
}

function summarizeMatrix(rows) {
  return rows.reduce((summary, row) => {
    summary.total += 1;
    summary.byPriority[row.priority] = (summary.byPriority[row.priority] || 0) + 1;
    summary.byAuth[row.auth] = (summary.byAuth[row.auth] || 0) + 1;
    return summary;
  }, { total: 0, byPriority: {}, byAuth: {} });
}

function printMarkdown(rows) {
  const summary = summarizeMatrix(rows);
  console.log(`# Route Isolation Matrix\n`);
  console.log(`Total routes: ${summary.total}`);
  console.log(`Priority counts: ${JSON.stringify(summary.byPriority)}`);
  console.log(`Auth counts: ${JSON.stringify(summary.byAuth)}\n`);
  console.log('| Method | Path | Auth | CSRF | Role | Ownership | Priority | Location |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const row of rows) {
    console.log(`| ${row.method} | \`${row.path}\` | ${row.auth} | ${row.csrf} | ${row.role} | ${row.ownership} | ${row.priority} | ${row.file}:${row.line} |`);
  }
}

if (require.main === module) {
  const rows = buildRouteMatrix();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ summary: summarizeMatrix(rows), rows }, null, 2));
  } else {
    printMarkdown(rows);
  }
}

module.exports = {
  buildRouteMatrix,
  summarizeMatrix
};
