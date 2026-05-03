#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOC_PATH = path.join(ROOT, 'docs', 'route-isolation-matrix.md');
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

function getPublicReason(routePath, line) {
  if (/^\/health/.test(routePath) || routePath === '/api/ai/health') return 'Health/status endpoint; safe response only.';
  if (/^\/($|privacy|terms|impressum|dpa|trust|reset-password|register|\.well-known)/.test(routePath)) return 'Public page or legal/static entry point.';
  if (/^\/api\/public\//.test(routePath)) return 'Intentional public API namespace.';
  if (routePath === '/api/legal/settings') return 'Public legal settings needed by unauthenticated pages.';
  if (/^\/api\/schools\/request$/.test(routePath)) return 'Public school onboarding request.';
  if (/^\/api\/register\/(otp|mobile-otp|session|request-review|link|invite-info|complete)/.test(routePath)) return 'Registration/invite flow with limiter or token validation.';
  if (/^\/api\/auth\/(login|csrf|forgot-password|reset-password|refresh|mfa\/setup\/start|mfa\/verify)/.test(routePath)) return 'Authentication bootstrap/recovery flow.';
  if (/^\/api\/attendance\/check-in\/public$/.test(routePath) || /^\/attendance\/check-in/.test(routePath)) return 'Public attendance check-in token flow.';
  if (routePath === '<dynamic>' && /channels.*live.*presenter/.test(line)) return 'Presenter static route for live class entry.';
  return '';
}

function findHelper(text, patterns) {
  for (const [label, pattern] of patterns) {
    if (pattern.test(text)) return label;
  }
  return '';
}

function classifyRoute(line, context, method, routePath, lineNumber, globalCsrfLine) {
  const text = `${line}\n${context}`;
  const mutating = !['get'].includes(method);
  const publicReason = getPublicReason(routePath, line);
  const publicRoute = Boolean(publicReason);

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
  const roleHelper = findHelper(text, [
    ['requireSuperAdmin', /requireSuperAdmin/],
    ['requireAdminAccess', /requireAdminAccess/],
    ['requirePermission', /requirePermission/],
    ['isWorkspaceAdmin/canTakeAttendance', /isWorkspaceAdmin|canTakeAttendance/],
    ['role guard', /super_admin|school_admin|teacher|student/]
  ]) || (publicRoute ? 'public' : 'review');
  const workspaceHelper = findHelper(text, [
    ['requireWorkspaceAccess', /requireWorkspaceAccess/],
    ['assertSameWorkspace', /assertSameWorkspace/],
    ['workspace_id SQL predicate', /workspace_id\s*=/],
    ['getWorkspaceIdFromUser/userWorkspaceId', /getWorkspaceIdFromUser|userWorkspaceId/],
    ['resolveTenant', /resolveTenant/],
    ['tenantForbidden/denyTenantAccess', /tenantForbidden|denyTenantAccess/]
  ]) || (publicRoute ? 'public' : 'review');
  const entityHelper = findHelper(text, [
    ['assertChannelAccess', /assertChannelAccess/],
    ['assertDmAccess', /assertDmAccess/],
    ['assertMessageAccess', /assertMessageAccess/],
    ['assertFileAccess', /assertFileAccess/],
    ['assertHomeworkAccess', /assertHomeworkAccess/],
    ['resolveLiveSessionAccess', /resolveLiveSessionAccess/],
    ['canTakeAttendance', /canTakeAttendance/],
    ['validateAttendanceReportStudentFilter', /validateAttendanceReportStudentFilter/],
    ['ensureChannelIsClass', /ensureChannelIsClass/],
    ['repository-scoped query', /workspace_id\s*=|WHERE[\s\S]{0,300}workspace/i]
  ]) || (publicRoute ? 'public' : 'review');

  const priority =
    auth === 'missing'
      ? 'P0'
      : (mutating && csrf === 'missing' ? 'P1' : (ownership === 'review' ? 'P2' : 'ok'));

  return {
    auth,
    csrf,
    role,
    ownership,
    priority,
    mutating,
    authRequired: auth === 'yes' ? 'yes' : (auth === 'public' ? 'intentional-public' : 'missing'),
    csrfRequired: mutating ? csrf : 'n/a',
    roleRequired: role,
    workspaceOwnershipCheck: ownership,
    entityOwnershipHelper: entityHelper,
    roleHelper,
    workspaceHelper,
    publicReason
  };
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
    if (row.priority === 'ok') summary.ok += 1;
    if (row.auth === 'public') summary.intentionalPublic += 1;
    return summary;
  }, { total: 0, ok: 0, intentionalPublic: 0, byPriority: {}, byAuth: {} });
}

function scoreMatrix(rows) {
  if (!rows.length) return 0;
  let points = 0;
  const max = rows.length * 5;
  for (const row of rows) {
    if (row.auth === 'yes' || row.auth === 'public') points += 1;
    if (!row.mutating || row.csrf !== 'missing') points += 1;
    if (row.role === 'yes' || row.role === 'public') points += 1;
    if (row.ownership === 'yes' || row.ownership === 'public') points += 1;
    if (row.entityOwnershipHelper !== 'review') points += 1;
  }
  return Math.round((points / max) * 100);
}

function buildMarkdown(rows) {
  const summary = summarizeMatrix(rows);
  const score = scoreMatrix(rows);
  const reviewRows = rows.filter((row) => row.priority !== 'ok');
  const lines = [];
  lines.push('# Route Isolation Matrix');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Route isolation score: ${score}/100`);
  lines.push(`Total routes: ${summary.total}`);
  lines.push(`Priority counts: ${JSON.stringify(summary.byPriority)}`);
  lines.push(`Auth counts: ${JSON.stringify(summary.byAuth)}`);
  lines.push('');
  lines.push('## Review Summary');
  lines.push('');
  lines.push(`Routes with explicit auth or intentional-public classification: ${summary.total - (summary.byAuth.missing || 0)}/${summary.total}`);
  lines.push(`Intentional public routes: ${summary.intentionalPublic}`);
  lines.push(`Routes still requiring deeper ownership review: ${reviewRows.length}`);
  lines.push('');
  lines.push('## Matrix');
  lines.push('');
  lines.push('| Method | Path | Auth Required | CSRF Required | Role Required | Workspace Ownership | Entity Ownership Helper | Public Reason | Priority | Location |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const row of rows) {
    lines.push(`| ${row.method} | \`${row.path}\` | ${row.authRequired} | ${row.csrfRequired} | ${row.roleRequired} | ${row.workspaceOwnershipCheck} | ${row.entityOwnershipHelper} | ${row.publicReason || ''} | ${row.priority} | ${row.file}:${row.line} |`);
  }
  return `${lines.join('\n')}\n`;
}

function writeDocs(rows, targetPath = DOC_PATH) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, buildMarkdown(rows));
  return targetPath;
}

function printMarkdown(rows) {
  console.log(buildMarkdown(rows));
}

if (require.main === module) {
  const rows = buildRouteMatrix();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ summary: summarizeMatrix(rows), score: scoreMatrix(rows), rows }, null, 2));
  } else {
    const written = writeDocs(rows);
    printMarkdown(rows);
    console.error(`[route-isolation-matrix] wrote ${path.relative(ROOT, written)}`);
  }
}

module.exports = {
  buildRouteMatrix,
  summarizeMatrix,
  scoreMatrix,
  buildMarkdown,
  writeDocs
};
