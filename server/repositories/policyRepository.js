'use strict';

const crypto = require('crypto');
const { normalizeEngine } = require('../../db/helpers');
const { one: pgOne, exec: pgExec } = require('../../db');

const DEFAULT_POLICY_VERSION = '2026-04-23';
const PLATFORM_POLICY_VERSION_KEY = 'workspace_policy_version_default';
const WORKSPACE_POLICY_TYPE = 'workspace_entry';

function createPolicyRepository({ engine = 'sqlite', sqliteDb } = {}) {
  const normalizedEngine = normalizeEngine(engine);
  if (normalizedEngine === 'postgres') return createPostgresPolicyRepository();
  if (!sqliteDb) throw new Error('sqliteDb is required for the SQLite policy repository');
  return createSqlitePolicyRepository(sqliteDb);
}

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return fallback;
  }
}

function normalizePolicyVersion(value) {
  const normalized = String(value || '').trim();
  return normalized || DEFAULT_POLICY_VERSION;
}

function resolveWorkspacePolicyVersionFromSettings(settingsJson) {
  const settings = safeJsonParse(settingsJson, {});
  const raw = String(
    settings?.policyAcceptance?.version ||
      settings?.policy?.version ||
      settings?.workspacePolicyVersion ||
      ''
  ).trim();
  return raw || '';
}

function buildDocumentPayload({
  workspaceRow = {},
  profileRow = {},
  emailSettingsRow = {},
  version = DEFAULT_POLICY_VERSION
} = {}) {
  const schoolName = String(workspaceRow.name || profileRow.school_name || 'School workspace').trim();
  const adminEmail = String(workspaceRow.admin_email || '').trim();
  const replyToEmail = String(emailSettingsRow.reply_to_email || '').trim();
  const supportEmail = replyToEmail || adminEmail || 'Not yet configured';
  const phone = String(profileRow.phone || '').trim() || 'Not yet configured';
  const website = String(profileRow.website || '').trim() || 'Not yet configured';
  const addressLines = [
    [profileRow.street, profileRow.house_number].filter(Boolean).join(' ').trim(),
    [profileRow.postal_code, profileRow.city].filter(Boolean).join(' ').trim(),
    [profileRow.state, profileRow.country].filter(Boolean).join(', ').trim()
  ].filter(Boolean);
  const address = addressLines.length ? addressLines.join('\n') : 'Not yet configured';
  const title = `${schoolName} Privacy, Terms & Rules`;
  const lastUpdated = normalizePolicyVersion(version);

  return {
    title,
    schoolName,
    workspaceId: String(workspaceRow.id || '').trim(),
    version: normalizePolicyVersion(version),
    lastUpdated,
    contact: {
      supportEmail,
      phone,
      website,
      address
    },
    summaryCards: [
      {
        key: 'eu-hosted',
        title: 'EU-hosted infrastructure',
        body: 'Workspace data is hosted for school operations within EU-oriented infrastructure.'
      },
      {
        key: 'no-tracking',
        title: 'No ads or third-party tracking',
        body: 'The workspace is designed for school communication, not ad-tech or behavioral profiling.'
      },
      {
        key: 'encrypted',
        title: 'Encrypted communication',
        body: 'Authentication and communication paths are handled through authenticated application sessions.'
      },
      {
        key: 'classroom-only',
        title: 'Classroom-only usage',
        body: 'Channels, homework, live classes, and direct communication are intended for educational use.'
      },
      {
        key: 'moderation',
        title: 'Moderation and reporting',
        body: 'Teachers and school administrators can review reports and take moderation action when needed.'
      }
    ],
    sections: [
      {
        id: 'controller',
        title: 'Data Controller & Legal Basis',
        summary: 'Who operates the workspace and why student data is processed.',
        paragraphs: [
          `${schoolName} is the controller for the workspace data used in this school environment.`,
          'Personal data is processed to deliver classes, assignments, attendance, communication, and workspace security.',
          'Where required, schools may rely on contract performance, legitimate interest, or consent, depending on the local educational context.'
        ],
        bullets: [
          `Workspace administrator: ${supportEmail}`,
          `School address: ${address.replace(/\n/g, ', ')}`,
          'Processing scope includes class participation, homework, moderation, attendance, and account administration.'
        ]
      },
      {
        id: 'gdpr',
        title: 'Data Privacy (GDPR)',
        summary: 'How personal data is handled for a school-focused workspace.',
        paragraphs: [
          'StudiesTalk is intended for school communication and learning activity, not consumer social networking.',
          'Workspace data is kept for educational operations, moderation, record-keeping, and service reliability.'
        ],
        bullets: [
          'No advertising network integration is required for the core workspace flow.',
          'No third-party behavioral tracking is presented in this acceptance checkpoint.',
          'Users may contact the workspace administrator for correction or deletion requests where applicable.'
        ]
      },
      {
        id: 'communication',
        title: 'Communication Rules',
        summary: 'Expected behavior for channels, homework, and direct communication.',
        paragraphs: [
          'All members must use the workspace respectfully and for educational purposes.',
          'Harassment, hate speech, illegal content, and harmful conduct are prohibited.'
        ],
        bullets: [
          'Use class and school channels for coursework, schedules, announcements, and related discussion.',
          'Follow the same behavior standards in direct messages and group conversations.',
          'Do not share unlawful, abusive, or unsafe material through the workspace.'
        ]
      },
      {
        id: 'roles',
        title: 'Roles & Permissions',
        summary: 'What students, teachers, and administrators are expected to do in the workspace.',
        paragraphs: [
          'Students participate in assigned channels and coursework.',
          'Teachers guide classes and can moderate learning spaces.',
          'School administrators manage workspace settings, users, and policy enforcement.'
        ],
        bullets: [
          'Students: participate in assigned classes and submit coursework.',
          'Teachers: manage classroom communication and review reported content.',
          'School administrators: manage members, settings, and compliance decisions.'
        ]
      },
      {
        id: 'safety',
        title: 'Safety & Moderation',
        summary: 'How issues can be reported and handled inside the workspace.',
        paragraphs: [
          'Reported content may be reviewed by teachers or school administrators.',
          'Moderation actions can include warnings, message removal, muting, or other school-level restrictions.'
        ],
        bullets: [
          'Use school reporting paths when behavior or content violates rules.',
          'Moderation decisions are made for classroom safety and policy compliance.',
          'Serious incidents may require escalation by the school.'
        ]
      },
      {
        id: 'commitment',
        title: 'Our Commitment',
        summary: 'A school-first communication environment rather than a public social feed.',
        paragraphs: [
          'StudiesTalk is intended to support secure school communication, learning collaboration, and operational clarity.',
          'This checkpoint exists to ensure every workspace member reviews the current policy version before entry.'
        ],
        bullets: [
          'School-first product design',
          'Readable and versioned policy disclosure',
          'Mandatory re-acceptance when the workspace policy version changes'
        ]
      },
      {
        id: 'contact',
        title: 'Contact',
        summary: 'How to reach the workspace operator when policy questions arise.',
        paragraphs: [
          `Support email: ${supportEmail}`,
          `Phone: ${phone}`,
          `Website: ${website}`,
          `Address: ${address.replace(/\n/g, ', ')}`
        ],
        bullets: []
      }
    ]
  };
}

function buildSqliteDocumentQuery(sqliteDb, workspaceId) {
  const workspaceRow =
    sqliteDb
      .prepare('SELECT id, name, admin_email FROM workspaces WHERE id = ? LIMIT 1')
      .get(workspaceId) || null;
  if (!workspaceRow) return null;
  const profileRow =
    sqliteDb.prepare('SELECT * FROM workspace_profile WHERE workspace_id = ? LIMIT 1').get(workspaceId) || {};
  const emailSettingsRow =
    sqliteDb
      .prepare('SELECT * FROM workspace_email_settings WHERE workspace_id = ? LIMIT 1')
      .get(workspaceId) || {};
  const settingsRow =
    sqliteDb
      .prepare('SELECT settings_json AS settingsJson FROM workspace_settings_admin WHERE workspace_id = ? LIMIT 1')
      .get(workspaceId) || {};
  const platformSettingRow =
    sqliteDb
      .prepare('SELECT value FROM platform_settings WHERE key = ? LIMIT 1')
      .get(PLATFORM_POLICY_VERSION_KEY) || {};
  const version =
    resolveWorkspacePolicyVersionFromSettings(settingsRow.settingsJson) ||
    normalizePolicyVersion(platformSettingRow.value);
  return buildDocumentPayload({ workspaceRow, profileRow, emailSettingsRow, version });
}

function createSqlitePolicyRepository(sqliteDb) {
  return {
    engine: 'sqlite',

    getWorkspacePolicyVersion(workspaceId) {
      const settingsRow =
        sqliteDb
          .prepare('SELECT settings_json AS settingsJson FROM workspace_settings_admin WHERE workspace_id = ? LIMIT 1')
          .get(workspaceId) || {};
      const platformSettingRow =
        sqliteDb
          .prepare('SELECT value FROM platform_settings WHERE key = ? LIMIT 1')
          .get(PLATFORM_POLICY_VERSION_KEY) || {};
      return (
        resolveWorkspacePolicyVersionFromSettings(settingsRow.settingsJson) ||
        normalizePolicyVersion(platformSettingRow.value)
      );
    },

    getLatestAcceptance(workspaceId, userId) {
      return (
        sqliteDb
          .prepare(
            `
            SELECT version, accepted_at AS acceptedAt
            FROM policy_acceptances
            WHERE workspace_id = ? AND user_id = ?
            ORDER BY datetime(accepted_at) DESC, rowid DESC
            LIMIT 1
          `
          )
          .get(workspaceId, userId) || null
      );
    },

    getAcceptanceByVersion(workspaceId, userId, version) {
      return (
        sqliteDb
          .prepare(
            `
            SELECT version, accepted_at AS acceptedAt
            FROM policy_acceptances
            WHERE workspace_id = ? AND user_id = ? AND version = ?
            ORDER BY datetime(accepted_at) DESC, rowid DESC
            LIMIT 1
          `
          )
          .get(workspaceId, userId, normalizePolicyVersion(version)) || null
      );
    },

    saveAcceptance({ workspaceId, userId, version, acceptedAt = new Date().toISOString() }) {
      const normalizedVersion = normalizePolicyVersion(version);
      sqliteDb
        .prepare(
          `
          INSERT INTO policy_acceptances (id, workspace_id, user_id, version, accepted_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, workspace_id, version) DO UPDATE SET
            accepted_at = excluded.accepted_at
        `
        )
        .run(`polacc_${crypto.randomUUID()}`, workspaceId, userId, normalizedVersion, acceptedAt);
      return this.getAcceptanceByVersion(workspaceId, userId, normalizedVersion);
    },

    getWorkspacePolicyDocument(workspaceId) {
      return buildSqliteDocumentQuery(sqliteDb, workspaceId);
    }
  };
}

function createPostgresPolicyRepository() {
  return {
    engine: 'postgres',

    async getWorkspacePolicyVersion(workspaceId) {
      const settingsRow =
        (await pgOne(
          'SELECT settings_json AS "settingsJson" FROM workspace_settings_admin WHERE workspace_id = ? LIMIT 1',
          [workspaceId]
        )) || {};
      const platformSettingRow =
        (await pgOne('SELECT value FROM platform_settings WHERE key = ? LIMIT 1', [PLATFORM_POLICY_VERSION_KEY])) || {};
      return (
        resolveWorkspacePolicyVersionFromSettings(settingsRow.settingsJson) ||
        normalizePolicyVersion(platformSettingRow.value)
      );
    },

    async getLatestAcceptance(workspaceId, userId) {
      return await pgOne(
        `
        SELECT version, accepted_at AS "acceptedAt"
        FROM policy_acceptances
        WHERE workspace_id = ? AND user_id = ?
        ORDER BY accepted_at DESC
        LIMIT 1
      `,
        [workspaceId, userId]
      );
    },

    async getAcceptanceByVersion(workspaceId, userId, version) {
      return await pgOne(
        `
        SELECT version, accepted_at AS "acceptedAt"
        FROM policy_acceptances
        WHERE workspace_id = ? AND user_id = ? AND version = ?
        ORDER BY accepted_at DESC
        LIMIT 1
      `,
        [workspaceId, userId, normalizePolicyVersion(version)]
      );
    },

    async saveAcceptance({ workspaceId, userId, version, acceptedAt = new Date().toISOString() }) {
      const normalizedVersion = normalizePolicyVersion(version);
      await pgExec(
        `
        INSERT INTO policy_acceptances (id, workspace_id, user_id, version, accepted_at, policy_type)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id, workspace_id, version) DO UPDATE SET
          accepted_at = EXCLUDED.accepted_at,
          policy_type = EXCLUDED.policy_type
      `,
        [`polacc_${crypto.randomUUID()}`, workspaceId, userId, normalizedVersion, acceptedAt, WORKSPACE_POLICY_TYPE]
      );
      return this.getAcceptanceByVersion(workspaceId, userId, normalizedVersion);
    },

    async getWorkspacePolicyDocument(workspaceId) {
      const workspaceRow = await pgOne(
        'SELECT id, name, admin_email FROM workspaces WHERE id = ? LIMIT 1',
        [workspaceId]
      );
      if (!workspaceRow) return null;
      const profileRow =
        (await pgOne('SELECT * FROM workspace_profile WHERE workspace_id = ? LIMIT 1', [workspaceId])) || {};
      const emailSettingsRow =
        (await pgOne('SELECT * FROM workspace_email_settings WHERE workspace_id = ? LIMIT 1', [workspaceId])) || {};
      const version = await this.getWorkspacePolicyVersion(workspaceId);
      return buildDocumentPayload({ workspaceRow, profileRow, emailSettingsRow, version });
    }
  };
}

module.exports = {
  createPolicyRepository,
  DEFAULT_POLICY_VERSION,
  PLATFORM_POLICY_VERSION_KEY,
  WORKSPACE_POLICY_TYPE
};
