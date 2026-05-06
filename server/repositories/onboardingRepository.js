'use strict';

const crypto = require('crypto');
const { normalizeEngine } = require('../../db/helpers');

const ONBOARDING_ITEMS = [
  { id: 'welcome', title: 'Welcome', description: 'Review what needs to be configured before the school goes live.', domain: 'orientation', required: true, mvp: true },
  { id: 'school_profile', title: 'Complete school profile', description: 'Add address, phone, website, and opening hours.', domain: 'settings', required: true, mvp: true },
  { id: 'staff_setup', title: 'Set up staff', description: 'Create at least one teacher account for the workspace.', domain: 'users', required: true, mvp: true },
  { id: 'academic_structure', title: 'Build academic structure', description: 'Create at least one real class channel beyond the default welcome channels.', domain: 'academics', required: true, mvp: true },
  { id: 'student_setup', title: 'Add students', description: 'Create at least one student account or prepare student registration.', domain: 'students', required: true, mvp: true },
  { id: 'communication_setup', title: 'Configure communication', description: 'Prepare announcements or school email settings.', domain: 'communication', required: false },
  { id: 'live_class_setup', title: 'Schedule a live class', description: 'Create the first live class session.', domain: 'live', required: true, mvp: true },
  { id: 'homework_setup', title: 'Prepare homework', description: 'Create a class homework item or homework channel.', domain: 'homework', required: false },
  { id: 'ai_setup', title: 'Set AI budget', description: 'Choose the monthly AI practice budget.', domain: 'ai', required: false },
  { id: 'billing_setup', title: 'Confirm billing setup', description: 'Verify billing email and plan readiness.', domain: 'billing', required: false },
  { id: 'launch_checklist', title: 'Launch checklist', description: 'Confirm the MVP setup is complete and activate the workspace.', domain: 'launch', required: true, mvp: true }
];

const ONBOARDING_STATUSES = new Set(['not_started', 'in_progress', 'completed', 'skipped']);
const STEP_STATUSES = new Set(['pending', 'in_progress', 'completed', 'skipped']);
const CORE_STEP_IDS = ['welcome', 'school_profile', 'staff_setup', 'academic_structure', 'student_setup', 'live_class_setup'];
const STEP_IDS = new Set(ONBOARDING_ITEMS.map((item) => item.id));
const STEP_INDEX = new Map(ONBOARDING_ITEMS.map((item, index) => [item.id, index]));
const MAX_META_JSON_LENGTH = 4000;
const MAX_NOTE_LENGTH = 240;

class OnboardingValidationError extends Error {
  constructor(message, code = 'invalid_onboarding_state', status = 400, details = null) {
    super(message);
    this.name = 'OnboardingValidationError';
    this.code = code;
    this.status = status;
    this.details = details || null;
  }
}

function createOnboardingRepository({ engine = 'sqlite', sqliteDb } = {}) {
  const normalizedEngine = normalizeEngine(engine);
  if (normalizedEngine === 'postgres') return createPostgresOnboardingRepository();
  if (!sqliteDb) throw new Error('sqliteDb is required for the SQLite onboarding repository');
  return createSqliteOnboardingRepository(sqliteDb);
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function safeParseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return fallback;
  }
}

function hasText(value) {
  return String(value || '').trim().length > 0;
}

function getConfiguredTimezone(settingsJson, openingHoursJson) {
  const settings = safeParseJson(settingsJson, {});
  const opening = safeParseJson(openingHoursJson, {});
  return String(
    settings.timezone ||
      settings.timeZone ||
      settings.schoolTimezone ||
      settings.school_time_zone ||
      opening.timezone ||
      opening.timeZone ||
      ''
  ).trim();
}

function parseOpeningHoursText(openingHoursJson) {
  const opening = safeParseJson(openingHoursJson, {});
  return String(opening.text || opening.summary || opening.label || '').trim();
}

function normalizeOpeningHoursDays(openingHoursJson) {
  const opening = safeParseJson(openingHoursJson, {});
  const candidates = Array.isArray(opening.days)
    ? opening.days
    : Array.isArray(opening.details)
      ? opening.details
      : Array.isArray(opening.details?.days)
        ? opening.details.days
        : [];
  return candidates
    .map((entry) => ({
      day: String(entry?.day || entry?.key || entry?.label || '').trim(),
      label: String(entry?.label || entry?.day || entry?.key || '').trim(),
      closed: !!entry?.closed,
      open: String(entry?.open || entry?.from || '').trim(),
      close: String(entry?.close || entry?.to || '').trim(),
      text: String(entry?.text || entry?.detail || '').trim()
    }))
    .filter((entry) => entry.day || entry.label || entry.text || entry.open || entry.close);
}

function buildReadinessStatus({ activationReady = false, activationScore = 0, blockers = [] }) {
  if (activationReady) return 'Launch-ready';
  if (Number(activationScore || 0) >= 70) return 'Nearly ready';
  if (Array.isArray(blockers) && blockers.length > 0) return 'Needs setup';
  return 'In progress';
}

function normalizeStatus(value, allowed, fallback) {
  const status = String(value || '').trim().toLowerCase();
  return allowed.has(status) ? status : fallback;
}

function boolInt(value) {
  return value ? 1 : 0;
}

function sanitizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeMeta(meta) {
  if (meta == null) return {};
  if (typeof meta !== 'object' || Array.isArray(meta)) {
    throw new OnboardingValidationError('Onboarding meta must be an object', 'invalid_onboarding_meta');
  }
  const serialized = JSON.stringify(meta);
  if (serialized.length > MAX_META_JSON_LENGTH) {
    throw new OnboardingValidationError('Onboarding meta is too large', 'onboarding_meta_too_large');
  }
  return safeParseJson(serialized, {});
}

function ensureKnownStepId(stepId, fieldName = 'stepId') {
  const normalized = String(stepId || '').trim();
  if (!STEP_IDS.has(normalized)) {
    throw new OnboardingValidationError(`Unknown onboarding step: ${fieldName}`, 'invalid_onboarding_step');
  }
  return normalized;
}

function normalizeCurrentStep(currentStep) {
  if (currentStep == null || currentStep === '') return null;
  return ensureKnownStepId(currentStep, 'currentStep');
}

function compareStepOrder(a, b) {
  return (STEP_INDEX.get(String(a || '').trim()) ?? 999) - (STEP_INDEX.get(String(b || '').trim()) ?? 999);
}

function getNextIncompleteStepId(items = []) {
  return items.find((item) => item.status !== 'completed' && item.status !== 'skipped')?.id || 'launch_checklist';
}

function resolveSummaryCurrentStep(onboarding, items = []) {
  const raw = String(onboarding?.currentStep || onboarding?.current_step || '').trim();
  if (STEP_IDS.has(raw)) return raw;
  return getNextIncompleteStepId(items);
}

function countCoreEvidence(items = []) {
  return CORE_STEP_IDS
    .filter((id) => id !== 'welcome')
    .reduce((count, id) => {
      const item = items.find((entry) => entry.id === id);
      return count + (item?.completed ? 1 : 0);
    }, 0);
}

function buildVisibilityState({ onboarding, items = [], metrics = {} }) {
  const status = normalizeStatus(onboarding?.status, ONBOARDING_STATUSES, 'not_started');
  const welcomeItem = items.find((item) => item.id === 'welcome') || null;
  const welcomeMeta = welcomeItem?.meta || {};
  const coreEvidenceCount = countCoreEvidence(items);
  const hasLegacySetupEvidence =
    coreEvidenceCount >= 2 ||
    Number(metrics.activationScore || 0) >= 30 ||
    !!(metrics.teachersCount && metrics.classesCount) ||
    !!(metrics.studentsCount && metrics.classesCount) ||
    !!(metrics.liveSessionsCount && metrics.classesCount);
  const autoOpenSeenAt = welcomeMeta.autoOpenSeenAt || null;
  const deferredAt = welcomeMeta.deferredAt || null;
  const shouldAutoOpen =
    status !== 'completed' &&
    status !== 'skipped' &&
    !autoOpenSeenAt &&
    !hasLegacySetupEvidence;
  let suppressionReason = 'pending';
  if (status === 'completed') suppressionReason = 'completed';
  else if (status === 'skipped') suppressionReason = 'deferred';
  else if (autoOpenSeenAt) suppressionReason = 'already_seen';
  else if (hasLegacySetupEvidence) suppressionReason = 'legacy_evidence';
  return {
    shouldAutoOpen,
    shouldEnforce: shouldAutoOpen,
    canResume: status !== 'completed',
    isDeferred: status === 'skipped',
    autoOpenSeenAt,
    deferredAt,
    hasLegacySetupEvidence,
    coreEvidenceCount,
    suppressionReason
  };
}

function deriveBillingReadiness({ status = '', billingEmail = '', invoiceContactName = '', readinessAcknowledgedAt = null }) {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  return hasText(billingEmail) && (normalizedStatus === 'active' || !!readinessAcknowledgedAt) && hasText(invoiceContactName);
}

function buildEvidenceSnapshot({
  workspaceId = '',
  schoolCode = '',
  workspaceCreatedAt = null,
  workspaceName = '',
  timezone = '',
  contactEmail = '',
  adminEmail = '',
  teacherCount = 0,
  studentCount = 0,
  demoStudentCount = 0,
  classCount = 0,
  channelCount = 0,
  announcementCount = 0,
  liveSessionCount = 0,
  homeworkCount = 0,
  emailConfigured = false,
  aiEnabled = false,
  aiMonthlyCapEur = null,
  billing = {},
  profile = {},
  admin = {},
  emailSettings = {}
}) {
  const billingContactEmail = String(billing.billingEmail || '').trim();
  const billingInvoiceContactName = String(billing.invoiceContactName || '').trim();
  const billingStatus = String(billing.status || '').trim().toLowerCase();
  const billingAcknowledgedAt = billing.readinessAcknowledgedAt || null;
  const normalizedAdminEmail = String(adminEmail || '').trim();
  const normalizedReplyToEmail = String(emailSettings.replyToEmail || '').trim();
  const normalizedBrandSchoolName = String(emailSettings.brandSchoolName || '').trim();
  const signatureHtml = String(emailSettings.signatureHtml || '').trim();
  const openingHoursText = parseOpeningHoursText(profile.openingHoursJson);
  const openingHoursDays = normalizeOpeningHoursDays(profile.openingHoursJson);
  const schoolEmailConfigured = !!emailConfigured;
  const senderIdentityConfigured =
    hasText(normalizedBrandSchoolName) ||
    hasText(normalizedReplyToEmail) ||
    hasText(signatureHtml);
  const billingReady = deriveBillingReadiness({
    status: billingStatus,
    billingEmail: billingContactEmail,
    invoiceContactName: billingInvoiceContactName,
    readinessAcknowledgedAt: billingAcknowledgedAt
  });
  const profileComplete = hasText(workspaceName) && hasText(timezone) && hasText(contactEmail);
  const effectiveStudentsCount = Math.max(Number(studentCount || 0), Number(demoStudentCount || 0));
  const evidence = {
    school_profile: profileComplete,
    staff_setup: Number(teacherCount || 0) > 0,
    academic_structure: Number(classCount || 0) > 0,
    student_setup: effectiveStudentsCount > 0,
    communication_setup: Number(announcementCount || 0) > 0 || !!emailConfigured,
    live_class_setup: Number(liveSessionCount || 0) > 0,
    homework_setup: Number(homeworkCount || 0) > 0,
    billing_setup: billingReady,
    ai_setup: !!aiEnabled
  };
  const blockers = {
    welcome: [],
    school_profile: [
      ...(!hasText(workspaceName) ? ['Add the school name.'] : []),
      ...(!hasText(timezone) ? ['Set the school timezone.'] : []),
      ...(!hasText(contactEmail) ? ['Add a contact or reply-to email.'] : [])
    ],
    staff_setup: evidence.staff_setup ? [] : ['Create at least one active teacher account.'],
    academic_structure: evidence.academic_structure ? [] : ['Create at least one real class channel beyond the default channels.'],
    student_setup: evidence.student_setup ? [] : ['Add at least one student account.'],
    communication_setup: evidence.communication_setup ? [] : ['Publish an announcement or configure school email settings.'],
    live_class_setup: evidence.live_class_setup ? [] : ['Schedule at least one live class session.'],
    homework_setup: evidence.homework_setup ? [] : ['Create at least one homework item or task.'],
    ai_setup: evidence.ai_setup ? [] : ['Set a monthly AI budget.'],
    billing_setup: [
      ...(!hasText(billingContactEmail) ? ['Add a billing contact email.'] : []),
      ...(!hasText(billingInvoiceContactName) ? ['Add an invoice contact name.'] : []),
      ...(!(billingStatus === 'active' || billingAcknowledgedAt) ? ['Confirm billing readiness for launch.'] : [])
    ],
    launch_checklist: []
  };
  blockers.launch_checklist = ONBOARDING_ITEMS
    .filter((item) => item.required && item.id !== 'launch_checklist')
    .filter((item) => !evidence[item.id])
    .sort((a, b) => compareStepOrder(a.id, b.id))
    .map((item) => `${item.title} is still incomplete.`);

  const metrics = computeActivationScore({
    evidence,
    metrics: {
      teachersCount: Number(teacherCount || 0),
      studentsCount: effectiveStudentsCount,
      classesCount: Number(classCount || 0),
      channelsCount: Number(channelCount || 0),
      liveSessionsCount: Number(liveSessionCount || 0),
      homeworkCount: Number(homeworkCount || 0),
      announcementsCount: Number(announcementCount || 0),
      aiEnabled,
      aiMonthlyCapEur,
      billingReady
    }
  });
  return {
    evidence,
    blockers,
    metrics: {
      ...metrics,
      schoolName: workspaceName || '',
      schoolTimezone: timezone || '',
      contactEmail: contactEmail || '',
      billingContactEmail,
      billingInvoiceContactName,
      billingStatus: billingStatus || 'active',
      billingAcknowledgedAt,
      billingController: 'platform_admin_and_school_admin',
      schoolEmailConfigured,
      senderIdentityConfigured
    },
    summary: {
      admin: {
        role: String(admin.role || 'school_admin').trim() || 'school_admin',
        displayName: String(admin.displayName || '').trim(),
        email: String(admin.email || normalizedAdminEmail || contactEmail || '').trim(),
        joinedAt: admin.joinedAt || null
      },
      workspace: {
        id: String(workspaceId || '').trim(),
        name: workspaceName || '',
        schoolCode: String(schoolCode || '').trim(),
        slug: String(workspaceId || '').trim(),
        adminEmail: normalizedAdminEmail,
        contactEmail: contactEmail || '',
        timezone: timezone || '',
        createdAt: workspaceCreatedAt || null,
        readinessStatus: buildReadinessStatus({
          activationReady: blockers.launch_checklist.length === 0,
          activationScore: metrics.activationScore,
          blockers: blockers.launch_checklist
        })
      },
      profile: {
        street: String(profile.street || '').trim(),
        houseNumber: String(profile.houseNumber || '').trim(),
        postalCode: String(profile.postalCode || '').trim(),
        city: String(profile.city || '').trim(),
        state: String(profile.state || '').trim(),
        country: String(profile.country || '').trim(),
        phone: String(profile.phone || '').trim(),
        website: String(profile.website || '').trim(),
        openingHoursText,
        openingHoursDays,
        registrationDetails: String(profile.registrationDetails || '').trim()
      },
      communication: {
        schoolEmailConfigured,
        senderIdentityConfigured,
        announcementReady: Number(announcementCount || 0) > 0,
        announcementsCount: Number(announcementCount || 0),
        brandSchoolName: normalizedBrandSchoolName,
        replyToEmail: normalizedReplyToEmail,
        signatureConfigured: hasText(signatureHtml),
        subjectPrefix: String(emailSettings.subjectPrefix || '').trim(),
        usesStudiesTalkEmail:
          /@studiestalk\.com$/i.test(normalizedReplyToEmail) || /@worknest\.com$/i.test(normalizedReplyToEmail)
      },
      billing: {
        ready: billingReady,
        status: billingStatus || 'active',
        billingEmail: billingContactEmail,
        invoiceContactName: billingInvoiceContactName,
        acknowledgedAt: billingAcknowledgedAt
      }
    }
  };
}

function assertStepTransition({ item, requestedStatus, storedStatus, evidenceCompleted, blockers }) {
  const normalizedStatus = normalizeStatus(requestedStatus, STEP_STATUSES, 'pending');
  if (normalizedStatus === 'skipped' && item.required) {
    throw new OnboardingValidationError('Required onboarding steps cannot be skipped', 'required_step_cannot_be_skipped');
  }
  if (normalizedStatus === 'completed') {
    const canCompleteManually = item.id === 'welcome';
    if (!canCompleteManually && !evidenceCompleted) {
      throw new OnboardingValidationError(
        blockers?.[0] || 'This step cannot be marked complete until the required setup exists.',
        'onboarding_evidence_required'
      );
    }
  }
  if (storedStatus === 'completed' && normalizedStatus === 'pending' && !evidenceCompleted) {
    throw new OnboardingValidationError('Completed onboarding steps cannot be reset to pending directly', 'invalid_onboarding_transition');
  }
  return normalizedStatus;
}

function buildItemStatus(item, evidence = {}, stepRowsByKey = {}, blockersByKey = {}) {
  const row = stepRowsByKey[item.id] || {};
  const storedStatus = normalizeStatus(row.status, STEP_STATUSES, 'pending');
  const completedByEvidence = !!evidence[item.id];
  const allowManualCompletion = item.id === 'welcome';
  const status = completedByEvidence || (allowManualCompletion && storedStatus === 'completed')
    ? 'completed'
    : storedStatus === 'skipped'
      ? 'skipped'
      : storedStatus === 'in_progress'
        ? 'in_progress'
        : 'pending';
  const meta = safeParseJson(row.metaJson || row.meta_json, {});
  return {
    ...item,
    status,
    completed: status === 'completed',
    evidence: completedByEvidence,
    blockers: Array.isArray(blockersByKey[item.id]) ? blockersByKey[item.id] : [],
    completedAt: row.completedAt || row.completed_at || null,
    completedByUserId: row.completedByUserId || row.completed_by_user_id || null,
    updatedAt: row.updatedAt || row.updated_at || null,
    meta
  };
}

function buildSummary({ onboarding, stepRows, evidence, blockers = {}, metrics, summary = {} }) {
  const stepRowsByKey = Object.fromEntries((stepRows || []).map((row) => [String(row.stepKey || row.step_key), row]));
  const derivedEvidence = { ...evidence };
  const coreItems = ONBOARDING_ITEMS
    .filter((item) => CORE_STEP_IDS.includes(item.id))
    .map((item) => buildItemStatus(item, derivedEvidence, stepRowsByKey, blockers));
  derivedEvidence.launch_checklist = coreItems.every((item) => item.completed);

  const items = ONBOARDING_ITEMS.map((item) => buildItemStatus(item, derivedEvidence, stepRowsByKey, blockers));
  const required = items.filter((item) => item.required);
  const completedRequired = required.filter((item) => item.completed);
  const activationReady = required.length > 0 && completedRequired.length === required.length;
  const storedStatus = normalizeStatus(onboarding?.status, ONBOARDING_STATUSES, 'not_started');
  const currentStep = resolveSummaryCurrentStep(onboarding, items);

  return {
    id: onboarding?.id || null,
    workspaceId: onboarding?.workspaceId || onboarding?.workspace_id || '',
    status: storedStatus,
    currentStep,
    activationReady,
    progress: {
      completed: items.filter((item) => item.completed).length,
      total: items.length,
      requiredCompleted: completedRequired.length,
      requiredTotal: required.length
    },
    items,
    metrics,
    summary,
    blockingReasons: (items.find((item) => item.id === currentStep)?.blockers || []).slice(0, 6),
    activationBlockedBy: required.filter((item) => !item.completed).map((item) => item.title),
    visibility: buildVisibilityState({ onboarding, items, metrics }),
    startedAt: onboarding?.startedAt || onboarding?.started_at || null,
    completedAt: onboarding?.completedAt || onboarding?.completed_at || null,
    startedByUserId: onboarding?.startedByUserId || onboarding?.started_by_user_id || null,
    completedByUserId: onboarding?.completedByUserId || onboarding?.completed_by_user_id || null,
    createdAt: onboarding?.createdAt || onboarding?.created_at || null,
    updatedAt: onboarding?.updatedAt || onboarding?.updated_at || null
  };
}

function computeActivationScore({ evidence, metrics }) {
  const score =
    (evidence.school_profile ? 10 : 0) +
    (evidence.staff_setup ? 10 : 0) +
    (evidence.academic_structure ? 15 : 0) +
    (evidence.student_setup ? 15 : 0) +
    (evidence.live_class_setup ? 15 : 0) +
    (evidence.homework_setup ? 10 : 0) +
    (metrics.announcementsCount > 0 ? 10 : 0) +
    (metrics.billingReady ? 10 : 0) +
    (metrics.aiEnabled ? 5 : 0);
  return {
    ...metrics,
    aiEnabled: boolInt(metrics.aiEnabled),
    billingReady: boolInt(metrics.billingReady),
    activationScore: Math.max(0, Math.min(100, score))
  };
}

function normalizeMetricsRow(row = {}) {
  return {
    teachersCount: Number(row.teachersCount ?? row.teachers_count ?? 0),
    studentsCount: Number(row.studentsCount ?? row.students_count ?? 0),
    classesCount: Number(row.classesCount ?? row.classes_count ?? 0),
    channelsCount: Number(row.channelsCount ?? row.channels_count ?? 0),
    liveSessionsCount: Number(row.liveSessionsCount ?? row.live_sessions_count ?? 0),
    homeworkCount: Number(row.homeworkCount ?? row.homework_count ?? 0),
    announcementsCount: Number(row.announcementsCount ?? row.announcements_count ?? 0),
    aiEnabled: Number(row.aiEnabled ?? row.ai_enabled ?? 0) === 1,
    aiMonthlyCapEur: row.aiMonthlyCapEur ?? row.ai_monthly_cap_eur ?? null,
    billingReady: Number(row.billingReady ?? row.billing_ready ?? 0) === 1,
    schoolName: row.schoolName ?? row.school_name ?? '',
    schoolTimezone: row.schoolTimezone ?? row.school_time_zone ?? '',
    contactEmail: row.contactEmail ?? row.contact_email ?? '',
    billingContactEmail: row.billingContactEmail ?? row.billing_contact_email ?? null,
    billingInvoiceContactName: row.billingInvoiceContactName ?? row.billing_invoice_contact_name ?? null,
    billingStatus: row.billingStatus ?? row.billing_status ?? 'active',
    billingAcknowledgedAt: row.billingAcknowledgedAt ?? row.billing_acknowledged_at ?? null,
    billingController: row.billingController ?? row.billing_controller ?? 'platform_admin_and_school_admin',
    activationScore: Number(row.activationScore ?? row.activation_score ?? 0),
    updatedAt: row.updatedAt || row.updated_at || null
  };
}

function normalizeEnsureArgs(input, userId = null) {
  if (typeof input === 'string') {
    return { workspaceId: input, createdBy: userId || null };
  }
  return input || {};
}

function normalizeStepRow(row = {}) {
  return {
    id: row.id || null,
    workspaceId: row.workspaceId || row.workspace_id || '',
    stepKey: row.stepKey || row.step_key || '',
    status: row.status || 'pending',
    completedAt: row.completedAt || row.completed_at || null,
    completedByUserId: row.completedByUserId || row.completed_by_user_id || null,
    meta: safeParseJson(row.metaJson || row.meta_json, {}),
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null
  };
}

function createSqliteOnboardingRepository(sqliteDb) {
  function getEvidenceAndMetrics(workspaceId) {
    const profile = sqliteDb.prepare(`
      SELECT street, house_number, postal_code, city, state, country, phone, website, opening_hours_json, registration_details
      FROM workspace_profile
      WHERE workspace_id = ?
    `).get(workspaceId) || {};
    const workspace = sqliteDb.prepare(`
      SELECT id, name, school_code AS schoolCode, admin_email AS adminEmail, created_at AS createdAt
      FROM workspaces
      WHERE id = ?
    `).get(workspaceId) || {};
    const workspaceSettings = sqliteDb.prepare(`
      SELECT settings_json AS settingsJson
      FROM workspace_settings_admin
      WHERE workspace_id = ?
    `).get(workspaceId) || {};
    const teacherCount = sqliteDb.prepare(`
      SELECT COUNT(*) AS c FROM users
      WHERE workspace_id = ? AND lower(role) = 'teacher' AND COALESCE(status, 'active') = 'active'
    `).get(workspaceId).c || 0;
    const studentCount = sqliteDb.prepare(`
      SELECT COUNT(*) AS c FROM users
      WHERE workspace_id = ? AND lower(role) = 'student' AND COALESCE(status, 'active') = 'active'
    `).get(workspaceId).c || 0;
    const demoStudentCount = sqliteDb.prepare(`
      SELECT COUNT(*) AS c FROM users
      WHERE workspace_id = ?
        AND lower(role) = 'student'
        AND (
          lower(COALESCE(name, '')) LIKE '%demo%'
          OR lower(COALESCE(name, '')) LIKE '%test%'
          OR lower(COALESCE(username, '')) LIKE '%demo%'
          OR lower(COALESCE(username, '')) LIKE '%test%'
          OR lower(COALESCE(email, '')) LIKE '%demo%'
          OR lower(COALESCE(email, '')) LIKE '%test%'
        )
    `).get(workspaceId).c || 0;
    const classCount = sqliteDb.prepare(`
      SELECT COUNT(*) AS c FROM channels
      WHERE workspace_id = ?
        AND lower(COALESCE(category, 'classes')) = 'classes'
        AND lower(name) NOT IN ('general', 'announcements')
    `).get(workspaceId).c || 0;
    const channelCount = sqliteDb.prepare('SELECT COUNT(*) AS c FROM channels WHERE workspace_id = ?').get(workspaceId).c || 0;
    const announcementCount = sqliteDb.prepare(`
      SELECT COUNT(*) AS c FROM announcements a
      JOIN channels c ON c.id = a.channel_id
      WHERE c.workspace_id = ?
    `).get(workspaceId).c || 0;
    const liveSessionCount = sqliteDb.prepare('SELECT COUNT(*) AS c FROM live_sessions WHERE workspace_id = ?').get(workspaceId).c || 0;
    const homeworkItemCount = sqliteDb.prepare('SELECT COUNT(*) AS c FROM homework_items WHERE workspace_id = ?').get(workspaceId).c || 0;
    const taskCount = sqliteDb.prepare('SELECT COUNT(*) AS c FROM tasks WHERE workspace_id = ?').get(workspaceId).c || 0;
    const billing = sqliteDb.prepare(`
      SELECT
        status,
        billing_email AS billingEmail,
        invoice_contact_name AS invoiceContactName,
        readiness_acknowledged_at AS readinessAcknowledgedAt,
        readiness_acknowledged_by_user_id AS readinessAcknowledgedByUserId
      FROM workspace_billing
      WHERE workspace_id = ?
    `).get(workspaceId);
    const aiBudget = sqliteDb.prepare(`
      SELECT monthly_limit_eur AS monthly_cap_eur
      FROM ai_budget_settings
      WHERE workspace_id = ? OR workspace_id IS NULL
      ORDER BY CASE WHEN workspace_id = ? THEN 0 ELSE 1 END, datetime(COALESCE(updated_at, created_at)) DESC
      LIMIT 1
    `).get(workspaceId, workspaceId);
    const emailSettings = sqliteDb.prepare(`
      SELECT enabled, brand_school_name, reply_to_email, signature_html, subject_prefix
      FROM workspace_email_settings WHERE workspace_id = ?
    `).get(workspaceId);
    const admin = sqliteDb.prepare(`
      SELECT
        name,
        username,
        email,
        role,
        created_at AS createdAt
      FROM users
      WHERE workspace_id = ? AND lower(role) = 'school_admin'
      ORDER BY datetime(COALESCE(created_at, '1970-01-01T00:00:00Z')) ASC, id ASC
      LIMIT 1
    `).get(workspaceId) || {};

    const contactEmail = String(emailSettings?.reply_to_email || workspace.adminEmail || '').trim();
    const timezone = getConfiguredTimezone(workspaceSettings.settingsJson, profile.opening_hours_json);
    const emailConfigured = !!emailSettings && (
      Number(emailSettings.enabled || 0) === 1 ||
      hasText(emailSettings.reply_to_email) ||
      hasText(emailSettings.brand_school_name) ||
      hasText(emailSettings.signature_html) ||
      hasText(emailSettings.subject_prefix)
    );
    const aiEnabled = !!aiBudget && Number.isFinite(Number(aiBudget.monthly_cap_eur));
    const homeworkCount = Number(homeworkItemCount || 0) + Number(taskCount || 0);
    return buildEvidenceSnapshot({
      workspaceId,
      schoolCode: workspace.schoolCode || '',
      workspaceCreatedAt: workspace.createdAt || null,
      workspaceName: workspace.name || '',
      timezone,
      contactEmail,
      adminEmail: workspace.adminEmail || '',
      teacherCount,
      studentCount,
      demoStudentCount,
      classCount,
      channelCount,
      announcementCount,
      liveSessionCount,
      homeworkCount,
      emailConfigured,
      aiEnabled,
      aiMonthlyCapEur: aiBudget?.monthly_cap_eur ?? null,
      profile: {
        street: profile.street || '',
        houseNumber: profile.house_number || '',
        postalCode: profile.postal_code || '',
        city: profile.city || '',
        state: profile.state || '',
        country: profile.country || '',
        phone: profile.phone || '',
        website: profile.website || '',
        openingHoursJson: profile.opening_hours_json || '',
        registrationDetails: profile.registration_details || ''
      },
      admin: {
        displayName: admin.name || admin.username || admin.email || '',
        email: admin.email || workspace.adminEmail || '',
        role: admin.role || 'school_admin',
        joinedAt: admin.createdAt || null
      },
      emailSettings: {
        enabled: Number(emailSettings?.enabled || 0) === 1,
        brandSchoolName: emailSettings?.brand_school_name || '',
        replyToEmail: emailSettings?.reply_to_email || '',
        signatureHtml: emailSettings?.signature_html || '',
        subjectPrefix: emailSettings?.subject_prefix || ''
      },
      billing: {
        status: billing?.status || '',
        billingEmail: billing?.billingEmail || '',
        invoiceContactName: billing?.invoiceContactName || '',
        readinessAcknowledgedAt: billing?.readinessAcknowledgedAt || null,
        readinessAcknowledgedByUserId: billing?.readinessAcknowledgedByUserId || null
      }
    });
  }

  function logEvent({ workspaceId, userId = null, eventType, stepKey = null, payload = {}, createdAt = new Date().toISOString() }) {
    sqliteDb.prepare(`
      INSERT INTO workspace_onboarding_events (id, workspace_id, user_id, event_type, step_key, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id('obe'), workspaceId, userId || null, eventType, stepKey || null, JSON.stringify(payload || {}), createdAt);
  }

  function upsertMetrics(workspaceId, metrics, updatedAt = new Date().toISOString()) {
    sqliteDb.prepare(`
      INSERT INTO workspace_activation_metrics (
        workspace_id, teachers_count, students_count, classes_count, channels_count,
        live_sessions_count, homework_count, announcements_count, ai_enabled,
        billing_ready, activation_score, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        teachers_count = excluded.teachers_count,
        students_count = excluded.students_count,
        classes_count = excluded.classes_count,
        channels_count = excluded.channels_count,
        live_sessions_count = excluded.live_sessions_count,
        homework_count = excluded.homework_count,
        announcements_count = excluded.announcements_count,
        ai_enabled = excluded.ai_enabled,
        billing_ready = excluded.billing_ready,
        activation_score = excluded.activation_score,
        updated_at = excluded.updated_at
    `).run(
      workspaceId,
      metrics.teachersCount,
      metrics.studentsCount,
      metrics.classesCount,
      metrics.channelsCount,
      metrics.liveSessionsCount,
      metrics.homeworkCount,
      metrics.announcementsCount,
      boolInt(metrics.aiEnabled),
      boolInt(metrics.billingReady),
      metrics.activationScore,
      updatedAt
    );
  }

  return {
    engine: 'sqlite',

    ensureWorkspaceOnboarding(input, userId = null) {
      const { workspaceId, createdBy = userId || null, requestId = null, now = new Date().toISOString() } = normalizeEnsureArgs(input, userId);
      const tx = sqliteDb.transaction(() => {
        const result = sqliteDb.prepare(`
          INSERT INTO workspace_onboarding (
            id, workspace_id, status, current_step, started_at, completed_at,
            created_at, updated_at, started_by_user_id, completed_by_user_id
          )
          VALUES (?, ?, 'not_started', 'welcome', NULL, NULL, ?, ?, NULL, NULL)
          ON CONFLICT(workspace_id) DO NOTHING
        `).run(id('ob'), workspaceId, now, now);
        for (const item of ONBOARDING_ITEMS) {
          sqliteDb.prepare(`
            INSERT INTO workspace_onboarding_steps (
              id, workspace_id, step_key, status, completed_at, completed_by_user_id,
              meta_json, created_at, updated_at
            )
            VALUES (?, ?, ?, 'pending', NULL, NULL, '{}', ?, ?)
            ON CONFLICT(workspace_id, step_key) DO NOTHING
          `).run(id('obs'), workspaceId, item.id, now, now);
        }
        if (result.changes > 0) {
          logEvent({
            workspaceId,
            userId: createdBy,
            eventType: 'onboarding_created',
            payload: { requestId },
            createdAt: now
          });
        }
      });
      tx();
      const { metrics } = getEvidenceAndMetrics(workspaceId);
      upsertMetrics(workspaceId, metrics, now);
      return { workspaceId };
    },

    listWorkspaceOnboardingSteps(workspaceId) {
      this.ensureWorkspaceOnboarding(workspaceId);
      const rows = sqliteDb.prepare(`
        SELECT id, workspace_id AS workspaceId, step_key AS stepKey, status,
               completed_at AS completedAt, completed_by_user_id AS completedByUserId,
               meta_json AS metaJson, created_at AS createdAt, updated_at AS updatedAt
        FROM workspace_onboarding_steps
        WHERE workspace_id = ?
      `).all(workspaceId).map(normalizeStepRow);
      const byKey = new Map(rows.map((row) => [String(row.stepKey), row]));
      const ordered = ONBOARDING_ITEMS.map((item) => byKey.get(item.id)).filter(Boolean);
      return ordered.concat(rows.filter((row) => !ONBOARDING_ITEMS.some((item) => item.id === row.stepKey)));
    },

    getWorkspaceOnboarding(workspaceId) {
      this.ensureWorkspaceOnboarding(workspaceId);
      const onboarding = sqliteDb.prepare(`
        SELECT id, workspace_id AS workspaceId, status, current_step AS currentStep,
               started_at AS startedAt, completed_at AS completedAt,
               created_at AS createdAt, updated_at AS updatedAt,
               started_by_user_id AS startedByUserId, completed_by_user_id AS completedByUserId
        FROM workspace_onboarding
        WHERE workspace_id = ?
      `).get(workspaceId);
      const steps = sqliteDb.prepare(`
        SELECT id, workspace_id AS workspaceId, step_key AS stepKey, status,
               completed_at AS completedAt, completed_by_user_id AS completedByUserId,
               meta_json AS metaJson, created_at AS createdAt, updated_at AS updatedAt
        FROM workspace_onboarding_steps
        WHERE workspace_id = ?
      `).all(workspaceId);
      const { evidence, blockers, metrics, summary } = getEvidenceAndMetrics(workspaceId);
      upsertMetrics(workspaceId, metrics);
      return buildSummary({ onboarding, stepRows: steps, evidence, blockers, metrics: normalizeMetricsRow(metrics), summary });
    },

    startWorkspaceOnboarding(workspaceId, userId = null) {
      const now = new Date().toISOString();
      this.ensureWorkspaceOnboarding(workspaceId, userId);
      const existing = sqliteDb.prepare(`
        SELECT status, current_step AS currentStep
        FROM workspace_onboarding
        WHERE workspace_id = ?
      `).get(workspaceId) || {};
      const existingStep = String(existing.currentStep || '').trim();
      const nextStep = existingStep === 'welcome' ? 'school_profile' : (STEP_IDS.has(existingStep) ? existingStep : 'school_profile');
      const tx = sqliteDb.transaction(() => {
        sqliteDb.prepare(`
          UPDATE workspace_onboarding
          SET status = 'in_progress',
              current_step = ?,
              started_at = COALESCE(started_at, ?),
              started_by_user_id = COALESCE(started_by_user_id, ?),
              updated_at = ?
          WHERE workspace_id = ?
        `).run(nextStep, now, userId || null, now, workspaceId);
        sqliteDb.prepare(`
          UPDATE workspace_onboarding_steps
          SET status = 'completed', completed_at = COALESCE(completed_at, ?),
              completed_by_user_id = COALESCE(completed_by_user_id, ?), updated_at = ?
          WHERE workspace_id = ? AND step_key = 'welcome'
        `).run(now, userId || null, now, workspaceId);
        if (existing.status === 'not_started') {
          logEvent({ workspaceId, userId, eventType: 'onboarding_started', payload: {}, createdAt: now });
        }
        if (existing.currentStep !== nextStep) {
          logEvent({ workspaceId, userId, eventType: 'onboarding_step_entered', stepKey: nextStep, payload: { source: 'start' }, createdAt: now });
        }
      });
      tx();
      return this.getWorkspaceOnboarding(workspaceId);
    },

    acknowledgeAutoOpenSeen(workspaceId, userId = null, meta = {}) {
      const now = new Date().toISOString();
      this.ensureWorkspaceOnboarding(workspaceId, userId);
      const current = this.getWorkspaceOnboarding(workspaceId);
      const welcomeItem = current.items.find((item) => item.id === 'welcome') || { meta: {} };
      if (welcomeItem.meta?.autoOpenSeenAt) return current;
      const nextMeta = {
        ...(welcomeItem.meta || {}),
        ...normalizeMeta(meta),
        autoOpenSeenAt: now
      };
      const tx = sqliteDb.transaction(() => {
        sqliteDb.prepare(`
          UPDATE workspace_onboarding_steps
          SET meta_json = ?, updated_at = ?
          WHERE workspace_id = ? AND step_key = 'welcome'
        `).run(JSON.stringify(nextMeta), now, workspaceId);
        sqliteDb.prepare(`
          UPDATE workspace_onboarding
          SET updated_at = ?
          WHERE workspace_id = ?
        `).run(now, workspaceId);
        logEvent({
          workspaceId,
          userId,
          eventType: 'onboarding_auto_open_seen',
          stepKey: 'welcome',
          payload: nextMeta,
          createdAt: now
        });
      });
      tx();
      return this.getWorkspaceOnboarding(workspaceId);
    },

    deferWorkspaceOnboarding(workspaceId, userId = null, meta = {}) {
      const now = new Date().toISOString();
      this.ensureWorkspaceOnboarding(workspaceId, userId);
      const current = this.getWorkspaceOnboarding(workspaceId);
      if (current.status === 'completed') return current;
      const welcomeItem = current.items.find((item) => item.id === 'welcome') || { meta: {} };
      const nextMeta = {
        ...(welcomeItem.meta || {}),
        ...normalizeMeta(meta),
        deferredAt: now,
        autoOpenSeenAt: welcomeItem.meta?.autoOpenSeenAt || now
      };
      const tx = sqliteDb.transaction(() => {
        sqliteDb.prepare(`
          UPDATE workspace_onboarding_steps
          SET meta_json = ?, updated_at = ?
          WHERE workspace_id = ? AND step_key = 'welcome'
        `).run(JSON.stringify(nextMeta), now, workspaceId);
        sqliteDb.prepare(`
          UPDATE workspace_onboarding
          SET status = 'skipped',
              started_at = COALESCE(started_at, ?),
              started_by_user_id = COALESCE(started_by_user_id, ?),
              current_step = ?,
              updated_at = ?
          WHERE workspace_id = ?
        `).run(now, userId || null, current.currentStep || 'welcome', now, workspaceId);
        logEvent({
          workspaceId,
          userId,
          eventType: 'onboarding_deferred',
          stepKey: current.currentStep || 'welcome',
          payload: nextMeta,
          createdAt: now
        });
      });
      tx();
      return this.getWorkspaceOnboarding(workspaceId);
    },

    resumeWorkspaceOnboarding(workspaceId, userId = null, meta = {}) {
      const now = new Date().toISOString();
      this.ensureWorkspaceOnboarding(workspaceId, userId);
      const current = this.getWorkspaceOnboarding(workspaceId);
      if (current.status === 'completed') return current;
      const welcomeItem = current.items.find((item) => item.id === 'welcome') || { meta: {} };
      const nextMeta = {
        ...(welcomeItem.meta || {}),
        ...normalizeMeta(meta),
        resumedAt: now,
        autoOpenSeenAt: welcomeItem.meta?.autoOpenSeenAt || now
      };
      const nextCurrentStep = current.currentStep || getNextIncompleteStepId(current.items);
      const tx = sqliteDb.transaction(() => {
        sqliteDb.prepare(`
          UPDATE workspace_onboarding_steps
          SET meta_json = ?, updated_at = ?
          WHERE workspace_id = ? AND step_key = 'welcome'
        `).run(JSON.stringify(nextMeta), now, workspaceId);
        sqliteDb.prepare(`
          UPDATE workspace_onboarding
          SET status = 'in_progress',
              started_at = COALESCE(started_at, ?),
              started_by_user_id = COALESCE(started_by_user_id, ?),
              current_step = ?,
              updated_at = ?
          WHERE workspace_id = ?
        `).run(now, userId || null, nextCurrentStep || 'welcome', now, workspaceId);
        logEvent({
          workspaceId,
          userId,
          eventType: 'onboarding_resumed',
          stepKey: nextCurrentStep || 'welcome',
          payload: nextMeta,
          createdAt: now
        });
      });
      tx();
      return this.getWorkspaceOnboarding(workspaceId);
    },

    saveOnboardingStep(workspaceId, stepKey, payload = {}, userId = null) {
      const status = payload?.status || 'in_progress';
      const meta = payload?.meta !== undefined ? payload.meta : payload;
      return this.updateStep({
        workspaceId,
        stepId: stepKey,
        status,
        note: payload?.note || '',
        currentStep: payload?.currentStep || stepKey,
        userId,
        meta,
        eventType: 'onboarding_step_updated'
      });
    },

    completeOnboardingStep(workspaceId, stepKey, userId = null, meta = {}) {
      return this.updateStep({
        workspaceId,
        stepId: stepKey,
        status: 'completed',
        currentStep: stepKey,
        userId,
        meta,
        eventType: 'onboarding_step_completed'
      });
    },

    skipOnboardingStep(workspaceId, stepKey, userId = null, meta = {}) {
      return this.updateStep({
        workspaceId,
        stepId: stepKey,
        status: 'skipped',
        currentStep: stepKey,
        userId,
        meta,
        eventType: 'onboarding_step_skipped'
      });
    },

    setCurrentOnboardingStep(workspaceId, stepKey, userId = null, payload = {}) {
      const now = new Date().toISOString();
      this.ensureWorkspaceOnboarding(workspaceId);
      const normalizedStep = normalizeCurrentStep(stepKey);
      const existing = sqliteDb.prepare('SELECT current_step AS currentStep FROM workspace_onboarding WHERE workspace_id = ?').get(workspaceId) || {};
      if (existing.currentStep === normalizedStep) {
        return this.getWorkspaceOnboarding(workspaceId);
      }
      sqliteDb.prepare(`
        UPDATE workspace_onboarding
        SET current_step = ?, updated_at = ?
        WHERE workspace_id = ?
      `).run(normalizedStep, now, workspaceId);
      logEvent({ workspaceId, userId, eventType: 'onboarding_step_entered', stepKey: normalizedStep, payload: normalizeMeta(payload), createdAt: now });
      return this.getWorkspaceOnboarding(workspaceId);
    },

    updateStep({ workspaceId, stepId, status, note = '', currentStep = null, userId = null, updatedAt = new Date().toISOString(), meta = null, eventType = 'step_status_changed' }) {
      const normalizedStepId = ensureKnownStepId(stepId);
      const normalizedCurrentStep = normalizeCurrentStep(currentStep);
      if (!status) {
        if (!normalizedCurrentStep) {
          throw new OnboardingValidationError('Either status or currentStep is required', 'invalid_onboarding_update');
        }
        return this.setCurrentOnboardingStep(workspaceId, normalizedCurrentStep, userId, meta || {});
      }
      this.ensureWorkspaceOnboarding({ workspaceId, now: updatedAt });
      const currentSummary = this.getWorkspaceOnboarding(workspaceId);
      const currentItem = currentSummary.items.find((item) => item.id === normalizedStepId);
      if (!currentItem) {
        throw new OnboardingValidationError('Unknown onboarding step', 'invalid_onboarding_step');
      }
      const normalizedStatus = assertStepTransition({
        item: currentItem,
        requestedStatus: status,
        storedStatus: currentItem.status,
        evidenceCompleted: !!currentItem.evidence,
        blockers: currentItem.blockers || []
      });
      const completedAt = normalizedStatus === 'completed' ? updatedAt : null;
      const completedBy = normalizedStatus === 'completed' ? userId || null : null;
      const metaPayload = normalizeMeta(meta);
      const safeNote = sanitizeText(note, MAX_NOTE_LENGTH);
      if (safeNote) metaPayload.note = safeNote;
      const nextCurrentStep = normalizedCurrentStep || currentSummary.currentStep;
      const nextEventType = String(eventType || 'onboarding_step_updated').trim() || 'onboarding_step_updated';
      const isNoOp =
        currentItem.status === normalizedStatus &&
        JSON.stringify(currentItem.meta || {}) === JSON.stringify(metaPayload) &&
        String(currentSummary.currentStep || '') === String(nextCurrentStep || '');
      if (isNoOp) return currentSummary;
      const tx = sqliteDb.transaction(() => {
        sqliteDb.prepare(`
          UPDATE workspace_onboarding_steps
          SET status = ?, completed_at = ?, completed_by_user_id = ?, meta_json = ?, updated_at = ?
          WHERE workspace_id = ? AND step_key = ?
        `).run(normalizedStatus, completedAt, completedBy, JSON.stringify(metaPayload), updatedAt, workspaceId, normalizedStepId);
        sqliteDb.prepare(`
          UPDATE workspace_onboarding
          SET status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END,
              started_at = COALESCE(started_at, ?),
              started_by_user_id = COALESCE(started_by_user_id, ?),
              current_step = COALESCE(?, current_step),
              updated_at = ?
          WHERE workspace_id = ?
        `).run(updatedAt, userId || null, nextCurrentStep, updatedAt, workspaceId);
        logEvent({
          workspaceId,
          userId,
          eventType: nextEventType,
          stepKey: normalizedStepId,
          payload: { status: normalizedStatus, note: safeNote, meta: metaPayload },
          createdAt: updatedAt
        });
        if (String(currentSummary.currentStep || '') !== String(nextCurrentStep || '')) {
          logEvent({
            workspaceId,
            userId,
            eventType: 'onboarding_step_entered',
            stepKey: nextCurrentStep,
            payload: { source: 'update_step' },
            createdAt: updatedAt
          });
        }
      });
      tx();
      return this.getWorkspaceOnboarding(workspaceId);
    },

    appendOnboardingEvent(workspaceId, eventType, stepKey = null, userId = null, payload = {}) {
      const createdAt = new Date().toISOString();
      logEvent({
        workspaceId,
        userId,
        eventType: String(eventType || '').trim(),
        stepKey: stepKey ? ensureKnownStepId(stepKey, 'stepKey') : null,
        payload: normalizeMeta(payload),
        createdAt
      });
      return { ok: true, workspaceId, eventType, stepKey, createdAt };
    },

    computeActivationMetrics(workspaceId) {
      const { metrics } = getEvidenceAndMetrics(workspaceId);
      return normalizeMetricsRow(metrics);
    },

    getActivationMetrics(workspaceId) {
      const row = sqliteDb.prepare(`
        SELECT workspace_id AS workspaceId, teachers_count AS teachersCount, students_count AS studentsCount,
               classes_count AS classesCount, channels_count AS channelsCount,
               live_sessions_count AS liveSessionsCount, homework_count AS homeworkCount,
               announcements_count AS announcementsCount, ai_enabled AS aiEnabled,
               billing_ready AS billingReady, activation_score AS activationScore, updated_at AS updatedAt
        FROM workspace_activation_metrics
        WHERE workspace_id = ?
      `).get(workspaceId);
      return row ? normalizeMetricsRow(row) : this.refreshActivationMetrics(workspaceId);
    },

    refreshActivationMetrics(workspaceId) {
      const { metrics } = getEvidenceAndMetrics(workspaceId);
      upsertMetrics(workspaceId, metrics);
      return normalizeMetricsRow(metrics);
    },

    completeWorkspaceOnboarding(workspaceId, userId = null) {
      return this.activateWorkspace({ workspaceId, userId, completedAt: new Date().toISOString() });
    },

    activateWorkspace({ workspaceId, completedAt = null, activatedAt = null, userId = null }) {
      const at = completedAt || activatedAt || new Date().toISOString();
      const current = this.getWorkspaceOnboarding(workspaceId);
      if (!current.activationReady) {
        throw new OnboardingValidationError('Workspace is not activation-ready', 'onboarding_activation_not_ready');
      }
      const tx = sqliteDb.transaction(() => {
        sqliteDb.prepare(`
          UPDATE workspace_onboarding
          SET status = 'completed', current_step = 'launch_checklist', completed_at = ?, completed_by_user_id = ?, updated_at = ?
          WHERE workspace_id = ?
        `).run(at, userId || null, at, workspaceId);
        logEvent({ workspaceId, userId, eventType: 'onboarding_completed', payload: {}, createdAt: at });
      });
      tx();
      return this.getWorkspaceOnboarding(workspaceId);
    }
  };
}

function createPostgresOnboardingRepository() {
  const postgres = require('../../db/postgres');

  async function getEvidenceAndMetrics(workspaceId) {
    const [profile, workspace, workspaceSettings, teacherRow, studentRow, demoStudentRow, classRow, channelRow, announcementRow, liveRow, homeworkRow, taskRow, billing, aiBudget, emailSettings, admin] = await Promise.all([
      postgres.one('SELECT street, house_number, postal_code, city, state, country, phone, website, opening_hours_json, registration_details FROM workspace_profile WHERE workspace_id = ?', [workspaceId]),
      postgres.one('SELECT id, name, school_code AS "schoolCode", admin_email AS "adminEmail", created_at AS "createdAt" FROM workspaces WHERE id = ?', [workspaceId]),
      postgres.one('SELECT settings_json AS "settingsJson" FROM workspace_settings_admin WHERE workspace_id = ?', [workspaceId]),
      postgres.one("SELECT COUNT(*)::int AS c FROM users WHERE workspace_id = ? AND lower(role) = 'teacher' AND COALESCE(status, 'active') = 'active'", [workspaceId]),
      postgres.one("SELECT COUNT(*)::int AS c FROM users WHERE workspace_id = ? AND lower(role) = 'student' AND COALESCE(status, 'active') = 'active'", [workspaceId]),
      postgres.one(`
        SELECT COUNT(*)::int AS c FROM users
        WHERE workspace_id = ?
          AND lower(role) = 'student'
          AND (
            lower(COALESCE(name, '')) LIKE '%demo%'
            OR lower(COALESCE(name, '')) LIKE '%test%'
            OR lower(COALESCE(username, '')) LIKE '%demo%'
            OR lower(COALESCE(username, '')) LIKE '%test%'
            OR lower(COALESCE(email::text, '')) LIKE '%demo%'
            OR lower(COALESCE(email::text, '')) LIKE '%test%'
          )
      `, [workspaceId]),
      postgres.one("SELECT COUNT(*)::int AS c FROM channels WHERE workspace_id = ? AND lower(COALESCE(category, 'classes')) = 'classes' AND lower(name) NOT IN ('general', 'announcements')", [workspaceId]),
      postgres.one('SELECT COUNT(*)::int AS c FROM channels WHERE workspace_id = ?', [workspaceId]),
      postgres.one('SELECT COUNT(*)::int AS c FROM announcements a JOIN channels c ON c.id = a.channel_id WHERE c.workspace_id = ?', [workspaceId]),
      postgres.one('SELECT COUNT(*)::int AS c FROM live_sessions WHERE workspace_id = ?', [workspaceId]),
      postgres.one('SELECT COUNT(*)::int AS c FROM homework_items WHERE workspace_id = ?', [workspaceId]),
      postgres.one('SELECT COUNT(*)::int AS c FROM tasks WHERE workspace_id = ?', [workspaceId]),
      postgres.one(`
        SELECT
          status,
          billing_email AS "billingEmail",
          invoice_contact_name AS "invoiceContactName",
          readiness_acknowledged_at AS "readinessAcknowledgedAt",
          readiness_acknowledged_by_user_id AS "readinessAcknowledgedByUserId"
        FROM workspace_billing
        WHERE workspace_id = ?
      `, [workspaceId]),
      postgres.one(`
        SELECT monthly_limit_eur AS monthly_cap_eur
        FROM ai_budget_settings
        WHERE workspace_id = ? OR workspace_id IS NULL
        ORDER BY CASE WHEN workspace_id = ? THEN 0 ELSE 1 END, COALESCE(updated_at, created_at) DESC
        LIMIT 1
      `, [workspaceId, workspaceId]),
      postgres.one('SELECT enabled, brand_school_name, reply_to_email, signature_html, subject_prefix FROM workspace_email_settings WHERE workspace_id = ?', [workspaceId]),
      postgres.one(`
        SELECT
          name,
          username,
          email,
          role,
          created_at AS "createdAt"
        FROM users
        WHERE workspace_id = ? AND lower(role) = 'school_admin'
        ORDER BY COALESCE(created_at, '1970-01-01T00:00:00Z') ASC, id ASC
        LIMIT 1
      `, [workspaceId])
    ]);
    const contactEmail = String(emailSettings?.reply_to_email || workspace?.adminEmail || '').trim();
    const timezone = getConfiguredTimezone(workspaceSettings?.settingsJson, profile?.opening_hours_json);
    const emailConfigured = !!emailSettings && (
      Number(emailSettings.enabled || 0) === 1 ||
      hasText(emailSettings.reply_to_email) ||
      hasText(emailSettings.brand_school_name) ||
      hasText(emailSettings.signature_html) ||
      hasText(emailSettings.subject_prefix)
    );
    const aiEnabled = !!aiBudget && Number.isFinite(Number(aiBudget.monthly_cap_eur));
    const homeworkCount = Number(homeworkRow?.c || 0) + Number(taskRow?.c || 0);
    return buildEvidenceSnapshot({
      workspaceId,
      schoolCode: workspace?.schoolCode || '',
      workspaceCreatedAt: workspace?.createdAt || null,
      workspaceName: workspace?.name || '',
      timezone,
      contactEmail,
      adminEmail: workspace?.adminEmail || '',
      teacherCount: Number(teacherRow?.c || 0),
      studentCount: Number(studentRow?.c || 0),
      demoStudentCount: Number(demoStudentRow?.c || 0),
      classCount: Number(classRow?.c || 0),
      channelCount: Number(channelRow?.c || 0),
      announcementCount: Number(announcementRow?.c || 0),
      liveSessionCount: Number(liveRow?.c || 0),
      homeworkCount,
      emailConfigured,
      aiEnabled,
      aiMonthlyCapEur: aiBudget?.monthly_cap_eur ?? null,
      profile: {
        street: profile?.street || '',
        houseNumber: profile?.house_number || '',
        postalCode: profile?.postal_code || '',
        city: profile?.city || '',
        state: profile?.state || '',
        country: profile?.country || '',
        phone: profile?.phone || '',
        website: profile?.website || '',
        openingHoursJson: profile?.opening_hours_json || '',
        registrationDetails: profile?.registration_details || ''
      },
      admin: {
        displayName: admin?.name || admin?.username || admin?.email || '',
        email: admin?.email || workspace?.adminEmail || '',
        role: admin?.role || 'school_admin',
        joinedAt: admin?.createdAt || null
      },
      emailSettings: {
        enabled: Number(emailSettings?.enabled || 0) === 1,
        brandSchoolName: emailSettings?.brand_school_name || '',
        replyToEmail: emailSettings?.reply_to_email || '',
        signatureHtml: emailSettings?.signature_html || '',
        subjectPrefix: emailSettings?.subject_prefix || ''
      },
      billing: {
        status: billing?.status || '',
        billingEmail: billing?.billingEmail || '',
        invoiceContactName: billing?.invoiceContactName || '',
        readinessAcknowledgedAt: billing?.readinessAcknowledgedAt || null,
        readinessAcknowledgedByUserId: billing?.readinessAcknowledgedByUserId || null
      }
    });
  }

  async function logEvent({ workspaceId, userId = null, eventType, stepKey = null, payload = {}, createdAt = new Date().toISOString() }) {
    await postgres.exec(`
      INSERT INTO workspace_onboarding_events (id, workspace_id, user_id, event_type, step_key, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id('obe'), workspaceId, userId || null, eventType, stepKey || null, JSON.stringify(payload || {}), createdAt]);
  }

  async function upsertMetrics(workspaceId, metrics, updatedAt = new Date().toISOString()) {
    await postgres.exec(`
      INSERT INTO workspace_activation_metrics (
        workspace_id, teachers_count, students_count, classes_count, channels_count,
        live_sessions_count, homework_count, announcements_count, ai_enabled,
        billing_ready, activation_score, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        teachers_count = EXCLUDED.teachers_count,
        students_count = EXCLUDED.students_count,
        classes_count = EXCLUDED.classes_count,
        channels_count = EXCLUDED.channels_count,
        live_sessions_count = EXCLUDED.live_sessions_count,
        homework_count = EXCLUDED.homework_count,
        announcements_count = EXCLUDED.announcements_count,
        ai_enabled = EXCLUDED.ai_enabled,
        billing_ready = EXCLUDED.billing_ready,
        activation_score = EXCLUDED.activation_score,
        updated_at = EXCLUDED.updated_at
    `, [
      workspaceId,
      metrics.teachersCount,
      metrics.studentsCount,
      metrics.classesCount,
      metrics.channelsCount,
      metrics.liveSessionsCount,
      metrics.homeworkCount,
      metrics.announcementsCount,
      boolInt(metrics.aiEnabled),
      boolInt(metrics.billingReady),
      metrics.activationScore,
      updatedAt
    ]);
  }

  return {
    engine: 'postgres',

    async ensureWorkspaceOnboarding(input, userId = null) {
      const { workspaceId, createdBy = userId || null, requestId = null, now = new Date().toISOString() } = normalizeEnsureArgs(input, userId);
      await postgres.transaction(async (tx) => {
        const existing = await tx.one('SELECT id FROM workspace_onboarding WHERE workspace_id = ?', [workspaceId]);
        if (!existing) {
          await tx.exec(`
            INSERT INTO workspace_onboarding (
              id, workspace_id, status, current_step, started_at, completed_at,
              created_at, updated_at, started_by_user_id, completed_by_user_id
            )
            VALUES (?, ?, 'not_started', 'welcome', NULL, NULL, ?, ?, NULL, NULL)
          `, [id('ob'), workspaceId, now, now]);
        }
        for (const item of ONBOARDING_ITEMS) {
          await tx.exec(`
            INSERT INTO workspace_onboarding_steps (
              id, workspace_id, step_key, status, completed_at, completed_by_user_id,
              meta_json, created_at, updated_at
            )
            VALUES (?, ?, ?, 'pending', NULL, NULL, '{}', ?, ?)
            ON CONFLICT(workspace_id, step_key) DO NOTHING
          `, [id('obs'), workspaceId, item.id, now, now]);
        }
        if (!existing) {
          await tx.exec(`
            INSERT INTO workspace_onboarding_events (id, workspace_id, user_id, event_type, step_key, payload_json, created_at)
            VALUES (?, ?, ?, 'onboarding_created', NULL, ?, ?)
          `, [id('obe'), workspaceId, createdBy || null, JSON.stringify({ requestId }), now]);
        }
      });
      const { metrics } = await getEvidenceAndMetrics(workspaceId);
      await upsertMetrics(workspaceId, metrics, now);
      return { workspaceId };
    },

    async listWorkspaceOnboardingSteps(workspaceId) {
      await this.ensureWorkspaceOnboarding(workspaceId);
      const rows = await postgres.many(`
        SELECT id, workspace_id AS "workspaceId", step_key AS "stepKey", status,
               completed_at AS "completedAt", completed_by_user_id AS "completedByUserId",
               meta_json AS "metaJson", created_at AS "createdAt", updated_at AS "updatedAt"
        FROM workspace_onboarding_steps
        WHERE workspace_id = ?
      `, [workspaceId]);
      const normalized = rows.map(normalizeStepRow);
      const byKey = new Map(normalized.map((row) => [String(row.stepKey), row]));
      const ordered = ONBOARDING_ITEMS.map((item) => byKey.get(item.id)).filter(Boolean);
      return ordered.concat(normalized.filter((row) => !ONBOARDING_ITEMS.some((item) => item.id === row.stepKey)));
    },

    async getWorkspaceOnboarding(workspaceId) {
      await this.ensureWorkspaceOnboarding(workspaceId);
      const onboarding = await postgres.one(`
        SELECT id, workspace_id AS "workspaceId", status, current_step AS "currentStep",
               started_at AS "startedAt", completed_at AS "completedAt",
               created_at AS "createdAt", updated_at AS "updatedAt",
               started_by_user_id AS "startedByUserId", completed_by_user_id AS "completedByUserId"
        FROM workspace_onboarding
        WHERE workspace_id = ?
      `, [workspaceId]);
      const steps = await postgres.many(`
        SELECT id, workspace_id AS "workspaceId", step_key AS "stepKey", status,
               completed_at AS "completedAt", completed_by_user_id AS "completedByUserId",
               meta_json AS "metaJson", created_at AS "createdAt", updated_at AS "updatedAt"
        FROM workspace_onboarding_steps
        WHERE workspace_id = ?
      `, [workspaceId]);
      const { evidence, blockers, metrics, summary } = await getEvidenceAndMetrics(workspaceId);
      await upsertMetrics(workspaceId, metrics);
      return buildSummary({ onboarding, stepRows: steps, evidence, blockers, metrics: normalizeMetricsRow(metrics), summary });
    },

    async startWorkspaceOnboarding(workspaceId, userId = null) {
      const now = new Date().toISOString();
      await this.ensureWorkspaceOnboarding(workspaceId, userId);
      const existing = await postgres.one(`
        SELECT status, current_step AS "currentStep"
        FROM workspace_onboarding
        WHERE workspace_id = ?
      `, [workspaceId]) || {};
      const existingStep = String(existing.currentStep || '').trim();
      const nextStep = existingStep === 'welcome' ? 'school_profile' : (STEP_IDS.has(existingStep) ? existingStep : 'school_profile');
      await postgres.transaction(async (tx) => {
        await tx.exec(`
          UPDATE workspace_onboarding
          SET status = 'in_progress',
              current_step = ?,
              started_at = COALESCE(started_at, ?),
              started_by_user_id = COALESCE(started_by_user_id, ?),
              updated_at = ?
          WHERE workspace_id = ?
        `, [nextStep, now, userId || null, now, workspaceId]);
        await tx.exec(`
          UPDATE workspace_onboarding_steps
          SET status = 'completed', completed_at = COALESCE(completed_at, ?),
              completed_by_user_id = COALESCE(completed_by_user_id, ?), updated_at = ?
          WHERE workspace_id = ? AND step_key = 'welcome'
        `, [now, userId || null, now, workspaceId]);
        if (existing.status === 'not_started') {
          await tx.exec(`
            INSERT INTO workspace_onboarding_events (id, workspace_id, user_id, event_type, step_key, payload_json, created_at)
            VALUES (?, ?, ?, 'onboarding_started', NULL, '{}', ?)
          `, [id('obe'), workspaceId, userId || null, now]);
        }
        if (existing.currentStep !== nextStep) {
          await tx.exec(`
            INSERT INTO workspace_onboarding_events (id, workspace_id, user_id, event_type, step_key, payload_json, created_at)
            VALUES (?, ?, ?, 'onboarding_step_entered', ?, ?, ?)
          `, [id('obe'), workspaceId, userId || null, nextStep, JSON.stringify({ source: 'start' }), now]);
        }
      });
      return this.getWorkspaceOnboarding(workspaceId);
    },

    async acknowledgeAutoOpenSeen(workspaceId, userId = null, meta = {}) {
      const now = new Date().toISOString();
      await this.ensureWorkspaceOnboarding(workspaceId, userId);
      const current = await this.getWorkspaceOnboarding(workspaceId);
      const welcomeItem = current.items.find((item) => item.id === 'welcome') || { meta: {} };
      if (welcomeItem.meta?.autoOpenSeenAt) return current;
      const nextMeta = {
        ...(welcomeItem.meta || {}),
        ...normalizeMeta(meta),
        autoOpenSeenAt: now
      };
      await postgres.transaction(async (tx) => {
        await tx.exec(`
          UPDATE workspace_onboarding_steps
          SET meta_json = ?, updated_at = ?
          WHERE workspace_id = ? AND step_key = 'welcome'
        `, [JSON.stringify(nextMeta), now, workspaceId]);
        await tx.exec(`
          UPDATE workspace_onboarding
          SET updated_at = ?
          WHERE workspace_id = ?
        `, [now, workspaceId]);
        await tx.exec(`
          INSERT INTO workspace_onboarding_events (id, workspace_id, user_id, event_type, step_key, payload_json, created_at)
          VALUES (?, ?, ?, 'onboarding_auto_open_seen', 'welcome', ?, ?)
        `, [id('obe'), workspaceId, userId || null, JSON.stringify(nextMeta), now]);
      });
      return this.getWorkspaceOnboarding(workspaceId);
    },

    async deferWorkspaceOnboarding(workspaceId, userId = null, meta = {}) {
      const now = new Date().toISOString();
      await this.ensureWorkspaceOnboarding(workspaceId, userId);
      const current = await this.getWorkspaceOnboarding(workspaceId);
      if (current.status === 'completed') return current;
      const welcomeItem = current.items.find((item) => item.id === 'welcome') || { meta: {} };
      const nextMeta = {
        ...(welcomeItem.meta || {}),
        ...normalizeMeta(meta),
        deferredAt: now,
        autoOpenSeenAt: welcomeItem.meta?.autoOpenSeenAt || now
      };
      await postgres.transaction(async (tx) => {
        await tx.exec(`
          UPDATE workspace_onboarding_steps
          SET meta_json = ?, updated_at = ?
          WHERE workspace_id = ? AND step_key = 'welcome'
        `, [JSON.stringify(nextMeta), now, workspaceId]);
        await tx.exec(`
          UPDATE workspace_onboarding
          SET status = 'skipped',
              started_at = COALESCE(started_at, ?),
              started_by_user_id = COALESCE(started_by_user_id, ?),
              current_step = ?,
              updated_at = ?
          WHERE workspace_id = ?
        `, [now, userId || null, current.currentStep || 'welcome', now, workspaceId]);
        await tx.exec(`
          INSERT INTO workspace_onboarding_events (id, workspace_id, user_id, event_type, step_key, payload_json, created_at)
          VALUES (?, ?, ?, 'onboarding_deferred', ?, ?, ?)
        `, [id('obe'), workspaceId, userId || null, current.currentStep || 'welcome', JSON.stringify(nextMeta), now]);
      });
      return this.getWorkspaceOnboarding(workspaceId);
    },

    async resumeWorkspaceOnboarding(workspaceId, userId = null, meta = {}) {
      const now = new Date().toISOString();
      await this.ensureWorkspaceOnboarding(workspaceId, userId);
      const current = await this.getWorkspaceOnboarding(workspaceId);
      if (current.status === 'completed') return current;
      const welcomeItem = current.items.find((item) => item.id === 'welcome') || { meta: {} };
      const nextMeta = {
        ...(welcomeItem.meta || {}),
        ...normalizeMeta(meta),
        resumedAt: now,
        autoOpenSeenAt: welcomeItem.meta?.autoOpenSeenAt || now
      };
      const nextCurrentStep = current.currentStep || getNextIncompleteStepId(current.items);
      await postgres.transaction(async (tx) => {
        await tx.exec(`
          UPDATE workspace_onboarding_steps
          SET meta_json = ?, updated_at = ?
          WHERE workspace_id = ? AND step_key = 'welcome'
        `, [JSON.stringify(nextMeta), now, workspaceId]);
        await tx.exec(`
          UPDATE workspace_onboarding
          SET status = 'in_progress',
              started_at = COALESCE(started_at, ?),
              started_by_user_id = COALESCE(started_by_user_id, ?),
              current_step = ?,
              updated_at = ?
          WHERE workspace_id = ?
        `, [now, userId || null, nextCurrentStep || 'welcome', now, workspaceId]);
        await tx.exec(`
          INSERT INTO workspace_onboarding_events (id, workspace_id, user_id, event_type, step_key, payload_json, created_at)
          VALUES (?, ?, ?, 'onboarding_resumed', ?, ?, ?)
        `, [id('obe'), workspaceId, userId || null, nextCurrentStep || 'welcome', JSON.stringify(nextMeta), now]);
      });
      return this.getWorkspaceOnboarding(workspaceId);
    },

    async saveOnboardingStep(workspaceId, stepKey, payload = {}, userId = null) {
      const status = payload?.status || 'in_progress';
      const meta = payload?.meta !== undefined ? payload.meta : payload;
      return this.updateStep({
        workspaceId,
        stepId: stepKey,
        status,
        note: payload?.note || '',
        currentStep: payload?.currentStep || stepKey,
        userId,
        meta,
        eventType: 'onboarding_step_updated'
      });
    },

    async completeOnboardingStep(workspaceId, stepKey, userId = null, meta = {}) {
      return this.updateStep({
        workspaceId,
        stepId: stepKey,
        status: 'completed',
        currentStep: stepKey,
        userId,
        meta,
        eventType: 'onboarding_step_completed'
      });
    },

    async skipOnboardingStep(workspaceId, stepKey, userId = null, meta = {}) {
      return this.updateStep({
        workspaceId,
        stepId: stepKey,
        status: 'skipped',
        currentStep: stepKey,
        userId,
        meta,
        eventType: 'onboarding_step_skipped'
      });
    },

    async setCurrentOnboardingStep(workspaceId, stepKey, userId = null, payload = {}) {
      const now = new Date().toISOString();
      await this.ensureWorkspaceOnboarding(workspaceId);
      const normalizedStep = normalizeCurrentStep(stepKey);
      const existing = await postgres.one('SELECT current_step AS "currentStep" FROM workspace_onboarding WHERE workspace_id = ?', [workspaceId]) || {};
      if (existing.currentStep === normalizedStep) {
        return this.getWorkspaceOnboarding(workspaceId);
      }
      await postgres.exec(`
        UPDATE workspace_onboarding
        SET current_step = ?, updated_at = ?
        WHERE workspace_id = ?
      `, [normalizedStep, now, workspaceId]);
      await logEvent({ workspaceId, userId, eventType: 'onboarding_step_entered', stepKey: normalizedStep, payload: normalizeMeta(payload), createdAt: now });
      return this.getWorkspaceOnboarding(workspaceId);
    },

    async updateStep({ workspaceId, stepId, status, note = '', currentStep = null, userId = null, updatedAt = new Date().toISOString(), meta = null, eventType = 'step_status_changed' }) {
      const normalizedStepId = ensureKnownStepId(stepId);
      const normalizedCurrentStep = normalizeCurrentStep(currentStep);
      if (!status) {
        if (!normalizedCurrentStep) {
          throw new OnboardingValidationError('Either status or currentStep is required', 'invalid_onboarding_update');
        }
        return this.setCurrentOnboardingStep(workspaceId, normalizedCurrentStep, userId, meta || {});
      }
      await this.ensureWorkspaceOnboarding({ workspaceId, now: updatedAt });
      const currentSummary = await this.getWorkspaceOnboarding(workspaceId);
      const currentItem = currentSummary.items.find((item) => item.id === normalizedStepId);
      if (!currentItem) {
        throw new OnboardingValidationError('Unknown onboarding step', 'invalid_onboarding_step');
      }
      const normalizedStatus = assertStepTransition({
        item: currentItem,
        requestedStatus: status,
        storedStatus: currentItem.status,
        evidenceCompleted: !!currentItem.evidence,
        blockers: currentItem.blockers || []
      });
      const completedAt = normalizedStatus === 'completed' ? updatedAt : null;
      const completedBy = normalizedStatus === 'completed' ? userId || null : null;
      const metaPayload = normalizeMeta(meta);
      const safeNote = sanitizeText(note, MAX_NOTE_LENGTH);
      if (safeNote) metaPayload.note = safeNote;
      const nextCurrentStep = normalizedCurrentStep || currentSummary.currentStep;
      const nextEventType = String(eventType || 'onboarding_step_updated').trim() || 'onboarding_step_updated';
      const isNoOp =
        currentItem.status === normalizedStatus &&
        JSON.stringify(currentItem.meta || {}) === JSON.stringify(metaPayload) &&
        String(currentSummary.currentStep || '') === String(nextCurrentStep || '');
      if (isNoOp) return currentSummary;
      await postgres.transaction(async (tx) => {
        await tx.exec(`
          UPDATE workspace_onboarding_steps
          SET status = ?, completed_at = ?, completed_by_user_id = ?, meta_json = ?, updated_at = ?
          WHERE workspace_id = ? AND step_key = ?
        `, [normalizedStatus, completedAt, completedBy, JSON.stringify(metaPayload), updatedAt, workspaceId, normalizedStepId]);
        await tx.exec(`
          UPDATE workspace_onboarding
          SET status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END,
              started_at = COALESCE(started_at, ?),
              started_by_user_id = COALESCE(started_by_user_id, ?),
              current_step = COALESCE(?, current_step),
              updated_at = ?
          WHERE workspace_id = ?
        `, [updatedAt, userId || null, nextCurrentStep, updatedAt, workspaceId]);
        await tx.exec(`
          INSERT INTO workspace_onboarding_events (id, workspace_id, user_id, event_type, step_key, payload_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id('obe'), workspaceId, userId || null, nextEventType, normalizedStepId, JSON.stringify({ status: normalizedStatus, note: safeNote, meta: metaPayload }), updatedAt]);
        if (String(currentSummary.currentStep || '') !== String(nextCurrentStep || '')) {
          await tx.exec(`
            INSERT INTO workspace_onboarding_events (id, workspace_id, user_id, event_type, step_key, payload_json, created_at)
            VALUES (?, ?, ?, 'onboarding_step_entered', ?, ?, ?)
          `, [id('obe'), workspaceId, userId || null, nextCurrentStep, JSON.stringify({ source: 'update_step' }), updatedAt]);
        }
      });
      return this.getWorkspaceOnboarding(workspaceId);
    },

    async appendOnboardingEvent(workspaceId, eventType, stepKey = null, userId = null, payload = {}) {
      const createdAt = new Date().toISOString();
      await logEvent({
        workspaceId,
        userId,
        eventType: String(eventType || '').trim(),
        stepKey: stepKey ? ensureKnownStepId(stepKey, 'stepKey') : null,
        payload: normalizeMeta(payload),
        createdAt
      });
      return { ok: true, workspaceId, eventType, stepKey, createdAt };
    },

    async computeActivationMetrics(workspaceId) {
      const { metrics } = await getEvidenceAndMetrics(workspaceId);
      return normalizeMetricsRow(metrics);
    },

    async getActivationMetrics(workspaceId) {
      const row = await postgres.one(`
        SELECT workspace_id AS "workspaceId", teachers_count AS "teachersCount", students_count AS "studentsCount",
               classes_count AS "classesCount", channels_count AS "channelsCount",
               live_sessions_count AS "liveSessionsCount", homework_count AS "homeworkCount",
               announcements_count AS "announcementsCount", ai_enabled AS "aiEnabled",
               billing_ready AS "billingReady", activation_score AS "activationScore", updated_at AS "updatedAt"
        FROM workspace_activation_metrics
        WHERE workspace_id = ?
      `, [workspaceId]);
      return row ? normalizeMetricsRow(row) : this.refreshActivationMetrics(workspaceId);
    },

    async refreshActivationMetrics(workspaceId) {
      const { metrics } = await getEvidenceAndMetrics(workspaceId);
      await upsertMetrics(workspaceId, metrics);
      return normalizeMetricsRow(metrics);
    },

    async completeWorkspaceOnboarding(workspaceId, userId = null) {
      return this.activateWorkspace({ workspaceId, userId, completedAt: new Date().toISOString() });
    },

    async activateWorkspace({ workspaceId, completedAt = null, activatedAt = null, userId = null }) {
      const at = completedAt || activatedAt || new Date().toISOString();
      const current = await this.getWorkspaceOnboarding(workspaceId);
      if (!current.activationReady) {
        throw new OnboardingValidationError('Workspace is not activation-ready', 'onboarding_activation_not_ready');
      }
      await postgres.transaction(async (tx) => {
        await tx.exec(`
          UPDATE workspace_onboarding
          SET status = 'completed', current_step = 'launch_checklist', completed_at = ?, completed_by_user_id = ?, updated_at = ?
          WHERE workspace_id = ?
        `, [at, userId || null, at, workspaceId]);
        await tx.exec(`
          INSERT INTO workspace_onboarding_events (id, workspace_id, user_id, event_type, step_key, payload_json, created_at)
          VALUES (?, ?, ?, 'onboarding_completed', NULL, '{}', ?)
        `, [id('obe'), workspaceId, userId || null, at]);
      });
      return this.getWorkspaceOnboarding(workspaceId);
    }
  };
}

module.exports = {
  ONBOARDING_ITEMS,
  OnboardingValidationError,
  createOnboardingRepository
};
