#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { buildRouteMatrix, summarizeMatrix, scoreMatrix, writeDocs: writeRouteMatrixDocs } = require('./route-isolation-matrix');
const { runIntegrityCheck } = require('./db-isolation-integrity-check');
const { createBillingRepository } = require('../server/repositories/billingRepository');
const { createStripeBillingService } = require('../server/services/billing/stripe.service');
const { createNotificationControlService } = require('../server/services/notificationControl.service');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function assertReactionAttributionHardened() {
  const server = read('server.js');
  assert.ok(!/userId:\s*rawUserId/.test(server), 'reaction routes must not destructure body userId');
  assert.ok(!/rawUserId\s*\|\|\s*['"]anonymous['"]/.test(server), 'reaction routes must not fall back to anonymous/body userId');
  assert.ok(!/dm.*reaction[\s\S]{0,300}req\.body[^;]*userId/i.test(server), 'DM reaction routes must not read req.body.userId');
  assert.ok(/toggleMessageReaction\(\{\s*messageId,\s*emoji,\s*userId\s*\}\)/.test(server), 'channel message reactions should use authenticated userId variable');
  assert.ok(/toggleReplyReaction\(\{\s*replyId,\s*emoji,\s*userId\s*\}\)/.test(server), 'reply reactions should use authenticated userId variable');
}

function assertExportAndPublicRouteProtection() {
  const matrix = buildRouteMatrix();
  const riskyExports = matrix.filter((row) =>
    (/export|report\.csv|\/reports\//.test(row.path)) &&
    row.auth === 'missing'
  );
  assert.deepStrictEqual(riskyExports, [], `export/report routes without auth: ${JSON.stringify(riskyExports)}`);
  const server = read('server.js');
  assert.ok(/app\.get\("\/api\/register\/link\/:token",\s*strictLimiter/.test(server), 'invite link lookup should be rate limited');
  assert.ok(/passwordResetRequestLimiter/.test(server) && /\/api\/auth\/forgot-password/.test(server), 'forgot-password should be rate limited');
  assert.ok(/return res\.json\(\{\s*ok:\s*true\s*\}\);/.test(server), 'forgot-password should use a generic response for unknown users');
  return summarizeMatrix(matrix);
}

function assertRoleMutationEdges() {
  const server = read('server.js');
  const userSelfUpdateBlock = server.slice(server.indexOf("app.patch('/api/users/:userId'"), server.indexOf("app.delete('/api/users/:userId'"));
  assert.ok(!/\brole\s*[,\}]/.test(userSelfUpdateBlock), 'non-owner user profile update route must not destructure role from body');
  assert.ok(!/SET[\s\S]{0,300}\brole\s*=/.test(userSelfUpdateBlock), 'non-owner user profile update route must not update role');
  const adminRoleUpdateBlock = server.slice(server.indexOf("app.patch('/api/admin/users/:id'"), server.indexOf("app.delete('/api/admin/users/:id'"));
  assert.ok(/requireSuperAdmin\(req,\s*res\)/.test(adminRoleUpdateBlock), 'admin user role/status mutation must require super_admin');
  assert.ok(/user\.role_updated/.test(adminRoleUpdateBlock), 'admin user role/status mutation must audit');
  assert.ok(/role !== 'super_admin'/.test(server) || /Cannot create.*super_admin/i.test(server) || /requireSuperAdmin\(req,\s*res\)[\s\S]{0,1200}super_admin/.test(server), 'school_admin must not be able to create super_admin users');
}

async function assertStripeWebhookMappingGuard() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT, status TEXT DEFAULT 'active', admin_email TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, workspace_id TEXT, email TEXT, role TEXT);
    CREATE TABLE workspace_billing (
      workspace_id TEXT PRIMARY KEY,
      plan TEXT DEFAULT 'free',
      status TEXT DEFAULT 'active',
      currency TEXT DEFAULT 'EUR',
      monthly_price_cents INTEGER DEFAULT 0,
      billing_email TEXT,
      invoice_contact_name TEXT,
      readiness_acknowledged_at TEXT,
      readiness_acknowledged_by_user_id TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE invoices (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      student_user_id TEXT,
      amount_cents INTEGER NOT NULL,
      currency TEXT DEFAULT 'EUR',
      description TEXT,
      status TEXT DEFAULT 'open',
      due_date TEXT,
      created_at INTEGER NOT NULL,
      paid_at INTEGER
    );
    CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      student_user_id TEXT,
      amount_cents INTEGER NOT NULL,
      currency TEXT DEFAULT 'EUR',
      provider TEXT DEFAULT 'manual',
      provider_ref TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  db.prepare('INSERT INTO workspaces (id, name, status) VALUES (?, ?, ?)').run('ws_a', 'A', 'active');
  db.prepare('INSERT INTO workspaces (id, name, status) VALUES (?, ?, ?)').run('ws_b', 'B', 'active');
  const repo = createBillingRepository({ engine: 'sqlite', sqliteDb: db });
  await repo.ensureWorkspaceBilling({ workspaceId: 'ws_a' });
  await repo.ensureWorkspaceBilling({ workspaceId: 'ws_b' });
  await repo.updateWorkspaceStripeState({ workspaceId: 'ws_a', stripeCustomerId: 'cus_a', stripeSubscriptionId: 'sub_a', stripeSubscriptionStatus: 'active' });
  await repo.updateWorkspaceStripeState({ workspaceId: 'ws_b', stripeCustomerId: 'cus_b', stripeSubscriptionId: 'sub_b', stripeSubscriptionStatus: 'active' });
  const service = createStripeBillingService({ billingRepository: repo, stripeClient: {} });
  await service.handleWebhookEvent({
    id: 'evt_valid_b',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_valid_b',
        customer: 'cus_b',
        subscription: 'sub_b',
        amount_paid: 2500,
        currency: 'eur',
        metadata: { workspaceId: 'ws_b' }
      }
    }
  });
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS count FROM payments WHERE workspace_id = 'ws_b'").get().count, 1, 'valid Stripe webhook should update only mapped workspace');
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS count FROM payments WHERE workspace_id = 'ws_a'").get().count, 0, 'valid Stripe webhook must not update another workspace');
  await assert.rejects(
    () => service.handleWebhookEvent({
      id: 'evt_mismatch',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_mismatch',
          customer: 'cus_b',
          subscription: 'sub_b',
          amount_paid: 1500,
          currency: 'eur',
          metadata: { workspaceId: 'ws_a' }
        }
      }
    }),
    /mapping mismatch/
  );
  await assert.rejects(
    () => service.handleWebhookEvent({
      id: 'evt_wrong_subscription',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_wrong_sub',
          customer: 'cus_b',
          subscription: 'sub_a',
          amount_paid: 1700,
          currency: 'eur',
          metadata: { workspaceId: 'ws_b' }
        }
      }
    }),
    /mapping mismatch/
  );
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM payments').get().count, 1, 'mismatched Stripe webhooks must not create extra payments');
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS count FROM billing_provider_events WHERE event_type = 'webhook.mapping_mismatch' AND status = 'blocked'").get().count, 2);
  db.close();
}

async function assertNotificationRecipientWorkspaceIsolation() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT, status TEXT DEFAULT 'active');
    CREATE TABLE users (id TEXT PRIMARY KEY, workspace_id TEXT, email TEXT, role TEXT, phone TEXT);
  `);
  db.prepare("INSERT INTO workspaces (id, name, status) VALUES ('ws_a', 'A', 'active')").run();
  db.prepare("INSERT INTO workspaces (id, name, status) VALUES ('ws_b', 'B', 'active')").run();
  db.prepare("INSERT INTO users (id, workspace_id, email, role, phone) VALUES ('u_a', 'ws_a', 'a@example.test', 'student', '+491111111111')")
    .run();
  db.prepare("INSERT INTO users (id, workspace_id, email, role, phone) VALUES ('u_b', 'ws_b', 'b@example.test', 'student', '+492222222222')")
    .run();
  const service = createNotificationControlService({ db, emailSender: null, smsSender: null });
  await service.ensureSchema();
  const campaign = await service.createCampaign({
    title: 'Recipient isolation',
    channels: ['email', 'sms', 'in_app'],
    targetType: 'selected_workspaces',
    workspaceIds: ['ws_a'],
    subject: 'Subject',
    body: 'Body'
  }, 'super');
  const built = await service.buildDeliveryDrafts(campaign.id);
  assert.strictEqual(built.rows.length, 3, 'selected workspace should create one recipient per selected channel');
  assert.ok(built.rows.every((row) => row.workspace_id === 'ws_a' && row.user_id === 'u_a'), 'selected workspace campaign must not include outside recipients');
  db.close();
}

function assertSupportHookCoverage() {
  const server = read('server.js');
  for (const resource of ['files', 'messages', 'DMs', 'billing', 'users', 'AI conversations', 'homework', 'attendance']) {
    assert.ok(server.includes(`logSupportAccessIfActive(req, '${resource}'`), `support access hook missing for ${resource}`);
  }
}

function assertDataAndBackupEvidence() {
  const platformRoutes = read('server/routes/platformOwnerControl.routes.js');
  assert.ok(/data-governance\/export\/:workspaceId/.test(platformRoutes), 'data export request endpoint should exist');
  assert.ok(/data-governance\/delete-request/.test(platformRoutes), 'data delete request endpoint should exist');
  assert.ok(/requireSuperAdmin/.test(platformRoutes), 'data governance routes should be behind super_admin guard');
  assert.ok(/affectedTablesSummary|affected_tables|dataGovernanceCoverage/i.test(read('server/services/platformOwnerControl.service.js')), 'data export/delete proof should include affected-table coverage');
  const restoreTest = read('scripts/restore-test-sqlite.js');
  assert.ok(/temp|tmp|mkdtemp|copy/i.test(restoreTest), 'restore test should copy backup to a temporary location');
  assert.ok(!/renameSync\([^)]*DB_PATH|copyFileSync\([^,]+,\s*DB_PATH/.test(restoreTest), 'restore test must not overwrite the production DB path');
}

function assertHomeworkIsolationCoverage() {
  const server = read('server.js');
  assert.ok(/resolveHomeworkRequestContext\(req,\s*res,\s*req\.params\.channelId\)/.test(server), 'homework board must resolve tenant-scoped request context');
  assert.ok(/getHomeworkChannelForClass[\s\S]{0,260}resolveHomeworkRequestContext\(req,\s*res,\s*homeworkChannel\?\.id/.test(server), 'homework item/submission routes must resolve tenant-scoped homework channel context');
  assert.ok(/canManageHomeworkChannel\(ctx\.user,\s*ctx\.homeworkChannel\)/.test(server), 'teacher homework mutation must require managed/assigned channel access');
  assert.ok(/canSubmitHomework\(ctx\.user,\s*ctx\.homeworkChannel,\s*ctx\.user\.id/.test(server), 'student homework submission must require class/channel membership');
  assert.ok(/requesterId[\s\S]{0,120}submission\.studentId/.test(server), 'student submission comments must be self-only');
  const tenantSmoke = read('scripts/tenant-isolation-smoke.js');
  assert.ok(/homework\/channels.*board/.test(tenantSmoke), 'tenant smoke should probe homework board isolation');
}

function assertPublicTokenEnumerationCoverage() {
  const server = read('server.js');
  assert.ok(/app\.get\("\/api\/register\/link\/:token",\s*strictLimiter/.test(server), 'invite token lookup should be rate limited');
  assert.ok(/app\.get\('\/api\/register\/invite-info'/.test(server), 'invite info endpoint should exist for token validation');
  assert.ok(/passwordResetRequestLimiter/.test(server) && /passwordResetCompletionLimiter/.test(server), 'reset request/complete flows should be rate limited');
  assert.ok(/return res\.json\(\{\s*ok:\s*true\s*\}\);/.test(server), 'forgot-password unknown-account response should be generic');
  assert.ok(/Invalid or expired code|code is incorrect or has expired|Invalid invite|Invite not found/.test(server), 'OTP/invite invalid responses should be generic token failures');
}

function assertExportUrlGuessingCoverage() {
  const matrix = buildRouteMatrix();
  const unauthenticatedExports = matrix.filter((row) => /export|report|csv|download/.test(row.path) && row.auth === 'missing');
  assert.deepStrictEqual(unauthenticatedExports, [], `export/report/download route lacks auth: ${JSON.stringify(unauthenticatedExports)}`);
  const p1Smoke = read('scripts/p1-isolation-hardening-smoke.js');
  assert.ok(/report\.csv/.test(p1Smoke) && /expectedStatus:\s*403/.test(p1Smoke), 'P1 smoke should reject guessed foreign attendance report CSV');
  const platformRoutes = read('server/routes/platformOwnerControl.routes.js');
  assert.ok(/support\/audit\/export/.test(platformRoutes) && /requireSuperAdmin/.test(platformRoutes), 'admin support audit export should be super_admin protected');
}

function assertRealtimeSseIsolationCoverage() {
  const server = read('server.js');
  assert.ok(/app\.get\('\/api\/events',\s*authRequired/.test(server), 'global SSE stream should require auth');
  assert.ok(/getWorkspaceIdForRealtimePayload/.test(server) && /payloadWorkspaceId[\s\S]{0,140}clientWorkspaceId[\s\S]{0,140}continue/.test(server), 'global SSE stream should skip foreign workspace events');
  assert.ok(/whiteboard\/stream',\s*authRequired/.test(server) && /resolveLiveSessionAccess/.test(server), 'live whiteboard stream should validate session access');
  assert.ok(/slides\/stream[\s\S]{0,500}canUserViewLiveSession/.test(server), 'live slides stream should validate session access');
}

async function main() {
  assertReactionAttributionHardened();
  const matrixSummary = assertExportAndPublicRouteProtection();
  assertRoleMutationEdges();
  await assertStripeWebhookMappingGuard();
  await assertNotificationRecipientWorkspaceIsolation();
  assertSupportHookCoverage();
  assertHomeworkIsolationCoverage();
  assertPublicTokenEnumerationCoverage();
  assertExportUrlGuessingCoverage();
  assertRealtimeSseIsolationCoverage();
  assertDataAndBackupEvidence();
  const routeRows = buildRouteMatrix();
  writeRouteMatrixDocs(routeRows);
  const dbIntegrity = runIntegrityCheck();
  console.log('[p2-isolation-completion-smoke] passed');
  console.log(JSON.stringify({ routeMatrix: matrixSummary, routeMatrixScore: scoreMatrix(routeRows), dbIntegrity }, null, 2));
}

main().catch((err) => {
  console.error('[p2-isolation-completion-smoke] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
