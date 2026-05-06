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

function getPublicReason(routePath, line, rel = '') {
  const topLevelServerRoute = rel === 'server.js';
  if (/^\/health/.test(routePath) || routePath === '/api/ai/health') return 'Health/status endpoint; safe response only.';
  if (topLevelServerRoute && /^\/($|privacy|terms|impressum|dpa|trust|reset-password|register|\.well-known)/.test(routePath)) return 'Public page or legal/static entry point.';
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

function getRouteGroup(row) {
  const source = `${row.file}:${row.path}`;
  if (/notification/i.test(source)) return 'notification';
  if (/billing|invoice|stripe/i.test(source)) return 'billing';
  if (/email|inbox|smtp/i.test(source)) return 'email';
  if (/onboarding/i.test(source)) return 'onboarding';
  if (/homework/i.test(source)) return 'homework';
  if (/report|export|csv/i.test(source)) return 'reports/export';
  if (/calendar|live-session|attendance|classes/.test(source)) return 'calendar/live';
  if (/ai|knowledge|search/i.test(source)) return 'AI/search';
  if (/platformOwner|platform-control|paymentGateways|costControl|secrets|legal|\/api\/admin/.test(source)) return 'admin/platform owner';
  if (/workspace/i.test(source)) return 'workspace';
  return 'other';
}

function getFileLevelProof(rel, fileText) {
  const text = String(fileText || '');
  const isRouter = rel.startsWith('server/routes/');
  const superAdminRouter = isRouter && /requireSuperAdmin/.test(text) && /(resolveSuperAdmin|guard|handler)\s*\(/.test(text);
  const adminRouter = isRouter && /(requireAdmin|requireSuperAdmin)/.test(text);
  const auditCapable = /auditAction|audit\(|legacyAuditLog|logSecurityEvent|supportAudit/.test(text);
  return { isRouter, superAdminRouter, adminRouter, auditCapable };
}

function classifyRoute(line, context, method, routePath, lineNumber, globalCsrfLine, rel = '', fileText = '') {
  const text = `${line}\n${context}`;
  const mutating = !['get'].includes(method);
  const publicReason = getPublicReason(routePath, line, rel);
  const publicRoute = Boolean(publicReason);
  const fileProof = getFileLevelProof(rel, fileText);
  const adminLike = routePath.startsWith('/api/admin')
    || rel.startsWith('server/routes/admin.')
    || rel.includes('platformOwnerControl')
    || rel.includes('platformControl')
    || rel.includes('notificationControl');
  const webhookProof = /^\/api\/billing\/(?:stripe\/)?webhook$/.test(routePath)
    && /constructWebhookEvent|STRIPE_WEBHOOK_SECRET|stripe-signature|webhookSecret|handleWebhook/.test(fileText);
  const explicitAuthProof = /authRequired|requireAccessToken|requireSuperAdmin|requirePermission|guard\s*\(|getAuthedUser\(req\)|getTenantAccessUser\(req\)|getEffectiveRequestUser\(req\)|attachAccessTokenIfPresent\(req\)|resolveLiveSessionAccess\(req|requireAdminAccess|handleAuthLogin/.test(text) || adminLike || webhookProof;
  const superAdminProtected = !publicRoute && (/requireSuperAdmin\s*\(/.test(text)
    || (fileProof.superAdminRouter && adminLike));
  const adminProtected = superAdminProtected || /requireAdmin\s*(?:,|\))|requireAdmin\s*\(/.test(text) || (fileProof.adminRouter && adminLike);
  const auditProof = /auditAction|audit\s*\(|legacyAuditLog|logSecurityEvent|supportAudit|recordBillingProviderEvent|recordNotificationEvent|notification_events|platform_secret_audit/.test(text)
    || (fileProof.auditCapable && adminLike);
  const workspaceProof = /assert(Channel|Dm|Message|File|Homework)Access|requireWorkspaceAccess|assertSameWorkspace|denyTenantAccess|tenantForbidden|userWorkspaceId|getWorkspaceIdFromUser|canTakeAttendance|validateAttendanceReportStudentFilter|resolveTenant|resolveHomeworkRequestContext|resolveLiveSessionAccess|resolveAnalyticsContext|resolveCalendar|resolveRequestedWorkspaceId|workspace_id\s*=|workspaceId\s*[,:=]/.test(text);
  const entityProof = /assert(Channel|Dm|Message|File|Homework)Access|resolveHomeworkRequestContext|resolveLiveSessionAccess|canTakeAttendance|validateAttendanceReportStudentFilter|ensureChannelIsClass|canUserViewLiveSession|canUserConsumeLiveSessionContent|getHomeworkChannelForClass|repository-scoped query|workspace_id\s*=|WHERE[\s\S]{0,300}workspace/i.test(text);
  const selfProof = /\/me\b|req\.auth|authUser|requesterId|ctx\.user|studentId[\s\S]{0,160}(ctx\.user|req\.auth|getRequesterId)|userId[\s\S]{0,160}(req\.auth|getRequesterId)/.test(text);
  const auth =
    publicRoute
      ? 'public'
      : (explicitAuthProof
      ? 'yes'
      : 'missing');
  const csrf =
    !mutating
      ? 'n/a'
      : (/csrfRequired|guard\s*\(|X-CSRF-Token|csrf_token|strictLimiter|authLimiter|passwordReset|registrationMutationLimiter|adminSensitiveMutationLimiter/.test(text) || lineNumber > globalCsrfLine ? 'yes-or-limited' : 'missing');
  const role =
    publicRoute
      ? 'public'
      : (superAdminProtected || adminProtected || /requireSuperAdmin|requireAdmin|requirePermission|isWorkspaceAdmin|canTakeAttendance|Only admins|super_admin|school_admin|teacher|student/.test(text)
      ? 'yes'
      : 'review');
  const ownership =
    publicRoute
      ? 'public'
      : (superAdminProtected || webhookProof || workspaceProof || selfProof
      ? 'yes'
      : 'review');
  let roleHelper = findHelper(text, [
    ['requireSuperAdmin', /requireSuperAdmin/],
    ['requireAdminAccess', /requireAdminAccess/],
    ['requirePermission', /requirePermission/],
    ['isWorkspaceAdmin/canTakeAttendance', /isWorkspaceAdmin|canTakeAttendance/],
    ['role guard', /super_admin|school_admin|teacher|student/]
  ]) || (superAdminProtected ? 'requireSuperAdmin wrapper' : (adminProtected ? 'admin wrapper' : (publicRoute ? 'public' : 'review')));
  let workspaceHelper = findHelper(text, [
    ['requireWorkspaceAccess', /requireWorkspaceAccess/],
    ['assertSameWorkspace', /assertSameWorkspace/],
    ['workspace_id SQL predicate', /workspace_id\s*=/],
    ['getWorkspaceIdFromUser/userWorkspaceId', /getWorkspaceIdFromUser|userWorkspaceId/],
    ['resolveTenant', /resolveTenant/],
    ['resolveHomeworkRequestContext', /resolveHomeworkRequestContext/],
    ['resolveLiveSessionAccess', /resolveLiveSessionAccess/],
    ['resolveAnalyticsContext', /resolveAnalyticsContext/],
    ['self/request auth context', /\/me\b|req\.auth|authUser|requesterId/],
    ['tenantForbidden/denyTenantAccess', /tenantForbidden|denyTenantAccess/]
  ]) || (superAdminProtected ? 'requireSuperAdmin global owner route' : (webhookProof ? 'verified Stripe webhook mapping' : (publicRoute ? 'public' : 'review')));
  let entityHelper = findHelper(text, [
    ['assertChannelAccess', /assertChannelAccess/],
    ['assertDmAccess', /assertDmAccess/],
    ['assertMessageAccess', /assertMessageAccess/],
    ['assertFileAccess', /assertFileAccess/],
    ['assertHomeworkAccess', /assertHomeworkAccess/],
    ['resolveLiveSessionAccess', /resolveLiveSessionAccess/],
    ['canTakeAttendance', /canTakeAttendance/],
    ['validateAttendanceReportStudentFilter', /validateAttendanceReportStudentFilter/],
    ['resolveHomeworkRequestContext', /resolveHomeworkRequestContext/],
    ['canUserViewLiveSession', /canUserViewLiveSession/],
    ['self check', /\/me\b|requesterId|ctx\.user|req\.auth/],
    ['super admin platform owner boundary', /requireSuperAdmin/],
    ['audit/security event', /audit\s*\(|legacyAuditLog|logSecurityEvent/],
    ['ensureChannelIsClass', /ensureChannelIsClass/],
    ['repository-scoped query', /workspace_id\s*=|WHERE[\s\S]{0,300}workspace/i]
  ]) || (superAdminProtected ? (auditProof ? 'requireSuperAdmin + audit' : 'requireSuperAdmin') : (webhookProof ? 'verified provider signature + mapping' : (entityProof ? 'repository-scoped query' : (selfProof ? 'self/request auth context' : (publicRoute ? 'public' : 'review')))));

  if (publicRoute) {
    roleHelper = 'public';
    workspaceHelper = 'public';
    entityHelper = 'public';
  }

  const auditProofValue = publicRoute ? 'n/a' : (auditProof ? 'yes' : 'review');

  const priority =
    auth === 'missing'
      ? 'P0'
      : (mutating && csrf === 'missing' ? 'P1' : (ownership === 'review' || role === 'review' || (entityHelper === 'review' && !superAdminProtected) ? 'P2' : 'ok'));

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
    auditProof: auditProofValue,
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
      const context = lines.slice(Math.max(0, i - 25), Math.min(lines.length, i + 120)).join('\n');
      const baseRow = {
        file: rel,
        line: i + 1,
        method,
        path: routePath,
        ...classifyRoute(line, context, method.toLowerCase(), routePath, i + 1, globalCsrfLine, rel, fs.readFileSync(file, 'utf8'))
      };
      rows.push({
        ...baseRow,
        group: getRouteGroup(baseRow)
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
    summary.byGroup[row.group] = (summary.byGroup[row.group] || 0) + 1;
    if (row.priority !== 'ok') summary.reviewByGroup[row.group] = (summary.reviewByGroup[row.group] || 0) + 1;
    if (row.priority === 'ok') summary.ok += 1;
    if (row.auth === 'public') summary.intentionalPublic += 1;
    return summary;
  }, { total: 0, ok: 0, intentionalPublic: 0, byPriority: {}, byAuth: {}, byGroup: {}, reviewByGroup: {} });
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
  const groupedReviews = reviewRows.reduce((acc, row) => {
    const key = row.group || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
  const lines = [];
  lines.push('# Route Isolation Matrix');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Route isolation score: ${score}/100`);
  lines.push(`Total routes: ${summary.total}`);
  lines.push(`Priority counts: ${JSON.stringify(summary.byPriority)}`);
  lines.push(`Auth counts: ${JSON.stringify(summary.byAuth)}`);
  lines.push(`Group counts: ${JSON.stringify(summary.byGroup)}`);
  lines.push(`Review by group: ${JSON.stringify(summary.reviewByGroup)}`);
  lines.push('');
  lines.push('## Review Summary');
  lines.push('');
  lines.push(`Routes with explicit auth or intentional-public classification: ${summary.total - (summary.byAuth.missing || 0)}/${summary.total}`);
  lines.push(`Intentional public routes: ${summary.intentionalPublic}`);
  lines.push(`Routes still requiring deeper ownership review: ${reviewRows.length}`);
  lines.push('');
  lines.push('## P2 Review Groups');
  lines.push('');
  if (!reviewRows.length) {
    lines.push('No P2 review rows remain.');
  } else {
    lines.push('| Group | Count | Example routes |');
    lines.push('|---|---:|---|');
    for (const [group, groupRows] of Object.entries(groupedReviews).sort((a, b) => b[1].length - a[1].length)) {
      const examples = groupRows.slice(0, 5).map((row) => `${row.method} ${row.path}`).join('<br>');
      lines.push(`| ${group} | ${groupRows.length} | ${examples} |`);
    }
  }
  lines.push('');
  lines.push('## Matrix');
  lines.push('');
  lines.push('| Group | Method | Path | Auth Required | CSRF Required | Role Required | Workspace Ownership | Entity Ownership Helper | Audit Proof | Public Reason | Priority | Location |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const row of rows) {
    lines.push(`| ${row.group} | ${row.method} | \`${row.path}\` | ${row.authRequired} | ${row.csrfRequired} | ${row.roleRequired} | ${row.workspaceOwnershipCheck} | ${row.entityOwnershipHelper} | ${row.auditProof} | ${row.publicReason || ''} | ${row.priority} | ${row.file}:${row.line} |`);
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
