'use strict';

const crypto = require('crypto');

function normalizeDbAdapter(db) {
  if (!db) throw new Error('Notification control service requires a database handle.');
  if (typeof db.one === 'function' && typeof db.many === 'function') {
    return {
      one: (sql, params = []) => Promise.resolve(db.one(sql, params)),
      many: (sql, params = []) => Promise.resolve(db.many(sql, params)),
      exec: (sql, params = []) => Promise.resolve(db.exec(sql, params))
    };
  }
  if (typeof db.prepare === 'function') {
    return {
      one: (sql, params = []) => Promise.resolve(db.prepare(sql).get(...params) || null),
      many: (sql, params = []) => Promise.resolve(db.prepare(sql).all(...params)),
      exec: (sql, params = []) => Promise.resolve(db.prepare(sql).run(...params))
    };
  }
  throw new Error('Unsupported database handle for notification control service.');
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value, fallback = '') {
  const text = String(value == null ? '' : value).trim();
  return text || fallback;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return fallback;
  }
}

function stringifyJson(value) {
  return JSON.stringify(value == null ? {} : value);
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function notFound(message = 'Campaign not found.') {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

function normalizeEnabled(value, fallback = true) {
  if (value == null) return fallback ? 1 : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value ? 1 : 0;
  const text = cleanString(value).toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(text) ? 1 : 0;
}

function createNotificationControlService({
  db,
  now = nowIso,
  costs = {},
  emailSender = null,
  smsSender = null,
  platformControlService = null,
  costControlService = null
} = {}) {
  const adapter = normalizeDbAdapter(db);
  const channelCosts = {
    in_app: Number(costs.inApp ?? costs.in_app ?? 0),
    email: Number(costs.email ?? 0.0005),
    sms: Number(costs.sms ?? 0.08)
  };

  async function execIgnore(sql) {
    try {
      await adapter.exec(sql);
    } catch (_err) {}
  }

  async function ensureSchema() {
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS notification_campaigns (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        channels_json TEXT NOT NULL,
        priority TEXT DEFAULT 'normal',
        target_type TEXT NOT NULL,
        target_config_json TEXT,
        subject TEXT,
        body TEXT NOT NULL,
        status TEXT DEFAULT 'draft',
        scheduled_at TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        sent_at TEXT
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS notification_deliveries (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        workspace_id TEXT,
        user_id TEXT,
        channel TEXT NOT NULL,
        recipient TEXT,
        status TEXT DEFAULT 'pending',
        cost_eur REAL DEFAULT 0,
        error_message TEXT,
        metadata_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS notification_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        channel TEXT NOT NULL,
        subject TEXT,
        body TEXT NOT NULL,
        variables_json TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS notification_events (
        id TEXT PRIMARY KEY,
        campaign_id TEXT,
        delivery_id TEXT,
        event_type TEXT NOT NULL,
        message TEXT,
        metadata_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS platform_user_notifications (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        user_id TEXT,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        read_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS notification_automation_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        trigger_key TEXT NOT NULL,
        channels_json TEXT NOT NULL,
        target_config_json TEXT,
        template_id TEXT,
        enabled INTEGER DEFAULT 1,
        cooldown_minutes INTEGER DEFAULT 1440,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS notification_automation_runs (
        id TEXT PRIMARY KEY,
        rule_id TEXT NOT NULL,
        status TEXT,
        result_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await execIgnore('CREATE INDEX IF NOT EXISTS idx_notification_campaigns_status_scheduled ON notification_campaigns(status, scheduled_at)');
    await execIgnore('CREATE INDEX IF NOT EXISTS idx_notification_deliveries_campaign_status ON notification_deliveries(campaign_id, status)');
    await execIgnore('CREATE INDEX IF NOT EXISTS idx_notification_deliveries_workspace_channel_created ON notification_deliveries(workspace_id, channel, created_at)');
    await execIgnore('CREATE INDEX IF NOT EXISTS idx_platform_user_notifications_user_created ON platform_user_notifications(user_id, created_at)');
    await execIgnore('CREATE INDEX IF NOT EXISTS idx_notification_automation_rules_trigger ON notification_automation_rules(trigger_key, enabled)');
    await execIgnore('CREATE INDEX IF NOT EXISTS idx_notification_automation_runs_rule_created ON notification_automation_runs(rule_id, created_at)');
  }

  function normalizeChannels(value) {
    const raw = Array.isArray(value) ? value : String(value || '').split(',');
    const allowed = new Set(['in_app', 'email', 'sms']);
    const channels = raw.map((item) => cleanString(item).toLowerCase()).filter((item) => allowed.has(item));
    if (!channels.length) throw badRequest('At least one valid channel is required.');
    return Array.from(new Set(channels));
  }

  function normalizePriority(value) {
    const priority = cleanString(value, 'normal').toLowerCase();
    if (!['low', 'normal', 'high', 'critical'].includes(priority)) throw badRequest('Invalid priority.');
    return priority;
  }

  function normalizeStatus(value, fallback = 'draft') {
    const status = cleanString(value, fallback).toLowerCase();
    if (!['draft', 'scheduled', 'sending', 'completed', 'failed', 'cancelled'].includes(status)) throw badRequest('Invalid campaign status.');
    return status;
  }

  function normalizeTargetType(value) {
    const targetType = cleanString(value, 'all_workspaces').toLowerCase();
    if (!['all_workspaces', 'selected_workspaces', 'role', 'plan'].includes(targetType)) throw badRequest('Invalid target type.');
    return targetType;
  }

  function normalizeTargetConfig(payload = {}, targetType) {
    const source = payload.targetConfig && typeof payload.targetConfig === 'object' ? payload.targetConfig : payload;
    const workspaceIds = Array.isArray(source.workspaceIds)
      ? source.workspaceIds.map((item) => cleanString(item)).filter(Boolean)
      : cleanString(source.workspaceId) ? [cleanString(source.workspaceId)] : [];
    return {
      workspaceIds,
      role: cleanString(source.role),
      plan: cleanString(source.plan)
    };
  }

  function normalizeTriggerKey(value) {
    const triggerKey = cleanString(value).toLowerCase();
    const allowed = new Set([
      'ai_budget_80',
      'workspace_inactive_7_days',
      'failed_payment',
      'failed_email_delivery_gt_10',
      'storage_usage_80'
    ]);
    if (!allowed.has(triggerKey)) throw badRequest('Invalid automation trigger.');
    return triggerKey;
  }

  function normalizeAutomationTargetConfig(payload = {}) {
    const source = payload.targetConfig && typeof payload.targetConfig === 'object' ? payload.targetConfig : payload;
    const workspaceIds = Array.isArray(source.workspaceIds)
      ? source.workspaceIds.map((item) => cleanString(item)).filter(Boolean)
      : cleanString(source.workspaceId) ? [cleanString(source.workspaceId)] : [];
    return {
      workspaceIds,
      role: cleanString(source.role),
      plan: cleanString(source.plan),
      threshold: cleanString(source.threshold),
      targetType: cleanString(source.targetType || source.target_type, workspaceIds.length ? 'selected_workspaces' : 'all_workspaces')
    };
  }

  function normalizeAutomationPayload(payload = {}, { partial = false } = {}) {
    const name = payload.name == null && partial ? null : cleanString(payload.name);
    const triggerKey = payload.triggerKey == null && payload.trigger_key == null && partial ? null : normalizeTriggerKey(payload.triggerKey || payload.trigger_key);
    const channels = payload.channels == null && payload.channels_json == null && partial ? null : normalizeChannels(payload.channels || payload.channels_json || payload.channel || 'in_app');
    const cooldown = payload.cooldownMinutes ?? payload.cooldown_minutes;
    const cooldownMinutes = cooldown == null && partial ? null : Math.min(Math.max(Number(cooldown == null ? 1440 : cooldown) || 1440, 0), 43200);
    return {
      name,
      triggerKey,
      channels,
      targetConfig: payload.targetConfig == null && partial ? null : normalizeAutomationTargetConfig(payload),
      templateId: payload.templateId == null && payload.template_id == null && partial ? null : cleanString(payload.templateId || payload.template_id) || null,
      enabled: payload.enabled == null && partial ? null : normalizeEnabled(payload.enabled, true),
      cooldownMinutes
    };
  }

  function validateBody(body, channels) {
    const text = cleanString(body);
    if (!text) throw badRequest('Campaign body is required.');
    const limit = channels.includes('sms') ? 1000 : 10000;
    if (text.length > limit) throw badRequest(channels.includes('sms') ? 'SMS campaign body cannot exceed 1000 characters.' : 'Campaign body cannot exceed 10000 characters.');
    return {
      body: text,
      warnings: channels.includes('sms') && text.length > 160 ? ['SMS body is over 160 characters and may be billed as multiple messages.'] : []
    };
  }

  function normalizeCampaignPayload(payload = {}, { partial = false } = {}) {
    const channels = payload.channels == null && partial ? null : normalizeChannels(payload.channels || payload.channels_json || payload.channel || 'in_app');
    const targetType = payload.targetType == null && payload.target_type == null && partial ? null : normalizeTargetType(payload.targetType || payload.target_type);
    const bodyValidation = payload.body == null && partial ? null : validateBody(payload.body, channels || ['in_app']);
    const targetConfig = targetType ? normalizeTargetConfig(payload, targetType) : null;
    const status = payload.status == null && partial
      ? null
      : normalizeStatus(payload.status || (payload.scheduledAt || payload.scheduled_at ? 'scheduled' : 'draft'));
    return {
      title: payload.title == null && partial ? null : cleanString(payload.title),
      description: payload.description == null && partial ? null : cleanString(payload.description),
      channels,
      priority: payload.priority == null && partial ? null : normalizePriority(payload.priority),
      targetType,
      targetConfig,
      subject: payload.subject == null && partial ? null : cleanString(payload.subject),
      body: bodyValidation?.body ?? null,
      warnings: bodyValidation?.warnings || [],
      status,
      scheduledAt: payload.scheduledAt == null && payload.scheduled_at == null && partial ? null : cleanString(payload.scheduledAt || payload.scheduled_at) || null
    };
  }

  async function recordEvent({ campaignId = null, deliveryId = null, eventType, message = '', metadata = {} }) {
    const row = {
      id: id('nevt'),
      campaign_id: campaignId,
      delivery_id: deliveryId,
      event_type: eventType,
      message,
      metadata_json: stringifyJson(metadata),
      created_at: now()
    };
    await adapter.exec(`
      INSERT INTO notification_events (id, campaign_id, delivery_id, event_type, message, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [row.id, row.campaign_id, row.delivery_id, row.event_type, row.message, row.metadata_json, row.created_at]);
    return row;
  }

  function publicErrorMessage(error) {
    const message = String(error?.message || error || 'Delivery failed.');
    return message
      .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
      .replace(/AC[a-fA-F0-9]{32}/g, '[redacted]')
      .replace(/[a-f0-9]{32,}/gi, '[redacted]');
  }

  function normalizeCampaign(row) {
    if (!row) return null;
    return {
      ...row,
      channels: parseJson(row.channels_json, []),
      targetConfig: parseJson(row.target_config_json, {})
    };
  }

  async function createCampaign(payload, actorUserId) {
    const data = normalizeCampaignPayload(payload);
    if (!data.title) throw badRequest('Campaign title is required.');
    const row = {
      id: id('ncamp'),
      title: data.title,
      description: data.description,
      channels_json: stringifyJson(data.channels),
      priority: data.priority,
      target_type: data.targetType,
      target_config_json: stringifyJson(data.targetConfig),
      subject: data.subject,
      body: data.body,
      status: data.status,
      scheduled_at: data.scheduledAt,
      created_by: actorUserId || null,
      created_at: now(),
      updated_at: now(),
      sent_at: null
    };
    await adapter.exec(`
      INSERT INTO notification_campaigns
        (id, title, description, channels_json, priority, target_type, target_config_json, subject, body, status, scheduled_at, created_by, created_at, updated_at, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [row.id, row.title, row.description, row.channels_json, row.priority, row.target_type, row.target_config_json, row.subject, row.body, row.status, row.scheduled_at, row.created_by, row.created_at, row.updated_at, row.sent_at]);
    await recordEvent({ campaignId: row.id, eventType: 'campaign.created', message: 'Campaign draft created.', metadata: { warnings: data.warnings } });
    return normalizeCampaign(row);
  }

  async function getCampaign(campaignId) {
    const row = await adapter.one('SELECT * FROM notification_campaigns WHERE id = ? LIMIT 1', [campaignId]);
    if (!row) throw notFound();
    return normalizeCampaign(row);
  }

  async function updateCampaign(campaignId, payload, actorUserId) {
    const existing = await getCampaign(campaignId);
    const merged = {
      ...existing,
      channels: payload.channels || existing.channels,
      targetType: payload.targetType || existing.target_type,
      targetConfig: payload.targetConfig || existing.targetConfig,
      workspaceIds: payload.workspaceIds,
      role: payload.role,
      plan: payload.plan,
      ...payload
    };
    const data = normalizeCampaignPayload(merged);
    await adapter.exec(`
      UPDATE notification_campaigns
      SET title = ?, description = ?, channels_json = ?, priority = ?, target_type = ?, target_config_json = ?,
        subject = ?, body = ?, status = ?, scheduled_at = ?, updated_at = ?
      WHERE id = ?
    `, [data.title, data.description, stringifyJson(data.channels), data.priority, data.targetType, stringifyJson(data.targetConfig), data.subject, data.body, data.status, data.scheduledAt, now(), campaignId]);
    await recordEvent({ campaignId, eventType: 'campaign.updated', message: 'Campaign updated.', metadata: { actorUserId, warnings: data.warnings } });
    return getCampaign(campaignId);
  }

  async function deleteCampaign(campaignId) {
    await getCampaign(campaignId);
    await adapter.exec('DELETE FROM notification_deliveries WHERE campaign_id = ?', [campaignId]);
    await adapter.exec('DELETE FROM notification_events WHERE campaign_id = ?', [campaignId]);
    await adapter.exec('DELETE FROM notification_campaigns WHERE id = ?', [campaignId]);
    return { ok: true };
  }

  async function resolveRecipients(campaignOrPayload) {
    const campaign = campaignOrPayload.id ? campaignOrPayload : normalizeCampaignPayload(campaignOrPayload);
    const targetType = campaign.target_type || campaign.targetType;
    const targetConfig = campaign.targetConfig || parseJson(campaign.target_config_json, {}) || campaign.targetConfig || {};
    if (targetType === 'plan') {
      try {
        const rows = await adapter.many(`
          SELECT u.*, u.id AS user_id, u.workspace_id, u.email, u.role, w.name AS workspace_name
          FROM users u
          JOIN workspaces w ON w.id = u.workspace_id
          JOIN workspace_subscriptions s ON s.workspace_id = w.id
          WHERE COALESCE(w.status, 'active') = 'active' AND lower(COALESCE(s.plan_key, '')) = ?
        `, [cleanString(targetConfig.plan).toLowerCase()]);
        return { rows, message: rows.length ? '' : 'No users matched the selected plan.' };
      } catch (_err) {
        return { rows: [], message: 'Plan targeting is available when subscription plan data exists.' };
      }
    }
    if (targetType === 'selected_workspaces') {
      const ids = Array.isArray(targetConfig.workspaceIds) ? targetConfig.workspaceIds.filter(Boolean) : [];
      if (!ids.length) return { rows: [], message: 'No workspaces selected.' };
      const results = [];
      for (const workspaceId of ids) {
        const rows = await adapter.many(`
          SELECT u.*, u.id AS user_id, u.workspace_id, u.email, u.role, w.name AS workspace_name
          FROM users u
          JOIN workspaces w ON w.id = u.workspace_id
          WHERE u.workspace_id = ? AND COALESCE(w.status, 'active') = 'active'
        `, [workspaceId]).catch(() => []);
        results.push(...rows);
      }
      return { rows: results, message: '' };
    }
    if (targetType === 'role') {
      const role = cleanString(targetConfig.role).toLowerCase();
      if (!role) return { rows: [], message: 'No role selected.' };
      const rows = await adapter.many(`
        SELECT u.*, u.id AS user_id, u.workspace_id, u.email, u.role, w.name AS workspace_name
        FROM users u
        JOIN workspaces w ON w.id = u.workspace_id
        WHERE COALESCE(w.status, 'active') = 'active' AND lower(COALESCE(u.role, '')) = ?
      `, [role]).catch(() => []);
      return { rows, message: '' };
    }
    const rows = await adapter.many(`
      SELECT u.*, u.id AS user_id, u.workspace_id, u.email, u.role, w.name AS workspace_name
      FROM users u
      JOIN workspaces w ON w.id = u.workspace_id
      WHERE COALESCE(w.status, 'active') = 'active'
    `).catch(() => []);
    return { rows, message: '' };
  }

  async function estimateCampaign(input) {
    const campaign = typeof input === 'string' ? await getCampaign(input) : (input?.id ? input : normalizeCampaignPayload(input || {}));
    const channels = campaign.channels || parseJson(campaign.channels_json, []);
    const recipients = await resolveRecipients(campaign);
    const count = recipients.rows.length;
    const costByChannel = {};
    for (const channel of channels) costByChannel[channel] = Number((count * (channelCosts[channel] || 0)).toFixed(4));
    const totalCost = Object.values(costByChannel).reduce((sum, value) => sum + Number(value || 0), 0);
    return {
      recipients: count,
      channels,
      costByChannel,
      emailCost: costByChannel.email || 0,
      smsCost: costByChannel.sms || 0,
      inAppCost: costByChannel.in_app || 0,
      totalCost: Number(totalCost.toFixed(4)),
      message: recipients.message || '',
      warnings: channels.includes('sms') ? ['SMS is estimated at 0.08 EUR per recipient. No real SMS is sent in Step 1.'] : []
    };
  }

  async function buildDeliveryDrafts(campaignId) {
    const campaign = await getCampaign(campaignId);
    await adapter.exec('DELETE FROM notification_deliveries WHERE campaign_id = ? AND status = ?', [campaignId, 'pending']);
    const channels = campaign.channels || [];
    const recipients = await resolveRecipients(campaign);
    const created = [];
    for (const recipient of recipients.rows) {
      for (const channel of channels) {
        const phone = cleanString(recipient.phone || recipient.phone_number || recipient.mobile_phone || recipient.mobile || recipient.sms || recipient.msisdn);
        const recipientValue = channel === 'email' ? recipient.email : channel === 'sms' ? phone : recipient.user_id;
        const row = {
          id: id('ndel'),
          campaign_id: campaignId,
          workspace_id: recipient.workspace_id || null,
          user_id: recipient.user_id || null,
          channel,
          recipient: recipientValue || null,
          status: 'pending',
          cost_eur: channelCosts[channel] || 0,
          error_message: null,
          metadata_json: stringifyJson({ workspaceName: recipient.workspace_name || null, step: 'draft_only' }),
          created_at: now(),
          updated_at: now()
        };
        await adapter.exec(`
          INSERT INTO notification_deliveries
            (id, campaign_id, workspace_id, user_id, channel, recipient, status, cost_eur, error_message, metadata_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [row.id, row.campaign_id, row.workspace_id, row.user_id, row.channel, row.recipient, row.status, row.cost_eur, row.error_message, row.metadata_json, row.created_at, row.updated_at]);
        created.push(row);
      }
    }
    await recordEvent({ campaignId, eventType: 'deliveries.built', message: 'Delivery draft rows built. No external notifications sent.', metadata: { count: created.length } });
    return { rows: created, count: created.length, message: recipients.message || '' };
  }

  async function getDeliveryStats(campaignId) {
    await getCampaign(campaignId);
    const rows = await adapter.many('SELECT status, COUNT(*) AS count, COALESCE(SUM(cost_eur), 0) AS cost FROM notification_deliveries WHERE campaign_id = ? GROUP BY status', [campaignId]);
    const stats = { pending: 0, sent: 0, delivered: 0, failed: 0, skipped: 0, totalCost: 0 };
    for (const row of rows) {
      const key = cleanString(row.status, 'pending');
      if (Object.prototype.hasOwnProperty.call(stats, key)) stats[key] = Number(row.count || 0);
      stats.totalCost += Number(row.cost || 0);
    }
    stats.totalCost = Number(stats.totalCost.toFixed(4));
    return stats;
  }

  async function listDeliveries({ campaignId, status, workspaceId, limit = 100 } = {}) {
    const filters = [];
    const params = [];
    if (campaignId) {
      filters.push('campaign_id = ?');
      params.push(campaignId);
    }
    if (status) {
      filters.push('status = ?');
      params.push(status);
    }
    if (workspaceId) {
      filters.push('workspace_id = ?');
      params.push(workspaceId);
    }
    params.push(Math.min(Math.max(Number(limit) || 100, 1), 500));
    return adapter.many(`SELECT * FROM notification_deliveries ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`, params);
  }

  async function listCampaigns({ status, channel, limit = 50 } = {}) {
    const filters = [];
    const params = [];
    if (status) {
      filters.push('c.status = ?');
      params.push(status);
    }
    if (channel) {
      filters.push('c.channels_json LIKE ?');
      params.push(`%"${channel}"%`);
    }
    params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));
    const rows = await adapter.many(`
      SELECT c.*,
        COUNT(d.id) AS delivery_count,
        SUM(CASE WHEN d.status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
        SUM(CASE WHEN d.status = 'delivered' THEN 1 ELSE 0 END) AS delivered_count,
        SUM(CASE WHEN d.status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
        COALESCE(SUM(d.cost_eur), 0) AS estimated_cost
      FROM notification_campaigns c
      LEFT JOIN notification_deliveries d ON d.campaign_id = c.id
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ?
    `, params);
    const summaryRows = await adapter.many(`
      SELECT status, COUNT(*) AS count FROM notification_campaigns GROUP BY status
    `).catch(() => []);
    const sentThisMonth = await adapter.one(`
      SELECT COUNT(*) AS count FROM notification_campaigns
      WHERE sent_at IS NOT NULL AND substr(sent_at, 1, 7) = substr(CURRENT_TIMESTAMP, 1, 7)
    `).catch(() => ({ count: 0 }));
    const monthlyCost = await adapter.one(`
      SELECT COALESCE(SUM(cost_eur), 0) AS cost FROM notification_deliveries
      WHERE substr(created_at, 1, 7) = substr(CURRENT_TIMESTAMP, 1, 7)
    `).catch(() => ({ cost: 0 }));
    const summary = { drafts: 0, scheduled: 0, sentThisMonth: Number(sentThisMonth?.count || 0), failed: 0, estimatedMonthlyCost: Number(monthlyCost?.cost || 0) };
    for (const row of summaryRows) {
      if (row.status === 'draft') summary.drafts = Number(row.count || 0);
      if (row.status === 'scheduled') summary.scheduled = Number(row.count || 0);
      if (row.status === 'failed') summary.failed = Number(row.count || 0);
    }
    return { rows: rows.map(normalizeCampaign), summary };
  }

  async function updateDelivery(deliveryId, patch = {}) {
    const existing = await adapter.one('SELECT * FROM notification_deliveries WHERE id = ? LIMIT 1', [deliveryId]);
    if (!existing) throw notFound('Delivery not found.');
    const updated = {
      status: patch.status ?? existing.status,
      error_message: patch.errorMessage ?? existing.error_message,
      metadata_json: patch.metadata == null ? existing.metadata_json : stringifyJson(patch.metadata),
      updated_at: now()
    };
    await adapter.exec(`
      UPDATE notification_deliveries
      SET status = ?, error_message = ?, metadata_json = ?, updated_at = ?
      WHERE id = ?
    `, [updated.status, updated.error_message, updated.metadata_json, updated.updated_at, deliveryId]);
    return adapter.one('SELECT * FROM notification_deliveries WHERE id = ? LIMIT 1', [deliveryId]);
  }

  async function isChannelEnabled(workspaceId, channel) {
    if (channel === 'email' && platformControlService?.isFeatureEnabled) {
      const enabled = await platformControlService.isFeatureEnabled(workspaceId, 'emailEnabled').catch(() => true);
      if (!enabled) throw new Error('Email is disabled by Platform Control.');
    }
    if (channel === 'sms' && platformControlService?.isFeatureEnabled) {
      const enabled = await platformControlService.isFeatureEnabled(workspaceId, 'smsEnabled').catch(() => true);
      if (!enabled) throw new Error('SMS is disabled by Platform Control.');
    }
  }

  async function checkAndRecordCost(delivery, metadata = {}) {
    const providerKey = delivery.channel === 'sms' ? 'twilio' : delivery.channel === 'email' ? 'ionos_email' : null;
    if (!providerKey || !costControlService) return;
    const cost = Number(delivery.cost_eur || 0);
    if (costControlService.enforceProviderLimit) {
      await costControlService.enforceProviderLimit({
        workspaceId: delivery.workspace_id,
        providerKey,
        estimatedCostEur: cost,
        period: 'monthly'
      });
    }
    if (costControlService.recordUsage) {
      await costControlService.recordUsage({
        workspaceId: delivery.workspace_id,
        providerKey,
        featureKey: 'notification_control',
        units: 1,
        unitName: delivery.channel === 'sms' ? 'sms' : 'email',
        unitCostEur: cost,
        costEur: cost,
        metadata
      });
    }
  }

  async function deliverInApp(campaign, delivery) {
    await adapter.exec(`
      INSERT INTO platform_user_notifications (id, workspace_id, user_id, title, body, read_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id('pun'), delivery.workspace_id || null, delivery.user_id || null, campaign.subject || campaign.title, campaign.body, null, now()]);
    return { ok: true, provider: 'in_app' };
  }

  async function deliverEmail(campaign, delivery) {
    if (!emailSender) throw new Error('Email sender is not configured.');
    if (!cleanString(delivery.recipient).includes('@')) throw new Error('Delivery has no valid email recipient.');
    return emailSender({
      to: delivery.recipient,
      subject: campaign.subject || campaign.title,
      text: campaign.body,
      html: `<div>${String(campaign.body || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])).replace(/\n/g, '<br>')}</div>`
    });
  }

  async function deliverSms(campaign, delivery) {
    if (!smsSender) throw new Error('Twilio SMS sender is not configured.');
    if (!cleanString(delivery.recipient)) throw new Error('Delivery has no SMS recipient.');
    return smsSender({
      to: delivery.recipient,
      body: campaign.body,
      campaignId: campaign.id,
      deliveryId: delivery.id
    });
  }

  async function processDelivery(campaign, delivery, { dryRun = false, allowedChannels = null } = {}) {
    if (['sent', 'delivered'].includes(String(delivery.status || '').toLowerCase())) {
      return { delivery, skipped: true, reason: 'already_sent' };
    }
    if (allowedChannels && !allowedChannels.has(delivery.channel)) {
      return { delivery, skipped: true, reason: 'channel_not_enabled' };
    }
    if (dryRun) {
      return {
        delivery,
        skipped: true,
        reason: 'dry_run'
      };
    }
    try {
      await isChannelEnabled(delivery.workspace_id, delivery.channel);
      await checkAndRecordCost(delivery, { campaignId: campaign.id, deliveryId: delivery.id, channel: delivery.channel });
      let providerResult;
      if (delivery.channel === 'in_app') providerResult = await deliverInApp(campaign, delivery);
      else if (delivery.channel === 'email') providerResult = await deliverEmail(campaign, delivery);
      else if (delivery.channel === 'sms') providerResult = await deliverSms(campaign, delivery);
      else throw new Error(`Unsupported delivery channel: ${delivery.channel}`);
      const updated = await updateDelivery(delivery.id, {
        status: 'sent',
        errorMessage: null,
        metadata: { provider: providerResult?.provider || delivery.channel, messageId: providerResult?.messageId || null, disabled: !!providerResult?.disabled }
      });
      await recordEvent({ campaignId: campaign.id, deliveryId: delivery.id, eventType: 'delivery.sent', message: `${delivery.channel} delivery processed.` });
      return { delivery: updated, providerResult };
    } catch (error) {
      const message = publicErrorMessage(error);
      const updated = await updateDelivery(delivery.id, {
        status: 'failed',
        errorMessage: message,
        metadata: { failedAt: now(), channel: delivery.channel }
      });
      await recordEvent({ campaignId: campaign.id, deliveryId: delivery.id, eventType: 'delivery.failed', message });
      return { delivery: updated, error: message };
    }
  }

  async function updateCampaignStatusFromDeliveries(campaignId) {
    const stats = await getDeliveryStats(campaignId);
    const remaining = Number(stats.pending || 0);
    const failed = Number(stats.failed || 0);
    const processed = Number(stats.sent || 0) + Number(stats.delivered || 0) + Number(stats.skipped || 0) + failed;
    if (remaining > 0) {
      await adapter.exec('UPDATE notification_campaigns SET status = ?, updated_at = ? WHERE id = ?', ['sending', now(), campaignId]);
      return 'sending';
    }
    const status = failed > 0 && processed === failed ? 'failed' : 'completed';
    await adapter.exec('UPDATE notification_campaigns SET status = ?, sent_at = ?, updated_at = ? WHERE id = ?', [status, now(), now(), campaignId]);
    return status;
  }

  async function sendInAppCampaign(campaignId, { dryRun = false, limit = 100 } = {}) {
    const campaign = await getCampaign(campaignId);
    if (campaign.status === 'cancelled') throw badRequest('Cancelled campaigns cannot be sent.');
    const inAppCount = await adapter.one("SELECT COUNT(*) AS count FROM notification_deliveries WHERE campaign_id = ? AND channel = 'in_app'", [campaignId]);
    if (Number(inAppCount?.count || 0) <= 0) throw badRequest('Build in-app notification deliveries before sending.');
    const pendingCount = await adapter.one("SELECT COUNT(*) AS count FROM notification_deliveries WHERE campaign_id = ? AND channel = 'in_app' AND status = 'pending'", [campaignId]);
    const total = Number(pendingCount?.count || 0);
    const batchLimit = Math.min(Math.max(Number(limit) || 100, 1), 100);
    if (total <= 0) {
      const stats = await getDeliveryStats(campaignId);
      return {
        ok: true,
        dryRun: !!dryRun,
        processed: 0,
        remaining: 0,
        status: campaign.status,
        queued: false,
        stats,
        results: []
      };
    }
    if (!dryRun) {
      await adapter.exec('UPDATE notification_campaigns SET status = ?, updated_at = ? WHERE id = ?', ['sending', now(), campaignId]);
    }
    const rows = await adapter.many(`
      SELECT * FROM notification_deliveries
      WHERE campaign_id = ? AND channel = 'in_app' AND status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?
    `, [campaignId, batchLimit]);
    const results = [];
    const inAppChannels = new Set(['in_app']);
    for (const delivery of rows) {
      results.push(await processDelivery(campaign, delivery, { dryRun, allowedChannels: inAppChannels }));
    }
    const status = dryRun ? campaign.status : await updateCampaignStatusFromDeliveries(campaignId);
    const remaining = await adapter.one("SELECT COUNT(*) AS count FROM notification_deliveries WHERE campaign_id = ? AND channel = 'in_app' AND status = 'pending'", [campaignId]);
    await recordEvent({
      campaignId,
      eventType: dryRun ? 'campaign.in_app_dry_run' : 'campaign.in_app_send_batch',
      message: dryRun ? 'In-app dry run completed.' : 'In-app campaign send batch processed.',
      metadata: { processed: results.length, remaining: Number(remaining?.count || 0), maxBatch: batchLimit }
    });
    return {
      ok: true,
      dryRun: !!dryRun,
      processed: results.length,
      remaining: Number(remaining?.count || 0),
      status,
      queued: total > batchLimit,
      results: results.map((item) => ({
        id: item.delivery?.id,
        status: item.delivery?.status,
        error: item.error || null,
        skipped: !!item.skipped,
        reason: item.reason || null
      }))
    };
  }

  async function sendCampaign(campaignId, options = {}) {
    return sendInAppCampaign(campaignId, options);
  }

  async function retryInAppDelivery(deliveryId, { dryRun = false } = {}) {
    const delivery = await adapter.one('SELECT * FROM notification_deliveries WHERE id = ? LIMIT 1', [deliveryId]);
    if (!delivery) throw notFound('Delivery not found.');
    if (delivery.channel !== 'in_app') throw badRequest('Only in-app deliveries can be retried in this step.');
    if (['sent', 'delivered'].includes(String(delivery.status || '').toLowerCase())) {
      return { ok: true, delivery, skipped: true, reason: 'already_sent' };
    }
    const campaign = await getCampaign(delivery.campaign_id);
    if (!dryRun) {
      await adapter.exec('UPDATE notification_campaigns SET status = ?, updated_at = ? WHERE id = ?', ['sending', now(), campaign.id]);
    }
    const result = await processDelivery(campaign, delivery, { dryRun, allowedChannels: new Set(['in_app']) });
    const status = dryRun ? campaign.status : await updateCampaignStatusFromDeliveries(campaign.id);
    return { ok: true, delivery: result.delivery, status, error: result.error || null, skipped: !!result.skipped };
  }

  async function retryDelivery(deliveryId, options = {}) {
    return retryInAppDelivery(deliveryId, options);
  }

  async function cancelCampaign(campaignId) {
    await getCampaign(campaignId);
    await adapter.exec("UPDATE notification_campaigns SET status = 'cancelled', updated_at = ? WHERE id = ?", [now(), campaignId]);
    await adapter.exec("UPDATE notification_deliveries SET status = 'skipped', error_message = NULL, updated_at = ? WHERE campaign_id = ? AND status = 'pending'", [now(), campaignId]);
    await recordEvent({ campaignId, eventType: 'campaign.cancelled', message: 'Campaign cancelled by platform owner.' });
    return { ok: true, row: await getCampaign(campaignId) };
  }

  async function createTemplate(payload, actorUserId) {
    const name = cleanString(payload.name);
    const channel = normalizeChannels([payload.channel || 'in_app'])[0];
    const body = cleanString(payload.body);
    if (!name || !body) throw badRequest('Template name and body are required.');
    validateBody(body, [channel]);
    const row = {
      id: id('ntpl'),
      name,
      channel,
      subject: cleanString(payload.subject),
      body,
      variables_json: stringifyJson(payload.variables || {}),
      created_by: actorUserId || null,
      created_at: now(),
      updated_at: now()
    };
    await adapter.exec(`
      INSERT INTO notification_templates (id, name, channel, subject, body, variables_json, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [row.id, row.name, row.channel, row.subject, row.body, row.variables_json, row.created_by, row.created_at, row.updated_at]);
    return row;
  }

  async function listTemplates() {
    const rows = await adapter.many('SELECT * FROM notification_templates ORDER BY created_at DESC LIMIT 100');
    if (rows.length) return rows;
    const defaults = [
      { name: 'Welcome message', channel: 'email', subject: 'Welcome to {{workspace}}', body: 'Hello {{name}}, welcome to {{workspace}}.' },
      { name: 'Payment reminder', channel: 'email', subject: 'Billing reminder', body: 'Hello {{name}}, your workspace {{workspace}} has a billing action due.' },
      { name: 'System alert', channel: 'sms', subject: 'System alert', body: 'StudiesTalk alert: {{message}}' }
    ];
    for (const item of defaults) await createTemplate(item, null);
    return adapter.many('SELECT * FROM notification_templates ORDER BY created_at DESC LIMIT 100');
  }

  function normalizeAutomationRule(row) {
    if (!row) return null;
    return {
      ...row,
      channels: parseJson(row.channels_json, []),
      targetConfig: parseJson(row.target_config_json, {}),
      enabled: Number(row.enabled || 0) ? 1 : 0,
      cooldown_minutes: Number(row.cooldown_minutes || 0)
    };
  }

  async function getAutomationRule(ruleId) {
    const row = await adapter.one('SELECT * FROM notification_automation_rules WHERE id = ? LIMIT 1', [ruleId]);
    if (!row) throw notFound('Automation rule not found.');
    return normalizeAutomationRule(row);
  }

  async function listAutomationRules({ limit = 100 } = {}) {
    const rows = await adapter.many(`
      SELECT r.*,
        COUNT(ar.id) AS run_count,
        MAX(ar.created_at) AS last_run_at
      FROM notification_automation_rules r
      LEFT JOIN notification_automation_runs ar ON ar.rule_id = r.id
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT ?
    `, [Math.min(Math.max(Number(limit) || 100, 1), 200)]);
    const runs = await adapter.many(`
      SELECT ar.*, r.name AS rule_name, r.trigger_key
      FROM notification_automation_runs ar
      LEFT JOIN notification_automation_rules r ON r.id = ar.rule_id
      ORDER BY ar.created_at DESC
      LIMIT 50
    `).catch(() => []);
    return { rows: rows.map(normalizeAutomationRule), runs };
  }

  async function createAutomationRule(payload, actorUserId) {
    const data = normalizeAutomationPayload(payload);
    if (!data.name) throw badRequest('Automation rule name is required.');
    const row = {
      id: id('nauto'),
      name: data.name,
      trigger_key: data.triggerKey,
      channels_json: stringifyJson(data.channels),
      target_config_json: stringifyJson(data.targetConfig),
      template_id: data.templateId,
      enabled: data.enabled,
      cooldown_minutes: data.cooldownMinutes,
      created_at: now(),
      updated_at: now()
    };
    await adapter.exec(`
      INSERT INTO notification_automation_rules
        (id, name, trigger_key, channels_json, target_config_json, template_id, enabled, cooldown_minutes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [row.id, row.name, row.trigger_key, row.channels_json, row.target_config_json, row.template_id, row.enabled, row.cooldown_minutes, row.created_at, row.updated_at]);
    await recordEvent({
      eventType: 'automation_rule.created',
      message: 'Automation rule created.',
      metadata: { ruleId: row.id, actorUserId: actorUserId || null, triggerKey: row.trigger_key }
    });
    return normalizeAutomationRule(row);
  }

  async function updateAutomationRule(ruleId, payload, actorUserId) {
    const existing = await getAutomationRule(ruleId);
    const merged = {
      ...existing,
      triggerKey: existing.trigger_key,
      channels: existing.channels,
      targetConfig: existing.targetConfig,
      templateId: existing.template_id,
      cooldownMinutes: existing.cooldown_minutes,
      ...payload
    };
    const data = normalizeAutomationPayload(merged);
    await adapter.exec(`
      UPDATE notification_automation_rules
      SET name = ?, trigger_key = ?, channels_json = ?, target_config_json = ?, template_id = ?,
        enabled = ?, cooldown_minutes = ?, updated_at = ?
      WHERE id = ?
    `, [
      data.name,
      data.triggerKey,
      stringifyJson(data.channels),
      stringifyJson(data.targetConfig),
      data.templateId,
      data.enabled,
      data.cooldownMinutes,
      now(),
      ruleId
    ]);
    await recordEvent({
      eventType: 'automation_rule.updated',
      message: 'Automation rule updated.',
      metadata: { ruleId, actorUserId: actorUserId || null }
    });
    return getAutomationRule(ruleId);
  }

  async function deleteAutomationRule(ruleId) {
    await getAutomationRule(ruleId);
    await adapter.exec('DELETE FROM notification_automation_runs WHERE rule_id = ?', [ruleId]);
    await adapter.exec('DELETE FROM notification_automation_rules WHERE id = ?', [ruleId]);
    await recordEvent({
      eventType: 'automation_rule.deleted',
      message: 'Automation rule deleted.',
      metadata: { ruleId }
    });
    return { ok: true };
  }

  function automationTriggerPreview(triggerKey) {
    const previews = {
      ai_budget_80: { matched: true, reason: 'AI budget sample is at 80% threshold.', recipientsHint: 'workspace admins' },
      workspace_inactive_7_days: { matched: true, reason: 'Workspace inactivity sample is 7 days.', recipientsHint: 'workspace admins' },
      failed_payment: { matched: true, reason: 'Failed payment sample event is present.', recipientsHint: 'billing admins' },
      failed_email_delivery_gt_10: { matched: true, reason: 'Failed email delivery sample count is above 10.', recipientsHint: 'platform operators' },
      storage_usage_80: { matched: true, reason: 'Storage usage sample is at 80% threshold.', recipientsHint: 'workspace admins' }
    };
    return previews[triggerKey] || { matched: false, reason: 'Unknown trigger.', recipientsHint: '' };
  }

  async function testAutomationRule(ruleId) {
    const rule = await getAutomationRule(ruleId);
    const template = rule.template_id
      ? await adapter.one('SELECT * FROM notification_templates WHERE id = ? LIMIT 1', [rule.template_id]).catch(() => null)
      : null;
    const preview = automationTriggerPreview(rule.trigger_key);
    const targetConfig = rule.targetConfig || {};
    const campaignPayload = {
      title: `[Automation test] ${rule.name}`,
      description: `Dry-run test for ${rule.trigger_key}`,
      channels: rule.channels,
      priority: rule.trigger_key === 'failed_payment' || rule.trigger_key === 'ai_budget_80' ? 'high' : 'normal',
      targetType: targetConfig.targetType || (targetConfig.workspaceIds?.length ? 'selected_workspaces' : 'all_workspaces'),
      workspaceIds: targetConfig.workspaceIds || [],
      role: targetConfig.role || '',
      plan: targetConfig.plan || '',
      subject: template?.subject || rule.name,
      body: template?.body || `Automation trigger fired: ${preview.reason}`,
      status: 'draft'
    };
    let estimate;
    try {
      estimate = await estimateCampaign(campaignPayload);
    } catch (error) {
      estimate = { recipients: 0, totalCost: 0, message: publicErrorMessage(error) };
    }
    const result = {
      matched: !!preview.matched,
      triggerKey: rule.trigger_key,
      reason: preview.reason,
      recipientsHint: preview.recipientsHint,
      channels: rule.channels,
      estimatedRecipients: Number(estimate.recipients || 0),
      estimatedCost: Number(estimate.totalCost || 0),
      enabled: Number(rule.enabled || 0) === 1,
      cooldownMinutes: Number(rule.cooldown_minutes || 0),
      dryRunOnly: true
    };
    const run = {
      id: id('nautorun'),
      rule_id: rule.id,
      status: result.matched ? 'matched' : 'skipped',
      result_json: stringifyJson(result),
      created_at: now()
    };
    await adapter.exec(`
      INSERT INTO notification_automation_runs (id, rule_id, status, result_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [run.id, run.rule_id, run.status, run.result_json, run.created_at]);
    await recordEvent({
      eventType: 'automation_rule.tested',
      message: 'Automation rule test run completed.',
      metadata: { ruleId: rule.id, runId: run.id, status: run.status }
    });
    return { ok: true, rule, run: { ...run, result: parseJson(run.result_json, {}) }, result };
  }

  function renderTemplate(template, variables = {}) {
    const replace = (value) => String(value || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => String(variables[key] ?? ''));
    return {
      subject: replace(template.subject),
      body: replace(template.body)
    };
  }

  return {
    ensureSchema,
    createCampaign,
    updateCampaign,
    getCampaign,
    listCampaigns,
    deleteCampaign,
    estimateCampaign,
    buildDeliveryDrafts,
    sendInAppCampaign,
    sendCampaign,
    retryInAppDelivery,
    retryDelivery,
    cancelCampaign,
    getDeliveryStats,
    listDeliveries,
    createTemplate,
    listTemplates,
    listAutomationRules,
    createAutomationRule,
    updateAutomationRule,
    deleteAutomationRule,
    testAutomationRule,
    renderTemplate
  };
}

module.exports = {
  createNotificationControlService
};
